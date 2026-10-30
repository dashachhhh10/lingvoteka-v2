import { Prisma } from '@prisma/client';
import { prisma } from './database.js';
import { generateGrammarContent } from './grammar-generation.js';
import type { GrammarGenerationMode } from './grammar-queue.js';

export async function processGrammarGeneration(
  topicId: string,
  mode: GrammarGenerationMode = 'theory',
): Promise<void> {
  const topic = await prisma.grammarTopic.findUnique({
    where: { id: topicId },
    include: { materials: { select: { sourceExcerpt: true } } },
  });
  const status = mode === 'practice' ? 'practiceStatus' : 'theoryStatus';
  if (!topic || topic[status] !== 'GENERATING') return;
  const generated = await generateGrammarContent(
    {
      title: topic.title,
      summary: topic.summary,
      excerpts: topic.materials
        .map((item) => item.sourceExcerpt)
        .filter((text): text is string => Boolean(text)),
    },
    mode,
  );
  await prisma.$transaction(async (tx) => {
    const updated = await tx.grammarTopic.updateMany({
      where: { id: topicId, [status]: 'GENERATING' },
      data:
        mode === 'practice'
          ? { practiceStatus: 'READY', practiceError: null }
          : {
              theory: generated.theory as unknown as Prisma.InputJsonValue,
              theoryStatus: 'READY',
              theoryError: null,
            },
    });
    if (!updated.count || mode !== 'practice') return;
    // Never replace existing exercise IDs: attempts and an open session reference them.
    if (await tx.grammarExercise.count({ where: { topicId } })) return;
    await tx.grammarExercise.createMany({
      data: generated.exercises.map((exercise, position) => ({ topicId, position, ...exercise })),
    });
  });
}
