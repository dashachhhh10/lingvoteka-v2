import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { emailDeliveryConfigured, sendEmail } from '../src/email.js';

const originalEnv = {
  EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
  BREVO_API_KEY: process.env.BREVO_API_KEY,
  BREVO_SENDER_EMAIL: process.env.BREVO_SENDER_EMAIL,
  EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO,
};
const originalFetch = globalThis.fetch;

after(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  globalThis.fetch = originalFetch;
});

test('Brevo sends a password-reset email with a separate Reply-To address', async () => {
  process.env.EMAIL_PROVIDER = 'brevo';
  process.env.BREVO_API_KEY = 'test-api-key';
  process.env.BREVO_SENDER_EMAIL = 'sender@example.com';
  process.env.EMAIL_REPLY_TO = 'reply@example.com';

  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.brevo.com/v3/smtp/email');
    assert.equal(options?.method, 'POST');
    assert.equal(new Headers(options?.headers).get('api-key'), 'test-api-key');
    assert.deepEqual(JSON.parse(String(options?.body)), {
      sender: { name: 'Lingvoteka', email: 'sender@example.com' },
      to: [{ email: 'student@example.com' }],
      replyTo: { email: 'reply@example.com' },
      subject: 'Сброс пароля',
      textContent: 'Ссылка для сброса',
    });
    return new Response(JSON.stringify({ messageId: 'test-message' }), { status: 201 });
  };

  assert.equal(emailDeliveryConfigured(), true);
  await sendEmail({
    to: 'student@example.com',
    subject: 'Сброс пароля',
    text: 'Ссылка для сброса',
  });
  assert.equal(calls, 1);
});

test('Brevo rejection does not expose the API response', async () => {
  globalThis.fetch = async () => new Response('secret provider details', { status: 401 });
  await assert.rejects(
    sendEmail({ to: 'student@example.com', subject: 'Сброс пароля', text: 'Ссылка' }),
    { message: 'Email delivery was rejected' },
  );
});
