import 'dotenv/config';
import type { JobWithMetadata } from 'pg-boss';
import { prisma } from './database.js';
import { processMaterialAnalysis } from './material-analysis-job.js';
import {
  createBoss,
  enqueueMaterialAnalysis,
  ensureMaterialQueue,
  MATERIAL_ANALYSIS_QUEUE,
} from './material-queue.js';

type MaterialJob = { materialId: string };

const boss = createBoss();
let reconciliationTimer: NodeJS.Timeout | undefined;
let stopping = false;

async function reconcileProcessingMaterials(): Promise<void> {
  const processing = await prisma.material.findMany({
    where: { status: 'PROCESSING' },
    select: { id: true },
  });
  for (const material of processing) {
    await enqueueMaterialAnalysis(boss, material.id);
  }
}

async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  if (reconciliationTimer) clearInterval(reconciliationTimer);
  await boss.stop({ graceful: true, timeout: 30_000 });
  await prisma.$disconnect();
}

async function main(): Promise<void> {
  await boss.start();
  await ensureMaterialQueue(boss);
  await boss.work(
    MATERIAL_ANALYSIS_QUEUE,
    { includeMetadata: true, pollingIntervalSeconds: 2 },
    async ([job]: JobWithMetadata<MaterialJob>[]) => {
      if (!job) return;
      try {
        await processMaterialAnalysis(job.data.materialId);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось разобрать материал';
        const permanent = message.startsWith('AI не настроен');
        const finalAttempt = job.retryCount >= job.retryLimit;
        console.error('Material analysis failed', {
          materialId: job.data.materialId,
          attempt: job.retryCount + 1,
          message,
        });
        if (permanent || finalAttempt) {
          await prisma.material.updateMany({
            where: { id: job.data.materialId, status: 'PROCESSING' },
            data: {
              status: 'ERROR',
              analysisError: permanent
                ? message.slice(0, 300)
                : 'Разбор не удался. Попробуй ещё раз или добавь записи вручную.',
            },
          });
        }
        if (!permanent) throw error;
      }
    },
  );
  await reconcileProcessingMaterials();
  reconciliationTimer = setInterval(() => {
    void reconcileProcessingMaterials().catch((error) =>
      console.error('Material job reconciliation failed', error),
    );
  }, 60_000);
  console.info('Lingvoteka material worker is ready');
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

void main().catch(async (error: unknown) => {
  console.error('Material worker could not start', error);
  await shutdown();
  process.exitCode = 1;
});
