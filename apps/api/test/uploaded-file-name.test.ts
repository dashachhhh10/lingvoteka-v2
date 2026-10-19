import assert from 'node:assert/strict';
import { test } from 'node:test';
import { titleFromFileName, uploadedFileName } from '../src/uploaded-file-name.js';

test('recovers UTF-8 names that Multer presents as Latin-1', () => {
  const originalName = Buffer.from('род ч2.jpg', 'utf8').toString('latin1');
  assert.equal(uploadedFileName(originalName), 'род ч2.jpg');
  assert.equal(titleFromFileName(uploadedFileName(originalName)), 'род ч2');
});

test('preserves already-decoded names and removes paths and control characters', () => {
  assert.equal(uploadedFileName('Café.jpg'), 'Café.jpg');
  assert.equal(uploadedFileName('folder\\unit\n.jpg'), 'unit.jpg');
  assert.equal(titleFromFileName('lesson.pdf'), 'lesson');
});
