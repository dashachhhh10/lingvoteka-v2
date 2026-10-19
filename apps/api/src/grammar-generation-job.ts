import { Prisma } from '@prisma/client';
import { prisma } from './database.js';
import { generateGrammarContent } from './grammar-generation.js';

export async function processGrammarGeneration(topicId: string): Promise<void> {
  const topic = await prisma.grammarTopic.findUnique({
    where: { id: topicId },
    include: { materials: { select: { sourceExcerpt: true } } },
  });
  if (!topic || topic.theoryStatus !== 'GENERATING') return;

  const generated = await generateGrammarContent({
    title: topic.title,
    summary: topic.summary,
    excerpts: topic.materials
      .map((item) => item.sourceExcerpt)
      .filter((text): text is string => Boolean(text)),
  });

  await prisma.$transaction(async (tx) => {
    const updated = await tx.grammarTopic.updateMany({
      where: { id: topicId, theoryStatus: 'GENERATING' },
      data: {
        theory: generated.theory as unknown as Prisma.InputJsonValue,
        theoryStatus: 'READY',
        theoryError: null,
      },
    });
    if (!updated.count) return;
    await tx.grammarExercise.deleteMany({ where: { topicId } });
    await tx.grammarExercise.createMany({
      data: generated.exercises.map((exercise, position) => ({
        topicId,
        position,
        prompt: exercise.prompt,
        options: exercise.options,
        answerIndex: exercise.answerIndex,
        explanation: exercise.explanation,
      })),
    });
  });
}
