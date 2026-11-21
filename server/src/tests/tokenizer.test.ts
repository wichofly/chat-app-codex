import { afterEach, describe, expect, it, vi } from 'vitest';
import { promptTokenCounter } from '../modules/ai/tokenizer.js';

// Small real WordPiece vocabulary: verifies tokenization and template control
// tokens without downloading large model files in the test suite.
const vocabulary = {
  added_tokens: [{ id: 0, content: '<s>', special: true }],
  normalizer: null,
  pre_tokenizer: { type: 'Whitespace' },
  post_processor: null,
  decoder: null,
  model: {
    type: 'WordPiece',
    unk_token: '[UNK]',
    vocab: {
      '<s>': 0,
      '[UNK]': 1,
      system: 2,
      helpful: 3,
      user: 4,
      hello: 5,
      assistant: 6,
      你好: 7,
      '🙂': 8,
    },
  },
};
const template =
  '{{ bos_token }}{% for message in messages %}{{ message.role }} {{ message.content }}\n{% endfor %}{% if add_generation_prompt %}assistant{% endif %}';
const config = { bos_token: '<s>' };
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('model tokenizer and chat template', () => {
  it('counts the non-thinking chat template branch used by generation', () => {
    const count = promptTokenCounter(vocabulary, { ...config, enable_thinking: true },
      '{% if enable_thinking %}helpful helpful {% endif %}' + template);
    expect(count('helpful', [{ role: 'user', content: 'hello' }])).toBe(6);
  });
  it('uses the verified Gemma 31B tokenizer and template for the replacement fallback', async () => {
    const fetchMock = vi.fn(
      async (url: string) =>
        new Response(
          url.endsWith('tokenizer.json')
            ? JSON.stringify(vocabulary)
            : url.endsWith('tokenizer_config.json')
              ? JSON.stringify(config)
              : template,
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { countModelTokens } = await import('../modules/ai/tokenizer.js');
    expect(
      await countModelTokens({
        modelId: 'google/gemma-4-31b-it:free',
        systemPrompt: 'helpful',
        messages: [{ role: 'user', content: 'hello' }],
        signal: new AbortController().signal,
      }),
    ).toBe(6);
    for (const [url] of fetchMock.mock.calls)
      expect(url).toContain(
        'google/gemma-4-31B-it/resolve/842da3794eaa0b77d5f08bae87a17459d91ff475/',
      );
  });
  it('counts actual tokens including BOS, roles, system text and generation prefix', () => {
    const count = promptTokenCounter(vocabulary, config, template);
    expect(count('helpful', [{ role: 'user', content: 'hello' }])).toBe(6);
    expect(count('helpful', [{ role: 'user', content: '你好 🙂' }])).toBe(7);
  });

  it('reuses pinned public assets and never sends conversation text to the asset host', async () => {
    const fetchMock = vi.fn(
      async (url: string) =>
        new Response(
          url.endsWith('tokenizer.json')
            ? JSON.stringify(vocabulary)
            : url.endsWith('tokenizer_config.json')
              ? JSON.stringify(config)
              : template,
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { countModelTokens } = await import('../modules/ai/tokenizer.js');
    const input = {
      modelId: 'cohere/north-mini-code:free',
      systemPrompt: 'helpful',
      messages: [{ role: 'user' as const, content: 'hello' }],
      signal: new AbortController().signal,
    };
    expect(await countModelTokens(input)).toBe(6);
    expect(await countModelTokens(input)).toBe(6);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [url, options] of vi.mocked(fetch).mock.calls) {
      expect(url).toMatch(/\/resolve\/[a-f0-9]{40}\//);
      expect(options?.body).toBeUndefined();
      expect(options?.headers).toBeUndefined();
    }
  });

  it('fails closed for an unregistered model instead of using an unrelated tokenizer', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { countModelTokens } = await import('../modules/ai/tokenizer.js');
    await expect(
      countModelTokens({
        modelId: 'unknown/model',
        systemPrompt: 'helpful',
        messages: [{ role: 'user', content: 'hello' }],
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('unavailable or unsupported');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed on artifact errors and retries a failed load on the next request', async () => {
    let unavailable = true;
    const fetchMock = vi.fn(async (url: string) => {
      if (unavailable) return new Response('', { status: 503 });
      return new Response(
        url.endsWith('tokenizer.json')
          ? JSON.stringify(vocabulary)
          : url.endsWith('tokenizer_config.json')
            ? JSON.stringify(config)
            : template,
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const { countModelTokens } = await import('../modules/ai/tokenizer.js');
    const input = {
      modelId: 'cohere/north-mini-code:free',
      systemPrompt: 'helpful',
      messages: [{ role: 'user' as const, content: 'hello' }],
      signal: new AbortController().signal,
    };
    await expect(countModelTokens(input)).rejects.toThrow(
      'unavailable or unsupported',
    );
    unavailable = false;
    expect(await countModelTokens(input)).toBe(6);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('cancels a caller promptly while allowing another caller to finish the shared load', async () => {
    let finish: (response: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('tokenizer.json')
          ? pending
          : new Response(
              url.endsWith('tokenizer_config.json')
                ? JSON.stringify(config)
                : template,
            ),
      ),
    );
    const { countModelTokens } = await import('../modules/ai/tokenizer.js');
    const input = {
      modelId: 'cohere/north-mini-code:free',
      systemPrompt: 'helpful',
      messages: [{ role: 'user' as const, content: 'hello' }],
    };
    const controller = new AbortController();
    const cancelled = countModelTokens({ ...input, signal: controller.signal });
    const other = countModelTokens({
      ...input,
      signal: new AbortController().signal,
    });
    controller.abort(new Error('Stopped'));
    await expect(cancelled).rejects.toThrow('Stopped');
    finish(new Response(JSON.stringify(vocabulary)));
    expect(await other).toBe(6);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
