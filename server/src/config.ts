import { z } from 'zod';

const httpUrl = z
  .url()
  .refine(
    (value) => ['http:', 'https:'].includes(new URL(value).protocol),
    'Use an HTTP(S) URL',
  );
const environment = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  TRUSTED_PROXY_SECRET: z.string().min(32).optional(),
  DATABASE_URL: z
    .url()
    .refine(
      (value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol),
      'Use a PostgreSQL connection URL',
    ),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32)
    .refine(
      (value) => !value.startsWith('replace-'),
      'Replace the example secret',
    ),
  BETTER_AUTH_URL: httpUrl.default('http://localhost:3001'),
  CLIENT_ORIGIN: httpUrl.default('http://localhost:5173'),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_MODEL_1: z.string().min(1).default('cohere/north-mini-code:free'),
  OPENROUTER_MODEL_2: z
    .string()
    .min(1)
    .default('google/gemma-4-26b-a4b-it:free'),
  OPENROUTER_MODEL_3: z
    .string()
    .min(1)
    .default('nvidia/nemotron-3-nano-30b-a3b:free'),
  MAX_GENERATIONS_PER_USER_DAY: z.coerce
    .number()
    .int()
    .min(1)
    .max(1000)
    .default(15),
  MAX_USER_MESSAGE_CHARS: z.coerce
    .number()
    .int()
    .min(1)
    .max(12000)
    .default(6000),
  MAX_HISTORY_MESSAGES: z.coerce.number().int().min(1).max(40).default(20),
  MAX_AI_OUTPUT_TOKENS: z.coerce.number().int().min(1).max(4096).default(1024),
  AI_FIRST_TOKEN_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(60000)
    .default(15000),
  AI_TOTAL_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(180000)
    .default(90000),
});

export function readConfig(input: NodeJS.ProcessEnv = process.env) {
  const key = input.OPENROUTER_API_KEY;
  const result = environment.safeParse({
    ...input,
    OPENROUTER_API_KEY: key && !key.startsWith('replace-') ? key : undefined,
  });
  if (!result.success) {
    // Report field names only; never include environment values or connection credentials.
    throw new Error(
      `Invalid server configuration: ${[...new Set(result.error.issues.map((issue) => issue.path.join('.')))].join(', ')}`,
    );
  }
  const config = result.data;
  if (new URL(config.CLIENT_ORIGIN).origin !== config.CLIENT_ORIGIN)
    throw new Error(
      'CLIENT_ORIGIN must be an origin without a path or trailing slash',
    );
  if (
    config.NODE_ENV === 'production' &&
    (!config.BETTER_AUTH_URL.startsWith('https://') ||
      !config.CLIENT_ORIGIN.startsWith('https://'))
  )
    throw new Error('Production authentication requires HTTPS');
  return config;
}

export type Config = ReturnType<typeof readConfig>;
