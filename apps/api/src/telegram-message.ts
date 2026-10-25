import { z } from 'zod';
import { uploadedFileName } from './uploaded-file-name.js';

const id = z.number().int().positive().safe();
const file = z.object({
  file_id: z.string().min(1).max(512),
  file_size: z.number().int().nonnegative().safe().optional(),
});
const update = z.object({
  update_id: z.number().int().nonnegative().safe(),
  message: z.object({
    message_id: id,
    chat: z.object({ id, type: z.literal('private') }),
    from: z.object({ id, is_bot: z.literal(false) }),
    text: z.string().max(80_000).optional(),
    caption: z.string().max(80_000).optional(),
    media_group_id: z.string().min(1).max(128).optional(),
    photo: z.array(file).max(20).optional(),
    document: file
      .extend({
        file_name: z.string().max(512).optional(),
        mime_type: z.string().max(160).optional(),
      })
      .optional(),
  }),
});
const mimeByExtension: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  txt: 'text/plain',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
export type TelegramFile = { fileId: string; name: string; mimeType: string; byteSize?: number };
export type TelegramPayload = { text: string; file?: TelegramFile };
export function parseTelegramMessage(raw: unknown) {
  const parsed = update.safeParse(raw);
  if (!parsed.success) return null;
  const { update_id: updateId, message } = parsed.data;
  if (message.chat.id !== message.from.id) return null;
  const base = {
    updateId: BigInt(updateId),
    messageId: String(message.message_id),
    chatId: String(message.chat.id),
    telegramId: String(message.from.id),
  };
  const text = (message.text ?? message.caption ?? '').trim();
  if (message.text?.startsWith('/')) {
    const command = message.text.split(/\s/, 1)[0]!.split('@', 1)[0]!;
    return {
      ...base,
      kind: ['/start', '/help', '/cards', '/materials'].includes(command)
        ? command.slice(1)
        : 'help',
      payload: null,
      albumId: undefined,
    };
  }
  let attachment: TelegramFile | undefined;
  if (message.document) {
    const doc = message.document;
    const name = uploadedFileName(doc.file_name ?? 'Файл');
    const mimeType = mimeByExtension[name.split('.').at(-1)!.toLowerCase()];
    if (!mimeType) return { ...base, kind: 'unsupported', payload: null, albumId: undefined };
    attachment = { fileId: doc.file_id, name, mimeType, byteSize: doc.file_size };
  } else if (message.photo?.length) {
    const photo = message.photo.at(-1)!;
    attachment = {
      fileId: photo.file_id,
      name: `Фото ${message.message_id}.jpg`,
      mimeType: 'image/jpeg',
      byteSize: photo.file_size,
    };
  }
  if (!text && !attachment)
    return { ...base, kind: 'unsupported', payload: null, albumId: undefined };
  return {
    ...base,
    kind: 'material',
    payload: { text, ...(attachment ? { file: attachment } : {}) },
    albumId: message.media_group_id,
  };
}

export const BOT_DESCRIPTION =
  '🍋 Твой итальянский — в твоём ритме.\n\nПрисылай записи урока, фотографии или документы. Lingvoteka соберёт слова и грамматику, а карточки помогут их запомнить.\n\nНачни с кнопки Start: войди в свой аккаунт и свяжи его с Telegram.';
export const BOT_SHORT_DESCRIPTION =
  'Уроки → слова → практика. Присылай материалы и повторяй итальянский в своём ритме. 🍋';
export function botCopy(kind: string) {
  switch (kind) {
    case 'start':
      return '🍋 <b>Ciao! Это Lingvoteka.</b>\n<i>Твой итальянский — в твоём ритме.</i>\n\nПришли сюда текст урока, фото или документ — я подготовлю слова и грамматику. Затем ты проверишь результат в приложении.\n\n<b>Впервые здесь?</b> Открой приложение, войди в свой аккаунт и подтверди связь с Telegram.';
    case 'help':
      return '<b>От урока — к словам, которые помнишь.</b>\n\n<b>1.</b> Пришли текст, фото или файл: PDF, DOCX, PPTX, JPG, PNG, TXT.\n<b>2.</b> Дождись разбора и проверь слова и темы.\n<b>3.</b> Возвращайся к карточкам и упражнениям.\n\nФото одного урока отправляй одним альбомом: до 5 файлов, каждый до 10 МБ, вместе до 20 МБ.\n\nМатериалы и прогресс общие с сайтом. Для начала свяжи аккаунт в приложении.';
    case 'cards':
      return '🍋 <b>Немного практики?</b>\nОткрой карточки: повтори слова по расписанию или выбери тему и материал.';
    case 'materials':
      return '<b>Все твои уроки — в одном месте.</b>\nОткрой материалы или пришли новый урок прямо сюда.';
    case 'connect':
      return '<b>Сначала познакомим аккаунты.</b>\nОткрой приложение, войди в свой аккаунт Lingvoteka и нажми «Связать этот аккаунт». После этого отправь материал ещё раз — пока я его не сохраняла.';
    case 'late':
      return 'Часть альбома пришла с задержкой, когда разбор уже начался. Эти файлы не добавлены. Пришли их отдельным новым альбомом или загрузи весь урок одним PDF.';
    default:
      return 'Этот формат пока не поддерживается. Пришли текст, фотографию или PDF, DOCX, PPTX, JPG, PNG, TXT. Аудио, видео и ссылки можно подготовить как текст или файл.';
  }
}
