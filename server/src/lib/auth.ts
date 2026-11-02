import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import type { Config } from '../config.js';
import { AUTH_CLIENT_IP_HEADER } from '../middleware/client-ip.js';
import type { Database } from './prisma.js';

export function createAuth(database: Database, config: Config) {
  return betterAuth({
    appName: 'Thread',
    baseURL: config.BETTER_AUTH_URL,
    basePath: '/api/auth',
    secret: config.BETTER_AUTH_SECRET,
    database: prismaAdapter(database, { provider: 'postgresql' }),
    trustedOrigins: [
      config.CLIENT_ORIGIN,
      new URL(config.BETTER_AUTH_URL).origin,
    ],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    advanced: {
      ipAddress: { ipAddressHeaders: [AUTH_CLIENT_IP_HEADER] },
      useSecureCookies: config.NODE_ENV === 'production',
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.NODE_ENV === 'production',
      },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 10 },
        '/sign-up/email': { window: 60, max: 5 },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
