export type AiContentPart = { text: string } | { inlineData: { mimeType: string; data: string } };

export interface AiProvider {
  generateStructured(parts: AiContentPart[], schema: Record<string, unknown>): Promise<unknown>;
}

class GeminiProvider implements AiProvider {
  async generateStructured(
    parts: AiContentPart[],
    schema: Record<string, unknown>,
  ): Promise<unknown> {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('AI не настроен: добавь GEMINI_API_KEY на сервере');

    const baseUrl = (
      process.env.GEMINI_API_BASE_URL ?? 'https://generativelanguage.googleapis.com'
    ).replace(/\/+$/, '');
    const model = encodeURIComponent(process.env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite');
    const response = await fetch(`${baseUrl}/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema },
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`AI-сервис вернул ошибку ${response.status}`);
    const payload = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const raw = payload.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;
    if (!raw) throw new Error('AI-сервис не вернул результат');
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      throw new Error('Некорректный ответ AI-сервиса');
    }
  }
}

const gemini = new GeminiProvider();

export function aiProvider(): AiProvider {
  const selected = process.env.AI_PROVIDER ?? 'gemini';
  if (selected === 'gemini') return gemini;
  throw new Error(`Неизвестный AI-провайдер: ${selected}`);
}
