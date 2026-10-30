import { describe, expect, it, vi } from 'vitest';
import { readConfig } from '../config.js';
import { modelRunner } from '../modules/ai/provider.js';

const { streamTextMock } = vi.hoisted(() => ({ streamTextMock: vi.fn() }));
vi.mock('ai', () => ({ streamText: streamTextMock }));
vi.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: () => ({ chat: () => ({}) }),
}));

const config = readConfig({
  DATABASE_URL: 'postgresql://test:unused@localhost/test',
  BETTER_AUTH_SECRET: 'test-only-secret-must-be-at-least-32-characters',
  OPENROUTER_API_KEY: 'test-only-key',
});

async function collect(reason?: string) {
  streamTextMock.mockReturnValue({
    fullStream: (async function* () {
      yield { type: 'text-delta', text: 'Partial answer' };
      if (reason) yield { type: 'finish', finishReason: reason };
    })(),
  });
  const chunks: string[] = [];
  const runner = modelRunner(config);
  for await (const chunk of runner({
    modelId: config.OPENROUTER_MODEL_1,
    messages: [{ role: 'user', content: 'A question' }],
    signal: new AbortController().signal,
  }))
    chunks.push(chunk);
  return chunks;
}

describe('provider stream completion', () => {
  it.each(['length', 'interrupted'])(
    'marks a %s finish as incomplete after partial text',
    async (reason) => {
      await expect(collect(reason)).rejects.toMatchObject({
        code: 'INCOMPLETE',
      });
    },
  );
  it('accepts a normal stop finish', async () => {
    await expect(collect('stop')).resolves.toEqual(['Partial answer']);
  });
  it('rejects a stream that ends without a finish event', async () => {
    await expect(collect()).rejects.toMatchObject({ code: 'INCOMPLETE' });
  });
});
