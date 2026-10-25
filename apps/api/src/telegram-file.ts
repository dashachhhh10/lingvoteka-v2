import { BadRequestException } from '@nestjs/common';
import { telegramApi, TelegramApiError } from './telegram-bot.js';
import type { TelegramFile } from './telegram-message.js';
import type { MaterialUpload } from './material-input.js';
const MAX_BYTES = 10 * 1024 * 1024;

export async function downloadTelegramFile(file: TelegramFile): Promise<MaterialUpload> {
  if (file.byteSize !== undefined && file.byteSize > MAX_BYTES)
    throw new BadRequestException('Один файл — не более 10 МБ');
  const result = await telegramApi<{ file_path?: string; file_size?: number }>('getFile', {
    file_id: file.fileId,
  });
  const path = result.file_path ?? '';
  if (!/^[A-Za-z0-9_/-]+\.[A-Za-z0-9]+$/.test(path) || path.startsWith('/') || path.includes('..'))
    throw new BadRequestException('Не удалось получить файл из Telegram');
  if (result.file_size !== undefined && result.file_size > MAX_BYTES)
    throw new BadRequestException('Один файл — не более 10 МБ');
  let response: Response;
  try {
    response = await fetch(
      `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${path}`,
      { signal: AbortSignal.timeout(30_000), redirect: 'error' },
    );
  } catch {
    throw new TelegramApiError('downloadFile', 'network');
  }
  if (!response.ok || !response.body)
    throw new TelegramApiError('downloadFile', 'request', response.status);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    if (Number(response.headers.get('content-length')) > MAX_BYTES)
      throw new BadRequestException('Один файл — не более 10 МБ');
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_BYTES) throw new BadRequestException('Один файл — не более 10 МБ');
      chunks.push(next.value);
    }
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new TelegramApiError('downloadFile', 'network');
  } finally {
    await reader.cancel().catch(() => {});
  }
  return { originalname: file.name, mimetype: file.mimeType, size, buffer: Buffer.concat(chunks) };
}
