import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTelegramMessage,
  BOT_DESCRIPTION,
  BOT_SHORT_DESCRIPTION,
} from '../src/telegram-message.js';
import { downloadTelegramFile } from '../src/telegram-file.js';
import { validateMaterialInput } from '../src/material-input.js';

const message = {
  update_id: 1,
  message: {
    message_id: 1,
    from: { id: 123, is_bot: false },
    chat: { id: 123, type: 'private' },
    text: 'Il limone è giallo.',
  },
};
test('only private human messages are accepted; document names and album IDs survive normalization', () => {
  assert.equal(
    parseTelegramMessage({
      ...message,
      message: { ...message.message, chat: { id: 123, type: 'group' } },
    }),
    null,
  );
  assert.equal(
    parseTelegramMessage({
      ...message,
      message: { ...message.message, from: { id: 456, is_bot: false } },
    }),
    null,
  );
  assert.equal(
    parseTelegramMessage({
      ...message,
      message: { ...message.message, from: { id: 123, is_bot: true } },
    }),
    null,
  );
  const parsed = parseTelegramMessage({
    ...message,
    message: {
      ...message.message,
      text: undefined,
      media_group_id: 'album-1',
      document: {
        file_id: 'file-1',
        file_name: 'C:\\уроки\\Лимоны.pdf',
        mime_type: 'application/pdf',
        file_size: 100,
      },
    },
  });
  assert.equal(parsed?.payload?.file?.name, 'Лимоны.pdf');
  assert.equal(parsed?.albumId, 'album-1');
  assert.equal(
    parseTelegramMessage({
      ...message,
      message: {
        ...message.message,
        text: undefined,
        document: { file_id: 'file', file_name: 'lesson.exe' },
      },
    })?.kind,
    'unsupported',
  );
  assert.ok(BOT_DESCRIPTION.length <= 512);
  assert.ok(BOT_SHORT_DESCRIPTION.length <= 120);
});

test('Telegram downloads reject unsafe paths and oversized streams without leaking token-bearing URLs', async () => {
  const previousFetch = globalThis.fetch;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = 'synthetic-private-token';
  const descriptor = { fileId: 'file', name: 'lesson.jpg', mimeType: 'image/jpeg' };
  try {
    for (const path of [
      '../secret.jpg',
      'https://example.com/a.jpg',
      '/photo/a.jpg',
      'photos/a.jpg?x=1',
    ]) {
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ ok: true, result: { file_path: path } }));
      await assert.rejects(downloadTelegramFile(descriptor), /Не удалось получить файл/);
    }
    let calls = 0;
    globalThis.fetch = async () => {
      if (++calls === 1)
        return new Response(
          JSON.stringify({ ok: true, result: { file_path: 'photos/file_1.jpg' } }),
        );
      let sent = 0;
      return new Response(
        new ReadableStream({
          pull(controller) {
            if (sent++ < 11) controller.enqueue(new Uint8Array(1024 * 1024));
            else controller.close();
          },
        }),
      );
    };
    await assert.rejects(downloadTelegramFile(descriptor), /не более 10 МБ/);
    calls = 0;
    globalThis.fetch = async () => {
      if (++calls === 1)
        return new Response(
          JSON.stringify({ ok: true, result: { file_path: 'photos/file_1.jpg' } }),
        );
      throw new Error('https://api.telegram.org/file/botsynthetic-private-token/private.jpg');
    };
    await assert.rejects(downloadTelegramFile(descriptor), {
      message: 'Telegram API is unavailable',
    });
    await assert.rejects(
      validateMaterialInput({}, [
        {
          originalname: 'lesson.pdf',
          mimetype: 'application/pdf',
          size: 3,
          buffer: Buffer.from('bad'),
        },
      ]),
      /PDF повреждён/,
    );
    assert.equal(
      (
        await validateMaterialInput({}, [
          {
            originalname: 'Лимоны.txt',
            mimetype: 'text/plain',
            size: 6,
            buffer: Buffer.from('limone'),
          },
        ])
      ).title,
      'Лимоны',
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (token === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = token;
  }
});
