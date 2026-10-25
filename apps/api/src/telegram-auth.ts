import { APIError, createAuthEndpoint, sessionMiddleware } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import type { BetterAuthPlugin } from 'better-auth';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from './database.js';
import { validateTelegramInitData } from './telegram-init-data.js';

const body = z.object({ initData: z.string().min(1).max(16_384) });

function telegramUser(initData: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token)
    throw new APIError('SERVICE_UNAVAILABLE', { message: 'Вход через Telegram пока не настроен.' });
  try {
    return validateTelegramInitData(initData, token);
  } catch {
    throw new APIError('UNAUTHORIZED', {
      message: 'Открой приложение заново из Telegram и попробуй ещё раз.',
    });
  }
}

export function telegramAuth() {
  return {
    id: 'lingvoteka-telegram',
    endpoints: {
      telegramSignIn: createAuthEndpoint(
        '/telegram/sign-in',
        { method: 'POST', body },
        async (ctx) => {
          const telegram = telegramUser(ctx.body.initData);
          const identity = await prisma.telegramIdentity.findUnique({
            where: { telegramId: telegram.id },
            include: { user: true },
          });
          if (!identity) return ctx.json({ status: 'link_required' as const });
          const session = await ctx.context.internalAdapter.createSession(identity.userId);
          if (!session)
            throw new APIError('INTERNAL_SERVER_ERROR', { message: 'Не удалось выполнить вход.' });
          await setSessionCookie(ctx, { session, user: identity.user });
          return ctx.json({ status: 'signed_in' as const });
        },
      ),
      telegramStatus: createAuthEndpoint(
        '/telegram/status',
        { method: 'POST', body, use: [sessionMiddleware] },
        async (ctx) => {
          const telegram = telegramUser(ctx.body.initData);
          const userId = ctx.context.session.user.id;
          const identities = await prisma.telegramIdentity.findMany({
            where: { OR: [{ telegramId: telegram.id }, { userId }] },
          });
          if (identities.some((item) => item.telegramId === telegram.id && item.userId === userId))
            return ctx.json({ status: 'linked' as const });
          return ctx.json({
            status: identities.length ? ('conflict' as const) : ('unlinked' as const),
          });
        },
      ),
      telegramLink: createAuthEndpoint(
        '/telegram/link',
        { method: 'POST', body, use: [sessionMiddleware] },
        async (ctx) => {
          const telegram = telegramUser(ctx.body.initData);
          const userId = ctx.context.session.user.id;
          const existing = await prisma.telegramIdentity.findUnique({
            where: { telegramId: telegram.id },
          });
          if (existing?.userId === userId) return ctx.json({ status: 'linked' as const });
          try {
            await prisma.telegramIdentity.create({ data: { telegramId: telegram.id, userId } });
          } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
              const raced = await prisma.telegramIdentity.findUnique({
                where: { telegramId: telegram.id },
              });
              if (raced?.userId === userId) return ctx.json({ status: 'linked' as const });
              throw new APIError('CONFLICT', {
                message:
                  'Этот Telegram или аккаунт Lingvoteka уже связан. Автоматическая замена отключена.',
              });
            }
            throw error;
          }
          return ctx.json({ status: 'linked' as const });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}
