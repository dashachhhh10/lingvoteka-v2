import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyVocabulary } from '../src/vocabulary-classification.js';

const words = [
  {
    id: 'calcio',
    term: 'il calcio',
    translation: 'футбол',
    example: null,
    partOfSpeech: null,
    semanticTopic: null,
  },
  {
    id: 'correre',
    term: 'correre',
    translation: 'бежать',
    example: null,
    partOfSpeech: null,
    semanticTopic: null,
  },
];

test('classifies each word into a part of speech and semantic topic', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-key';
  globalThis.fetch = async () =>
    Response.json({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  items: [
                    { id: 'calcio', partOfSpeech: 'Существительное', semanticTopic: 'Спорт' },
                    { id: 'correre', partOfSpeech: 'Глагол', semanticTopic: 'Спорт' },
                  ],
                }),
              },
            ],
          },
        },
      ],
    });
  try {
    assert.deepEqual(await classifyVocabulary(words), [
      { id: 'calcio', partOfSpeech: 'Существительное', semanticTopic: 'Спорт' },
      { id: 'correre', partOfSpeech: 'Глагол', semanticTopic: 'Спорт' },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  }
});

test('rejects a partial or invented classification', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-key';
  globalThis.fetch = async () =>
    Response.json({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  items: [
                    { id: 'calcio', partOfSpeech: 'Магическое слово', semanticTopic: 'Спорт' },
                    { id: 'correre', partOfSpeech: 'Глагол', semanticTopic: 'Спорт' },
                  ],
                }),
              },
            ],
          },
        },
      ],
    });
  try {
    await assert.rejects(classifyVocabulary(words), /неизвестную категорию/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  }
});
