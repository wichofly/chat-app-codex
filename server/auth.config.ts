// Schema generation only: the CLI reads these options without needing a live database.
// Runtime authentication is constructed in src/index.ts with validated configuration.
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';

export const auth = betterAuth({
  baseURL: 'http://localhost:3001',
  database: prismaAdapter({}, { provider: 'postgresql' }),
  emailAndPassword: { enabled: true, requireEmailVerification: false },
});
