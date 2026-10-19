import { readFile, stat } from 'node:fs/promises';
import { prisma } from '../src/database.js';
import { removeFile, storeFile, validateFileStorage } from '../src/file-storage.js';

async function main(): Promise<void> {
  if (process.env.FILE_STORAGE !== 's3') throw new Error('FILE_STORAGE=s3 is required');
  validateFileStorage();

  const files = await prisma.materialFile.findMany({
    where: { NOT: { storageKey: { startsWith: 's3:' } } },
    include: { material: { select: { ownerId: true } } },
  });

  // Check every source before changing the database or uploading anything.
  for (const file of files) {
    const source = await stat(file.storageKey);
    if (!source.isFile() || source.size !== file.byteSize) {
      throw new Error(`Local source for material file ${file.id} is missing or has changed`);
    }
  }

  if (!process.argv.includes('--apply')) {
    console.info(
      `${files.length} local material file(s) ready for S3 migration; pass --apply to upload`,
    );
    return;
  }

  let migrated = 0;
  for (const file of files) {
    const bytes = await readFile(file.storageKey);
    const key = await storeFile(file.material.ownerId, bytes, file.mimeType);
    const updated = await prisma.materialFile.updateMany({
      where: { id: file.id, storageKey: file.storageKey },
      data: { storageKey: key },
    });
    if (updated.count !== 1) {
      await removeFile(key);
      throw new Error(`Material file ${file.id} changed during migration`);
    }
    migrated += 1;
  }
  console.info(`Migrated ${migrated} material file(s) to S3`);
}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
