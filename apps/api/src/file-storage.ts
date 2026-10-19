import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const uploadRoot = resolve(process.env.UPLOAD_DIR ?? './data/uploads');
const maxStoredFileBytes = 20 * 1024 * 1024;
let client: S3Client | undefined;

function provider(): 'local' | 's3' {
  const value = process.env.FILE_STORAGE ?? 'local';
  if (value !== 'local' && value !== 's3') throw new Error('FILE_STORAGE must be local or s3');
  return value;
}

export function validateFileStorage(): void {
  const selected = provider();
  if (process.env.NODE_ENV === 'production' && selected !== 's3') {
    throw new Error('FILE_STORAGE=s3 is required in production');
  }
  if (selected !== 's3') return;
  if (!process.env.S3_BUCKET || !process.env.S3_REGION) {
    throw new Error('S3_BUCKET and S3_REGION are required when FILE_STORAGE=s3');
  }
  if (Boolean(process.env.S3_ACCESS_KEY_ID) !== Boolean(process.env.S3_SECRET_ACCESS_KEY)) {
    throw new Error('Set both S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, or neither');
  }
  if (process.env.S3_ENDPOINT) {
    const endpoint = new URL(process.env.S3_ENDPOINT);
    if (!['http:', 'https:'].includes(endpoint.protocol)) {
      throw new Error('S3_ENDPOINT must be an HTTP(S) URL');
    }
    if (process.env.NODE_ENV === 'production' && endpoint.protocol !== 'https:') {
      throw new Error('S3_ENDPOINT must use HTTPS in production');
    }
  }
  if (
    process.env.S3_FORCE_PATH_STYLE &&
    !['true', 'false'].includes(process.env.S3_FORCE_PATH_STYLE)
  ) {
    throw new Error('S3_FORCE_PATH_STYLE must be true or false');
  }
}

function s3(): S3Client {
  validateFileStorage();
  if (provider() !== 's3') throw new Error('S3 storage is not configured');
  client ??= new S3Client({
    region: process.env.S3_REGION!,
    endpoint: process.env.S3_ENDPOINT || undefined,
    // Older S3-compatible endpoints often use path-style URLs. Railway Buckets
    // use virtual-hosted URLs, so production can explicitly opt out.
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE
      ? process.env.S3_FORCE_PATH_STYLE === 'true'
      : Boolean(process.env.S3_ENDPOINT),
    credentials: process.env.S3_ACCESS_KEY_ID
      ? {
          accessKeyId: process.env.S3_ACCESS_KEY_ID,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
        }
      : undefined,
  });
  return client;
}

function objectKey(storageKey: string): string {
  const key = storageKey.slice(3);
  if (!/^materials\/[0-9a-f]{32}\/[0-9a-f-]{36}$/.test(key)) {
    throw new Error('Invalid stored file key');
  }
  return key;
}

export async function storeFile(ownerId: string, bytes: Buffer, mimeType: string): Promise<string> {
  if (provider() === 's3') {
    const ownerSegment = createHash('sha256').update(ownerId).digest('hex').slice(0, 32);
    const key = `materials/${ownerSegment}/${randomUUID()}`;
    await s3().send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: key,
        Body: bytes,
        ContentType: mimeType,
      }),
    );
    return `s3:${key}`;
  }
  await mkdir(uploadRoot, { recursive: true });
  const path = resolve(uploadRoot, randomUUID());
  await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
  return path;
}

export async function loadFile(storageKey: string): Promise<Buffer> {
  if (!storageKey.startsWith('s3:')) return readFile(storageKey);
  const result = await s3().send(
    new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: objectKey(storageKey) }),
  );
  if (!result.Body) throw new Error('Stored file has no content');
  if (result.ContentLength && result.ContentLength > maxStoredFileBytes) {
    throw new Error('Stored file exceeds the maximum allowed size');
  }
  const bytes = Buffer.from(await result.Body.transformToByteArray());
  if (bytes.byteLength > maxStoredFileBytes) {
    throw new Error('Stored file exceeds the maximum allowed size');
  }
  return bytes;
}

export async function removeFile(storageKey: string): Promise<void> {
  if (!storageKey.startsWith('s3:')) {
    await rm(storageKey, { force: true });
    return;
  }
  await s3().send(
    new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: objectKey(storageKey) }),
  );
}
