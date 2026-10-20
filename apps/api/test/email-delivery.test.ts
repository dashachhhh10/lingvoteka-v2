import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { emailDeliveryConfigured, passwordResetAvailable, sendEmail } from '../src/email.js';

const originalEnv = {
  EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_FROM: process.env.RESEND_FROM,
  EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO,
  SMTP_HOST: process.env.SMTP_HOST,
};
const originalFetch = globalThis.fetch;

after(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  globalThis.fetch = originalFetch;
});

test('Resend sends a password-reset email with a separate Reply-To address', async () => {
  process.env.EMAIL_PROVIDER = 'resend';
  process.env.RESEND_API_KEY = 'test-api-key';
  process.env.RESEND_FROM = 'Lingvoteka <sender@example.com>';
  process.env.EMAIL_REPLY_TO = 'reply@example.com';

  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(options?.method, 'POST');
    assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer test-api-key');
    assert.deepEqual(JSON.parse(String(options?.body)), {
      from: 'Lingvoteka <sender@example.com>',
      to: ['student@example.com'],
      reply_to: 'reply@example.com',
      subject: 'Сброс пароля',
      text: 'Ссылка для сброса',
    });
    return new Response(JSON.stringify({ id: 'test-message' }), { status: 200 });
  };

  assert.equal(emailDeliveryConfigured(), true);
  await sendEmail({
    to: 'student@example.com',
    subject: 'Сброс пароля',
    text: 'Ссылка для сброса',
  });
  assert.equal(calls, 1);
});

test('Resend rejection does not expose the API response', async () => {
  globalThis.fetch = async () => new Response('secret provider details', { status: 401 });
  await assert.rejects(
    sendEmail({ to: 'student@example.com', subject: 'Сброс пароля', text: 'Ссылка' }),
    { message: 'Email delivery was rejected' },
  );
});

test('disabled email mode keeps startup valid without sending messages', async () => {
  process.env.EMAIL_PROVIDER = 'disabled';
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM;
  assert.equal(emailDeliveryConfigured(), false);
  assert.equal(passwordResetAvailable(), false);
  await assert.rejects(
    sendEmail({ to: 'student@example.com', subject: 'Сброс пароля', text: 'Ссылка' }),
    { message: 'Email delivery is disabled' },
  );
});

test('missing email provider also keeps delivery disabled', async () => {
  delete process.env.EMAIL_PROVIDER;
  process.env.SMTP_HOST = 'smtp.example.com';
  assert.equal(emailDeliveryConfigured(), false);
  assert.equal(passwordResetAvailable(), false);
  await assert.rejects(
    sendEmail({ to: 'student@example.com', subject: 'Сброс пароля', text: 'Ссылка' }),
    { message: 'Email delivery is disabled' },
  );
});
