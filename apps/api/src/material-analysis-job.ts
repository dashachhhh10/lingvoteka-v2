import { prisma } from './database.js';
import { analyzeMaterial } from './material-analysis.js';
import { annotateDraft } from './draft-matches.js';

export async function processMaterialAnalysis(materialId: string): Promise<void> {
  const material = await prisma.material.findUnique({
    where: { id: materialId },
    include: { files: true },
  });
  if (!material || material.status !== 'PROCESSING') return;

  const knownTopics = await prisma.grammarTopic.findMany({
    where: { ownerId: material.ownerId },
    select: { title: true },
    orderBy: { title: 'asc' },
    take: 300,
  });
  const extracted = await analyzeMaterial(
    material.noteText,
    material.files,
    knownTopics.map((topic) => topic.title),
  );
  const draft = await annotateDraft(material.ownerId, extracted);
  await prisma.material.updateMany({
    where: { id: materialId, status: 'PROCESSING' },
    data: { status: 'REVIEW', analysisDraft: draft, analysisError: null },
  });
}
