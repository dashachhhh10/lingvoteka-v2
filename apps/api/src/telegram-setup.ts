import { synchronizeTelegramAvatar } from './telegram-brand.js';
import { setTimeout as delay } from 'node:timers/promises';
import { BOT_COMMANDS, BOT_DESCRIPTION, BOT_SHORT_DESCRIPTION } from './telegram-message.js';
import {
  TelegramApiError,
  telegramApi,
  telegramMiniAppUrl,
  telegramWebhookSecret,
} from './telegram-bot.js';

export async function configureTelegramBot(apply: boolean) {
  const url = telegramMiniAppUrl();
  const menuText = 'Lingvoteka';
  const webhook = new URL('/api/telegram/webhook', url).toString();
  const secret = telegramWebhookSecret();
  if (!secret) throw new Error('TELEGRAM_BOT_TOKEN is required');
  const bot = await telegramApi<{ id: number; username: string; is_bot: boolean }>('getMe', {});
  if (!bot.is_bot || !/^[A-Za-z0-9_]{5,32}$/.test(bot.username))
    throw new Error('Invalid Telegram bot identity');
  if (!apply) return { bot: `@${bot.username}`, miniApp: url, webhook, mode: 'check' };
  console.info(`Telegram bot verified @${bot.username}`);
  await telegramApi('setMyName', { name: 'Lingvoteka' });
  await telegramApi('setMyDescription', { description: BOT_DESCRIPTION });
  await telegramApi('setMyShortDescription', { short_description: BOT_SHORT_DESCRIPTION });
  const commands = BOT_COMMANDS;
  await telegramApi('setMyCommands', { commands });
  // The button beside the input opens the Mini App; typing `/` still suggests the commands.
  await telegramApi('setChatMenuButton', {
    menu_button: { type: 'web_app', text: menuText, web_app: { url } },
  });
  await telegramApi('setWebhook', {
    url: webhook,
    secret_token: secret,
    allowed_updates: ['message', 'callback_query'],
  });
  const info = await telegramApi<{ url: string; pending_update_count: number }>(
    'getWebhookInfo',
    {},
  );
  type Menu = { type: string; text?: string; web_app?: { url: string } };
  let menu = await telegramApi<Menu>('getChatMenuButton', {});
  const savedCommands = await telegramApi<{ command: string }[]>('getMyCommands', {});
  if (info.url !== webhook) throw new Error('Telegram webhook verification failed');
  if (
    savedCommands.map((item) => item.command).join() !== commands.map((item) => item.command).join()
  )
    throw new Error('Telegram commands verification failed');
  // Telegram can briefly return the previous label immediately after a successful update.
  for (const waitMs of [1_000, 3_000, 6_000]) {
    if (menu.type !== 'web_app' || menu.text === menuText) break;
    await delay(waitMs);
    menu = await telegramApi<Menu>('getChatMenuButton', {});
  }
  // Telegram may canonicalize an origin-only menu URL by adding its trailing slash.
  let menuUrlMatches = false;
  try {
    menuUrlMatches = new URL(menu.web_app?.url ?? '').href === new URL(url).href;
  } catch {
    // An absent/malformed URL is a failed verification, never an error to serialize.
  }
  if (menu.type !== 'web_app' || menu.text !== menuText || !menuUrlMatches) {
    console.warn(
      `Telegram menu type ${['commands', 'default', 'web_app'].includes(menu.type) ? menu.type : 'unknown'}`,
    );
    throw new Error('Telegram menu verification failed');
  }
  return {
    bot: `@${bot.username}`,
    botId: bot.id,
    miniApp: url,
    webhook,
    mode: 'apply',
    pendingUpdates: info.pending_update_count,
    menu: menu.type,
    menuText: menu.text,
    commands: savedCommands.map((item) => `/${item.command}`),
  };
}

/** Local development must not replace the production webhook. */
export async function initializeTelegramBot() {
  if (process.env.NODE_ENV !== 'production' || !process.env.TELEGRAM_BOT_TOKEN) return;
  try {
    const result = await configureTelegramBot(true);
    const avatar = await synchronizeTelegramAvatar(result.botId!);
    console.info(`Telegram setup ready ${JSON.stringify({ ...result, avatar })}`);
  } catch (error) {
    // Fetch errors may contain a token-bearing URL; never log them.
    const knownSettingsErrors = [
      'Invalid Telegram bot identity',
      'Telegram webhook verification failed',
      'Telegram menu verification failed',
      'Telegram commands verification failed',
      'Invalid TELEGRAM_WEBHOOK_SECRET format',
      'Telegram Mini App requires a clean HTTPS URL',
      'TELEGRAM_MINI_APP_URL is required',
    ];
    const detail =
      error instanceof TelegramApiError
        ? { method: error.method, kind: error.kind, status: error.status ?? null }
        : {
            kind: 'invalid-settings',
            reason:
              error instanceof Error && knownSettingsErrors.includes(error.message)
                ? error.message
                : 'Unknown settings error',
          };
    console.warn(`Telegram setup failed ${JSON.stringify(detail)}`);
  }
}
