import {
  Controller,
  Post,
  Req,
  HttpCode,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';
import {
  telegramApi,
  telegramMiniAppUrl,
  telegramWebhookSecret,
  telegramWelcome,
} from './telegram-bot.js';

@Controller('telegram')
export class TelegramController {
  @Post('webhook')
  @HttpCode(200)
  async webhook(@Req() request: Request) {
    const secret = telegramWebhookSecret();
    if (!secret || !process.env.TELEGRAM_BOT_TOKEN) throw new ServiceUnavailableException();
    const supplied = request.get('x-telegram-bot-api-secret-token') ?? '';
    const expected = Buffer.from(secret);
    const actual = Buffer.from(supplied);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new UnauthorizedException();
    const update = request.body as {
      update_id?: unknown;
      message?: {
        chat?: { id?: unknown; type?: unknown };
        from?: { is_bot?: unknown };
        text?: unknown;
      };
    };
    const message = update?.message;
    if (
      !Number.isSafeInteger(update?.update_id) ||
      message?.chat?.type !== 'private' ||
      message.from?.is_bot === true ||
      !Number.isSafeInteger(message.chat.id)
    )
      return { ok: true };
    const text = typeof message.text === 'string' ? message.text : '';
    const command = text.split(/\s/, 1)[0]?.split('@', 1)[0] ?? '';
    try {
      await telegramApi('sendMessage', {
        chat_id: message.chat.id,
        text: telegramWelcome(command),
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Открыть Lingvoteka', web_app: { url: telegramMiniAppUrl() } }],
          ],
        },
      });
    } catch {
      // Telegram will retry the update. No raw request, initData or token-bearing error is logged.
      throw new ServiceUnavailableException('Не удалось ответить через Telegram');
    }
    return { ok: true };
  }
}
