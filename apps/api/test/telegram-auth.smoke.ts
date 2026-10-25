import 'dotenv/config';
import { randomUUID, createHmac } from 'node:crypto';
import assert from 'node:assert/strict';
import { prisma } from '../src/database.js';

if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL!).hostname))
  throw new Error('Telegram smoke test is restricted to the local database');
process.env.TELEGRAM_BOT_TOKEN = '123456:synthetic-smoke-token';
const { auth } = await import('../src/auth.js');
const base = process.env.BETTER_AUTH_URL ?? 'http://localhost:3001';
const origin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
const emails = [
  `telegram-${randomUUID()}@example.invalid`,
  `telegram-${randomUUID()}@example.invalid`,
];
const password = `Synthetic-${randomUUID()}-9`;
const telegramId = Math.floor(1_000_000_000_000 + Math.random() * 1_000_000_000_000);

function signed(id: number) {
  const fields = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id, first_name: 'Synthetic' }),
  };
  const secret = createHmac('sha256', 'WebAppData')
    .update(process.env.TELEGRAM_BOT_TOKEN!)
    .digest();
  const text = Object.entries(fields)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  return new URLSearchParams({
    ...fields,
    hash: createHmac('sha256', secret).update(text).digest('hex'),
  }).toString();
}
async function call(path: string, body?: unknown, cookie = '', requestOrigin = origin) {
  const response = await auth.handler(
    new Request(`${base}/api/auth${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Origin: requestOrigin,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
  const data = (await response.json()) as { user?: { id: string }; status?: string };
  return {
    status: response.status,
    data,
    cookie: response.headers
      .getSetCookie()
      .map((v) => v.split(';')[0])
      .join('; '),
  };
}

try {
  const first = await call('/sign-up/email', {
    name: 'Telegram smoke',
    email: emails[0],
    password,
  });
  const second = await call('/sign-up/email', { name: 'Other smoke', email: emails[1], password });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.ok(first.cookie);
  const userId = first.data.user!.id;
  const material = await prisma.material.create({
    data: { ownerId: userId, title: 'Synthetic retained lesson' },
  });
  const initData = signed(telegramId);
  assert.equal((await call('/telegram/sign-in', { initData })).data.status, 'link_required');
  assert.equal((await call('/telegram/link', { initData })).status, 401);
  assert.equal(
    (await call('/telegram/link', { initData: `${initData}broken` }, first.cookie)).status,
    401,
  );
  assert.equal(
    (await call('/telegram/link', { initData }, first.cookie, 'https://untrusted.example')).status,
    403,
  );
  assert.equal(
    (await call('/telegram/status', { initData }, first.cookie)).data.status,
    'unlinked',
  );
  const concurrentLinks = await Promise.all([
    call('/telegram/link', { initData }, first.cookie),
    call('/telegram/link', { initData }, first.cookie),
  ]);
  assert.ok(concurrentLinks.every((result) => result.data.status === 'linked'));
  assert.equal((await call('/telegram/link', { initData }, first.cookie)).data.status, 'linked');
  assert.equal((await call('/telegram/link', { initData }, second.cookie)).status, 409);
  assert.equal(
    (await call('/telegram/link', { initData: signed(telegramId + 1) }, first.cookie)).status,
    409,
  );
  assert.equal(
    (await call('/telegram/status', { initData }, second.cookie)).data.status,
    'conflict',
  );
  const login = await call('/telegram/sign-in', { initData });
  assert.equal(login.status, 200);
  assert.equal(login.data.status, 'signed_in');
  assert.ok(login.cookie);
  assert.equal((await call('/get-session', undefined, login.cookie)).data.user!.id, userId);
  assert.equal(
    (await prisma.material.findUniqueOrThrow({ where: { id: material.id } })).ownerId,
    userId,
  );
  delete process.env.TELEGRAM_BOT_TOKEN;
  assert.equal((await call('/telegram/sign-in', { initData })).status, 503);
  assert.equal((await call('/sign-in/email', { email: emails[0], password })).status, 200);
  console.log(
    'telegram_auth=PASS signature=PASS explicit_link=PASS isolation=PASS retained_data=PASS web_login=PASS',
  );
} finally {
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
}
