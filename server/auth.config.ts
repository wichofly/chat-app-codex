// Schema generation only: the CLI reads these options without needing a live database.
// Runtime authentication is constructed in src/index.ts with validated configuration.
import { betterAuth, env } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  database: prismaAdapter({}, { provider: 'postgresql' }),
  trustedOrigins: [
    env.CLIENT_ORIGIN,
    'http://localhost:5173',
    'http://localhost:5174',
  ].filter((origin) => typeof origin === 'string'),
  emailAndPassword: { enabled: true, requireEmailVerification: false },
});
