import { prisma } from './database.js';
import { classifyVocabulary } from './vocabulary-classification.js';
import { PENDING_CATEGORY_STATUSES } from './vocabulary-categories.js';

const BATCH_SIZE = 20;

export async function processVocabularyClassification(ownerId: string): Promise<void> {
  for (let batch = 0; batch < 5; batch += 1) {
    const words = await prisma.vocabItem.findMany({
      where: { ownerId, categoryStatus: { in: PENDING_CATEGORY_STATUSES } },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
      select: {
        id: true,
        term: true,
        translation: true,
        example: true,
        partOfSpeech: true,
        semanticTopic: true,
        categoryStatus: true,
      },
    });
    if (!words.length) return;
    // A recheck may replace the topic only; retain the previous value in the DB on failure.
    const categories = await classifyVocabulary(
      words.map((word) =>
        word.categoryStatus === 'RECHECK_PENDING' ? { ...word, semanticTopic: null } : word,
      ),
    );
    const original = new Map(words.map((word) => [word.id, word]));
    await prisma.$transaction(
      categories.map((item) => {
        const word = original.get(item.id)!;
        return prisma.vocabItem.updateMany({
          // Do not overwrite edits/imports completed while AI was responding.
          where: {
            id: item.id,
            ownerId,
            categoryStatus: word.categoryStatus,
            partOfSpeech: word.partOfSpeech,
            semanticTopic: word.semanticTopic,
          },
          data: {
            partOfSpeech: word.partOfSpeech ?? item.partOfSpeech,
            semanticTopic:
              word.categoryStatus === 'RECHECK_PENDING'
                ? item.semanticTopic
                : (word.semanticTopic ?? item.semanticTopic),
            categoryStatus: 'READY',
          },
        });
      }),
    );
  }
}

export async function failVocabularyClassification(ownerId: string): Promise<void> {
  const words = await prisma.vocabItem.findMany({
    where: { ownerId, categoryStatus: { in: PENDING_CATEGORY_STATUSES } },
    orderBy: { createdAt: 'asc' },
    take: BATCH_SIZE,
    select: { id: true, categoryStatus: true },
  });
  await prisma.$transaction(
    words.map((word) =>
      prisma.vocabItem.updateMany({
        where: { id: word.id, ownerId, categoryStatus: word.categoryStatus },
        data: {
          categoryStatus: word.categoryStatus === 'RECHECK_PENDING' ? 'RECHECK_ERROR' : 'ERROR',
        },
      }),
    ),
  );
}
