import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/database.js';

const email = `flow-${randomUUID()}@example.invalid`;
const secondEmail = `flow-${randomUUID()}@example.invalid`;
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
    if (!cookie) throw new Error('register: session cookie missing');
  }
  return payload;
}

async function expectStatus(label: string, path: string, expected: number): Promise<void> {
  const response = await fetch(`${apiBase}${path}`, { headers: { Cookie: cookie } });
  if (response.status !== expected) {
    throw new Error(`${label}: expected HTTP ${expected}, received ${response.status}`);
  }
}

async function register(testEmail: string): Promise<void> {
  await request('register', '/api/auth/sign-up/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.REGISTRATION_INVITE_CODE
        ? { 'X-Registration-Code': process.env.REGISTRATION_INVITE_CODE }
        : {}),
    },
    body: JSON.stringify({ name: 'Flow test', email: testEmail, password }),
  });
}

async function waitFor<T extends { status?: string; theoryStatus?: string }>(
  label: string,
  path: string,
  ready: string,
  maxMs = 180_000,
): Promise<T> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const result = await request<T>(label, path);
    if (result.status === ready || result.theoryStatus === ready) return result;
    if (result.status === 'ERROR' || result.theoryStatus === 'ERROR') {
      throw new Error(`${label}: background task failed`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`${label}: timeout`);
}

try {
  await register(email);
  const form = new FormData();
  form.set('title', 'Тестовый урок: настоящее время');
  form.set(
    'noteText',
    'Presente indicativo dei verbi in -are. Io parlo italiano. Tu parli con Marco. Lei parla ogni giorno. Parole: parlare — говорить, libro — книга, amico — друг.',
  );
  const material = await request<{ id: string }>('material create', '/api/materials', {
    method: 'POST',
    body: form,
  });
  await request('material analysis enqueue', `/api/materials/${material.id}/analyze`, {
    method: 'POST',
  });
  const analyzed = await waitFor<{
    status: string;
    analysisDraft: {
      vocabulary: Record<string, string>[];
      grammar: Record<string, string>[];
    };
  }>('material analysis', `/api/materials/${material.id}`, 'REVIEW');
  if (!analyzed.analysisDraft?.vocabulary?.length || !analyzed.analysisDraft.grammar?.length) {
    throw new Error('AI draft did not include vocabulary and grammar');
  }
  await request('material approval', `/api/materials/${material.id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vocabulary: analyzed.analysisDraft.vocabulary.slice(0, 2),
      grammar: analyzed.analysisDraft.grammar.slice(0, 1),
    }),
  });
  const vocabulary = await request<{ id: string }[]>('vocabulary list', '/api/vocabulary');
  if (!vocabulary.length) throw new Error('Approved words were not saved');
  const queue = await request<{
    cards: { id: string; term: string }[];
  }>('review queue', '/api/reviews/queue');
  if (!queue.cards.length) throw new Error('Approved words were not added to the review queue');
  const savedCard = await prisma.flashcard.findUnique({ where: { id: queue.cards[0].id } });
  if (!savedCard || savedCard.vocabItemId === savedCard.id) {
    throw new Error('Review queue did not return a separate flashcard');
  }
  await request('review card', `/api/reviews/${queue.cards[0].id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating: 3 }),
  });
  const reviewState = await prisma.reviewState.findFirst({
    where: { flashcardId: savedCard.id },
  });
  if (!reviewState) throw new Error('Review state was not stored for the flashcard');
  const topics = await request<{ id: string }[]>('grammar list', '/api/grammar');
  if (!topics.length) throw new Error('Approved grammar topic missing');
  await request('grammar enqueue', `/api/grammar/${topics[0].id}/generate`, { method: 'POST' });
  const generated = await waitFor<{
    theoryStatus: string;
    theory: unknown;
    exercises: { id: string }[];
  }>('grammar generation', `/api/grammar/${topics[0].id}`, 'READY');
  if (!generated.theory || generated.exercises.length < 1) {
    throw new Error('Generated grammar content is incomplete');
  }
  const checked = await request<{ correct: boolean }>(
    'exercise check',
    `/api/grammar/exercises/${generated.exercises[0].id}/check`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answerIndex: 0 }),
    },
  );
  if (typeof checked.correct !== 'boolean') throw new Error('Exercise result is incomplete');
  await register(secondEmail);
  await expectStatus('material isolation', `/api/materials/${material.id}`, 404);
  await expectStatus('grammar isolation', `/api/grammar/${topics[0].id}`, 404);
  const otherVocabulary = await request<unknown[]>('other vocabulary', '/api/vocabulary');
  if (otherVocabulary.length) throw new Error("Second user can see another user's vocabulary");
  console.log(
    `full_flow=PASS words=${analyzed.analysisDraft.vocabulary.length} grammar=${analyzed.analysisDraft.grammar.length} exercises=${generated.exercises.length} isolation=PASS`,
  );
} finally {
  await prisma.user.deleteMany({ where: { email: { in: [email, secondEmail] } } });
  await prisma.$disconnect();
}
