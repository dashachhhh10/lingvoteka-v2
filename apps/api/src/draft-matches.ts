import { prisma } from './database.js';
import type { Draft } from './material-analysis.js';
import { normaliseTerm, normaliseMeaning } from './vocabulary-identity.js';

// Re-read on opening a draft: another material may have been approved after AI finished.
export async function annotateDraft(ownerId: string, draft: Draft): Promise<Draft> {
  const [words, topics] = await Promise.all([
    prisma.vocabItem.findMany({
      where: {
        ownerId,
        normalized: { in: draft.vocabulary.map((item) => normaliseTerm(item.term)) },
      },
      select: { normalized: true, normalizedMeaning: true, translation: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.grammarTopic.findMany({
      where: {
        ownerId,
        normalized: { in: draft.grammar.map((item) => normaliseTerm(item.title)) },
      },
      select: { normalized: true },
    }),
  ]);
  return {
    vocabulary: draft.vocabulary.map((item) => {
      const sameTerm = words.filter((word) => word.normalized === normaliseTerm(item.term));
      const exact = sameTerm.find(
        (word) => word.normalizedMeaning === normaliseMeaning(item.translation),
      );
      return {
        ...item,
        alreadyInVocabulary: Boolean(exact),
        otherMeaningInVocabulary: !exact && sameTerm.length > 0,
        existingTranslation: (exact ?? sameTerm[0])?.translation,
      };
    }),
    grammar: draft.grammar.map((item) => ({
      ...item,
      alreadyInGrammar: topics.some((topic) => topic.normalized === normaliseTerm(item.title)),
    })),
  };
}
