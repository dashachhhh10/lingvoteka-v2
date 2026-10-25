import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { JobWithMetadata } from 'pg-boss';
import { prisma } from './database.js';
import { createBoss, MaterialQueueService } from './material-queue.js';
import {
  importTelegramSubmission,
  notifyTelegramSubmission,
  receiveTelegramUpdate,
  rejectTelegramSubmission,
  replyToTelegramUpdate,
} from './telegram-intake.js';
const QUEUE = 'telegram-delivery';
type TelegramJob = { kind: 'control' | 'import' | 'notify'; id: string };

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private boss = createBoss();
  private timer: NodeJS.Timeout | undefined;
  private reconciling = false;
  private started = false;
  constructor(@Inject(MaterialQueueService) private readonly materials: MaterialQueueService) {}
  accept(raw: unknown) {
    return receiveTelegramUpdate(raw);
  }
  async onModuleInit() {
    if (!process.env.TELEGRAM_BOT_TOKEN) return;
    await this.boss.start();
    this.started = true;
    await this.boss.createQueue(QUEUE, {
      policy: 'exclusive',
      retryLimit: 3,
      retryDelay: 10,
      retryBackoff: true,
      expireInSeconds: 360,
      heartbeatSeconds: 60,
    });
    await this.boss.work(
      QUEUE,
      { includeMetadata: true, pollingIntervalSeconds: 1 },
      async ([job]: JobWithMetadata<TelegramJob>[]) => {
        if (!job) return;
        try {
          if (job.data.kind === 'control') await replyToTelegramUpdate(BigInt(job.data.id));
          else if (job.data.kind === 'import')
            await importTelegramSubmission(job.data.id, (id) => this.materials.enqueue(id));
          else await notifyTelegramSubmission(job.data.id);
        } catch {
          if (job.retryCount >= job.retryLimit) {
            if (job.data.kind === 'import')
              await rejectTelegramSubmission(
                job.data.id,
                'Не удалось получить файл из Telegram. Попробуй отправить его заново или загрузить в приложении.',
              );
            else if (job.data.kind === 'control')
              await prisma.telegramUpdate.updateMany({
                where: { updateId: BigInt(job.data.id) },
                data: { handledAt: new Date() },
              });
            else
              await prisma.telegramSubmission.updateMany({
                where: { id: job.data.id },
                data: { notificationRetryAt: new Date(Date.now() + 60_000) },
              });
          }
          throw new Error('Telegram delivery retry required');
        }
      },
    );
    await this.reconcile();
    this.timer = setInterval(
      () => void this.reconcile().catch(() => console.warn('Telegram reconciliation delayed')),
      3_000,
    );
  }
  private enqueue(kind: TelegramJob['kind'], id: string) {
    return this.boss.send(QUEUE, { kind, id }, { singletonKey: `${kind}:${id}` });
  }
  async reconcile() {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      const now = new Date();
      await prisma.telegramSubmission.updateMany({
        where: { status: 'IMPORTING', leaseUntil: { lt: now } },
        data: { status: 'PENDING', claimToken: null, leaseUntil: null },
      });
      const [controls, imports, notifications] = await Promise.all([
        prisma.telegramUpdate.findMany({
          where: { handledAt: null, kind: { not: 'material' } },
          select: { updateId: true },
          take: 50,
          orderBy: { createdAt: 'asc' },
        }),
        prisma.telegramSubmission.findMany({
          where: {
            status: 'PENDING',
            OR: [{ isAlbum: false }, { lastReceivedAt: { lte: new Date(Date.now() - 4_000) } }],
          },
          select: { id: true },
          take: 50,
          orderBy: { createdAt: 'asc' },
        }),
        prisma.telegramSubmission.findMany({
          where: {
            OR: [
              { status: 'REJECTED', notifiedStatus: null },
              { status: 'IMPORTED', notifiedStatus: null },
              {
                status: 'IMPORTED',
                notifiedStatus: 'PROCESSING',
                material: { status: { in: ['REVIEW', 'READY', 'ERROR'] } },
              },
              {
                status: 'IMPORTED',
                notifiedStatus: 'ERROR',
                material: { status: { in: ['PROCESSING', 'REVIEW', 'READY'] } },
              },
              { status: 'IMPORTED', notifiedStatus: 'REVIEW', material: { status: 'READY' } },
            ],
            AND: [{ OR: [{ notificationRetryAt: null }, { notificationRetryAt: { lte: now } }] }],
          },
          select: { id: true },
          take: 50,
          orderBy: { createdAt: 'asc' },
        }),
      ]);
      for (const item of controls) await this.enqueue('control', String(item.updateId));
      for (const item of imports) await this.enqueue('import', item.id);
      for (const item of notifications) await this.enqueue('notify', item.id);
      // Telegram retries for at most 24h; retain receipts for 30 days without message content.
      await prisma.telegramUpdate.deleteMany({
        where: {
          submissionId: null,
          handledAt: { not: null },
          createdAt: { lt: new Date(Date.now() - 30 * 86400_000) },
        },
      });
    } finally {
      this.reconciling = false;
    }
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.started) await this.boss.stop({ graceful: true, timeout: 30_000 });
  }
}
