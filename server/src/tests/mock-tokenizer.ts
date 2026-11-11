import type { TokenCounter } from '../modules/ai/tokenizer.js';

// Controlled token counts for orchestration tests, independent of downloads.
export const countModelTokens: TokenCounter = async ({ systemPrompt, messages }) =>
  systemPrompt.length + messages.reduce((sum, message) =>
    sum + (typeof message.content === 'string' ? message.content.length : 0), 0);

