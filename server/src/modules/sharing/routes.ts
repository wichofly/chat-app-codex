import { Router } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { Config } from '../../config.js';
import type { Database } from '../../lib/prisma.js';
import { AUTH_CLIENT_IP_HEADER } from '../../middleware/client-ip.js';
import { sharingService } from './service.js';

export function publicSharingRoutes(database: Database, config: Config) {
  const router = Router();
  const service = sharingService(database, config);
  router.use((_request, response, next) => {
    response.set('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
  router.use(
    rateLimit({
      windowMs: 60000,
      limit: 60,
      keyGenerator: (request) =>
        ipKeyGenerator(request.get(AUTH_CLIENT_IP_HEADER) || ''),
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please try again later.',
        },
      },
    }),
  );
  router.get('/:token', async (request, response) => {
    response.json({ data: await service.read(request.params.token) });
  });
  return router;
}
