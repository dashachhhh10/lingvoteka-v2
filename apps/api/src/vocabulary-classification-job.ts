import { prisma } from './database.js';
import { classifyVocabulary } from './vocabulary-classification.js';

const BATCH_SIZE = 20;

export async function processVocabularyClassification(ownerId: string): Promise<void> {
  for (let batch = 0; batch < 5; batch += 1) {
    const words = await prisma.vocabItem.findMany({
      where: { ownerId, categoryStatus: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
      select: {
        id: true,
        term: true,
        translation: true,
        example: true,
        partOfSpeech: true,
        semanticTopic: true,
      },
    });
    if (!words.length) return;
    const categories = await classifyVocabulary(words);
    const original = new Map(words.map((word) => [word.id, word]));
    await prisma.$transaction(
      categories.map((item) =>
        prisma.vocabItem.updateMany({
          where: { id: item.id, ownerId, categoryStatus: 'PENDING' },
          data: {
            partOfSpeech: original.get(item.id)?.partOfSpeech ?? item.partOfSpeech,
            semanticTopic: original.get(item.id)?.semanticTopic ?? item.semanticTopic,
            categoryStatus: 'READY',
          },
        }),
      ),
    );
  }
}

export async function failVocabularyClassification(ownerId: string): Promise<void> {
  const words = await prisma.vocabItem.findMany({
    where: { ownerId, categoryStatus: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take: BATCH_SIZE,
    select: { id: true },
  });
  await prisma.vocabItem.updateMany({
    where: { id: { in: words.map((word) => word.id) }, ownerId, categoryStatus: 'PENDING' },
    data: { categoryStatus: 'ERROR' },
  });
}
