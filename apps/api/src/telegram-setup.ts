import { telegramApi, telegramMiniAppUrl, telegramWebhookSecret } from './telegram-bot.js';

export async function configureTelegramBot(apply: boolean) {
  const url = telegramMiniAppUrl();
  const webhook = new URL('/api/telegram/webhook', url).toString();
  const secret = telegramWebhookSecret();
  if (!secret) throw new Error('TELEGRAM_BOT_TOKEN is required');
  const bot = await telegramApi<{ username: string; is_bot: boolean }>('getMe', {});
  if (!bot.is_bot || !/^[A-Za-z0-9_]{5,32}$/.test(bot.username))
    throw new Error('Invalid Telegram bot identity');
  if (!apply) return { bot: `@${bot.username}`, miniApp: url, webhook, mode: 'check' };
  await telegramApi('setMyCommands', {
    commands: [
      { command: 'start', description: 'Открыть Lingvoteka' },
      { command: 'help', description: 'Как начать заниматься' },
    ],
  });
  await telegramApi('setChatMenuButton', {
    menu_button: { type: 'web_app', text: 'Lingvoteka', web_app: { url } },
  });
  await telegramApi('setWebhook', {
    url: webhook,
    secret_token: secret,
    allowed_updates: ['message'],
  });
  const info = await telegramApi<{ url: string; pending_update_count: number }>(
    'getWebhookInfo',
    {},
  );
  const menu = await telegramApi<{ type: string; web_app?: { url: string } }>(
    'getChatMenuButton',
    {},
  );
  if (info.url !== webhook || menu.type !== 'web_app' || menu.web_app?.url !== url)
    throw new Error('Telegram settings verification failed');
  return {
    bot: `@${bot.username}`,
    miniApp: url,
    webhook,
    mode: 'apply',
    pendingUpdates: info.pending_update_count,
  };
}

/** Local development must not replace the production webhook. */
export async function initializeTelegramBot() {
  if (process.env.NODE_ENV !== 'production' || !process.env.TELEGRAM_BOT_TOKEN) return;
  try {
    console.info(`Telegram setup ready ${JSON.stringify(await configureTelegramBot(true))}`);
  } catch {
    // Fetch errors may contain a token-bearing URL; never log them.
    console.warn('Telegram setup failed; check bot token, HTTPS origin and Telegram availability');
  }
}
