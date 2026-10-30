import type { PgBoss } from 'pg-boss';

export type GrammarGenerationMode = 'theory' | 'practice';

export const GRAMMAR_GENERATION_QUEUE = 'grammar-generation';

export async function ensureGrammarQueue(boss: PgBoss): Promise<void> {
  await boss.createQueue(GRAMMAR_GENERATION_QUEUE, {
    policy: 'exclusive',
    retryLimit: 2,
    retryDelay: 10,
    retryBackoff: true,
    heartbeatSeconds: 60,
    expireInSeconds: 900,
  });
}

export async function enqueueGrammarGeneration(
  boss: PgBoss,
  topicId: string,
  mode: GrammarGenerationMode = 'theory',
) {
  return boss.send(
    GRAMMAR_GENERATION_QUEUE,
    { topicId, mode },
    { singletonKey: mode === 'theory' ? topicId : `practice:${topicId}` },
  );
}
