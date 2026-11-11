import { APICallError } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readConfig } from '../config.js';
import { countModelTokens, TokenizerError } from '../modules/ai/tokenizer.js';
import { countModelTokens as controlledCount } from './mock-tokenizer.js';
vi.mock('../modules/ai/tokenizer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../modules/ai/tokenizer.js')>();
  const { countModelTokens } = await import('./mock-tokenizer.js');
  return { ...actual, countModelTokens: vi.fn(countModelTokens) };
});
import {
  assistantDocument,
  documentSchema,
  paragraph,
  plainText,
} from '../modules/ai/content.js';
import {
  generateAnswer,
  GenerationError,
  type ModelRunner,
} from '../modules/ai/provider.js';

const config = readConfig({
  DATABASE_URL: 'postgresql://test:unused@localhost/test',
  BETTER_AUTH_SECRET: 'test-only-secret-must-be-at-least-32-characters',
  AI_FIRST_TOKEN_TIMEOUT_MS: '100',
});
const upstream = (statusCode: number) =>
  new APICallError({
    message: 'Private upstream detail',
    url: 'https://provider.invalid',
    requestBodyValues: {},
    statusCode,
  });
const input = (
  run: ModelRunner,
  onText = vi.fn(),
  signal = new AbortController().signal,
) => ({
  config,
  run,
  onText,
  signal,
  messages: [{ role: 'user' as const, content: 'A test question' }],
});
afterEach(() => {
  vi.useRealTimers();
  vi.mocked(countModelTokens).mockReset().mockImplementation(controlledCount);
});

describe('model fallback boundaries', () => {
  it('recounts the original history with each fallback tokenizer', async () => {
    const messages = [
      { role: 'user' as const, content: 'Earlier question' },
      { role: 'assistant' as const, content: 'Earlier answer' },
      { role: 'user' as const, content: 'Current question' },
    ];
    vi.mocked(countModelTokens).mockImplementation(async ({ modelId, messages: history }) =>
      modelId === config.OPENROUTER_MODEL_1 && history.length === 3 ? 2000 : 500,
    );
    const run = vi.fn<ModelRunner>(async function* ({ modelId }) {
      if (modelId === config.OPENROUTER_MODEL_1) throw upstream(503);
      yield 'Fallback';
    });
    await generateAnswer({
      ...input(run), messages,
      config: { ...config, AI_MAX_CONTEXT_TOKENS: 2048, AI_CONTEXT_SAFETY_MARGIN_TOKENS: 128 },
    });
    expect(run.mock.calls[0]?.[0].messages).toEqual([messages[2]]);
    expect(run.mock.calls[1]?.[0].messages).toEqual(messages);
    expect(countModelTokens).toHaveBeenCalledTimes(3);
  });

  it.each(['too large', 'tokenizer unavailable'])(
    'skips a candidate before generation when its prompt is %s', async (reason) => {
      vi.mocked(countModelTokens).mockImplementation(async ({ modelId }) => {
        if (modelId === config.OPENROUTER_MODEL_1) {
          if (reason === 'tokenizer unavailable') throw new TokenizerError('Unavailable');
          return 100000;
        }
        return 100;
      });
      const run = vi.fn<ModelRunner>(async function* () { yield 'Answer'; });
      const answer = await generateAnswer(input(run));
      expect(answer.modelId).toBe(config.OPENROUTER_MODEL_2);
      expect(run).toHaveBeenCalledTimes(1);
    },
  );
  it('reserves output and safety space and sends the same trimmed turns to every fallback', async () => {
    const boundedConfig = {
      ...config,
      AI_MAX_CONTEXT_TOKENS: 2048,
      MAX_AI_OUTPUT_TOKENS: 512,
      AI_CONTEXT_SAFETY_MARGIN_TOKENS: 128,
    };
    const messages = [
      { role: 'user' as const, content: 'Q'.repeat(100) },
      { role: 'assistant' as const, content: 'A'.repeat(500) },
      { role: 'user' as const, content: 'Latest '.repeat(70) },
    ];
    const run = vi.fn<ModelRunner>(async function* ({ modelId }) {
      if (modelId !== config.OPENROUTER_MODEL_3) throw upstream(503);
      yield 'Answer';
    });

    await generateAnswer({ ...input(run), config: boundedConfig, messages });

    expect(run.mock.calls.map(([attempt]) => attempt.modelId)).toEqual([
      config.OPENROUTER_MODEL_1,
      config.OPENROUTER_MODEL_2,
      config.OPENROUTER_MODEL_3,
    ]);
    for (const [attempt] of run.mock.calls)
      expect(attempt.messages).toEqual([messages[2]]);
    expect(messages).toHaveLength(3);
  });

  it.each(['assistant', 'eli5', 'coach'] as const)(
    'includes the %s system prompt before rejecting input without calling any model',
    async (persona) => {
      // The user text alone fits the 896-token input allowance. The fixed
      // shared guidance plus each persona's instructions make it too large.
      const run = vi.fn<ModelRunner>(async function* () {
        yield 'Unexpected';
      });
      const onText = vi.fn();
      await expect(
        generateAnswer({
          ...input(run, onText),
          config: {
            ...config,
            AI_MAX_CONTEXT_TOKENS: 2048,
            AI_CONTEXT_SAFETY_MARGIN_TOKENS: 128,
          },
          messages: [{ role: 'user', content: 'Q'.repeat(800) }],
          persona,
        }),
      ).rejects.toMatchObject({ code: 'CONTEXT_LIMIT' });
      expect(run).not.toHaveBeenCalled();
      expect(onText).not.toHaveBeenCalled();
    },
  );

  it('streams progressively from the primary and records its model', async () => {
    const run = vi.fn<ModelRunner>(async function* () {
      yield 'Hello ';
      yield 'world';
    });
    const onText = vi.fn();
    expect(await generateAnswer(input(run, onText))).toEqual({
      text: 'Hello world',
      modelId: config.OPENROUTER_MODEL_1,
    });
    expect(onText.mock.calls.map((call) => call[0])).toEqual([
      'Hello ',
      'world',
    ]);
    expect(run).toHaveBeenCalledTimes(1);
  });
  it('tries each qualifying candidate once before content', async () => {
    const run = vi.fn<ModelRunner>(async function* ({ modelId }) {
      if (modelId === config.OPENROUTER_MODEL_1) throw upstream(503);
      if (modelId === config.OPENROUTER_MODEL_2) throw upstream(429);
      yield 'Fallback answer';
    });
    const result = await generateAnswer({ ...input(run), persona: 'coach' });
    expect(result.modelId).toBe(config.OPENROUTER_MODEL_3);
    expect(run.mock.calls.map((call) => call[0].modelId)).toEqual([
      config.OPENROUTER_MODEL_1,
      config.OPENROUTER_MODEL_2,
      config.OPENROUTER_MODEL_3,
    ]);
    expect(run.mock.calls.map((call) => call[0].persona)).toEqual([
      'coach',
      'coach',
      'coach',
    ]);
  });
  it('skips an unavailable configured model', async () => {
    const run = vi.fn<ModelRunner>(async function* ({ modelId }) {
      if (modelId === config.OPENROUTER_MODEL_1) throw upstream(404);
      yield 'Available';
    });
    expect((await generateAnswer(input(run))).modelId).toBe(
      config.OPENROUTER_MODEL_2,
    );
  });
  it.each([400, 401, 402, 403, 422])(
    'does not retry input, credentials or quota errors (%s)',
    async (status: number) => {
      const run = vi.fn<ModelRunner>(async function* () {
        throw upstream(status);
      });
      await expect(generateAnswer(input(run))).rejects.toBeInstanceOf(
        GenerationError,
      );
      expect(run).toHaveBeenCalledTimes(1);
    },
  );
  it('preserves partial output and never switches models mid-answer', async () => {
    const run = vi.fn<ModelRunner>(async function* () {
      yield 'Incomplete ';
      throw upstream(503);
    });
    const onText = vi.fn();
    await expect(generateAnswer(input(run, onText))).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
    expect(onText).toHaveBeenCalledWith(
      'Incomplete ',
      config.OPENROUTER_MODEL_1,
    );
    expect(run).toHaveBeenCalledTimes(1);
  });
  it('fails cleanly after all candidates return no content', async () => {
    const run = vi.fn<ModelRunner>(async function* () {});
    await expect(generateAnswer(input(run))).rejects.toMatchObject({
      code: 'EMPTY_RESPONSE',
    });
    expect(run).toHaveBeenCalledTimes(3);
  });
  it('bounds first-token waits and cancels timed-out candidates', async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const run = vi.fn<ModelRunner>(async function* ({ signal }) {
      signals.push(signal);
      await new Promise<void>((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        }),
      );
    });
    const assertion = expect(generateAnswer(input(run))).rejects.toMatchObject({
      code: 'FIRST_TOKEN_TIMEOUT',
    });
    await vi.advanceTimersByTimeAsync(301);
    await assertion;
    expect(signals).toHaveLength(3);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
  it('propagates cancellation without a fallback', async () => {
    const controller = new AbortController();
    const run = vi.fn<ModelRunner>(async function* () {
      yield 'Partial';
      yield 'Must not appear';
    });
    const onText = vi.fn(() => controller.abort());
    await expect(
      generateAnswer(input(run, onText, controller.signal)),
    ).rejects.toMatchObject({ code: 'STOPPED' });
    expect(onText).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('rich-text input and generated Markdown', () => {
  it('accepts the editor allowlist and derives plain text', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'A safe question',
              marks: [{ type: 'bold' }],
            },
          ],
        },
      ],
    };
    expect(plainText(documentSchema(6000).parse(doc))).toBe('A safe question');
  });
  it.each([
    {
      type: 'doc',
      content: [{ type: 'image', attrs: { src: 'https://unsafe.invalid' } }],
    },
    { type: 'doc', content: [{ type: 'text', text: 'Invalid root child' }] },
    {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'unsafe',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
          ],
        },
      ],
    },
    paragraph(' '),
    paragraph('x'.repeat(6001)),
  ])('rejects malformed, unsafe, empty or excessive input', (doc: unknown) => {
    expect(documentSchema(6000).safeParse(doc).success).toBe(false);
  });
  it('rejects excessive nesting before recursive schema evaluation', () => {
    let value: unknown = paragraph('nested');
    for (let index = 0; index < 50; index++)
      value = { type: 'doc', content: [value] };
    expect(documentSchema(6000).safeParse(value).success).toBe(false);
  });
  it('preserves code, lists and marks while keeping HTML and unsafe links inert', () => {
    const doc = assistantDocument(
      '## Heading\n\n**Bold** and *italic*.\n\n- First\n- Second\n\n```ts\nconst safe = true\n```\n\n[unsafe](javascript:alert(1))\n\n<script>alert(1)</script>',
    );
    expect(doc.content?.map((node) => node.type)).toContain('codeBlock');
    expect(doc.content?.map((node) => node.type)).toContain('bulletList');
    expect(JSON.stringify(doc)).toContain('"type":"bold"');
    expect(JSON.stringify(doc)).not.toContain('"href":"javascript:');
    expect(plainText(doc)).toContain('<script>alert(1)</script>');
  });
  it('preserves an ordered list starting after one', () => {
    const document = assistantDocument('5. Fifth item\n6. Sixth item');
    expect(document.content?.[0]).toMatchObject({
      type: 'orderedList',
      attrs: { start: 5 },
    });
    expect(plainText(document)).toBe('Fifth item\nSixth item');
  });
});
