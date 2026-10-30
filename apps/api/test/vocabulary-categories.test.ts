import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { CATEGORY_GUIDANCE, SEMANTIC_TOPICS } from '../src/vocabulary-categories.js';
import { classifyVocabulary } from '../src/vocabulary-classification.js';
import { analyzeMaterial } from '../src/material-analysis.js';

const words = [
  {
    id: 'face',
    term: 'la faccia / le facce',
    translation: 'лицо / лица',
    example: 'La faccia fa le facce al plurale.',
    partOfSpeech: null,
    semanticTopic: null,
  },
];

async function withReply(
  items: unknown[],
  run: (requests: Record<string, any>[]) => Promise<void>,
) {
  const fetch = globalThis.fetch;
  const env = { ...process.env };
  const requests: Record<string, any>[] = [];
  process.env.GEMINI_API_KEY = 'synthetic-test-key';
  process.env.GEMINI_API_BASE_URL = 'https://gemini.invalid';
  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: { parts: [{ text: JSON.stringify({ items, vocabulary: [], grammar: [] }) }] },
          },
        ],
      }),
    );
  };
  try {
    await run(requests);
  } finally {
    globalThis.fetch = fetch;
    for (const key of ['GEMINI_API_KEY', 'GEMINI_API_BASE_URL']) {
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    }
  }
}

test('extraction and classification use the same bounded taxonomy and independent speech categories', async () => {
  const frontend = await readFile(
    new URL('../../web/src/vocabulary-categories.ts', import.meta.url),
    'utf8',
  );
  const topics = frontend.split('export const semanticTopics = [')[1].split('];')[0];
  assert.deepEqual(
    [...topics.matchAll(/'([^']+)'/g)].map((match) => match[1]),
    [...SEMANTIC_TOPICS],
  );
  assert.equal(SEMANTIC_TOPICS.length, 15);
  await withReply(
    [{ id: 'face', partOfSpeech: 'Существительное', semanticTopic: 'Тело и здоровье' }],
    async (requests) => {
      const result = await classifyVocabulary(words);
      assert.equal(result[0].semanticTopic, 'Тело и здоровье');
      await analyzeMaterial('La faccia fa le facce al plurale.', []);
      for (const request of requests) {
        assert(request.contents[0].parts[0].text.includes(CATEGORY_GUIDANCE));
        const properties = request.generationConfig.responseSchema.properties;
        const topic = (properties.items ?? properties.vocabulary).items.properties.semanticTopic;
        assert.deepEqual(topic.enum, [...SEMANTIC_TOPICS]);
      }
    },
  );
});

test('rejects unknown, duplicate, missing or invented classifications instead of applying partial groups', async () => {
  for (const items of [
    [],
    [{ id: 'foreign', partOfSpeech: 'Существительное', semanticTopic: 'Семья и люди' }],
    [{ id: 'face', partOfSpeech: 'Существительное', semanticTopic: 'Нос и уши' }],
    [{ id: 'face', partOfSpeech: 'unknown', semanticTopic: 'Тело и здоровье' }],
    [
      { id: 'face', partOfSpeech: 'Существительное', semanticTopic: 'Тело и здоровье' },
      { id: 'face', partOfSpeech: 'Существительное', semanticTopic: 'Тело и здоровье' },
    ],
  ])
    await withReply(items, async () => {
      await assert.rejects(classifyVocabulary(words));
    });
  await withReply(
    [
      { id: 'face', partOfSpeech: 'Существительное', semanticTopic: 'Тело и здоровье' },
      { id: 'face', partOfSpeech: 'Существительное', semanticTopic: 'Тело и здоровье' },
    ],
    async () => {
      await assert.rejects(
        classifyVocabulary([...words, { ...words[0], id: 'second' }]),
        /повторное слово/,
      );
    },
  );
});
