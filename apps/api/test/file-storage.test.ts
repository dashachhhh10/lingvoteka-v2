import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { loadFile, removeFile, storeFile } from '../src/file-storage.js';

test('S3 files round-trip across the storage boundary; legacy local files remain readable', async () => {
  const objects = new Map<string, Buffer>();
  const calls: { method: string; path: string; acl?: string }[] = [];
  const server = createServer(async (request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    calls.push({ method: request.method ?? '', path, acl: request.headers['x-amz-acl'] as string });
    if (request.method === 'PUT') {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      objects.set(path, Buffer.concat(chunks));
      response.setHeader('ETag', '"test"');
      response.end();
      return;
    }
    if (request.method === 'GET') {
      const bytes = objects.get(path);
      if (!bytes) {
        response.statusCode = 404;
        response.end();
        return;
      }
      response.setHeader('Content-Length', bytes.length);
      response.end(bytes);
      return;
    }
    if (request.method === 'DELETE') {
      objects.delete(path);
      response.statusCode = 204;
      response.end();
      return;
    }
    response.statusCode = 405;
    response.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const prior = Object.fromEntries(
    [
      'FILE_STORAGE',
      'S3_BUCKET',
      'S3_REGION',
      'S3_ENDPOINT',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
    ].map((name) => [name, process.env[name]]),
  );
  const localPath = join(tmpdir(), `lingvoteka-legacy-${randomUUID()}`);
  try {
    process.env.FILE_STORAGE = 's3';
    process.env.S3_BUCKET = 'private-materials';
    process.env.S3_REGION = 'us-east-1';
    process.env.S3_ENDPOINT = `http://127.0.0.1:${address.port}`;
    process.env.S3_ACCESS_KEY_ID = 'test-access';
    process.env.S3_SECRET_ACCESS_KEY = 'test-secret';

    const original = Buffer.from('Ciao, come stai?');
    const key = await storeFile('owner_123', original, 'text/plain');
    assert.match(key, /^s3:materials\/[0-9a-f]{32}\//);
    assert.deepEqual(await loadFile(key), original);
    assert.equal(objects.size, 1);
    assert(calls.every((call) => call.path.startsWith('/private-materials/materials/')));
    assert(calls.every((call) => !call.acl));

    await writeFile(localPath, original);
    assert.deepEqual(await loadFile(localPath), original);

    await removeFile(key);
    assert.equal(objects.size, 0);
    assert.deepEqual(
      calls.map((call) => call.method),
      ['PUT', 'GET', 'DELETE'],
    );
  } finally {
    await rm(localPath, { force: true });
    server.close();
    await once(server, 'close');
    for (const [name, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
