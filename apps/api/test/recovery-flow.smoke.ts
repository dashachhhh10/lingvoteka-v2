import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/database.js';
import { processMaterialAnalysis } from '../src/material-analysis-job.js';

const email = `recovery-flow-${randomUUID()}@example.invalid`;
const password = `Smoke-${randomUUID()}-9`;
const apiBase = process.env.BETTER_AUTH_URL ?? 'http://localhost:3001';
let cookie = '';

async function request<T>(label: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      Origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
      ...(cookie ? { Cookie: cookie } : {}),
      ...init.headers,
    },
  });
  const payload = (await response.json().catch(() => null)) as T;
  if (!response.ok) {
    throw new Error(`${label}: HTTP ${response.status} ${JSON.stringify(payload).slice(0, 300)}`);
  }
  if (label === 'register') {
    cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    assert.ok(cookie, 'registration must create a session without email confirmation');
  }
  return payload;
}

async function createMaterial(title: string): Promise<string> {
  const form = new FormData();
  form.set('title', title);
  form.set(
    'noteText',
    'Presente indicativo: io gioco a calcio, tu giochi a calcio. Giocare — играть, calcio — футбол.',
  );
  const material = await request<{ id: string }>('material create', '/api/materials', {
    method: 'POST',
    body: form,
  });
  return material.id;
}

async function simulateMissingAi(id: string): Promise<void> {
  await prisma.material.update({ where: { id }, data: { status: 'PROCESSING' } });
  const originalKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    await assert.rejects(processMaterialAnalysis(id), /AI не настроен/);
  } finally {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  }
  // The worker writes the public error state after a permanent AI failure.
  await prisma.material.update({
    where: { id },
    data: { status: 'ERROR', analysisError: 'AI не настроен: добавь GEMINI_API_KEY на сервере' },
  });
}

try {
  await request('register', '/api/auth/sign-up/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.REGISTRATION_INVITE_CODE
        ? { 'X-Registration-Code': process.env.REGISTRATION_INVITE_CODE }
        : {}),
    },
    body: JSON.stringify({ name: 'Recovery flow test', email, password }),
  });

  const manualId = await createMaterial('Ручное восстановление');
  await simulateMissingAi(manualId);
  const failed = await request<{ status: string; analysisError: string }>(
    'failed material',
    `/api/materials/${manualId}`,
  );
  assert.equal(failed.status, 'ERROR');
  assert.match(failed.analysisError, /AI не настроен/);
  const saved = await request<{ status: string; vocabulary: unknown[]; grammar: unknown[] }>(
    'manual review after error',
    `/api/materials/${manualId}/review`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vocabulary: [
          {
            term: 'giocare',
            translation: 'играть',
            example: 'io gioco a calcio',
            sourceExcerpt: 'io gioco a calcio',
            partOfSpeech: 'Глагол',
            semanticTopic: 'Спорт',
          },
        ],
        grammar: [
          {
            title: 'Presente indicativo',
            summary: 'Настоящее время из урока',
            sourceExcerpt: 'Presente indicativo',
          },
        ],
      }),
    },
  );
  assert.equal(saved.status, 'READY');
  assert.equal(saved.vocabulary.length, 1);
  assert.equal(saved.grammar.length, 1);

  const retryId = await createMaterial('Повторная обработка');
  await simulateMissingAi(retryId);
  await request('retry analysis', `/api/materials/${retryId}/analyze`, { method: 'POST' });
  const deadline = Date.now() + 180_000;
  let status = 'PROCESSING';
  while (Date.now() < deadline) {
    const material = await request<{
      status: string;
      analysisError: string | null;
      analysisDraft: unknown;
    }>('retry result', `/api/materials/${retryId}`);
    status = material.status;
    if (status === 'REVIEW') {
      assert.equal(material.analysisError, null);
      assert.ok(material.analysisDraft);
      break;
    }
    if (status === 'ERROR') throw new Error(`Retry failed: ${material.analysisError}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  assert.equal(status, 'REVIEW', 'retry must return an editable AI draft');
  console.log('recovery_flow=PASS manual_after_error=PASS retry_after_error=PASS');
} finally {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
}
