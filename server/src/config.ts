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
});

export function readConfig(input: NodeJS.ProcessEnv = process.env) {
  const result = environment.safeParse(input);
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
