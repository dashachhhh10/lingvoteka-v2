import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { prisma } from '../src/database.js';
import { removeFile } from '../src/file-storage.js';
import { sampleDocx, samplePptx } from './fixtures/sample-office.js';

const email = `office-flow-${randomUUID()}@example.invalid`;
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
  const payload = (await response.json().catch(() => null)) as T;
  if (!response.ok) {
    throw new Error(`${label}: HTTP ${response.status} ${JSON.stringify(payload).slice(0, 300)}`);
  }
  if (label === 'register') {
    cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    assert.ok(cookie, 'registration must create a session without email confirmation');
  }
  return payload;
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
    body: JSON.stringify({ name: 'Office flow test', email, password }),
  });

  const image = await readFile(new URL('./fixtures/synthetic-lesson.jpg', import.meta.url));
  const docx = await sampleDocx(image);
  const pptx = await samplePptx(image);
  const form = new FormData();
  form.append(
    'files',
    new Blob([new Uint8Array(docx)], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }),
    'lesson-document.docx',
  );
  form.append(
    'files',
    new Blob([new Uint8Array(pptx)], {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    }),
    'lesson-slides.pptx',
  );
  const created = await request<{ id: string; title: string }>('office upload', '/api/materials', {
    method: 'POST',
    body: form,
  });
  assert.equal(created.title, 'lesson-document');
  await request('analysis enqueue', `/api/materials/${created.id}/analyze`, { method: 'POST' });

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
      files: { id: string }[];
    }>('office analysis', `/api/materials/${created.id}`);
    assert.equal(result.files.length, 2);
    if (result.status === 'REVIEW') {
      draft = result.analysisDraft;
      break;
    }
    if (result.status === 'ERROR')
      throw new Error(`Office analysis failed: ${result.analysisError}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  assert.ok(draft, 'office analysis must return an editable draft');
  const terms = draft.vocabulary.map((item) => item.term.toLocaleLowerCase('it'));
  assert.ok(terms.some((term) => /gatto|mangia|calcio|gioco/.test(term)));
  const excerpts =
    draft.vocabulary.filter((item) => item.sourceExcerpt).length +
    draft.grammar.filter((item) => item.sourceExcerpt).length;
  assert.ok(excerpts > 0, 'office analysis should retain source excerpts');
  console.log(
    `office_flow=PASS words=${draft.vocabulary.length} grammar=${draft.grammar.length} source_excerpts=${excerpts}`,
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
