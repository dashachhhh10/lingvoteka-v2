import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from './database.js';
import { validateMaterialInput, withStoredMaterialFiles } from './material-input.js';
import { downloadTelegramFile } from './telegram-file.js';
import { botCopy, parseTelegramMessage, type TelegramPayload } from './telegram-message.js';
import { telegramApi, TelegramApiError, telegramMiniAppUrl } from './telegram-bot.js';

export const ALBUM_QUIET_MS = 4_000;
const leaseMs = 300_000;

/** The database receipt is committed before Telegram is acknowledged. No raw update is stored. */
export async function receiveTelegramUpdate(raw: unknown) {
  const message = parseTelegramMessage(raw);
  if (!message) return;
  const batchKey = `${message.chatId}:${message.albumId ? `album:${message.albumId}` : `message:${message.messageId}`}`;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${batchKey}, 0))`;
      const duplicate = await tx.telegramUpdate.findFirst({
        where: {
          OR: [
            { updateId: message.updateId },
            { chatId: message.chatId, messageId: message.messageId },
          ],
        },
      });
      if (duplicate) return;
      let kind = message.kind;
      let submissionId: string | undefined;
      let payload = message.payload;
      if (kind === 'material') {
        const identity = await tx.telegramIdentity.findUnique({
          where: { telegramId: message.telegramId },
        });
        if (!identity) {
          kind = 'connect';
          payload = null;
        } else {
          const existing = await tx.telegramSubmission.findUnique({ where: { batchKey } });
          if (existing && existing.status !== 'PENDING') {
            kind = 'late';
            payload = null;
          } else {
            const submission = await tx.telegramSubmission.upsert({
              where: { batchKey },
              create: {
                batchKey,
                ownerId: identity.userId,
                telegramId: message.telegramId,
                chatId: message.chatId,
                isAlbum: !!message.albumId,
              },
              update: { lastReceivedAt: new Date() },
            });
            submissionId = submission.id;
          }
        }
      }
      await tx.telegramUpdate.create({
        data: {
          updateId: message.updateId,
          chatId: message.chatId,
          telegramId: message.telegramId,
          messageId: message.messageId,
          kind,
          submissionId,
          payload: payload ? (payload as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        },
      });
    });
  } catch (error) {
    // A delivery with an existing update/message ID is already durably accepted.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'))
      throw error;
  }
  return message.callbackQueryId;
}

export function telegramButtons(path = '', label = 'Открыть приложение') {
  const url = telegramMiniAppUrl();
  return {
    inline_keyboard: [
      [
        {
          text: `${label} ↗`,
          web_app: { url: url + path },
        },
      ],
      [{ text: 'Главное меню', callback_data: 'home' }],
    ],
  };
}

export function telegramHomeButtons(linked: boolean) {
  const url = telegramMiniAppUrl();
  return {
    inline_keyboard: [
      [{ text: linked ? '📱 Открыть приложение ↗' : '📱 Связать аккаунт ↗', web_app: { url } }],
      [{ text: 'Разобрать фразу', callback_data: 'phrase' }],
      [{ text: 'Прислать фото или файл', callback_data: 'add' }],
      [
        { text: 'Карточки ↗', web_app: { url: `${url}/review` } },
        { text: 'Мои материалы ↗', web_app: { url: `${url}/materials` } },
      ],
      [{ text: 'Как это работает', callback_data: 'help' }],
    ],
  };
}

export async function replyToTelegramUpdate(updateId: bigint) {
  const update = await prisma.telegramUpdate.findUnique({ where: { updateId } });
  if (!update || update.handledAt || update.kind === 'material') return;
  const identity = await prisma.telegramIdentity.findUnique({
    where: { telegramId: update.telegramId },
    select: { userId: true },
  });
  const kind = ['add', 'phrase'].includes(update.kind) && !identity ? 'connect' : update.kind;
  const path = kind === 'cards' ? '/review' : kind === 'materials' ? '/materials' : '';
  const label =
    kind === 'cards'
      ? 'Повторить слова'
      : kind === 'materials'
        ? 'Мои материалы'
        : kind === 'connect'
          ? 'Связать аккаунт'
          : 'Открыть приложение';
  try {
    await telegramApi('sendMessage', {
      chat_id: update.chatId,
      text:
        botCopy(kind) +
        (kind === 'start' && !identity
          ? '\n\n<b>Первый раз?</b> Начни с кнопки «Связать аккаунт»: войди в приложение и подтверди привязку к Telegram.'
          : ''),
      parse_mode: 'HTML',
      reply_markup: ['start', 'phrase', 'add', 'help'].includes(kind)
        ? telegramHomeButtons(!!identity)
        : telegramButtons(path, label),
    });
  } catch (error) {
    if (!(error instanceof TelegramApiError && error.status === 403)) throw error;
    // A blocked bot cannot deliver; do not repeatedly retry a user's explicit block.
  }
  await prisma.telegramUpdate.update({
    where: { updateId },
    data: { handledAt: new Date(), payload: Prisma.DbNull },
  });
}

export async function rejectTelegramSubmission(id: string, errorText: string) {
  await prisma.$transaction([
    prisma.telegramSubmission.updateMany({
      where: { id, status: { in: ['PENDING', 'IMPORTING'] } },
      data: { status: 'REJECTED', claimToken: null, leaseUntil: null, errorText },
    }),
    prisma.telegramUpdate.updateMany({
      where: { submissionId: id },
      data: { payload: Prisma.DbNull, handledAt: new Date() },
    }),
  ]);
}

export async function importTelegramSubmission(
  id: string,
  enqueue: (id: string) => Promise<unknown>,
) {
  const submission = await prisma.telegramSubmission.findUnique({ where: { id } });
  if (!submission || submission.status !== 'PENDING') return;
  if (submission.isAlbum && Date.now() - submission.lastReceivedAt.getTime() < ALBUM_QUIET_MS)
    return;
  const claimToken = randomUUID();
  const claimed = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${submission.batchKey}, 0))`;
    const fresh = await tx.telegramSubmission.findUnique({ where: { id } });
    if (
      !fresh ||
      fresh.status !== 'PENDING' ||
      (fresh.isAlbum && Date.now() - fresh.lastReceivedAt.getTime() < ALBUM_QUIET_MS)
    )
      return false;
    await tx.telegramSubmission.update({
      where: { id },
      data: { status: 'IMPORTING', claimToken, leaseUntil: new Date(Date.now() + leaseMs) },
    });
    return true;
  });
  if (!claimed) return;
  try {
    const identity = await prisma.telegramIdentity.findUnique({
      where: { telegramId: submission.telegramId },
    });
    if (identity?.userId !== submission.ownerId) {
      await rejectTelegramSubmission(
        id,
        'Связь с аккаунтом изменилась. Открой приложение и отправь материал заново.',
      );
      return;
    }
    const updates = await prisma.telegramUpdate.findMany({
      where: { submissionId: id, kind: 'material' },
      orderBy: { updateId: 'asc' },
    });
    const payloads = updates.map((update) => update.payload as unknown as TelegramPayload);
    const attachments = payloads.flatMap((payload) => (payload.file ? [payload.file] : []));
    if (
      attachments.length > 5 ||
      attachments.reduce((sum, file) => sum + (file.byteSize ?? 0), 0) > 20 * 1024 * 1024
    )
      throw new BadRequestException(
        'В одном материале — до 5 файлов общим размером до 20 МБ. Раздели материал и отправь заново.',
      );
    const files = [];
    for (const attachment of attachments) files.push(await downloadTelegramFile(attachment));
    const text = payloads
      .map((payload) => payload.text)
      .filter(Boolean)
      .join('\n\n');
    const title = files.length
      ? undefined
      : text.split('\n')[0]?.trim().slice(0, 100) || 'Материал из Telegram';
    const input = await validateMaterialInput({ title, noteText: text }, files);
    const material = await withStoredMaterialFiles(submission.ownerId, files, (stored) =>
      prisma.$transaction(async (tx) => {
        const owned = await tx.telegramSubmission.updateMany({
          where: { id, status: 'IMPORTING', claimToken },
          data: { leaseUntil: new Date(Date.now() + leaseMs) },
        });
        if (!owned.count) throw new Error('Telegram import lease lost');
        const created = await tx.material.create({
          data: {
            ownerId: submission.ownerId,
            ...input,
            status: 'PROCESSING',
            files: { create: stored },
          },
        });
        await tx.telegramSubmission.update({
          where: { id },
          data: { status: 'IMPORTED', materialId: created.id, claimToken: null, leaseUntil: null },
        });
        await tx.telegramUpdate.updateMany({
          where: { submissionId: id },
          data: { payload: Prisma.DbNull, handledAt: new Date() },
        });
        return created;
      }),
    );
    // Existing worker reconciliation recovers a queue outage after the durable material commit.
    await enqueue(material.id).catch(() =>
      console.warn('Telegram material awaits analysis queue reconciliation'),
    );
  } catch (error) {
    if (error instanceof BadRequestException) {
      await rejectTelegramSubmission(id, error.message);
      return;
    }
    await prisma.telegramSubmission.updateMany({
      where: { id, status: 'IMPORTING', claimToken },
      data: { status: 'PENDING', claimToken: null, leaseUntil: null },
    });
    // Never bubble a token-bearing fetch/storage exception into pg-boss logs.
    throw new Error('Telegram import temporarily unavailable');
  }
}

export async function notifyTelegramSubmission(id: string) {
  const submission = await prisma.telegramSubmission.findUnique({
    where: { id },
    include: { material: { include: { _count: { select: { files: true, vocabulary: true } } } } },
  });
  if (!submission || !['IMPORTED', 'REJECTED'].includes(submission.status)) return;
  const state = submission.status === 'REJECTED' ? 'REJECTED' : submission.material?.status;
  if (!state || state === submission.notifiedStatus) return;
  if (!['PROCESSING', 'REVIEW', 'ERROR', 'READY', 'REJECTED'].includes(state)) return;
  const identity = await prisma.telegramIdentity.findUnique({
    where: { telegramId: submission.telegramId },
  });
  if (identity?.userId !== submission.ownerId) return;
  const subject = submission.material?._count.files ? 'материала' : 'текста';
  const text =
    state === 'REVIEW'
      ? `🍋 <b>Разбор ${subject} готов.</b>\nКнопка «Проверить слова и темы» откроет приложение Lingvoteka. Проверь переводы, убери лишнее и сохрани выбранное. Из сохранённых слов появятся карточки.\n\nПока результат не подтверждён, в словарь ничего не добавлено.`
      : state === 'READY'
        ? '🍋 <b>Материал сохранён.</b>\nВыбранные слова и темы доступны в приложении. Можно вернуться к ним в любое время.'
        : state === 'PROCESSING'
          ? `🍋 <b>${subject === 'текста' ? 'Текст получен' : 'Материал получен'}.</b>\nИщу слова с переводом и грамматические темы. Затем обновлю это сообщение и дам кнопку проверки результата в приложении. Ты выберешь, что сохранить; до этого в словарь ничего не добавится.`
          : state === 'REJECTED'
            ? `<b>Материал не добавлен.</b>\n${escapeHtml(submission.errorText ?? 'Не удалось получить файл. Попробуй отправить его заново.')}`
            : '<b>С разбором не получилось.</b>\nМатериал сохранён: можно повторить попытку в приложении или заполнить черновик вручную.';
  const canReview = state === 'READY' && !!submission.material?._count.vocabulary;
  const body = {
    chat_id: submission.chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: telegramButtons(
      canReview
        ? `/review?materialId=${encodeURIComponent(submission.materialId!)}`
        : submission.materialId
          ? `/materials/${submission.materialId}`
          : '',
      state === 'REVIEW'
        ? 'Проверить слова и темы'
        : canReview
          ? 'Повторить слова материала'
          : submission.materialId
            ? 'Открыть материал'
            : 'Открыть приложение',
    ),
  };
  let messageId = submission.replyMessageId;
  try {
    if (messageId) {
      try {
        await telegramApi('editMessageText', { ...body, message_id: messageId });
      } catch (error) {
        if (!(error instanceof TelegramApiError && error.status === 400)) throw error;
        messageId = null;
      }
    }
    if (!messageId)
      messageId = (await telegramApi<{ message_id: number }>('sendMessage', body)).message_id;
  } catch (error) {
    if (!(error instanceof TelegramApiError && error.status === 403)) throw error;
  }
  await prisma.telegramSubmission.update({
    where: { id },
    data: { replyMessageId: messageId, notifiedStatus: state, notificationRetryAt: null },
  });
}
function escapeHtml(text: string) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
