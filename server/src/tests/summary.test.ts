import { afterEach, describe, expect, it, vi } from 'vitest';
import { APICallError } from 'ai';
import { readConfig } from '../config.js';
import { countModelTokens } from '../modules/ai/tokenizer.js';
import { countModelTokens as controlledCount } from './mock-tokenizer.js';
import type { ModelRunner } from '../modules/ai/provider.js';
import { contextMessages, prepareConversation, type ConversationContext } from '../modules/ai/summary.js';
vi.mock('../modules/ai/tokenizer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../modules/ai/tokenizer.js')>();
  const { countModelTokens } = await import('./mock-tokenizer.js');
  return { ...actual, countModelTokens: vi.fn(countModelTokens) };
});
afterEach(() => vi.mocked(countModelTokens).mockReset().mockImplementation(controlledCount));
const config = readConfig({
  DATABASE_URL: 'postgresql://test:unused@localhost/test',
  BETTER_AUTH_SECRET: 'test-only-secret-must-be-at-least-32-characters',
});
const source = [
  { role: 'user' as const, content: 'Use TypeScript', sequence: 1 },
  { role: 'assistant' as const, content: 'Agreed', sequence: 2 },
];
const context: ConversationContext = {
  summary: '', through: 0, source,
  history: [{ role: 'user', content: 'Next question', sequence: 5 }],
};
function input(overrides: Partial<Parameters<typeof prepareConversation>[0]> = {}) {
  return { config, context, persona: 'assistant' as const,
    signal: new AbortController().signal,
    run: vi.fn<ModelRunner>(async function* () { yield 'User prefers TypeScript.'; }),
    save: vi.fn(async () => true), ...overrides };
}
describe('rolling conversation summary', () => {
  it('counts the exact final summary request after removing an unfinished source turn', async () => {
    const args = input({ context: {
      ...context,
      source: [...source, { role: 'user', content: 'Unfinished question', sequence: 3 }],
    } });
    await prepareConversation(args);
    const request = vi.mocked(args.run).mock.calls[0]?.[0];
    const lastCount = vi.mocked(countModelTokens).mock.calls.at(-1)?.[0];
    expect(request).toBeDefined();
    expect(lastCount?.messages).toBe(request?.messages);
    expect(lastCount?.systemPrompt).toBe(request?.systemPrompt);
    expect(lastCount?.modelId).toBe(request?.modelId);
    expect(request?.messages.at(-1)).toEqual({
      role: 'user', content: expect.stringContaining('produce the updated concise conversation summary'),
    });
    expect(JSON.stringify(request?.messages)).not.toContain('Unfinished question');
    expect(args.save).toHaveBeenCalledWith(2, 'User prefers TypeScript.');
  });

  it('skips generation when the final user instruction pushes the summary request over budget', async () => {
    // 1,408 input tokens remain after the output reserve and safety margin.
    // The source fits alone, but its final instruction adds another 200 tokens.
    vi.mocked(countModelTokens).mockImplementation(async ({ systemPrompt, messages }) => {
      if (!systemPrompt.startsWith('Summarize')) return 1;
      const last = messages.at(-1);
      const hasRequest = last?.role === 'user' && typeof last.content === 'string'
        && last.content.startsWith('Now produce');
      return 1210 + (hasRequest ? 200 : 0);
    });
    const args = input({ config: {
      ...config, AI_MAX_CONTEXT_TOKENS: 2048, MAX_AI_OUTPUT_TOKENS: 512,
      AI_CONTEXT_SAFETY_MARGIN_TOKENS: 128,
    } });
    expect(await prepareConversation(args)).toEqual(contextMessages(context));
    expect(countModelTokens).toHaveBeenCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([
        { role: 'user', content: expect.stringContaining('produce the updated concise conversation summary') },
      ]),
    }));
    expect(args.run).not.toHaveBeenCalled();
    expect(args.save).not.toHaveBeenCalled();
  });

  it('does not call a model when history fits and nothing is omitted', async () => {
    const args = input({ context: { ...context, history: [...source, ...context.history] } });
    await prepareConversation(args);
    expect(args.run).not.toHaveBeenCalled();
    expect(args.save).not.toHaveBeenCalled();
  });
  it('summarizes history excluded by bounds, saves only its covered prefix and preserves recent text', async () => {
    const args = input();
    const messages = await prepareConversation(args);
    expect(args.run).toHaveBeenCalledTimes(1);
    expect(args.save).toHaveBeenCalledWith(2, 'User prefers TypeScript.');
    expect(messages.at(-1)).toEqual({ role: 'user', content: 'Next question' });
    expect(JSON.stringify(messages)).toContain('User prefers TypeScript');
    expect(args.run).toHaveBeenCalledWith(expect.objectContaining({ maxOutputTokens: 512 }));
    expect(vi.mocked(args.run).mock.calls[0]?.[0].messages.at(-1)).toEqual({
      role: 'user',
      content: expect.stringContaining('produce the updated concise conversation summary'),
    });
  });
  it('summarizes when the counted prompt exceeds the input budget', async () => {
    const old = source.map((message) => ({ ...message, content: 'x'.repeat(1000) }));
    const args = input({
      config: { ...config, AI_MAX_CONTEXT_TOKENS: 4096, AI_CONTEXT_SAFETY_MARGIN_TOKENS: 128 },
      context: { ...context, source: old, history: [...old,
        { role: 'user', content: 'y'.repeat(1000), sequence: 3 }] },
    });
    const messages = await prepareConversation(args);
    expect(args.run).toHaveBeenCalledTimes(1);
    expect(args.save).toHaveBeenCalledWith(2, 'User prefers TypeScript.');
    expect(messages.at(-1)?.content).toBe('y'.repeat(1000));
  });
  it('merges an existing summary and avoids duplicate summarized messages on later requests', async () => {
    const args = input({ context: { ...context, summary: 'Project uses React.', through: 0 } });
    await prepareConversation(args);
    expect(JSON.stringify(vi.mocked(args.run).mock.calls)).toContain('Project uses React.');
    const saved = { ...context, summary: 'User prefers TypeScript.', through: 2, source: [] };
    const retry = input({ context: saved });
    const messages = await prepareConversation(retry);
    expect(retry.run).not.toHaveBeenCalled();
    expect(messages).toEqual(contextMessages(saved));
  });
  it('falls back to bounded history when summarization or persistence fails', async () => {
    for (const args of [
      input({ run: async function* () { throw new Error('Upstream failure'); } }),
      input({ save: async () => false }),
      input({ run: async function* () { yield ''; } }),
    ]) expect(await prepareConversation(args)).toEqual(contextMessages(context));
  });
  it('does not summarize a source that cannot fit the summary request budget', async () => {
    const args = input({ context: { ...context, source: source.map((m) => ({ ...m, content: 'x'.repeat(40000) })) } });
    await prepareConversation(args);
    expect(args.run).not.toHaveBeenCalled();
    expect(args.save).not.toHaveBeenCalled();
  });
  it('propagates Stop and never saves a partial summary', async () => {
    const controller = new AbortController();
    const args = input({ signal: controller.signal, run: async function* () {
      yield 'Partial'; controller.abort(new Error('Stopped')); yield 'More';
    } });
    await expect(prepareConversation(args)).rejects.toThrow('Stopped');
    expect(args.save).not.toHaveBeenCalled();
  });
  it('does not retry rejected credentials through the normal answer path', async () => {
    const args = input({ run: async function* () {
      throw new APICallError({ message: 'private', url: 'https://provider.invalid',
        requestBodyValues: {}, statusCode: 401 });
    } });
    await expect(prepareConversation(args)).rejects.toMatchObject({ code: 'PROVIDER_CREDENTIALS' });
    expect(args.save).not.toHaveBeenCalled();
  });
});
