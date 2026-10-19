import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import JSZip from 'jszip';
import { analyzeMaterial } from '../src/material-analysis.js';

function samplePdf() {
  const stream = 'BT /F1 18 Tf 72 720 Td (Buongiorno) Tj ET\n';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, body] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

async function sampleDocx(image: Buffer) {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    'word/document.xml',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Il gatto mangia.</w:t></w:r></w:p></w:body></w:document>',
  );
  zip.file('word/media/image1.jpg', image);
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function samplePptx(image: Buffer) {
  const zip = new JSZip();
  const slide = (text: string) =>
    `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t xml:space="preserve">${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
  zip.file('ppt/slides/slide10.xml', slide('secondo esempio'));
  zip.file('ppt/slides/slide2.xml', slide('gioco a calcio'));
  zip.file('ppt/media/image1.jpg', image);
  return zip.generateAsync({ type: 'nodebuffer' });
}

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
