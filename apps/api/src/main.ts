import 'dotenv/config';
import 'reflect-metadata';
import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { toNodeHandler } from 'better-auth/node';
import { AppModule } from './app.module.js';
import { auth } from './auth.js';
import { prisma } from './database.js';
import {
  getDevelopmentVerificationLink,
  initializeEmailDelivery,
  localEmailPreviewEnabled,
  smtpConfigured,
} from './email.js';

async function bootstrap() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32) {
    throw new Error('BETTER_AUTH_SECRET must be at least 32 characters');
  }
  if (process.env.NODE_ENV === 'production' && !smtpConfigured()) {
    throw new Error('SMTP delivery settings are incomplete in production');
  }
  if (process.env.NODE_ENV === 'production' && !process.env.REGISTRATION_INVITE_CODE) {
    throw new Error('REGISTRATION_INVITE_CODE is required in production');
  }

  await initializeEmailDelivery();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  const expressApp = app.getHttpAdapter().getInstance() as express.Express;
  expressApp.get('/api/dev/verification-link', (request, response) => {
    const address = request.socket.remoteAddress;
    const localRequest =
      address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
    if (!localEmailPreviewEnabled() || !localRequest) {
      response.sendStatus(404);
      return;
    }
    const email = typeof request.query.email === 'string' ? request.query.email : '';
    const url = getDevelopmentVerificationLink(email);
    if (!url) {
      response.sendStatus(404);
      return;
    }
    response.setHeader('Cache-Control', 'no-store');
    response.json({ url });
  });
  expressApp.use('/api/auth/sign-up/email', (request, response, next) => {
    const configured = process.env.REGISTRATION_INVITE_CODE;
    if (!configured) return next();
    const input = request.get('x-registration-code') ?? '';
    const expectedBytes = Buffer.from(configured);
    const inputBytes = Buffer.from(input);
    if (inputBytes.length !== expectedBytes.length || !timingSafeEqual(inputBytes, expectedBytes)) {
      response
        .status(403)
        .json({ code: 'INVITE_CODE_REQUIRED', message: 'Неверный код приглашения' });
      return;
    }
    next();
  });
  expressApp.all('/api/auth/*splat', toNodeHandler(auth));
  expressApp.use(express.json({ limit: '1mb' }));
  expressApp.use(express.urlencoded({ extended: true }));
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3001));
  console.info(`Lingvoteka API listening on port ${process.env.PORT ?? 3001}`);
}

void bootstrap().catch(async (error: unknown) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
