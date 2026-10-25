import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { validateTelegramInitData } from '../src/telegram-init-data.js';

const token = '123456:synthetic-only';
const now = 1_800_000_000;
function sign(fields: Record<string, string>, key = token) {
  const text = Object.entries(fields)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(key).digest();
  return new URLSearchParams({
    ...fields,
    hash: createHmac('sha256', secret).update(text).digest('hex'),
  }).toString();
}
const fields = {
  auth_date: String(now),
  user: JSON.stringify({ id: 123456789, first_name: 'Test' }),
  query_id: 'synthetic-query',
};

test('accepts signed Telegram data, including the optional signature field', () => {
  assert.deepEqual(validateTelegramInitData(sign(fields), token, now), {
    id: '123456789',
    firstName: 'Test',
  });
  assert.equal(
    validateTelegramInitData(sign({ ...fields, signature: 'opaque-signature' }), token, now).id,
    '123456789',
  );
});

test('rejects tampering, another bot, missing hash and duplicate fields', () => {
  const raw = sign(fields);
  const changed = new URLSearchParams(raw);
  changed.set('user', JSON.stringify({ id: 987654321, first_name: 'Other' }));
  for (const candidate of [
    changed.toString(),
    sign(fields, 'another-bot'),
    raw.replace(/hash=[^&]+/, 'hash=no'),
    `${raw}&auth_date=${now}`,
    `${raw}&user=${fields.user}`,
  ])
    assert.throws(() => validateTelegramInitData(candidate, token, now));
});

test('rejects expired, future, malformed or oversized credentials and unsafe user IDs', () => {
  for (const candidate of [
    sign({ ...fields, auth_date: String(now - 601) }),
    sign({ ...fields, auth_date: String(now + 31) }),
    sign({ ...fields, auth_date: 'NaN' }),
    sign({ ...fields, user: '{broken' }),
    sign({
      ...fields,
      user: JSON.stringify({ id: Number.MAX_SAFE_INTEGER + 1, first_name: 'Test' }),
    }),
    sign({ ...fields, user: JSON.stringify({ id: 0, first_name: 'Test' }) }),
    sign({ ...fields, user: JSON.stringify({ id: 123, first_name: 'Test', is_bot: true }) }),
    'x'.repeat(16_385),
  ])
    assert.throws(() => validateTelegramInitData(candidate, token, now));
});
