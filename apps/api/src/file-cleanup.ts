import { prisma } from './database.js';
import { removeFile } from './file-storage.js';

let running = false;

export async function processFileDeletions(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const pending = await prisma.fileDeletion.findMany({
      where: { retryAt: { lte: new Date() } },
      orderBy: { retryAt: 'asc' },
      take: 10,
    });
    await Promise.all(
      pending.map(async (item) => {
        try {
          await removeFile(item.storageKey);
          await prisma.fileDeletion.deleteMany({ where: { id: item.id } });
        } catch {
          await prisma.fileDeletion.updateMany({
            where: { id: item.id },
            data: {
              attempts: { increment: 1 },
              retryAt: new Date(
                Date.now() + Math.min(3600, 10 * 2 ** Math.min(item.attempts, 9)) * 1000,
              ),
            },
          });
          console.warn('Stored file cleanup delayed', { deletionId: item.id });
        }
      }),
    );
  } finally {
    running = false;
  }
}
