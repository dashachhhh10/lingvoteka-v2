import 'dotenv/config';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Request } from 'express';
import type { MaterialQueueService } from '../src/material-queue.js';
import type { Draft } from '../src/material-analysis.js';

const database = new URL(process.env.DATABASE_URL!);
if (!['localhost', '127.0.0.1', '[::1]'].includes(database.hostname))
  throw new Error('Local database only');
const schema = `practice_${randomUUID().replaceAll('-', '')}`;
database.searchParams.set('schema', schema);
process.env.DATABASE_URL = database.toString();
process.env.FILE_STORAGE = 'local';
const uploadDir = await mkdtemp(join(tmpdir(), 'lingvoteka-practice-'));
process.env.UPLOAD_DIR = uploadDir;
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
  const { GrammarController } = await import('../src/grammar.controller.js');
  const { MaterialsController } = await import('../src/materials.controller.js');
  const { StudyController } = await import('../src/study.controller.js');
  const { processGrammarGeneration } = await import('../src/grammar-generation-job.js');
  const { processMaterialAnalysis } = await import('../src/material-analysis-job.js');
  const { processFileDeletions } = await import('../src/file-cleanup.js');
  const { storeFile } = await import('../src/file-storage.js');
  const jobs: { id: string; mode: string }[] = [];
  let failQueue = false;
  const queue = {
    enqueueGrammar: async (id: string, mode = 'theory') => {
      if (failQueue) throw new Error('Synthetic queue outage');
      jobs.push({ id, mode });
      return randomUUID();
    },
  } as unknown as MaterialQueueService;
  const grammar = new GrammarController(queue);
  const materials = new MaterialsController(queue);
  const study = new StudyController();
  async function register() {
    const response = await auth.handler(
      new globalThis.Request(`${process.env.BETTER_AUTH_URL}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: process.env.WEB_ORIGIN! },
        body: JSON.stringify({
          name: 'Synthetic practice',
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
    const body = (await response.json()) as { user: { id: string } };
    return { request: { headers: { cookie } } as Request, id: body.user.id };
  }
  const owner = await register(),
    other = await register();
  const theory = {
    when: 'О конкретном предмете.',
    formation: 'Артикль согласуется с существительным.',
    examples: [{ italian: 'La casa è grande.', russian: 'Дом большой.' }],
    mistakes: ['Не путать род.'],
  };
  const exercises = ['casa', 'scuola', 'porta', 'strada'].map((word) => ({
    prompt: `___ ${word} è grande.`,
    options: ['La', 'Il', 'Lo', 'Gli'],
    answerIndex: 0,
    explanation: `${word} — женского рода в единственном числе.`,
  }));
  const aiScopes: string[][] = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const required = body.generationConfig.responseSchema.required as string[];
    aiScopes.push(required);
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ theory, exercises }) }] } }],
      }),
    );
  };
  const draft: Draft = {
    vocabulary: [
      {
        term: 'il limone',
        translation: 'лимон',
        example: '',
        sourceExcerpt: '',
        partOfSpeech: 'Существительное',
        semanticTopic: 'Еда и напитки',
      },
    ],
    grammar: [{ title: 'Артикли', summary: 'Выбор артикля.', sourceExcerpt: '' }],
  };
  async function material(title: string, data = draft) {
    return prisma.material.create({
      data: { ownerId: owner.id, title, status: 'REVIEW', analysisDraft: data },
    });
  }
  const first = await material('First'),
    second = await material('Duplicate', {
      ...draft,
      vocabulary: [{ ...draft.vocabulary[0], translation: 'лимон, плод' }],
    });
  await Promise.all([
    materials.review(owner.request, first.id, draft),
    materials.review(owner.request, second.id, {
      ...draft,
      vocabulary: [{ ...draft.vocabulary[0], translation: 'лимон, плод' }],
    }),
  ]);
  assert.equal(
    await prisma.vocabItem.count({ where: { ownerId: owner.id } }),
    1,
    'Concurrent approvals must reuse the same word by default',
  );
  assert.equal(await prisma.grammarTopic.count({ where: { ownerId: owner.id } }), 1);
  await prisma.vocabItem.updateMany({
    where: { ownerId: owner.id },
    data: { semanticTopic: 'Путешествия', categoryStatus: 'READY' },
  });
  const topic = await prisma.grammarTopic.findFirstOrThrow({ where: { ownerId: owner.id } });
  const starts = await Promise.all([
    grammar.preparePractice(owner.request, topic.id),
    grammar.preparePractice(owner.request, topic.id),
  ]);
  assert(starts.every((item) => item.practiceStatus === 'GENERATING'));
  assert.equal(jobs.filter((job) => job.mode === 'practice').length, 1);
  assert.equal(starts[0].theoryStatus, 'NOT_GENERATED');
  await processGrammarGeneration(topic.id, 'practice');
  await processGrammarGeneration(topic.id, 'practice');
  const prepared = await grammar.detail(owner.request, topic.id);
  assert.equal(prepared.exercises.length, 4);
  assert.equal(prepared.theory, null);
  assert.equal(prepared.theoryStatus, 'NOT_GENERATED');
  assert.equal(
    'answerIndex' in prepared.exercises[0],
    false,
    'Correct answers must not be exposed before checking',
  );
  await grammar.check(owner.request, prepared.exercises[0].id, { answerIndex: 0 });
  const idsBefore = prepared.exercises.map((item) => item.id);
  await grammar.generate(owner.request, topic.id);
  await processGrammarGeneration(topic.id);
  assert.deepEqual(
    (await grammar.detail(owner.request, topic.id)).exercises.map((item) => item.id),
    idsBefore,
  );
  assert.equal(await prisma.exerciseAttempt.count({ where: { userId: owner.id } }), 1);
  assert.deepEqual(aiScopes, [['exercises'], ['theory']]);
  const retries = await grammar.create(owner.request, { title: 'Retry practice' });
  const realError = console.error;
  console.error = () => {};
  try {
    failQueue = true;
    await assert.rejects(grammar.preparePractice(owner.request, retries.id));
  } finally {
    failQueue = false;
    console.error = realError;
  }
  assert.equal((await grammar.detail(owner.request, retries.id)).practiceStatus, 'ERROR');
  await grammar.preparePractice(owner.request, retries.id);
  await processGrammarGeneration(retries.id, 'practice');
  assert.equal((await grammar.detail(owner.request, retries.id)).practiceError, null);
  await assert.rejects(grammar.preparePractice(other.request, topic.id), /Тема не найдена/);
  await assert.rejects(
    grammar.check(other.request, prepared.exercises[0].id, { answerIndex: 0 }),
    /Упражнение не найдено/,
  );
  await assert.rejects(materials.remove(other.request, first.id), /Материал не найден/);
  const third = await material('New meaning', {
    ...draft,
    vocabulary: [{ ...draft.vocabulary[0], translation: 'лимонный цвет', allowNewMeaning: true }],
  });
  const annotated = await materials.detail(owner.request, third.id);
  const annotatedDraft = annotated.analysisDraft as unknown as Draft;
  assert(annotatedDraft.vocabulary[0].otherMeaningInVocabulary);
  assert(annotatedDraft.grammar[0].alreadyInGrammar);
  await materials.review(owner.request, third.id, {
    ...draft,
    vocabulary: [{ ...draft.vocabulary[0], translation: 'лимонный цвет', allowNewMeaning: true }],
  });
  assert.equal(await prisma.vocabItem.count({ where: { ownerId: owner.id } }), 2);
  await materials.remove(owner.request, third.id);
  assert.equal(await prisma.vocabItem.count({ where: { ownerId: owner.id } }), 1);
  const manualWord = await study.addVocabulary(owner.request, {
    term: 'il libro',
    translation: 'книга',
  });
  const manualTopic = await grammar.create(owner.request, { title: 'Ручная тема' });
  const attached: Draft = {
    vocabulary: [
      ...draft.vocabulary,
      { ...draft.vocabulary[0], term: 'la neve', translation: 'снег' },
      { ...draft.vocabulary[0], term: manualWord.term, translation: manualWord.translation },
    ],
    grammar: [
      ...draft.grammar,
      { title: 'Уникальная тема', summary: '', sourceExcerpt: '' },
      { title: manualTopic.title, summary: '', sourceExcerpt: '' },
    ],
  };
  const filesMaterial = await material('With file', attached);
  const storageKey = await storeFile(owner.id, Buffer.from('Synthetic lesson'), 'text/plain');
  await prisma.materialFile.create({
    data: {
      materialId: filesMaterial.id,
      storageKey,
      name: 'synthetic.txt',
      mimeType: 'text/plain',
      byteSize: 16,
    },
  });
  await materials.review(owner.request, filesMaterial.id, attached);
  const uniqueWord = await prisma.vocabItem.findFirstOrThrow({
    where: { ownerId: owner.id, term: 'la neve' },
    include: { flashcards: true },
  });
  const state = await prisma.reviewState.create({
    data: { userId: owner.id, flashcardId: uniqueWord.flashcards[0].id, card: {}, due: new Date() },
  });
  await prisma.reviewEvent.create({ data: { reviewStateId: state.id, rating: 1, log: {} } });
  await prisma.deferredCard.create({
    data: { userId: owner.id, flashcardId: uniqueWord.flashcards[0].id, rating: 1 },
  });
  assert.equal(
    (await prisma.vocabItem.findFirstOrThrow({ where: { ownerId: owner.id, term: 'il limone' } }))
      .semanticTopic,
    'Путешествия',
    'A repeated material must preserve an existing category',
  );
  await materials.remove(owner.request, filesMaterial.id);
  assert.equal(await prisma.vocabItem.count({ where: { id: uniqueWord.id } }), 0);
  assert.equal(await prisma.reviewState.count({ where: { id: state.id } }), 0);
  assert.equal(await prisma.reviewEvent.count({ where: { reviewStateId: state.id } }), 0);
  assert.equal(
    await prisma.deferredCard.count({ where: { flashcardId: uniqueWord.flashcards[0].id } }),
    0,
  );
  assert.equal(
    await prisma.grammarTopic.count({ where: { ownerId: owner.id, title: 'Уникальная тема' } }),
    0,
  );
  assert.equal(await prisma.fileDeletion.count(), 1);
  await processFileDeletions();
  await assert.rejects(access(storageKey));
  assert.equal(await prisma.fileDeletion.count(), 0);
  await Promise.all([
    materials.remove(owner.request, first.id),
    materials.remove(owner.request, second.id),
  ]);
  assert.equal(
    await prisma.exerciseAttempt.count({
      where: { userId: owner.id, exerciseId: { in: idsBefore } },
    }),
    0,
  );
  assert.equal(await prisma.grammarTopic.count({ where: { id: topic.id } }), 0);
  assert.equal(
    await prisma.vocabItem.count({ where: { ownerId: owner.id, manuallyAdded: false } }),
    0,
  );
  assert.equal(await prisma.vocabItem.count({ where: { id: manualWord.id } }), 1);
  assert.equal(await prisma.grammarTopic.count({ where: { id: manualTopic.id } }), 1);
  const failure = await prisma.fileDeletion.create({
    data: { storageKey: 's3:synthetic-invalid-key' },
  });
  const oldWarn = console.warn;
  console.warn = () => {};
  try {
    await processFileDeletions();
  } finally {
    console.warn = oldWarn;
  }
  const delayed = await prisma.fileDeletion.findUniqueOrThrow({ where: { id: failure.id } });
  assert.equal(delayed.attempts, 1);
  assert(delayed.retryAt > new Date());
  // A fresh AI draft knows existing grammar names and fresh server-side match flags.
  const processing = await prisma.material.create({
    data: {
      ownerId: owner.id,
      title: 'Synthetic analysis',
      noteText: 'La casa è grande.',
      status: 'PROCESSING',
    },
  });
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.match(body.contents[0].parts[0].text, /Ручная тема/);
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    vocabulary: [],
                    grammar: [{ title: manualTopic.title, summary: '', sourceExcerpt: '' }],
                  }),
                },
              ],
            },
          },
        ],
      }),
    );
  };
  await processMaterialAnalysis(processing.id);
  const analyzed = await materials.detail(owner.request, processing.id);
  assert.equal((analyzed.analysisDraft as unknown as Draft).grammar[0].alreadyInGrammar, true);
  console.log(
    'practice_materials=PASS independent_generation=PASS immutable_attempts=PASS queue_retry=PASS concurrent_dedup=PASS isolated_delete=PASS shared_and_manual_retained=PASS file_cleanup_retry=PASS',
  );
} finally {
  globalThis.fetch = oldFetch;
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await prisma.$disconnect();
  await rm(uploadDir, { recursive: true, force: true });
}
