import 'dotenv/config';
import type { JobWithMetadata } from 'pg-boss';
import { prisma } from './database.js';
import { validateFileStorage } from './file-storage.js';
import { processMaterialAnalysis } from './material-analysis-job.js';
import { processGrammarGeneration } from './grammar-generation-job.js';
import {
  enqueueGrammarGeneration,
  ensureGrammarQueue,
  GRAMMAR_GENERATION_QUEUE,
} from './grammar-queue.js';
import {
  failVocabularyClassification,
  processVocabularyClassification,
} from './vocabulary-classification-job.js';
import {
  enqueueVocabularyClassification,
  ensureVocabularyQueue,
  VOCABULARY_CLASSIFICATION_QUEUE,
} from './vocabulary-queue.js';
import {
  createBoss,
  enqueueMaterialAnalysis,
  ensureMaterialQueue,
  MATERIAL_ANALYSIS_QUEUE,
} from './material-queue.js';

type MaterialJob = { materialId: string };
type GrammarJob = { topicId: string };
type VocabularyJob = { ownerId: string };

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

async function reconcileVocabulary(): Promise<void> {
  const owners = await prisma.vocabItem.findMany({
    where: { categoryStatus: 'PENDING' },
    distinct: ['ownerId'],
    select: { ownerId: true },
    take: 100,
  });
  for (const { ownerId } of owners) await enqueueVocabularyClassification(boss, ownerId);
}

async function reconcileGeneratingGrammar(): Promise<void> {
  const topics = await prisma.grammarTopic.findMany({
    where: { theoryStatus: 'GENERATING' },
    select: { id: true },
    take: 100,
  });
  for (const topic of topics) await enqueueGrammarGeneration(boss, topic.id);
}

async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  if (reconciliationTimer) clearInterval(reconciliationTimer);
  await boss.stop({ graceful: true, timeout: 30_000 });
  await prisma.$disconnect();
}

async function main(): Promise<void> {
  validateFileStorage();
  await boss.start();
  await ensureMaterialQueue(boss);
  await ensureGrammarQueue(boss);
  await ensureVocabularyQueue(boss);
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
  await boss.work(
    GRAMMAR_GENERATION_QUEUE,
    { includeMetadata: true, pollingIntervalSeconds: 2 },
    async ([job]: JobWithMetadata<GrammarJob>[]) => {
      if (!job) return;
      try {
        await processGrammarGeneration(job.data.topicId);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось создать объяснение';
        const permanent = message.startsWith('AI не настроен');
        const finalAttempt = job.retryCount >= job.retryLimit;
        console.error('Grammar generation failed', {
          topicId: job.data.topicId,
          attempt: job.retryCount + 1,
          message,
        });
        if (permanent || finalAttempt) {
          await prisma.grammarTopic.updateMany({
            where: { id: job.data.topicId, theoryStatus: 'GENERATING' },
            data: {
              theoryStatus: 'ERROR',
              theoryError: permanent
                ? message.slice(0, 300)
                : 'Не удалось создать объяснение. Попробуй ещё раз.',
            },
          });
        }
        if (!permanent) throw error;
      }
    },
  );
  await boss.work(
    VOCABULARY_CLASSIFICATION_QUEUE,
    { includeMetadata: true, pollingIntervalSeconds: 2 },
    async ([job]: JobWithMetadata<VocabularyJob>[]) => {
      if (!job) return;
      try {
        await processVocabularyClassification(job.data.ownerId);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось определить темы слов';
        const permanent = message.startsWith('AI не настроен');
        const finalAttempt = job.retryCount >= job.retryLimit;
        console.error('Vocabulary classification failed', {
          ownerId: job.data.ownerId,
          attempt: job.retryCount + 1,
          message,
        });
        if (permanent || finalAttempt) await failVocabularyClassification(job.data.ownerId);
        if (!permanent) throw error;
      }
    },
  );
  await reconcileProcessingMaterials();
  await reconcileGeneratingGrammar();
  await reconcileVocabulary();
  reconciliationTimer = setInterval(() => {
    void reconcileProcessingMaterials().catch((error) =>
      console.error('Material job reconciliation failed', error),
    );
    void reconcileVocabulary().catch((error) =>
      console.error('Vocabulary job reconciliation failed', error),
    );
    void reconcileGeneratingGrammar().catch((error) =>
      console.error('Grammar job reconciliation failed', error),
    );
  }, 10_000);
  console.info('Lingvoteka background worker is ready');
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

void main().catch(async (error: unknown) => {
  console.error('Material worker could not start', error);
  await shutdown();
  process.exitCode = 1;
});
