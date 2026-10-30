import 'dotenv/config';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import type { Request } from 'express';

const database = new URL(process.env.DATABASE_URL!);
if (!['localhost', '127.0.0.1', '[::1]'].includes(database.hostname))
  throw new Error('Local DB only');
const schema = `categories_${randomUUID().replaceAll('-', '')}`;
database.searchParams.set('schema', schema);
process.env.DATABASE_URL = database.toString();
process.env.GEMINI_API_KEY = 'synthetic-test-key';
process.env.GEMINI_API_BASE_URL = 'https://gemini.invalid';
const { prisma } = await import('../src/database.js');
const oldFetch = globalThis.fetch;
try {
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    env: process.env,
    stdio: 'pipe',
  });
  const { auth } = await import('../src/auth.js');
  const { StudyController } = await import('../src/study.controller.js');
  const { processVocabularyClassification, failVocabularyClassification } =
    await import('../src/vocabulary-classification-job.js');
  const controller = new StudyController();
  async function register() {
    const response = await auth.handler(
      new globalThis.Request(`${process.env.BETTER_AUTH_URL}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: process.env.WEB_ORIGIN! },
        body: JSON.stringify({
          name: 'Synthetic categories',
          email: `${randomUUID()}@example.invalid`,
          password: `Synthetic-${randomUUID()}`,
        }),
      }),
    );
    assert.equal(response.status, 200);
    const cookie = response.headers
      .getSetCookie()
      .map((v) => v.split(';')[0])
      .join('; ');
    const { user } = (await response.json()) as { user: { id: string } };
    return { id: user.id, request: { headers: { cookie } } as Request };
  }
  const owner = await register(),
    other = await register();
  const word = await controller.addVocabulary(owner.request, {
    term: 'alzarsi',
    translation: 'вставать',
  });
  const foreign = await controller.addVocabulary(other.request, {
    term: 'alzarsi',
    translation: 'вставать',
  });
  await prisma.vocabItem.updateMany({
    where: { id: { in: [word.id, foreign.id] } },
    data: { partOfSpeech: 'Глагол', semanticTopic: 'Тело и здоровье', categoryStatus: 'READY' },
  });
  await assert.rejects(controller.recheckCategories({ headers: {} } as Request));
  assert.deepEqual(await controller.recheckCategories(owner.request), { queued: 1 });
  assert.deepEqual(await controller.recheckCategories(owner.request), { queued: 0 });
  assert.equal(
    (await prisma.vocabItem.findUniqueOrThrow({ where: { id: word.id } })).semanticTopic,
    'Тело и здоровье',
  );
  assert.equal(
    (await prisma.vocabItem.findUniqueOrThrow({ where: { id: foreign.id } })).categoryStatus,
    'READY',
  );
  await failVocabularyClassification(owner.id);
  let saved = await prisma.vocabItem.findUniqueOrThrow({ where: { id: word.id } });
  assert.equal(saved.categoryStatus, 'RECHECK_ERROR');
  assert.equal(saved.semanticTopic, 'Тело и здоровье');
  await controller.recheckCategories(owner.request);
  let whileResponding: (() => Promise<void>) | undefined;
  globalThis.fetch = async (_input, init) => {
    const prompt = JSON.parse(String(init?.body)).contents[0].parts[0].text as string;
    const inputs = JSON.parse(prompt.slice(prompt.lastIndexOf('\n\n') + 2)) as {
      id: string;
      partOfSpeech: string;
      semanticTopic: string | null;
    }[];
    assert.equal(inputs.length, 1);
    assert.equal(inputs[0].id, word.id);
    assert.equal(inputs[0].semanticTopic, null);
    assert.equal(inputs[0].partOfSpeech, 'Глагол');
    await whileResponding?.();
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    items: [
                      { id: word.id, partOfSpeech: 'Существительное', semanticTopic: 'Дом и быт' },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      }),
    );
  };
  const cards = await controller.queue(owner.request);
  await controller.review(owner.request, cards.cards[0].id, { rating: 2 });
  const beforeStates = await prisma.reviewState.findMany({
    where: { userId: owner.id },
    include: { events: true },
  });
  const beforeDeferred = await prisma.deferredCard.findMany({ where: { userId: owner.id } });
  const before = await controller.vocabulary(owner.request);
  await processVocabularyClassification(owner.id);
  saved = await prisma.vocabItem.findUniqueOrThrow({ where: { id: word.id } });
  assert.equal(saved.semanticTopic, 'Дом и быт');
  assert.equal(saved.partOfSpeech, 'Глагол');
  assert.equal(saved.categoryStatus, 'READY');
  const after = await controller.vocabulary(owner.request);
  assert.deepEqual(
    await prisma.reviewState.findMany({ where: { userId: owner.id }, include: { events: true } }),
    beforeStates,
  );
  assert.deepEqual(
    await prisma.deferredCard.findMany({ where: { userId: owner.id } }),
    beforeDeferred,
  );
  assert.deepEqual(
    after.map(({ semanticTopic: _topic, categoryStatus: _status, ...rest }) => rest),
    before.map(({ semanticTopic: _topic, categoryStatus: _status, ...rest }) => rest),
  );
  // Concurrent category update wins over the delayed AI response.
  await controller.recheckCategories(owner.request);
  whileResponding = async () => {
    await prisma.vocabItem.update({
      where: { id: word.id },
      data: { semanticTopic: 'Спорт', categoryStatus: 'READY' },
    });
  };
  await processVocabularyClassification(owner.id);
  assert.equal(
    (await prisma.vocabItem.findUniqueOrThrow({ where: { id: word.id } })).semanticTopic,
    'Спорт',
  );
  assert.equal(
    (await prisma.vocabItem.findUniqueOrThrow({ where: { id: foreign.id } })).semanticTopic,
    'Тело и здоровье',
  );
  console.log(
    'categories=PASS owner_isolation=PASS failure_retains_topics=PASS progress_unchanged=PASS concurrent_edit=PASS',
  );
} finally {
  globalThis.fetch = oldFetch;
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await prisma.$disconnect();
}
