import {
  Controller,
  Inject,
  Post,
  Req,
  HttpCode,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { TelegramService } from './telegram.service.js';
import type { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { telegramWebhookSecret } from './telegram-bot.js';

@Controller('telegram')
export class TelegramController {
  constructor(@Inject(TelegramService) private readonly telegram: TelegramService) {}
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
    try {
      await this.telegram.accept(request.body);
    } catch {
      throw new ServiceUnavailableException('Приём материала временно недоступен');
    }
    return { ok: true };
  }
}
