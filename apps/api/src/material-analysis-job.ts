import { prisma } from './database.js';
import { analyzeMaterial } from './material-analysis.js';
import { normaliseTerm, vocabularyIdentity } from './vocabulary-identity.js';

export async function processMaterialAnalysis(materialId: string): Promise<void> {
  const material = await prisma.material.findUnique({
    where: { id: materialId },
    include: { files: true },
  });
  if (!material || material.status !== 'PROCESSING') return;

  const draft = await analyzeMaterial(material.noteText, material.files);
  const known = await prisma.vocabItem.findMany({
    where: {
      ownerId: material.ownerId,
      normalized: { in: draft.vocabulary.map((item) => normaliseTerm(item.term)) },
    },
    select: { normalized: true, normalizedMeaning: true },
  });
  const knownTerms = new Set(known.map((item) => item.normalized));
  const knownIdentities = new Set(
    known.map((item) => `${item.normalized}\u0000${item.normalizedMeaning}`),
  );
  draft.vocabulary = draft.vocabulary.map((item) => {
    const alreadyInVocabulary = knownIdentities.has(
      vocabularyIdentity(item.term, item.translation),
    );
    return {
      ...item,
      alreadyInVocabulary,
      otherMeaningInVocabulary: !alreadyInVocabulary && knownTerms.has(normaliseTerm(item.term)),
    };
  });
  await prisma.material.updateMany({
    where: { id: materialId, status: 'PROCESSING' },
    data: { status: 'REVIEW', analysisDraft: draft, analysisError: null },
  });
}
