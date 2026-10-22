import assert from 'node:assert/strict';
import test from 'node:test';
import { generateGrammarContent } from '../src/grammar-generation.js';

const topic = { title: 'Passato prossimo', summary: null, excerpts: [] };

function answer(formation: string) {
  return {
    theory: {
      when: 'Для описания прошедших событий.',
      formation,
      examples: [{ italian: 'Ho camminato.', russian: 'Я гулял.' }],
      mistakes: [],
    },
    exercises: [
      {
        prompt: 'Ieri io ___ al parco.',
        options: ['ho camminato', 'sono camminato', 'cammino', 'camminavo'],
        answerIndex: 0,
        explanation: 'Для camminare используется avere.',
      },
    ],
  };
}

async function withGeminiReplies(
  replies: unknown[],
  run: (requests: Array<{ prompt: string }>) => Promise<void>,
) {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  const originalBaseUrl = process.env.GEMINI_API_BASE_URL;
  const requests: Array<{ prompt: string }> = [];
  process.env.GEMINI_API_KEY = 'synthetic-test-key';
  process.env.GEMINI_API_BASE_URL = 'https://gemini.invalid';
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { contents: { parts: { text: string }[] }[] };
    requests.push({ prompt: body.contents[0].parts[0].text });
    const reply = replies[requests.length - 1];
    if (!reply) throw new Error('Unexpected extra AI request');
    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] }),
      { status: 200 },
    );
  };
  try {
    await run(requests);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
    if (originalBaseUrl === undefined) delete process.env.GEMINI_API_BASE_URL;
    else process.env.GEMINI_API_BASE_URL = originalBaseUrl;
  }
}

test('retries a categorical essere claim and returns the corrected theory', async () => {
  await withGeminiReplies(
    [
      answer('Большинство глаголов используют avere, но глаголы движения используют essere.'),
      answer('Andare употребляется с essere, а camminare — с avere.'),
    ],
    async (requests) => {
      const result = await generateGrammarContent(topic);
      assert.match(result.theory.formation, /camminare — с avere/);
      assert.equal(requests.length, 2);
      assert.match(requests[1].prompt, /camminare и viaggiare — с avere/);
    },
  );
});

test('replaces a repeated categorical theory claim with a checked rule', async () => {
  await withGeminiReplies(
    [
      answer('Essere используется с глаголами движения и состояния.'),
      answer('Все глаголы движения требуют essere.'),
    ],
    async (requests) => {
      const result = await generateGrammarContent(topic);
      assert.match(result.theory.formation, /Не все глаголы движения используют essere/);
      assert.doesNotMatch(result.theory.formation, /Все глаголы движения требуют essere/);
      assert.equal(requests.length, 2);
    },
  );
});

test('rejects a repeated categorical claim inside exercise feedback', async () => {
  const badExercise = answer('Andare — с essere, camminare — с avere.');
  badExercise.exercises[0].explanation = 'Все глаголы движения требуют essere.';
  await withGeminiReplies([badExercise, badExercise], async (requests) => {
    await assert.rejects(generateGrammarContent(topic), /неточное правило в задании/);
    assert.equal(requests.length, 2);
  });
});

test('does not insert passato prossimo fallback into an unrelated topic', async () => {
  const unrelated = { ...topic, title: 'Pronomi diretti' };
  await withGeminiReplies(
    [
      answer('Все глаголы движения требуют essere.'),
      answer('Все глаголы движения требуют essere.'),
    ],
    async () => {
      await assert.rejects(generateGrammarContent(unrelated), /неточное правило/);
    },
  );
});

test('accepts a qualified rule without a second AI request', async () => {
  await withGeminiReplies(
    [answer('Не все глаголы движения требуют essere: camminare и viaggiare — с avere.')],
    async (requests) => {
      const result = await generateGrammarContent(topic);
      assert.match(result.theory.formation, /Не все/);
      assert.equal(requests.length, 1);
    },
  );
});
