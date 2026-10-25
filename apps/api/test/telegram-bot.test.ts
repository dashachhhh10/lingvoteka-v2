import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Request } from 'express';
import { configureTelegramBot, initializeTelegramBot } from '../src/telegram-setup.js';
import type { TelegramService } from '../src/telegram.service.js';
import { botCopy, parseTelegramMessage } from '../src/telegram-message.js';
import { telegramButtons, telegramHomeButtons } from '../src/telegram-intake.js';
import { TelegramController } from '../src/telegram.controller.js';
import { telegramMiniAppUrl, telegramWebhookSecret } from '../src/telegram-bot.js';

test('webhook rejects missing/wrong secret and ignores messages outside a private user chat', async () => {
  const oldToken = process.env.TELEGRAM_BOT_TOKEN;
  const oldSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  process.env.TELEGRAM_BOT_TOKEN = 'synthetic-token';
  process.env.TELEGRAM_WEBHOOK_SECRET = 'synthetic-webhook-secret-32-characters';
  const controller = new TelegramController({
    accept: async () => {},
  } as unknown as TelegramService);
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

test('start copy and launch buttons are readable and do not expose credentials', () => {
  const original = process.env.TELEGRAM_MINI_APP_URL;
  process.env.TELEGRAM_MINI_APP_URL = 'https://lingvoteka.vercel.app';
  try {
    const parsed = parseTelegramMessage({
      update_id: 1,
      message: {
        message_id: 1,
        from: { id: 123, is_bot: false },
        chat: { id: 123, type: 'private' },
        text: '/start',
      },
    });
    assert.equal(parsed?.kind, 'start');
    assert.match(botCopy('start'), /Ciao/);
    for (const command of ['phrase', 'app']) {
      const action = parseTelegramMessage({
        update_id: 2,
        message: {
          message_id: 2,
          from: { id: 123, is_bot: false },
          chat: { id: 123, type: 'private' },
          text: `/${command}`,
        },
      });
      assert.equal(action?.kind, command);
      assert.equal(action?.payload, null, 'A navigation command must not be analyzed as text');
    }
    assert.equal(
      telegramButtons().inline_keyboard[0]?.[0]?.web_app?.url,
      'https://lingvoteka.vercel.app',
    );
  } finally {
    if (original === undefined) delete process.env.TELEGRAM_MINI_APP_URL;
    else process.env.TELEGRAM_MINI_APP_URL = original;
  }
});

test('navigation accepts only supported private callbacks and keeps repeated menu clicks distinct', () => {
  const callback = {
    update_id: 10,
    callback_query: {
      id: 'click-1',
      from: { id: 123, is_bot: false },
      message: { message_id: 456, chat: { id: 123, type: 'private' } },
      data: 'add',
    },
  };
  const first = parseTelegramMessage(callback);
  assert.equal(first?.kind, 'add');
  assert.equal(first?.callbackQueryId, 'click-1');
  assert.equal(first?.payload, null);
  const second = parseTelegramMessage({
    ...callback,
    update_id: 11,
    callback_query: { ...callback.callback_query, id: 'click-2', data: 'home' },
  });
  assert.equal(second?.kind, 'start');
  assert.notEqual(first?.messageId, second?.messageId);
  for (const query of [
    { ...callback.callback_query, data: 'delete' },
    { ...callback.callback_query, from: { id: 999, is_bot: false } },
    { ...callback.callback_query, message: { message_id: 456, chat: { id: 123, type: 'group' } } },
  ])
    assert.equal(parseTelegramMessage({ ...callback, callback_query: query }), null);
});

test('home menu separates in-chat guidance from launching the application', () => {
  const original = process.env.TELEGRAM_MINI_APP_URL;
  process.env.TELEGRAM_MINI_APP_URL = 'https://lingvoteka.vercel.app';
  try {
    const linked = telegramHomeButtons(true).inline_keyboard.flat();
    const phrase = linked.find((button) => button.text === 'Разобрать фразу');
    assert.deepEqual(phrase, { text: 'Разобрать фразу', callback_data: 'phrase' });
    const add = linked.find((button) => button.text === 'Прислать фото или файл');
    assert.deepEqual(add, { text: 'Прислать фото или файл', callback_data: 'add' });
    assert.deepEqual(linked[0], {
      text: '📱 Открыть приложение ↗',
      web_app: { url: 'https://lingvoteka.vercel.app' },
    });
    for (const button of linked.filter((button) => button.web_app))
      assert.ok(button.text.endsWith('↗'), 'Every application launch must be explicit');
    assert.ok(linked.some((button) => button.web_app?.url.endsWith('/review')));
    assert.ok(linked.some((button) => button.web_app?.url.endsWith('/materials')));
    assert.equal(telegramHomeButtons(false).inline_keyboard[0]?.[0]?.text, '📱 Связать аккаунт ↗');
  } finally {
    if (original === undefined) delete process.env.TELEGRAM_MINI_APP_URL;
    else process.env.TELEGRAM_MINI_APP_URL = original;
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
  let menuType = 'commands';
  let webhookUrl = `${url}/api/telegram/webhook`;
  process.env.TELEGRAM_BOT_TOKEN = 'synthetic-token';
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  process.env.TELEGRAM_MINI_APP_URL = url;
  globalThis.fetch = async (input, options) => {
    const method = String(input).split('/').at(-1)!;
    calls.push({ method, body: JSON.parse(String(options?.body)) });
    const result =
      method === 'getMe'
        ? { id: 12345, username: 'SyntheticBot', is_bot: true }
        : method === 'getWebhookInfo'
          ? { url: webhookUrl, pending_update_count: 0 }
          : method === 'getChatMenuButton'
            ? { type: menuType }
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
        'setMyName',
        'setMyDescription',
        'setMyShortDescription',
        'setMyCommands',
        'setChatMenuButton',
        'setWebhook',
        'getWebhookInfo',
        'getChatMenuButton',
      ],
    );
    const registered = calls.find(({ method }) => method === 'setWebhook')!.body;
    assert.equal(registered.secret_token, secret);
    assert.deepEqual(registered.allowed_updates, ['message', 'callback_query']);
    assert.deepEqual(calls.find(({ method }) => method === 'setMyName')?.body, {
      name: 'Lingvoteka',
    });
    assert.deepEqual(calls.find(({ method }) => method === 'setChatMenuButton')?.body, {
      menu_button: { type: 'commands' },
    });
    const commands = calls.find(({ method }) => method === 'setMyCommands')!.body.commands as {
      command: string;
    }[];
    assert.ok(commands.some((item) => item.command === 'phrase'));
    assert.ok(commands.some((item) => item.command === 'app'));
    assert.ok(!JSON.stringify(result).includes(secret!));
    assert.ok(!JSON.stringify(result).includes('synthetic-token'));
    // Same derived secret is required by the real controller, not just the setup script.
    await assert.rejects(
      new TelegramController({ accept: async () => {} } as unknown as TelegramService).webhook({
        get: () => '',
        body: null,
      } as unknown as Request),
    );
    assert.deepEqual(
      await new TelegramController({
        accept: async () => {},
      } as unknown as TelegramService).webhook({
        get: () => secret,
        body: null,
      } as unknown as Request),
      { ok: true },
    );
    menuType = 'web_app';
    await assert.rejects(configureTelegramBot(true), {
      message: 'Telegram menu verification failed',
    });
    menuType = 'commands';
    webhookUrl = `${url}/wrong`;
    await assert.rejects(configureTelegramBot(true), {
      message: 'Telegram webhook verification failed',
    });
    webhookUrl = `${url}/api/telegram/webhook`;
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
    assert.ok(warnings[0]!.includes('\"method\":\"getMe\"'));
    assert.ok(warnings[0]!.includes('\"kind\":\"network\"'));
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ ok: false, description: 'not logged' }), { status: 401 });
    await assert.rejects(configureTelegramBot(true), {
      method: 'getMe',
      kind: 'request',
      status: 401,
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
