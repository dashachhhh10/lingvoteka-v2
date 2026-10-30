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
  run: (
    requests: Array<{
      prompt: string;
      schema: { required: string[]; properties: Record<string, unknown> };
    }>,
  ) => Promise<void>,
) {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  const originalBaseUrl = process.env.GEMINI_API_BASE_URL;
  const requests: Array<{
    prompt: string;
    schema: { required: string[]; properties: Record<string, unknown> };
  }> = [];
  process.env.GEMINI_API_KEY = 'synthetic-test-key';
  process.env.GEMINI_API_BASE_URL = 'https://gemini.invalid';
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      contents: { parts: { text: string }[] }[];
      generationConfig: {
        responseSchema: { required: string[]; properties: Record<string, unknown> };
      };
    };
    requests.push({
      prompt: body.contents[0].parts[0].text,
      schema: body.generationConfig.responseSchema,
    });
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

const areTopic = {
  title: 'Presente indicativo dei verbi in -are',
  summary: 'Глаголы первого спряжения в настоящем времени.',
  excerpts: [],
};

function areAnswer() {
  return {
    theory: {
      when: 'Для регулярных действий в настоящем.',
      formation: 'Убери -are и добавь личное окончание.',
      examples: [{ italian: 'Io parlo.', russian: 'Я говорю.' }],
      mistakes: [] as string[],
    },
    exercises: [
      {
        prompt: 'Io ___ italiano. (parlare)',
        options: ['parlo', 'parli', 'parla', 'parliamo'],
        answerIndex: 0,
        explanation: 'Для io у parlare форма parlo.',
      },
      {
        prompt: 'Tu ___ ogni giorno. (studiare)',
        options: ['studio', 'studi', 'studia', 'studiamo'],
        answerIndex: 1,
        explanation: 'Для tu у studiare форма studi.',
      },
      {
        prompt: 'Noi ___ in ufficio. (lavorare)',
        options: ['lavoro', 'lavori', 'lavoriamo', 'lavorano'],
        answerIndex: 2,
        explanation: 'Для noi у lavorare форма lavoriamo.',
      },
      {
        prompt: 'Voi ___ a casa. (abitare)',
        options: ['abito', 'abiti', 'abitiamo', 'abitate'],
        answerIndex: 3,
        explanation: 'Для voi у abitare форма abitate.',
      },
    ],
  };
}

test('retries an -are exercise that uses bere and accepts a corrected set', async () => {
  const offTopic = areAnswer();
  offTopic.exercises[0] = {
    prompt: 'Io ___ un caffè ogni mattina. (bere)',
    options: ['bevi', 'bevo', 'beviamo', 'bevonno'],
    answerIndex: 1,
    explanation: 'Для io с глаголом первой группы окончание -o.',
  };
  await withGeminiReplies([offTopic, areAnswer()], async (requests) => {
    const result = await generateGrammarContent(areTopic);
    assert.equal(result.exercises.length, 4);
    assert.equal(result.exercises[0].options[result.exercises[0].answerIndex], 'parlo');
    assert.equal(requests.length, 2);
    assert.match(requests[1].prompt, /не используй глаголы на -ere/i);
  });
});

test('rejects a repeated off-topic -are exercise', async () => {
  const offTopic = areAnswer();
  offTopic.exercises[0].prompt = 'Io ___ un caffè. (bere)';
  offTopic.exercises[0].options[0] = 'bevo';
  await withGeminiReplies([offTopic, offTopic], async () => {
    await assert.rejects(generateGrammarContent(areTopic), /задание вне темы глаголов на -are/);
  });
});

test('checks the selected -are form against the person and infinitive', async () => {
  const wrongForm = areAnswer();
  wrongForm.exercises[1].answerIndex = 0;
  await withGeminiReplies([wrongForm, areAnswer()], async (requests) => {
    const result = await generateGrammarContent(areTopic);
    assert.equal(result.exercises[1].options[result.exercises[1].answerIndex], 'studi');
    assert.equal(requests.length, 2);
  });
});

test('drops a mistake that calls the same written form correct and incorrect', async () => {
  const reply = areAnswer();
  reply.theory.mistakes = [
    'Ошибка: *studiamo* вместо неверного *studiamo* с лишними буквами.',
    'Для io у parlare нужно parlo, а не parli.',
  ];
  await withGeminiReplies([reply], async () => {
    const result = await generateGrammarContent(areTopic);
    assert.deepEqual(result.theory.mistakes, ['Для io у parlare нужно parlo, а не parli.']);
  });
});

test('practice generates only exercises and does not require a theory payload', async () => {
  await withGeminiReplies([{ exercises: areAnswer().exercises }], async (requests) => {
    const result = await generateGrammarContent(areTopic, 'practice');
    assert.equal(result.exercises.length, 4);
    assert.equal(result.theory.when, '');
    assert.deepEqual(requests[0].schema.required, ['exercises']);
    assert.equal(requests[0].schema.properties.theory, undefined);
  });
});

test('theory generation does not require or accept exercise output', async () => {
  await withGeminiReplies(
    [{ theory: areAnswer().theory, exercises: areAnswer().exercises }],
    async (requests) => {
      const result = await generateGrammarContent(areTopic, 'theory');
      assert.equal(result.exercises.length, 0);
      assert.equal(result.theory.when, areAnswer().theory.when);
      assert.deepEqual(requests[0].schema.required, ['theory']);
    },
  );
});

test('practice rejects a partial or repeated exercise set', async () => {
  await withGeminiReplies([{ exercises: [areAnswer().exercises[0]] }], async () => {
    await assert.rejects(generateGrammarContent(areTopic, 'practice'), /неполный учебный материал/);
  });
});
