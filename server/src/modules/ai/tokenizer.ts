import { Template } from '@huggingface/jinja';
import { Tokenizer } from '@huggingface/tokenizers';
import type { ModelMessage } from 'ai';
import { z } from 'zod';

// Pin tokenizer and chat template together. Each model needs its own vocabulary.
const sources: Record<string, { repo: string; revision: string }> = {
  'google/gemma-4-31b-it:free': {
    repo: 'google/gemma-4-31B-it',
    revision: '842da3794eaa0b77d5f08bae87a17459d91ff475',
  },
  'cohere/north-mini-code:free': {
    repo: 'CohereLabs/North-Mini-Code-1.0',
    revision: 'd11e61a842617a22dc328552fa5bb86231ee4f37',
  },
  'google/gemma-4-26b-a4b-it:free': {
    repo: 'google/gemma-4-26B-A4B-it',
    revision: '4d7ae4984b7db7de8f8457170b3f1a419ee76d52',
  },
  'nvidia/nemotron-3-nano-30b-a3b:free': {
    repo: 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16',
    revision: 'bf77c3174f68ad409e1c2aa60daeb46e32d1c606',
  },
  'nvidia/nemotron-3.5-lightning:free': {
    repo: 'nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-BF16',
    revision: 'a9904d24bcc1d289a1950fa9d2b978c47cf903b9',
  },
};

export class TokenizerError extends Error {}

export type TokenCounter = (input: {
  modelId: string;
  systemPrompt: string;
  messages: ModelMessage[];
  signal: AbortSignal;
}) => Promise<number>;

const objectSchema = z.record(z.string(), z.unknown());

export function promptTokenCounter(
  tokenizerJson: object,
  config: Record<string, unknown>,
  chatTemplate: string,
): (systemPrompt: string, messages: ModelMessage[]) => number {
  const tokenizer = new Tokenizer(tokenizerJson, config);
  const template = new Template(chatTemplate);
  return (systemPrompt, messages) => {
    const conversation = [{ role: 'system', content: systemPrompt }];
    for (const message of messages) {
      if (
        (message.role !== 'user' && message.role !== 'assistant') ||
        typeof message.content !== 'string'
      )
        throw new TokenizerError('Only text chat messages can be counted.');
      conversation.push({ role: message.role, content: message.content });
    }
    const prompt = template.render({
      ...config,
      messages: conversation,
      add_generation_prompt: true,
      // Match the provider's disabled optional reasoning and generation prefix.
      enable_thinking: false,
    });
    return tokenizer.encode(prompt, { add_special_tokens: false }).ids.length;
  };
}

async function loadCounter(modelId: string) {
  const source = Object.hasOwn(sources, modelId) ? sources[modelId] : undefined;
  if (!source)
    throw new TokenizerError('No verified tokenizer for this model.');
  const base = `https://huggingface.co/${source.repo}/resolve/${source.revision}`;
  // Fetch public artifacts only; private conversation text stays on the server.
  const responses = await Promise.all(
    ['tokenizer.json', 'tokenizer_config.json', 'chat_template.jinja'].map(
      (file) =>
        // Vocabularies are tens of MB; a cold download can exceed ten seconds.
        fetch(`${base}/${file}`, { signal: AbortSignal.timeout(60000) }),
    ),
  );
  if (responses.some((response) => !response.ok))
    throw new TokenizerError('Could not load the pinned tokenizer artifacts.');
  const [tokenizerJson, config, template] = await Promise.all([
    responses[0]?.json(),
    responses[1]?.json(),
    responses[2]?.text(),
  ]);
  if (!template) throw new TokenizerError('Missing chat template.');
  return promptTokenCounter(
    objectSchema.parse(tokenizerJson),
    objectSchema.parse(config),
    template,
  );
}

// Keep one large vocabulary resident on the small API instance.
let cached:
  { modelId: string; counter: ReturnType<typeof loadCounter> } | undefined;
export const countModelTokens: TokenCounter = async ({
  modelId,
  systemPrompt,
  messages,
  signal,
}) => {
  signal.throwIfAborted();
  if (cached?.modelId !== modelId)
    cached = { modelId, counter: loadCounter(modelId) };
  const entry = cached;
  let onAbort = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    // Stop this caller immediately without cancelling a shared artifact load.
    const counter = await Promise.race([entry.counter, aborted]);
    signal.throwIfAborted();
    return counter(systemPrompt, messages);
  } catch {
    if (!signal.aborted && cached === entry) cached = undefined;
    signal.throwIfAborted();
    throw new TokenizerError(
      'The model tokenizer is unavailable or unsupported.',
    );
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
};
