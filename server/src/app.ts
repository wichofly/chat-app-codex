import { toNodeHandler } from 'better-auth/node';
import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Config } from './config.js';
import type { Auth } from './lib/auth.js';
import type { Database } from './lib/prisma.js';
import { errorHandler, HttpError } from './middleware/errors.js';
import { chatRoutes } from './modules/chats/routes.js';

export function createApp({
  config,
  auth,
  database,
}: {
  config: Config;
  auth: Auth;
  database: Database;
}) {
  const app = express();
  const trustedOrigins = [
    config.CLIENT_ORIGIN,
    new URL(config.BETTER_AUTH_URL).origin,
  ];
  app.disable('x-powered-by');
  app.use('/api', (_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || trustedOrigins.includes(origin)) callback(null, true);
        else
          callback(
            new HttpError(
              403,
              'INVALID_ORIGIN',
              'This request origin is not allowed.',
            ),
          );
      },
      credentials: true,
      methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type'],
    }),
  );
  // This IP limiter also limits spoofed forwarded headers; no proxy is trusted by default.
  app.use(
    '/api/auth',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 30,
      skip: (request) => request.method !== 'POST',
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many authentication attempts. Please try again later.',
        },
      },
    }),
  );
  // Express 5 named wildcard. Better Auth must see the untouched request body.
  app.all('/api/auth/*splat', toNodeHandler(auth));
  app.use(express.json({ limit: '64kb' }));
  app.get('/api/health', (_request, response) => {
    response.json({ data: { status: 'ok' } });
  });
  app.use('/api/chats', chatRoutes(database, auth, trustedOrigins));
  app.use('/api/shared', (_request, response) => {
    response
      .set('X-Robots-Tag', 'noindex, nofollow')
      .status(404)
      .json({
        error: { code: 'NOT_FOUND', message: 'Shared conversation not found.' },
      });
  });
  app.use((_request, response) => {
    response
      .status(404)
      .json({ error: { code: 'NOT_FOUND', message: 'Not found.' } });
  });
  app.use(errorHandler);
  return app;
}
