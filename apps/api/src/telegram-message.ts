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
const navigation = z.object({
  update_id: z.number().int().nonnegative().safe(),
  callback_query: z.object({
    id: z.string().min(1).max(128),
    from: z.object({ id, is_bot: z.literal(false) }),
    message: z.object({ message_id: id, chat: z.object({ id, type: z.literal('private') }) }),
    data: z.enum(['phrase', 'add', 'help', 'home']),
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
  const control = navigation.safeParse(raw);
  if (control.success) {
    const { callback_query: query, update_id: updateId } = control.data;
    if (query.message.chat.id !== query.from.id) return null;
    return {
      updateId: BigInt(updateId),
      // Each click has its own receipt, even when the same menu is used again.
      messageId: `callback:${query.id}`,
      chatId: String(query.message.chat.id),
      telegramId: String(query.from.id),
      callbackQueryId: query.id,
      kind: query.data === 'home' ? 'start' : query.data,
      payload: null,
      albumId: undefined,
    };
  }
  const parsed = update.safeParse(raw);
  if (!parsed.success) return null;
  const { update_id: updateId, message } = parsed.data;
  if (message.chat.id !== message.from.id) return null;
  const base = {
    updateId: BigInt(updateId),
    messageId: String(message.message_id),
    chatId: String(message.chat.id),
    telegramId: String(message.from.id),
    callbackQueryId: undefined,
  };
  const text = (message.text ?? message.caption ?? '').trim();
  if (message.text?.startsWith('/')) {
    const command = message.text.split(/\s/, 1)[0]!.split('@', 1)[0]!;
    return {
      ...base,
      kind: ['/start', '/phrase', '/add', '/help', '/cards', '/materials', '/app'].includes(command)
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
  '🍋 Напиши мне фразу на итальянском — я разберу её на слова с переводом и грамматические темы.\n\nНапример: Il limone è giallo.\n\nМожно прислать и фото, PDF, презентацию или записи с урока. Ты проверишь результат в приложении, сохранишь нужное и начнёшь повторять слова.\n\nНажми Start, чтобы начать.';
export const BOT_SHORT_DESCRIPTION =
  '🍋 Напиши фразу на итальянском или пришли фото/файл — получишь слова с переводом и карточки после проверки.';
export function botCopy(kind: string) {
  switch (kind) {
    case 'start':
      return '🍋 <b>Ciao! Просто напиши мне фразу на итальянском.</b>\nНапример: <code>Il limone è giallo.</code>\n\nЯ найду слова с переводом и грамматические темы. Ты проверишь результат в приложении, сохранишь нужное и получишь карточки для повторения. Можно прислать и фото или файл.\n\n<b>В чате:</b> присылай текст и файлы, получай уведомления о разборе.\n<b>В приложении ↗:</b> проверяй результат, повторяй карточки и занимайся грамматикой. Кнопки со стрелкой откроют его внутри Telegram.\n\nКнопка «Меню» рядом со строкой ввода открывает команды; их можно выбрать без набора вручную.';
    case 'phrase':
      return '<b>Напиши фразу прямо в этот чат.</b>\nНапример: <code>Il limone è giallo.</code>\n\nОтправь её обычным сообщением — команда перед текстом не нужна. Можно написать несколько предложений сразу.\n\nЯ найду слова с переводом и грамматические темы, затем дам кнопку «Проверить слова и темы ↗». В приложении ты выберешь, что сохранить. После сохранения откроются карточки.';
    case 'add':
      return '<b>Пришли фото или файл в этот чат.</b>\nНажми скрепку рядом со строкой ввода и выбери фото страницы, PDF, DOCX, PPTX, JPG, PNG или TXT. Фото одного материала можно прислать альбомом.\n\nЯ найду слова с переводом и грамматические темы. Кнопка «Проверить слова и темы ↗» откроет результат в приложении: там ты выберешь, что сохранить. Из сохранённых слов появятся карточки.\n\nДо 5 файлов, каждый до 10 МБ, вместе до 20 МБ. Текст тоже можно просто написать сообщением.';
    case 'help':
      return '<b>Как это работает</b>\n\n<b>1. Пришли материал в чат.</b> Подойдёт фраза, текст, фото или документ. Каждое сообщение — отдельный материал; фото в одном альбоме объединяются.\n\n<b>2. Проверь результат.</b> Когда разбор закончится, нажми «Проверить слова и темы». В приложении можно изменить переводы и убрать лишнее. AI может ошибаться, поэтому ничего не попадает в словарь без твоего подтверждения.\n\n<b>3. Сохрани и повторяй.</b> После сохранения откроются карточки этого материала. Позже можно выбрать материал или тему для повторения.\n\nМатериалы и прогресс общие с сайтом. Для приёма сообщений нужно один раз войти в приложение и связать аккаунт с Telegram.\n\n/start — главное меню.';
    case 'cards':
      return '🍋 <b>Повтори слова в карточках.</b>\nКнопка со стрелкой откроет приложение внутри Telegram: там можно повторять по расписанию или выбрать тему и материал.';
    case 'app':
      return '<b>Открой приложение Lingvoteka.</b>\nОно откроется внутри Telegram. Там находятся проверка разбора, карточки, словарь, материалы и грамматика. Материалы и прогресс общие с сайтом.\n\nЧтобы разобрать новую фразу, просто напиши её в этот чат.';
    case 'materials':
      return '<b>Твои материалы и разборы</b>\nКнопка откроет приложение со всеми сохранёнными текстами и файлами. Там можно проверить разбор или повторить слова конкретного материала.';
    case 'connect':
      return '<b>Сначала свяжи аккаунт с Telegram.</b>\nОткрой приложение, войди или зарегистрируйся и нажми «Связать этот аккаунт». Тогда присланные материалы и карточки будут доступны и здесь, и на сайте.\n\nПосле привязки отправь текст или файл в этот чат. Если уже отправляла — пришли ещё раз: до привязки материал не сохраняется.';
    case 'late':
      return 'Часть альбома пришла с задержкой, когда разбор уже начался. Эти файлы не добавлены. Пришли их отдельным новым альбомом или загрузи весь урок одним PDF.';
    default:
      return 'Этот формат пока не поддерживается. Пришли текст, фотографию или PDF, DOCX, PPTX, JPG, PNG, TXT. Аудио, видео и ссылки можно подготовить как текст или файл.';
  }
}
