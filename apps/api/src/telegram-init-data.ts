import { createHmac, timingSafeEqual } from 'node:crypto';

export type TelegramUser = { id: string; firstName: string };

/** initData is a short-lived credential. Never persist it or log its contents. */
export function validateTelegramInitData(
  raw: unknown,
  botToken: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): TelegramUser {
  const invalid = () => new Error('Открой приложение заново из Telegram и попробуй ещё раз.');
  if (typeof raw !== 'string' || !raw || raw.length > 16_384 || !botToken) throw invalid();
  const params = new URLSearchParams(raw);
  const entries = [...params.entries()];
  if (entries.length > 20 || new Set(entries.map(([key]) => key)).size !== entries.length)
    throw invalid();
  const hash = params.get('hash') ?? '';
  const date = params.get('auth_date') ?? '';
  if (!/^[a-f0-9]{64}$/i.test(hash) || !/^\d{1,12}$/.test(date)) throw invalid();
  const signedAt = Number(date);
  if (signedAt > nowSeconds + 30 || nowSeconds - signedAt > 600) throw invalid();
  const dataCheck = entries
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(dataCheck).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) throw invalid();
  let user: unknown;
  try {
    user = JSON.parse(params.get('user') ?? 'null');
  } catch {
    throw invalid();
  }
  if (!user || typeof user !== 'object' || !('id' in user)) throw invalid();
  const record = user as Record<string, unknown>;
  if (
    !Number.isSafeInteger(record.id) ||
    (record.id as number) <= 0 ||
    record.is_bot === true ||
    typeof record.first_name !== 'string' ||
    !record.first_name.trim()
  )
    throw invalid();
  return { id: String(record.id), firstName: record.first_name.trim().slice(0, 120) };
}
