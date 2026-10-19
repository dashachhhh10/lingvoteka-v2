import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { prisma } from '../src/database.js';
import { removeFile } from '../src/file-storage.js';

const email = `image-flow-${randomUUID()}@example.invalid`;
const password = `Smoke-${randomUUID()}-9`;
const apiBase = process.env.BETTER_AUTH_URL ?? 'http://localhost:3001';
let cookie = '';

async function request<T>(label: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      Origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
      ...(cookie ? { Cookie: cookie } : {}),
      ...init.headers,
    },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${label}: HTTP ${response.status} ${JSON.stringify(payload).slice(0, 300)}`);
  }
  if (label === 'register') {
    cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    if (!cookie) throw new Error('register: session cookie missing');
  }
  return payload as T;
}

try {
  await request('register', '/api/auth/sign-up/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.REGISTRATION_INVITE_CODE
        ? { 'X-Registration-Code': process.env.REGISTRATION_INVITE_CODE }
        : {}),
    },
    body: JSON.stringify({ name: 'Image flow test', email, password }),
  });

  const bytes = await readFile(new URL('./fixtures/synthetic-lesson.jpg', import.meta.url));
  const form = new FormData();
  form.set('files', new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }), 'lesson-image.jpg');
  const material = await request<{ id: string; title: string }>('image upload', '/api/materials', {
    method: 'POST',
    body: form,
  });
  if (material.title !== 'lesson-image') {
    throw new Error(`Image upload did not derive the title from the filename: ${material.title}`);
  }
  await request('analysis enqueue', `/api/materials/${material.id}/analyze`, { method: 'POST' });

  const deadline = Date.now() + 180_000;
  let draft: {
    vocabulary: { term: string; sourceExcerpt: string }[];
    grammar: { title: string; sourceExcerpt: string }[];
  } | null = null;
  while (Date.now() < deadline) {
    const result = await request<{
      status: string;
      analysisError: string | null;
      analysisDraft: typeof draft;
    }>('analysis result', `/api/materials/${material.id}`);
    if (result.status === 'REVIEW') {
      draft = result.analysisDraft;
      break;
    }
    if (result.status === 'ERROR') {
      throw new Error(`Image analysis failed: ${result.analysisError ?? 'unknown error'}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  if (!draft) throw new Error('Image analysis timed out or returned no draft');

  const words = draft.vocabulary.map((item) => item.term.toLocaleLowerCase('it'));
  const recognizedWord = words.some((word) =>
    ['parlare', 'libro', 'amico'].some((expected) => word.includes(expected)),
  );
  const recognizedGrammar = draft.grammar.some((item) => /presente|indicativo/i.test(item.title));
  const sourceExcerpts =
    draft.vocabulary.filter((item) => item.sourceExcerpt).length +
    draft.grammar.filter((item) => item.sourceExcerpt).length;
  if (!recognizedWord || !recognizedGrammar || !sourceExcerpts) {
    throw new Error('AI did not recognize the words, grammar, and source excerpts in the image');
  }
  console.log(
    `image_flow=PASS words=${draft.vocabulary.length} grammar=${draft.grammar.length} source_excerpts=${sourceExcerpts}`,
  );
} finally {
  const files = await prisma.materialFile.findMany({
    where: { material: { owner: { email } } },
    select: { storageKey: true },
  });
  await prisma.user.deleteMany({ where: { email } });
  await Promise.all(files.map((file) => removeFile(file.storageKey)));
  await prisma.$disconnect();
}
