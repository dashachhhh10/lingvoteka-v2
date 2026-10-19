import type { PgBoss } from 'pg-boss';

export const VOCABULARY_CLASSIFICATION_QUEUE = 'vocabulary-classification';

export async function ensureVocabularyQueue(boss: PgBoss) {
  await boss.createQueue(VOCABULARY_CLASSIFICATION_QUEUE, {
    policy: 'exclusive',
    retryLimit: 2,
    retryDelay: 10,
    retryBackoff: true,
    heartbeatSeconds: 60,
    expireInSeconds: 900,
  });
}

export async function enqueueVocabularyClassification(boss: PgBoss, ownerId: string) {
  return boss.send(VOCABULARY_CLASSIFICATION_QUEUE, { ownerId }, { singletonKey: ownerId });
}
