import 'dotenv/config';
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const database = new URL(process.env.DATABASE_URL!);
if (!['localhost', '127.0.0.1', '[::1]'].includes(database.hostname))
  throw new Error('Only a local database is allowed');
const schema = `telegram_test_${randomUUID().replaceAll('-', '')}`;
database.searchParams.set('schema', schema);
process.env.DATABASE_URL = database.toString();
process.env.TELEGRAM_BOT_TOKEN = 'synthetic-test-token';
process.env.TELEGRAM_MINI_APP_URL = 'https://lingvoteka.vercel.app';
process.env.FILE_STORAGE = 'local';
process.env.UPLOAD_DIR = await mkdtemp(join(tmpdir(), 'lingvoteka-telegram-'));
process.env.GEMINI_API_KEY = 'synthetic-gemini-key';
try {
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'pipe',
  });
} catch {
  await rm(process.env.UPLOAD_DIR!, { recursive: true, force: true });
  throw new Error('Could not prepare the isolated local test schema');
}
const { prisma } = await import('../src/database.js');
const {
  receiveTelegramUpdate,
  importTelegramSubmission,
  notifyTelegramSubmission,
  replyToTelegramUpdate,
} = await import('../src/telegram-intake.js');
const { processMaterialAnalysis } = await import('../src/material-analysis-job.js');
const { synchronizeTelegramAvatar } = await import('../src/telegram-brand.js');
const { loadFile } = await import('../src/file-storage.js');
const { TelegramService } = await import('../src/telegram.service.js');
const { PgBoss } = await import('pg-boss');
const queueSchema = `telegram_jobs_${schema.slice(-32)}`;
let service: InstanceType<typeof TelegramService> | undefined;
const oldFetch = globalThis.fetch;
const jpg = await readFile(new URL('./fixtures/synthetic-lesson.jpg', import.meta.url));
const calls: { method: string; body: Record<string, unknown> }[] = [];
let nextMessage = 1000;
let failDownload = false;
globalThis.fetch = async (input, options) => {
  const url = String(input);
  if (url.startsWith('https://api.telegram.org/file/')) {
    if (failDownload) throw new Error('private-token-bearing-url');
    return new Response(new Uint8Array(jpg));
  }
  if (url.startsWith('https://api.telegram.org/bot')) {
    const method = url.split('/').at(-1)!;
    const body =
      options?.body instanceof FormData ? { multipart: true } : JSON.parse(String(options?.body));
    calls.push({ method, body });
    return new Response(
      JSON.stringify({
        ok: true,
        result:
          method === 'getFile'
            ? { file_path: 'photos/file_1.jpg', file_size: jpg.length }
            : method === 'sendMessage'
              ? { message_id: nextMessage++ }
              : true,
      }),
    );
  }
  if (url.includes('generateContent'))
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    vocabulary: [
                      {
                        term: 'limone',
                        translation: 'лимон',
                        example: 'Il limone è giallo.',
                        sourceExcerpt: 'limone',
                        partOfSpeech: 'Существительное',
                        semanticTopic: 'Еда и напитки',
                      },
                    ],
                    grammar: [],
                  }),
                },
              ],
            },
          },
        ],
      }),
    );
  throw new Error('Unexpected external request blocked by test');
};
const update = (
  number: number,
  sender = 123,
  text: string | undefined = 'Il limone è giallo.',
  extra: Record<string, unknown> = {},
) => ({
  update_id: number,
  message: {
    message_id: number,
    from: { id: sender, is_bot: false },
    chat: { id: sender, type: 'private' },
    text: Object.keys(extra).length ? undefined : text,
    ...extra,
  },
});
const enqueued: string[] = [];
const enqueue = async (id: string) => {
  enqueued.push(id);
};
try {
  await prisma.user.createMany({
    data: [
      { id: 'synthetic-owner', name: 'Synthetic', email: 'owner@example.invalid' },
      { id: 'synthetic-other', name: 'Other', email: 'other@example.invalid' },
    ],
  });
  await prisma.telegramIdentity.create({ data: { telegramId: '123', userId: 'synthetic-owner' } });
  await receiveTelegramUpdate(update(1, 456));
  const unlinked = await prisma.telegramUpdate.findUniqueOrThrow({ where: { updateId: 1n } });
  assert.equal(unlinked.kind, 'connect');
  assert.equal(unlinked.payload, null);
  await replyToTelegramUpdate(1n);
  assert.equal(await prisma.material.count(), 0);
  const navigation = (number: number, data: string, sender = 123) => ({
    update_id: number,
    callback_query: {
      id: `synthetic-click-${number}`,
      from: { id: sender, is_bot: false },
      message: { message_id: 800, chat: { id: sender, type: 'private' } },
      data,
    },
  });
  const callbackService = new TelegramService({ enqueue } as never);
  await callbackService.accept(navigation(100, 'add'));
  await callbackService.accept(navigation(100, 'add'));
  await callbackService.accept(navigation(101, 'home'));
  await replyToTelegramUpdate(100n);
  await replyToTelegramUpdate(101n);
  const navigationReplies = calls.filter((call) => call.method === 'sendMessage');
  assert.match(String(navigationReplies.at(-2)?.body.text), /Пришли материал/);
  assert.match(String(navigationReplies.at(-1)?.body.text), /Ciao/);
  assert.equal(await prisma.telegramUpdate.count({ where: { updateId: { in: [100n, 101n] } } }), 2);
  assert.equal(await prisma.telegramSubmission.count(), 0, 'Menu clicks must not import material');
  assert.equal(await prisma.material.count(), 0);
  assert.ok(calls.some((call) => call.method === 'answerCallbackQuery'));
  await callbackService.accept(navigation(102, 'add', 456));
  await replyToTelegramUpdate(102n);
  assert.match(
    String(calls.filter((call) => call.method === 'sendMessage').at(-1)?.body.text),
    /Сначала свяжи аккаунт/,
  );
  await Promise.all(Array.from({ length: 6 }, () => receiveTelegramUpdate(update(2))));
  assert.equal(await prisma.telegramUpdate.count({ where: { updateId: 2n } }), 1);
  const textSubmission = await prisma.telegramSubmission.findFirstOrThrow({
    where: { chatId: '123' },
  });
  await Promise.all([
    importTelegramSubmission(textSubmission.id, enqueue),
    importTelegramSubmission(textSubmission.id, enqueue),
  ]);
  assert.equal(await prisma.material.count(), 1);
  assert.equal(enqueued.length, 1);
  const textMaterial = await prisma.material.findUniqueOrThrow({ where: { id: enqueued[0]! } });
  assert.equal(textMaterial.ownerId, 'synthetic-owner');
  assert.equal(textMaterial.noteText, 'Il limone è giallo.');
  await notifyTelegramSubmission(textSubmission.id);
  await processMaterialAnalysis(textMaterial.id);
  await notifyTelegramSubmission(textSubmission.id);
  const readyReply = calls.filter((call) => call.method === 'editMessageText').at(-1)!;
  assert.match(String(readyReply.body.text), /Разбор текста готов/);
  assert.ok(!String(readyReply.body.text).includes('урок'));
  assert.deepEqual(readyReply.body.reply_markup, {
    inline_keyboard: [
      [
        {
          text: 'Проверить слова и темы',
          web_app: { url: `https://lingvoteka.vercel.app/materials/${textMaterial.id}` },
        },
      ],
      [{ text: 'Главное меню', callback_data: 'home' }],
    ],
  });
  const repliesBefore = calls.filter((call) => call.method === 'editMessageText').length;
  await notifyTelegramSubmission(textSubmission.id);
  assert.equal(calls.filter((call) => call.method === 'editMessageText').length, repliesBefore);
  assert.equal(
    (await prisma.material.findUniqueOrThrow({ where: { id: textMaterial.id } })).status,
    'REVIEW',
  );
  assert.equal(await prisma.vocabItem.count(), 0);
  assert.equal(await prisma.flashcard.count(), 0);
  assert.equal(await prisma.material.count({ where: { ownerId: 'synthetic-other' } }), 0);
  assert.equal(
    (await prisma.telegramUpdate.findUniqueOrThrow({ where: { updateId: 2n } })).payload,
    null,
  );
  const photo = {
    photo: [
      { file_id: 'photo-small', file_size: 10 },
      { file_id: 'photo-large', file_size: jpg.length },
    ],
    media_group_id: 'synthetic-album',
  };
  await Promise.all([
    receiveTelegramUpdate(update(3, 123, undefined, { ...photo, caption: 'Un limone.' })),
    receiveTelegramUpdate(update(4, 123, undefined, photo)),
  ]);
  const album = await prisma.telegramSubmission.findFirstOrThrow({ where: { isAlbum: true } });
  await importTelegramSubmission(album.id, enqueue);
  assert.equal(await prisma.material.count(), 1, 'Album should debounce before importing');
  await prisma.telegramSubmission.update({
    where: { id: album.id },
    data: { lastReceivedAt: new Date(Date.now() - 5_000) },
  });
  await Promise.all([
    importTelegramSubmission(album.id, enqueue),
    importTelegramSubmission(album.id, enqueue),
  ]);
  const importedAlbum = await prisma.telegramSubmission.findUniqueOrThrow({
    where: { id: album.id },
    include: { material: { include: { files: true } } },
  });
  assert.equal(importedAlbum.material?.files.length, 2);
  assert.equal(importedAlbum.material?.title, 'Фото 3');
  assert.equal(importedAlbum.material?.noteText, 'Un limone.');
  assert.deepEqual(await loadFile(importedAlbum.material!.files[0]!.storageKey), jpg);
  await receiveTelegramUpdate(update(5, 123, undefined, photo));
  assert.equal(
    (await prisma.telegramUpdate.findUniqueOrThrow({ where: { updateId: 5n } })).kind,
    'late',
  );
  assert.equal(await prisma.material.count(), 2);
  for (let n = 10; n < 16; n++)
    await receiveTelegramUpdate(
      update(n, 123, undefined, { ...photo, media_group_id: 'oversized-album' }),
    );
  const oversized = await prisma.telegramSubmission.findFirstOrThrow({
    where: { batchKey: { endsWith: 'oversized-album' } },
  });
  await prisma.telegramSubmission.update({
    where: { id: oversized.id },
    data: { lastReceivedAt: new Date(Date.now() - 5_000) },
  });
  await importTelegramSubmission(oversized.id, enqueue);
  assert.equal(
    (await prisma.telegramSubmission.findUniqueOrThrow({ where: { id: oversized.id } })).status,
    'REJECTED',
  );
  await receiveTelegramUpdate(update(20, 123, undefined, { photo: photo.photo }));
  const retry = await prisma.telegramSubmission.findFirstOrThrow({
    where: { batchKey: '123:message:20' },
  });
  failDownload = true;
  await assert.rejects(importTelegramSubmission(retry.id, enqueue), {
    message: 'Telegram import temporarily unavailable',
  });
  assert.equal(
    (await prisma.telegramSubmission.findUniqueOrThrow({ where: { id: retry.id } })).status,
    'PENDING',
  );
  failDownload = false;
  await importTelegramSubmission(retry.id, enqueue);
  assert.equal(await prisma.material.count(), 3);
  const uploadsBefore = calls.filter((call) => call.method === 'setMyProfilePhoto').length;
  assert.equal(await synchronizeTelegramAvatar(999), 'updated');
  assert.equal(await synchronizeTelegramAvatar(999), 'unchanged');
  assert.equal(
    calls.filter((call) => call.method === 'setMyProfilePhoto').length,
    uploadsBefore + 1,
  );
  const racePhoto = { ...photo, media_group_id: 'race-album' };
  await receiveTelegramUpdate(update(30, 123, undefined, racePhoto));
  const race = await prisma.telegramSubmission.findFirstOrThrow({
    where: { batchKey: { endsWith: 'race-album' } },
  });
  await prisma.telegramSubmission.update({
    where: { id: race.id },
    data: { lastReceivedAt: new Date(Date.now() - 5_000) },
  });
  await Promise.all([
    importTelegramSubmission(race.id, enqueue),
    receiveTelegramUpdate(update(31, 123, undefined, racePhoto)),
  ]);
  await prisma.telegramSubmission.updateMany({
    where: { id: race.id, status: 'PENDING' },
    data: { lastReceivedAt: new Date(Date.now() - 5_000) },
  });
  await importTelegramSubmission(race.id, enqueue);
  const raceResult = await prisma.telegramSubmission.findUniqueOrThrow({
    where: { id: race.id },
    include: { material: { include: { files: true } } },
  });
  const racedUpdate = await prisma.telegramUpdate.findUniqueOrThrow({ where: { updateId: 31n } });
  assert.equal(raceResult.material?.files.length, racedUpdate.kind === 'material' ? 2 : 1);
  await receiveTelegramUpdate(update(40));
  const outage = await prisma.telegramSubmission.findFirstOrThrow({
    where: { batchKey: '123:message:40' },
  });
  await importTelegramSubmission(outage.id, async () => {
    throw new Error('synthetic queue outage');
  });
  const beforeRetry = await prisma.material.count();
  await importTelegramSubmission(outage.id, enqueue);
  assert.equal(await prisma.material.count(), beforeRetry);
  const openService = async () => {
    const running = new TelegramService({ enqueue } as never);
    // Dedicated pg-boss schema isolates real background jobs from the developer's queues.
    Object.assign(running, {
      boss: new PgBoss({ connectionString: process.env.DATABASE_URL, schema: queueSchema }),
    });
    service = running;
    await running.onModuleInit();
    return running;
  };
  const until = async (check: () => Promise<boolean>) => {
    const deadline = Date.now() + 20_000;
    while (!(await check())) {
      if (Date.now() > deadline) throw new Error('Background Telegram delivery timed out');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  };
  await receiveTelegramUpdate(update(50, 123, 'Un limone per favore.'));
  const background = await prisma.telegramSubmission.findFirstOrThrow({
    where: { batchKey: '123:message:50' },
  });
  await openService();
  await until(
    async () =>
      (await prisma.telegramSubmission.findUniqueOrThrow({ where: { id: background.id } }))
        .notifiedStatus === 'PROCESSING',
  );
  await service!.onModuleDestroy();
  service = undefined;
  const backgroundImported = await prisma.telegramSubmission.findUniqueOrThrow({
    where: { id: background.id },
  });
  await processMaterialAnalysis(backgroundImported.materialId!);
  // Ready notifications survive stopping/restarting the API consumer.
  await openService();
  await until(
    async () =>
      (await prisma.telegramSubmission.findUniqueOrThrow({ where: { id: background.id } }))
        .notifiedStatus === 'REVIEW',
  );
  await service!.onModuleDestroy();
  service = undefined;
  assert.equal(await prisma.material.count({ where: { id: backgroundImported.materialId! } }), 1);
  console.log(
    'telegram_intake=PASS duplicate_updates=PASS concurrent_import=PASS album=PASS owner_isolation=PASS draft_confirmation=PASS download_retry=PASS avatar=PASS',
  );
} finally {
  if (service) await service.onModuleDestroy();
  globalThis.fetch = oldFetch;
  // Only the randomly created test schema is disposable; public/user schemas are never touched.
  if (!/^telegram_test_[a-f0-9]{32}$/.test(schema)) throw new Error('Invalid cleanup schema');
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${queueSchema}" CASCADE`);
  await prisma.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await prisma.$disconnect();
  await rm(process.env.UPLOAD_DIR!, { recursive: true, force: true });
}
