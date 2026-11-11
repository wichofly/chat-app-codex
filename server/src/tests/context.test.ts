import { describe, expect, it, vi } from 'vitest';
import { fitMessagesToContext } from '../modules/ai/context.js';
import { countModelTokens } from './mock-tokenizer.js';

const defaults = {
  modelId: 'test-model',
  countTokens: countModelTokens,
  signal: new AbortController().signal,
  systemPrompt: '',
  maxInputTokens: 1000,
};

describe('native-token context budget', () => {
  it('removes an orphaned assistant reply even when all history fits', async () => {
    const messages = [
      { role: 'assistant' as const, content: 'Reply to a discarded question' },
      { role: 'user' as const, content: 'Current question' },
    ];
    const fitted = await fitMessagesToContext({ ...defaults, messages });
    expect(fitted?.messages).toEqual([messages[1]]);
    expect(messages).toHaveLength(2);
  });

  it.each([{ messages: [] }, { messages: [
    { role: 'user' as const, content: 'Old question' },
    { role: 'assistant' as const, content: 'Old answer' },
  ] }])('rejects history without a final user prompt ($messages)', async ({ messages }) => {
    expect(await fitMessagesToContext({ ...defaults, messages })).toBeNull();
  });

  it('drops whole turns and recounts the full formatted prompt', async () => {
    const messages = [
      { role: 'user' as const, content: 'Old question' },
      { role: 'assistant' as const, content: 'Old answer' },
      { role: 'user' as const, content: 'Recent question' },
    ];
    const countTokens = vi.fn().mockResolvedValueOnce(201).mockResolvedValueOnce(200);
    const fitted = await fitMessagesToContext({
      ...defaults, systemPrompt: 'System', messages, countTokens, maxInputTokens: 200,
    });
    expect(fitted).toEqual({ messages: [messages[2]], inputTokens: 200 });
    expect(countTokens).toHaveBeenNthCalledWith(1, expect.objectContaining({
      modelId: 'test-model', systemPrompt: 'System', messages,
    }));
    expect(countTokens).toHaveBeenNthCalledWith(2, expect.objectContaining({
      messages: [messages[2]],
    }));
  });

  it('rejects the latest prompt if its native count exceeds the budget', async () => {
    expect(await fitMessagesToContext({
      ...defaults,
      messages: [{ role: 'user', content: 'Small text with expensive tokens' }],
      countTokens: async () => 1001,
    })).toBeNull();
  });

  it('keeps text when its tokenizer count fits despite a large byte size', async () => {
    const messages = [{ role: 'user' as const, content: '你好🙂'.repeat(200) }];
    expect(await fitMessagesToContext({
      ...defaults, messages, countTokens: async () => 400,
    })).toEqual({ messages, inputTokens: 400 });
  });

  it('does not count or generate after cancellation', async () => {
    const countTokens = vi.fn();
    await expect(fitMessagesToContext({
      ...defaults, messages: [{ role: 'user', content: 'Question' }],
      countTokens, signal: AbortSignal.abort(),
    })).rejects.toThrow();
    expect(countTokens).not.toHaveBeenCalled();
  });
});
