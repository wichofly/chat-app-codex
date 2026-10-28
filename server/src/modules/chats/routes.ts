import { Router, type Response } from 'express';
import { z } from 'zod';
import type { Auth } from '../../lib/auth.js';
import type { Database } from '../../lib/prisma.js';
import { HttpError } from '../../middleware/errors.js';
import { requireSession } from '../../middleware/require-session.js';
import { chatRepository } from './repository.js';
import { chatService } from './service.js';

const title = z
  .string()
  .trim()
  .min(1)
  .refine((value) => [...value].length <= 100, 'Use at most 100 characters');
const chatId = z.uuid();
function userId(response: Response): string {
  const id: unknown = response.locals.userId;
  if (typeof id !== 'string')
    throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in to continue.');
  return id;
}

export function chatRoutes(
  database: Database,
  auth: Auth,
  trustedOrigins: string[],
) {
  const router = Router();
  const service = chatService(chatRepository(database));
  router.use(requireSession(auth));
  router.use((request, _response, next) => {
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      !trustedOrigins.includes(request.get('origin') || '')
    ) {
      throw new HttpError(
        403,
        'INVALID_ORIGIN',
        'This request origin is not allowed.',
      );
    }
    next();
  });
  router.get('/', async (_request, response) => {
    response.json({ data: await service.list(userId(response)) });
  });
  router.post('/', async (request, response) => {
    const data = z
      .object({ title: title.default('New chat') })
      .strict()
      .parse(request.body);
    response
      .status(201)
      .json({ data: await service.create(userId(response), data.title) });
  });
  router.get('/:chatId', async (request, response) => {
    const chat = await service.get(
      chatId.parse(request.params.chatId),
      userId(response),
    );
    response.json({ data: { ...chat, messages: [] } });
  });
  router.patch('/:chatId', async (request, response) => {
    const data = z.object({ title }).strict().parse(request.body);
    response.json({
      data: await service.rename(
        chatId.parse(request.params.chatId),
        userId(response),
        data.title,
      ),
    });
  });
  router.delete('/:chatId', async (request, response) => {
    await service.delete(chatId.parse(request.params.chatId), userId(response));
    response.status(204).end();
  });
  for (const feature of ['share', 'messages/stream']) {
    router.all(`/:chatId/${feature}`, async (request, _response) => {
      await service.get(chatId.parse(request.params.chatId), userId(_response));
      throw new HttpError(
        503,
        'FEATURE_UNAVAILABLE',
        'This feature is not connected yet.',
      );
    });
  }
  return router;
}
