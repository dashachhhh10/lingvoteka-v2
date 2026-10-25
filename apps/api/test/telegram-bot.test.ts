import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Request } from 'express';
import { configureTelegramBot, initializeTelegramBot } from '../src/telegram-setup.js';
import { TelegramController } from '../src/telegram.controller.js';
import { telegramMiniAppUrl, telegramWebhookSecret } from '../src/telegram-bot.js';

test('webhook rejects missing/wrong secret and ignores messages outside a private user chat', async () => {
  const oldToken = process.env.TELEGRAM_BOT_TOKEN;
  const oldSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  process.env.TELEGRAM_BOT_TOKEN = 'synthetic-token';
  process.env.TELEGRAM_WEBHOOK_SECRET = 'synthetic-webhook-secret-32-characters';
  const controller = new TelegramController();
  try {
    const request = (header: string, body: unknown) =>
      ({ get: () => header, body }) as unknown as Request;
    for (const header of ['', 'wrong-secret'])
      await assert.rejects(controller.webhook(request(header, {})));
    assert.deepEqual(
      await controller.webhook(
        request('synthetic-webhook-secret-32-characters', {
          update_id: 1,
          message: { chat: { id: 10, type: 'group' } },
        }),
      ),
      { ok: true },
    );
    assert.deepEqual(
      await controller.webhook(request('synthetic-webhook-secret-32-characters', null)),
      {
        ok: true,
      },
    );
  } finally {
    if (oldToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = oldToken;
    if (oldSecret === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET;
    else process.env.TELEGRAM_WEBHOOK_SECRET = oldSecret;
  }
});

test('Mini App launch URLs require HTTPS and exclude credentials and query parameters', () => {
  const original = process.env.TELEGRAM_MINI_APP_URL;
  try {
    for (const url of [
      'http://localhost:5173',
      'https://user:password@example.com',
      'https://example.com?token=secret',
    ]) {
      process.env.TELEGRAM_MINI_APP_URL = url;
      assert.throws(telegramMiniAppUrl);
    }
    process.env.TELEGRAM_MINI_APP_URL = 'https://lingvoteka.vercel.app';
    assert.equal(telegramMiniAppUrl(), 'https://lingvoteka.vercel.app');
  } finally {
    if (original === undefined) delete process.env.TELEGRAM_MINI_APP_URL;
    else process.env.TELEGRAM_MINI_APP_URL = original;
  }
});

test('private /start replies with a Mini App button without exposing Telegram credentials', async () => {
  const oldToken = process.env.TELEGRAM_BOT_TOKEN;
  const oldSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const oldUrl = process.env.TELEGRAM_MINI_APP_URL;
  const originalFetch = globalThis.fetch;
  process.env.TELEGRAM_BOT_TOKEN = 'synthetic-token';
  process.env.TELEGRAM_WEBHOOK_SECRET = 'synthetic-webhook-secret-32-characters';
  process.env.TELEGRAM_MINI_APP_URL = 'https://lingvoteka.vercel.app';
  const bodies: Record<string, unknown>[] = [];
  globalThis.fetch = async (_url, options) => {
    bodies.push(JSON.parse(String(options?.body)));
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
  };
  try {
    const request = {
      get: () => 'synthetic-webhook-secret-32-characters',
      body: { update_id: 1, message: { chat: { id: 123, type: 'private' }, text: '/start' } },
    } as unknown as Request;
    assert.deepEqual(await new TelegramController().webhook(request), { ok: true });
    assert.equal(bodies.length, 1);
    assert.equal(bodies[0]?.chat_id, 123);
    assert.ok(JSON.stringify(bodies[0]).includes('https://lingvoteka.vercel.app'));
    assert.ok(!JSON.stringify(bodies[0]).includes('synthetic-token'));
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries({
      TELEGRAM_BOT_TOKEN: oldToken,
      TELEGRAM_WEBHOOK_SECRET: oldSecret,
      TELEGRAM_MINI_APP_URL: oldUrl,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('production setup verifies identity/menu/webhook, local startup does not take over webhook', async () => {
  const keys = [
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_WEBHOOK_SECRET',
    'TELEGRAM_MINI_APP_URL',
    'NODE_ENV',
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  const url = 'https://lingvoteka.vercel.app';
  process.env.TELEGRAM_BOT_TOKEN = 'synthetic-token';
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  process.env.TELEGRAM_MINI_APP_URL = url;
  globalThis.fetch = async (input, options) => {
    const method = String(input).split('/').at(-1)!;
    calls.push({ method, body: JSON.parse(String(options?.body)) });
    const result =
      method === 'getMe'
        ? { username: 'SyntheticBot', is_bot: true }
        : method === 'getWebhookInfo'
          ? { url: `${url}/api/telegram/webhook`, pending_update_count: 0 }
          : method === 'getChatMenuButton'
            ? { type: 'web_app', web_app: { url } }
            : true;
    return new Response(JSON.stringify({ ok: true, result }));
  };
  try {
    const secret = telegramWebhookSecret();
    assert.match(secret!, /^[a-f0-9]{64}$/);
    assert.notEqual(secret, process.env.TELEGRAM_BOT_TOKEN);
    assert.equal(secret, telegramWebhookSecret());
    process.env.TELEGRAM_BOT_TOKEN = 'different-synthetic-token';
    assert.notEqual(secret, telegramWebhookSecret());
    process.env.TELEGRAM_BOT_TOKEN = 'synthetic-token';
    process.env.NODE_ENV = 'development';
    await initializeTelegramBot();
    assert.equal(calls.length, 0);
    await configureTelegramBot(false);
    assert.deepEqual(
      calls.map(({ method }) => method),
      ['getMe'],
    );
    calls.length = 0;
    const result = await configureTelegramBot(true);
    assert.equal(result.bot, '@SyntheticBot');
    assert.equal(result.pendingUpdates, 0);
    assert.deepEqual(
      calls.map(({ method }) => method),
      [
        'getMe',
        'setMyCommands',
        'setChatMenuButton',
        'setWebhook',
        'getWebhookInfo',
        'getChatMenuButton',
      ],
    );
    const registered = calls.find(({ method }) => method === 'setWebhook')!.body;
    assert.equal(registered.secret_token, secret);
    assert.ok(!JSON.stringify(result).includes(secret!));
    assert.ok(!JSON.stringify(result).includes('synthetic-token'));
    // Same derived secret is required by the real controller, not just the setup script.
    await assert.rejects(
      new TelegramController().webhook({ get: () => '', body: null } as unknown as Request),
    );
    assert.deepEqual(
      await new TelegramController().webhook({
        get: () => secret,
        body: null,
      } as unknown as Request),
      { ok: true },
    );
    process.env.TELEGRAM_WEBHOOK_SECRET = 'too-short';
    assert.throws(telegramWebhookSecret);
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    globalThis.fetch = async () => {
      throw new Error('token-bearing-private-request-url');
    };
    await assert.rejects(configureTelegramBot(true), { message: 'Telegram API is unavailable' });
    process.env.NODE_ENV = 'production';
    const oldWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (message: string) => {
      warnings.push(message);
    };
    try {
      await initializeTelegramBot();
    } finally {
      console.warn = oldWarn;
    }
    assert.equal(warnings.length, 1);
    assert.ok(!warnings[0]!.includes('token-bearing-private-request-url'));
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
