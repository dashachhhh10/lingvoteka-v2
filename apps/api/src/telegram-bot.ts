import { createHmac } from 'node:crypto';

export class TelegramApiError extends Error {
  constructor(
    readonly method: string,
    readonly kind: 'network' | 'request',
    readonly status?: number,
  ) {
    super(
      kind === 'network'
        ? 'Telegram API is unavailable'
        : `Telegram API request failed (${status})`,
    );
  }
}

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
export async function telegramApi<T>(
  method: string,
  body: Record<string, unknown> | FormData,
): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
      body: body instanceof FormData ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new TelegramApiError(method, 'network');
  }
  const payload = (await response.json().catch(() => null)) as { ok?: boolean; result?: T } | null;
  if (!response.ok || !payload?.ok) throw new TelegramApiError(method, 'request', response.status);
  return payload.result as T;
}
