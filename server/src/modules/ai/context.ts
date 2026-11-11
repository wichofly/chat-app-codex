import type { ModelMessage } from 'ai';
import type { TokenCounter } from './tokenizer.js';

export async function fitMessagesToContext({
  systemPrompt,
  messages,
  maxInputTokens,
  modelId,
  countTokens,
  signal,
}: {
  systemPrompt: string;
  messages: ModelMessage[];
  maxInputTokens: number;
  modelId: string;
  countTokens: TokenCounter;
  signal: AbortSignal;
}): Promise<{ messages: ModelMessage[]; inputTokens: number } | null> {
  // The database's message/character bounds may cut off the first user message
  // of a turn. Never send its orphaned assistant reply as the start of history.
  const firstUser = messages.findIndex((message) => message.role === 'user');
  if (firstUser < 0 || messages.at(-1)?.role !== 'user') return null;
  let recentMessages = messages.slice(firstUser);
  while (true) {
    signal.throwIfAborted();
    const inputTokens = await countTokens({
      modelId,
      systemPrompt,
      messages: recentMessages,
      signal,
    });
    if (!Number.isSafeInteger(inputTokens) || inputTokens < 0)
      throw new Error('Invalid tokenizer count');
    if (inputTokens <= maxInputTokens)
      return { messages: recentMessages, inputTokens };
    const nextTurn = recentMessages.findIndex(
      (message, index) => index > 0 && message.role === 'user',
    );
    if (nextTurn < 0) return null;
    recentMessages = recentMessages.slice(nextTurn);
  }
}
