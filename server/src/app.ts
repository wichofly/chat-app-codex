import { toNodeHandler } from 'better-auth/node';
import cors from 'cors';
import express from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { Config } from './config.js';
import type { Auth } from './lib/auth.js';
import type { Database } from './lib/prisma.js';
import { createReadinessProbe } from './lib/readiness.js';
import { errorHandler, HttpError } from './middleware/errors.js';
import { AUTH_CLIENT_IP_HEADER, clientIp } from './middleware/client-ip.js';
import type { ModelRunner } from './modules/ai/provider.js';
import { chatRoutes } from './modules/chats/routes.js';
import { publicSharingRoutes } from './modules/sharing/routes.js';

export function createApp({
  config,
  auth,
  database,
  runModel,
}: {
  config: Config;
  auth: Auth;
  database: Database;
  runModel?: ModelRunner;
}) {
  const app = express();

  const checkReadiness = createReadinessProbe(database);

  const trustedOrigins = [
    config.CLIENT_ORIGIN,
    new URL(config.BETTER_AUTH_URL).origin,
  ];

  app.disable('x-powered-by');

  app.set('trust proxy', config.TRUST_PROXY_HOPS || false);

  app.use('/api', (_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });

  app.use('/api', clientIp(config));

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

  // Proxy trust is bounded by the configured ingress hop count; it is off locally.
  app.use(
    '/api/auth',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 30,
      skip: (request) => request.method !== 'POST',
      keyGenerator: (request) =>
        ipKeyGenerator(request.get(AUTH_CLIENT_IP_HEADER) || ''),
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

  app.get('/api/ready', async (_request, response) => {
    try {
      await checkReadiness();
      response.json({ data: { status: 'ready' } });
    } catch {
      response.status(503).json({
        error: {
          code: 'NOT_READY',
          message: 'The service is temporarily unavailable.',
        },
      });
    }
  });

  app.use(
    '/api/chats',
    chatRoutes(database, auth, trustedOrigins, config, runModel),
  );

  app.use('/api/shared', publicSharingRoutes(database, config));

  app.use((_request, response) => {
    response
      .status(404)
      .json({ error: { code: 'NOT_FOUND', message: 'Not found.' } });
  });

  app.use(errorHandler);

  return app;
}
