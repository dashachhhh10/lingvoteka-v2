import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/database.js';

const email = `theory-${randomUUID()}@example.invalid`;
const otherEmail = `theory-${randomUUID()}@example.invalid`;
const password = `Smoke-${randomUUID()}-9`;
const apiBase = process.env.BETTER_AUTH_URL ?? 'http://localhost:3001';
const origin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';

async function register(address: string): Promise<string> {
  const response = await fetch(`${apiBase}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      ...(process.env.REGISTRATION_INVITE_CODE
        ? { 'X-Registration-Code': process.env.REGISTRATION_INVITE_CODE }
        : {}),
    },
    body: JSON.stringify({ name: 'Synthetic theory test', email: address, password }),
  });
  if (!response.ok) throw new Error(`Registration failed: HTTP ${response.status}`);
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  if (!cookie) throw new Error('Registration did not return a session cookie');
  return cookie;
}

async function request(path: string, cookie: string, init: RequestInit = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { Origin: origin, Cookie: cookie, ...init.headers },
  });
  return { status: response.status, body: await response.json() };
}

try {
  const ownerCookie = await register(email);
  const created = await request('/api/grammar', ownerCookie, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Synthetic theory edit' }),
  });
  if (created.status !== 201) throw new Error(`Topic creation: HTTP ${created.status}`);
  const topicId = created.body.id as string;
  const path = `/api/grammar/${topicId}/theory`;
  const theory = {
    when: 'Исправленное правило',
    formation: 'Исправленное образование',
    examples: [{ italian: 'Il libro è qui.', russian: 'Книга здесь.' }],
    mistakes: ['Не путать артикли.'],
  };
  const beforeReady = await request(path, ownerCookie, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(theory),
  });
  if (beforeReady.status !== 400) throw new Error('Theory was editable before generation');
  await prisma.grammarTopic.update({
    where: { id: topicId },
    data: {
      theoryStatus: 'READY',
      theory: { when: 'AI draft', formation: 'AI draft', examples: [], mistakes: [] },
    },
  });
  const malformed = await request(path, ownerCookie, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...theory, examples: [] }),
  });
  if (malformed.status !== 400) throw new Error('Malformed theory was accepted');
  const otherCookie = await register(otherEmail);
  const outsider = await request(path, otherCookie, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(theory),
  });
  if (outsider.status !== 404) throw new Error("Second user could edit someone else's theory");
  const saved = await request(path, ownerCookie, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(theory),
  });
  if (saved.status !== 200 || saved.body.theory?.when !== theory.when)
    throw new Error('Edited theory was not returned');
  const reread = await request(`/api/grammar/${topicId}`, ownerCookie);
  if (reread.status !== 200 || reread.body.theory?.formation !== theory.formation)
    throw new Error('Edited theory was not persisted');
  console.log('grammar_theory_edit=PASS validation=PASS isolation=PASS persistence=PASS');
} finally {
  await prisma.user.deleteMany({ where: { email: { in: [email, otherEmail] } } });
  await prisma.$disconnect();
}
