import { createHmac } from 'node:crypto';

/** Stable across replicas/restarts; purpose separation keeps the bot token private. */
export function telegramWebhookSecret() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return undefined;
  const explicit = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (explicit) {
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(explicit))
      throw new Error('Invalid TELEGRAM_WEBHOOK_SECRET format');
    return explicit;
  }
  return createHmac('sha256', token).update('lingvoteka:telegram:webhook:v1').digest('hex');
}

export function telegramMiniAppUrl() {
  const value = process.env.TELEGRAM_MINI_APP_URL ?? process.env.WEB_ORIGIN;
  if (!value) throw new Error('TELEGRAM_MINI_APP_URL is required');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search)
    throw new Error('Telegram Mini App requires a clean HTTPS URL');
  return url.origin;
}

/** Never include Telegram API URLs in errors: their path contains the bot token. */
export async function telegramApi<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error('Telegram API is unavailable');
  }
  const payload = (await response.json().catch(() => null)) as { ok?: boolean; result?: T } | null;
  if (!response.ok || !payload?.ok)
    throw new Error(`Telegram API request failed (${response.status})`);
  return payload.result as T;
}

export function telegramWelcome(command: string) {
  if (command === '/help')
    return 'Открой Lingvoteka кнопкой ниже. В приложении доступны материалы, словарь, карточки и грамматика. При первом входе войди в свой аккаунт сайта и подтверди привязку Telegram. Пока материалы загружаются внутри приложения.';
  if (command === '/start')
    return 'Ciao! Это Lingvoteka — твои уроки, слова и повторение в одном месте. Открой приложение. Если ты уже занимаешься на сайте, войди в тот же аккаунт, чтобы сохранить материалы и прогресс.';
  return 'Пока загружай материалы внутри Lingvoteka. Нажми кнопку ниже, чтобы открыть приложение.';
}
