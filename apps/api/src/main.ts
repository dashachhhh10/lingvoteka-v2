import 'dotenv/config';
import 'reflect-metadata';
import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { toNodeHandler } from 'better-auth/node';
import { AppModule } from './app.module.js';
import { auth } from './auth.js';
import { prisma } from './database.js';
import { validateFileStorage } from './file-storage.js';
import { initializeEmailDelivery, smtpConfigured } from './email.js';

async function bootstrap() {
  validateFileStorage();
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
  const openApiConfig = new DocumentBuilder()
    .setTitle('Lingvoteka API')
    .setDescription(
      'Материалы уроков, словарь, повторение и грамматика. Доступ к личным данным — по сессионной cookie Better Auth.',
    )
    .setVersion('0.1.0')
    .addCookieAuth('better-auth.session_token', undefined, 'sessionCookie')
    .build();
  SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, openApiConfig), {
    jsonDocumentUrl: 'api/openapi.json',
  });
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3001));
  console.info(`Lingvoteka API listening on port ${process.env.PORT ?? 3001}`);
}

void bootstrap().catch(async (error: unknown) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
