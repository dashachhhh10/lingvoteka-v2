import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/database.js';

const email = `review-anytime-${randomUUID()}@example.invalid`;
const otherEmail = `review-anytime-${randomUUID()}@example.invalid`;
const password = `Smoke-${randomUUID()}-9`;
const base = process.env.BETTER_AUTH_URL ?? 'http://localhost:3001';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL ?? '').hostname))
  throw new Error('This smoke test only supports a local database');
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname))
  throw new Error('This smoke test only supports a local API');
let cookie = '';
const jsonRating = (rating: number): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ rating }),
});

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
      ...(cookie ? { Cookie: cookie } : {}),
      ...init.headers,
    },
  });
  const result = (await response.json().catch(() => null)) as T;
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  if (path === '/api/auth/sign-up/email' || path === '/api/auth/sign-in/email') {
    cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    if (!cookie) throw new Error('Registration did not create a session');
  }
  return result;
}

async function register(address: string) {
  await request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.REGISTRATION_INVITE_CODE
        ? { 'X-Registration-Code': process.env.REGISTRATION_INVITE_CODE }
        : {}),
    },
    body: JSON.stringify({ name: 'Review test', email: address, password }),
  });
}

try {
  await register(email);
  for (let index = 0; index < 12; index += 1) {
    await request('/api/vocabulary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ term: `parola-${index}`, translation: `слово ${index}` }),
    });
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const sport = await prisma.vocabItem.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: { id: true },
  });
  await prisma.vocabItem.updateMany({
    where: { id: { in: sport.map((item) => item.id) } },
    data: { semanticTopic: 'Спорт', partOfSpeech: 'Существительное', categoryStatus: 'READY' },
  });
  const material = await prisma.material.create({
    data: {
      ownerId: user.id,
      title: 'Synthetic sports lesson',
      status: 'READY',
      vocabulary: {
        create: sport.map((item) => ({ vocabItemId: item.id })),
      },
    },
  });

  const scheduled = await request<{ cards: { id: string }[]; newCount: number }>(
    '/api/reviews/queue',
  );
  if (scheduled.newCount !== 12 || scheduled.cards.length !== 12)
    throw new Error('Newly added words were capped or missing from the planned queue');
  const materialQueue = await request<{ cards: { id: string }[]; newCount: number }>(
    `/api/reviews/queue?materialId=${material.id}`,
  );
  if (materialQueue.newCount !== 3 || materialQueue.cards.length !== 3)
    throw new Error('Material queue included unrelated cards or missed new words');

  await request(`/api/reviews/${materialQueue.cards[0].id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating: 1 }),
  });
  await prisma.reviewState.updateMany({
    where: { userId: user.id, flashcardId: materialQueue.cards[0].id },
    data: { due: new Date(0) },
  });
  const mixedMaterialQueue = await request<{ cards: { id: string; kind: string }[] }>(
    `/api/reviews/queue?materialId=${material.id}`,
  );
  if (
    mixedMaterialQueue.cards.length !== 3 ||
    mixedMaterialQueue.cards[0].kind !== 'new' ||
    mixedMaterialQueue.cards[2].kind !== 'due'
  )
    throw new Error('Material queue did not put new words before due words');
  await request(`/api/reviews/${materialQueue.cards[1].id}`, jsonRating(2));
  const deferred = await request<{ cards: { id: string }[] }>('/api/reviews/deferred');
  if (
    deferred.cards.length !== 2 ||
    !materialQueue.cards
      .slice(0, 2)
      .every((card) => deferred.cards.some((item) => item.id === card.id))
  )
    throw new Error('Both Again and Hard must persist in the difficult-words folder');
  const statesBefore = await prisma.reviewState.findMany({
    where: { userId: user.id },
    orderBy: { id: 'asc' },
  });
  await request(`/api/reviews/${materialQueue.cards[0].id}/practice`, jsonRating(1));
  await request(`/api/reviews/${materialQueue.cards[0].id}/practice`, jsonRating(2));
  if ((await request<{ cards: unknown[] }>('/api/reviews/deferred')).cards.length !== 2)
    throw new Error('Repeated practice created duplicate folder entries');
  await request(`/api/reviews/${materialQueue.cards[1].id}/practice`, jsonRating(3));
  if (
    (await request<{ cards: { id: string }[] }>('/api/reviews/deferred')).cards.some(
      (card) => card.id === materialQueue.cards[1].id,
    )
  )
    throw new Error('Good did not remove the word from the folder');
  await request(`/api/reviews/${materialQueue.cards[2].id}/practice`, jsonRating(1));
  if (
    await prisma.reviewState.count({
      where: { userId: user.id, flashcardId: materialQueue.cards[2].id },
    })
  )
    throw new Error('Voluntary practice unexpectedly created a scheduled review state');
  await request(`/api/reviews/${materialQueue.cards[2].id}/practice`, jsonRating(4));
  const statesAfter = await prisma.reviewState.findMany({
    where: { userId: user.id },
    orderBy: { id: 'asc' },
  });
  if (JSON.stringify(statesBefore) !== JSON.stringify(statesAfter))
    throw new Error('Voluntary practice changed an existing FSRS state');
  for (const rating of [0, 5, 'bad']) {
    const response = await fetch(`${base}/api/reviews/${materialQueue.cards[0].id}/practice`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating }),
    });
    if (response.status !== 400) throw new Error('Invalid practice rating was accepted');
  }
  const beforePractice = await prisma.reviewEvent.count({
    where: { reviewState: { userId: user.id } },
  });
  const all = await request<{ cards: { id: string; kind: string }[] }>('/api/reviews/practice');
  if (all.cards.length !== 12 || !all.cards.some((item) => item.id === materialQueue.cards[0].id))
    throw new Error('Free practice omitted a word after it was marked forgotten');
  if (all.cards.some((item) => item.kind !== 'practice'))
    throw new Error('Free-practice cards were mislabeled');
  const filtered = await request<{ cards: { id: string }[] }>(
    '/api/reviews/practice?topic=%D0%A1%D0%BF%D0%BE%D1%80%D1%82',
  );
  if (filtered.cards.length !== 3) throw new Error('Topic filter returned the wrong cards');
  const byPart = await request<{ cards: { id: string }[] }>(
    '/api/reviews/practice?partOfSpeech=%D0%A1%D1%83%D1%89%D0%B5%D1%81%D1%82%D0%B2%D0%B8%D1%82%D0%B5%D0%BB%D1%8C%D0%BD%D0%BE%D0%B5',
  );
  if (byPart.cards.length !== 3) throw new Error('Part-of-speech filter returned wrong cards');
  const byMaterial = await request<{ cards: { id: string }[] }>(
    `/api/reviews/practice?materialId=${material.id}`,
  );
  if (byMaterial.cards.length !== 3) throw new Error('Material practice returned the wrong cards');
  const afterPractice = await prisma.reviewEvent.count({
    where: { reviewState: { userId: user.id } },
  });
  if (beforePractice !== 2 || afterPractice !== 2)
    throw new Error('Fetching free practice unexpectedly changed the FSRS schedule');

  await register(otherEmail);
  const otherDeferred = await request<{ cards: unknown[] }>('/api/reviews/deferred');
  if (otherDeferred.cards.length)
    throw new Error('Another user can see the difficult-words folder');
  const forbiddenRating = await fetch(`${base}/api/reviews/${materialQueue.cards[0].id}/practice`, {
    ...jsonRating(4),
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
  });
  if (forbiddenRating.status !== 400) throw new Error('Another user can rate this practice card');
  const isolated = await request<{ cards: unknown[] }>('/api/reviews/practice');
  if (isolated.cards.length) throw new Error('Another user can see these practice cards');
  const otherMaterialQueue = await request<{ cards: unknown[] }>(
    `/api/reviews/queue?materialId=${material.id}`,
  );
  const otherMaterialPractice = await request<{ cards: unknown[] }>(
    `/api/reviews/practice?materialId=${material.id}`,
  );
  if (otherMaterialQueue.cards.length || otherMaterialPractice.cards.length)
    throw new Error('Another user can access material cards');
  await request('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const restored = await request<{ cards: { id: string }[] }>('/api/reviews/deferred');
  if (restored.cards.length !== 1 || restored.cards[0].id !== materialQueue.cards[0].id)
    throw new Error('Folder did not survive a new authenticated session');
  console.log(
    'review_anytime=PASS new=12 practice=12 topic=3 material=3 folder=PASS persistence=PASS fsrs_unchanged=PASS isolation=PASS',
  );
} finally {
  await prisma.user.deleteMany({ where: { email: { in: [email, otherEmail] } } });
  await prisma.$disconnect();
}
