import { Router, type Response } from 'express';
import { z } from 'zod';
import type { Config } from '../../config.js';
import type { Auth } from '../../lib/auth.js';
import type { Database } from '../../lib/prisma.js';
import { HttpError } from '../../middleware/errors.js';
import { requireSession } from '../../middleware/require-session.js';
import type { ModelRunner } from '../ai/provider.js';
import { messageRepository } from '../ai/repository.js';
import { streamHandler } from '../ai/stream.js';
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
  config: Config,
  runModel?: ModelRunner,
) {
  const router = Router();
  const service = chatService(chatRepository(database));
  const stream = streamHandler(database, config, runModel);
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
    await messageRepository(database, config).recover(chat.id);
    const messages = await database.message.findMany({
      where: { chatId: chat.id },
      orderBy: { sequence: 'asc' },
      select: {
        id: true,
        role: true,
        contentJson: true,
        plainText: true,
        status: true,
        modelId: true,
        clientMessageId: true,
        generationId: true,
        failureCode: true,
      },
    });
    const pendingIndex = messages.findIndex(
      (message) => message.role === 'ASSISTANT' && message.status === 'PENDING',
    );
    const pending = messages[pendingIndex];
    const original = messages[pendingIndex - 1];
    const activeGeneration =
      pending?.generationId &&
      original?.role === 'USER' &&
      original.clientMessageId
        ? {
            generationId: pending.generationId,
            clientMessageId: original.clientMessageId,
          }
        : null;
    response.json({
      data: {
        ...chat,
        messages: messages.map(
          ({ generationId: _generationId, ...message }) => message,
        ),
        activeGeneration,
      },
    });
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
  router.post('/:chatId/messages/stream', async (request, response) => {
    const id = chatId.parse(request.params.chatId);
    await service.get(id, userId(response));
    await stream.send(request, response, id, userId(response));
  });
  router.post('/:chatId/messages/stop', async (request, response) => {
    const id = chatId.parse(request.params.chatId);
    await service.get(id, userId(response));
    const body = z
      .object({ clientMessageId: z.uuid(), generationId: z.uuid() })
      .strict()
      .parse(request.body);
    response.json({
      data: {
        stopped: await stream.stop(id, body.clientMessageId, body.generationId),
      },
    });
  });
  for (const feature of ['share']) {
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
