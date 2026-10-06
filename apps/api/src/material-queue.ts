import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PgBoss } from 'pg-boss';

export const MATERIAL_ANALYSIS_QUEUE = 'material-analysis';

export function createBoss(): PgBoss {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required for the job queue');
  const boss = new PgBoss({ connectionString });
  boss.on('error', (error) => console.error('Job queue error', error));
  return boss;
}

export async function ensureMaterialQueue(boss: PgBoss): Promise<void> {
  await boss.createQueue(MATERIAL_ANALYSIS_QUEUE, {
    policy: 'exclusive',
    retryLimit: 2,
    retryDelay: 10,
    retryBackoff: true,
    heartbeatSeconds: 60,
    expireInSeconds: 900,
  });
}

export async function enqueueMaterialAnalysis(boss: PgBoss, materialId: string) {
  return boss.send(MATERIAL_ANALYSIS_QUEUE, { materialId }, { singletonKey: materialId });
}

@Injectable()
export class MaterialQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly boss = createBoss();

  async onModuleInit(): Promise<void> {
    await this.boss.start();
    await ensureMaterialQueue(this.boss);
  }

  async onModuleDestroy(): Promise<void> {
    await this.boss.stop({ graceful: true, timeout: 30_000 });
  }

  enqueue(materialId: string) {
    return enqueueMaterialAnalysis(this.boss, materialId);
  }
}
