import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { analyzeMaterial } from '../src/material-analysis.js';
import { sampleDocx, samplePptx } from './fixtures/sample-office.js';
import { samplePdf } from './fixtures/sample-pdf.js';

test('PDF, DOCX and PPTX reach AI with extracted text and embedded images', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lingvoteka-formats-'));
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.GEMINI_API_KEY;
  const previousBase = process.env.GEMINI_API_BASE_URL;
  const image = await readFile(new URL('./fixtures/synthetic-lesson.jpg', import.meta.url));
  const pdf = samplePdf();
  const docx = await sampleDocx(image);
  const pptx = await samplePptx(image);
  const sources = [
    {
      storageKey: join(directory, 'lesson.pdf'),
      name: 'lesson.pdf',
      mimeType: 'application/pdf',
      bytes: pdf,
    },
    {
      storageKey: join(directory, 'lesson.docx'),
      name: 'lesson.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      bytes: docx,
    },
    {
      storageKey: join(directory, 'lesson.pptx'),
      name: 'lesson.pptx',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      bytes: pptx,
    },
  ];
  let requestBody: {
    contents: {
      parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[];
    }[];
  } | null = null;
  try {
    await Promise.all(sources.map((source) => writeFile(source.storageKey, source.bytes)));
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.GEMINI_API_BASE_URL = 'https://example.invalid';
    globalThis.fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"vocabulary":[],"grammar":[]}' }] } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const result = await analyzeMaterial(
      null,
      sources.map(({ storageKey, name, mimeType }) => ({ storageKey, name, mimeType })),
    );
    assert.deepEqual(result, { vocabulary: [], grammar: [] });
    assert(requestBody);
    const parts = requestBody.contents[0].parts;
    const prompt = parts.find((part): part is { text: string } => 'text' in part)?.text ?? '';
    assert.match(prompt, /Il gatto mangia\./);
    assert.match(prompt, /Слайд 1: gioco a calcio/);
    assert.match(prompt, /Слайд 2: secondo esempio/);
    assert(prompt.indexOf('Слайд 1') < prompt.indexOf('Слайд 2'));

    const attachments = parts.filter(
      (part): part is { inlineData: { mimeType: string; data: string } } => 'inlineData' in part,
    );
    assert.equal(attachments.length, 3);
    assert.deepEqual(attachments.map((part) => part.inlineData.mimeType).sort(), [
      'application/pdf',
      'image/jpeg',
      'image/jpeg',
    ]);
    const sentPdf = attachments.find((part) => part.inlineData.mimeType === 'application/pdf');
    assert(sentPdf);
    assert.deepEqual(Buffer.from(sentPdf.inlineData.data, 'base64'), pdf);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
    if (previousBase === undefined) delete process.env.GEMINI_API_BASE_URL;
    else process.env.GEMINI_API_BASE_URL = previousBase;
    await rm(directory, { recursive: true, force: true });
  }
});
