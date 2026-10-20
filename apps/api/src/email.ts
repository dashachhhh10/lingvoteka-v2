import nodemailer from 'nodemailer';

type EmailInput = {
  to: string;
  subject: string;
  text: string;
};

let smtpVerified = false;

export function passwordResetAvailable(): boolean {
  return process.env.EMAIL_PROVIDER !== 'disabled';
}

export function emailDeliveryConfigured(): boolean {
  if (process.env.EMAIL_PROVIDER === 'disabled') return false;
  if (process.env.EMAIL_PROVIDER === 'resend') {
    return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
  }
  return !process.env.EMAIL_PROVIDER || process.env.EMAIL_PROVIDER === 'smtp'
    ? smtpConfigured()
    : false;
}

export function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && (!process.env.SMTP_USER || process.env.SMTP_PASSWORD));
}

function createTransport() {
  const port = Number(process.env.SMTP_PORT ?? 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });
}

function previewDevelopmentEmail(input: EmailInput): void {
  console.info(`[development email] to=${input.to} subject=${input.subject}\n${input.text}`);
}

export async function initializeEmailDelivery(): Promise<void> {
  if (process.env.EMAIL_PROVIDER === 'disabled') {
    console.info('Email delivery disabled');
    return;
  }
  if (process.env.EMAIL_PROVIDER === 'resend') {
    if (!emailDeliveryConfigured()) throw new Error('Resend delivery settings are incomplete');
    console.info('Resend HTTPS email delivery configured');
    return;
  }
  if (!smtpConfigured()) return;
  const transport = createTransport();
  try {
    await transport.verify();
    smtpVerified = true;
    console.info('SMTP authentication verified');
  } catch (error) {
    const detail = error as { code?: string; responseCode?: number };
    console.warn('SMTP unavailable', detail.code ?? 'unknown', detail.responseCode ?? '');
  } finally {
    transport.close();
  }
}

export async function sendEmail(input: EmailInput): Promise<void> {
  if (process.env.EMAIL_PROVIDER === 'disabled') {
    throw new Error('Email delivery is disabled');
  }
  if (process.env.EMAIL_PROVIDER === 'resend') {
    await sendResendEmail(input);
    return;
  }
  if (!smtpVerified) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SMTP delivery is unavailable');
    }
    previewDevelopmentEmail(input);
    return;
  }

  const transport = createTransport();
  try {
    const result = await transport.sendMail({
      from: process.env.SMTP_FROM ?? 'Lingvoteka <noreply@example.com>',
      to: input.to,
      subject: input.subject,
      text: input.text,
      replyTo: process.env.EMAIL_REPLY_TO || undefined,
    });
    if (
      !result.accepted.some(
        (recipient) =>
          (typeof recipient === 'string' ? recipient : recipient.address).toLowerCase() ===
          input.to.toLowerCase(),
      )
    ) {
      throw new Error('SMTP did not accept the recipient');
    }
    console.info('SMTP message accepted for delivery');
  } catch (error) {
    const detail = error as { code?: string; responseCode?: number };
    console.warn('SMTP send failed', detail.code ?? 'unknown', detail.responseCode ?? '');
    if (process.env.NODE_ENV === 'production') throw error;
    smtpVerified = false;
    previewDevelopmentEmail(input);
  } finally {
    transport.close();
  }
}

async function sendResendEmail(input: EmailInput): Promise<void> {
  if (!emailDeliveryConfigured()) throw new Error('Resend delivery settings are incomplete');
  let response: Response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM,
        to: [input.to],
        reply_to: process.env.EMAIL_REPLY_TO || undefined,
        subject: input.subject,
        text: input.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    console.warn('Resend HTTPS request failed', error instanceof Error ? error.name : 'unknown');
    throw new Error('Email delivery is unavailable');
  }
  if (!response.ok) {
    console.warn('Resend rejected email', response.status);
    throw new Error('Email delivery was rejected');
  }
  console.info('Resend accepted email for delivery');
}
