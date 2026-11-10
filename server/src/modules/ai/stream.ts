import { createUIMessageStream, pipeUIMessageStreamToResponse } from 'ai';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { Config } from '../../config.js';
import type { Database } from '../../lib/prisma.js';
import { HttpError } from '../../middleware/errors.js';
import { assistantDocument, documentSchema, paragraph } from './content.js';
import { personaSchema } from './personas.js';
import {
  generateAnswer,
  GenerationError,
  modelRunner,
  type ModelRunner,
} from './provider.js';
import { messageRepository } from './repository.js';

export function streamHandler(
  database: Database,
  config: Config,
  injectedRunner?: ModelRunner,
) {
  const repository = messageRepository(database, config);
  // This deployment runs one API instance. Database guards still own concurrency;
  // this registry only lets an explicit Stop reach the active provider signal.
  const active = new Map<
    string,
    {
      chatId: string;
      clientMessageId: string;
      cancellation: AbortController;
      finished: Promise<boolean>;
    }
  >();
  const payload = z
    .object({
      clientMessageId: z.uuid(),
      contentJson: documentSchema(config.MAX_USER_MESSAGE_CHARS),
      persona: personaSchema.default('assistant'),
    })
    .strict();
  const send = async (
    request: Request,
    response: Response,
    chatId: string,
    userId: string,
  ) => {
    const body = payload.parse(request.body);
    if (!config.OPENROUTER_API_KEY && !injectedRunner)
      throw new HttpError(
        503,
        'AI_NOT_CONFIGURED',
        'The AI service is unavailable. Please contact the app administrator.',
      );
    const attempt = await repository.begin(
      chatId,
      userId,
      body.clientMessageId,
      body.contentJson,
    );
    const cancellation = new AbortController();
    let complete: (stopped: boolean) => void = () => {};
    const finished = new Promise<boolean>((resolve) => {
      complete = resolve;
    });
    let persistedStop = false;
    const generationId = attempt.assistant.generationId;
    if (!attempt.replay && generationId) {
      active.set(generationId, {
        chatId,
        clientMessageId: body.clientMessageId,
        cancellation,
        finished,
      });
    }
    const disconnect = () => {
      if (!response.writableFinished) cancellation.abort();
    };
    response.once('close', disconnect);
    // Stop may arrive while the database transaction is still opening the turn.
    if (request.aborted || response.destroyed) cancellation.abort();
    const timeout = setTimeout(
      () =>
        cancellation.abort(
          new GenerationError(
            'REQUEST_TIMEOUT',
            'The response timed out. Please retry.',
          ),
        ),
      config.AI_TOTAL_TIMEOUT_MS,
    );
    const assistant = attempt.assistant;
    let text = '';
    let modelId: string | null = null;
    const metadata = (
      status: 'PENDING' | 'COMPLETED' | 'FAILED',
      failureCode?: string,
    ) => ({
      clientMessageId: body.clientMessageId,
      generationId,
      userMessageId: attempt.user?.id,
      modelId,
      status,
      ...(failureCode ? { failureCode } : {}),
    });
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        try {
          writer.write({
            type: 'start',
            messageId: assistant.id,
            messageMetadata: metadata('PENDING'),
          });
          writer.write({ type: 'text-start', id: assistant.id });
          if (attempt.replay) {
            text = assistant.plainText;
            modelId = assistant.modelId;
            writer.write({ type: 'text-delta', id: assistant.id, delta: text });
          } else {
            const result = await generateAnswer({
              config,
              run: injectedRunner ?? modelRunner(config),
              messages: await repository.history(chatId, assistant.sequence),
              persona: body.persona,
              signal: cancellation.signal,
              onText: (delta, selected) => {
                text += delta;
                modelId = selected;
                writer.write({ type: 'text-delta', id: assistant.id, delta });
              },
            });
            cancellation.signal.throwIfAborted();
            const persisted = await repository.finish(
              assistant.id,
              assistant.generationId,
              {
                status: 'COMPLETED',
                contentJson: assistantDocument(result.text),
                plainText: result.text,
                modelId: result.modelId,
                failureCode: null,
              },
            );
            if (!persisted)
              throw new GenerationError(
                'INTERRUPTED',
                'This response was interrupted. Please reload the conversation.',
              );
          }
          writer.write({ type: 'text-end', id: assistant.id });
          writer.setOutcome({ status: 'completed' });
          writer.write({
            type: 'finish',
            finishReason: 'stop',
            messageMetadata: metadata('COMPLETED'),
          });
        } catch (error) {
          const stopped = cancellation.signal.aborted;
          const failure = stopped
            ? cancellation.signal.reason instanceof GenerationError
              ? cancellation.signal.reason
              : new GenerationError('STOPPED', 'Generation stopped.')
            : error instanceof GenerationError
              ? error
              : new GenerationError(
                  'GENERATION_FAILED',
                  'This response could not be completed. Please retry.',
                );
          try {
            if (!attempt.replay) {
              const persisted = await repository.finish(
                assistant.id,
                assistant.generationId,
                {
                  status: 'FAILED',
                  contentJson: paragraph(text),
                  plainText: text,
                  modelId,
                  failureCode: failure.code,
                },
              );
              persistedStop = persisted && failure.code === 'STOPPED';
            }
          } catch {
            console.error('Could not persist AI failure', {
              messageId: assistant.id,
            });
          }
          writer.write({ type: 'text-end', id: assistant.id });
          writer.write({
            type: 'message-metadata',
            messageMetadata: metadata('FAILED', failure.code),
          });
          writer.write({ type: 'error', errorText: failure.message });
          writer.setOutcome({ status: stopped ? 'aborted' : 'failed' });
          writer.write({
            type: 'finish',
            finishReason: 'error',
            messageMetadata: metadata('FAILED', failure.code),
          });
        } finally {
          clearTimeout(timeout);
          response.off('close', disconnect);
          if (!attempt.replay && generationId) active.delete(generationId);
          complete(persistedStop);
        }
      },
      onError: () => 'This response could not be completed. Please retry.',
    });
    pipeUIMessageStreamToResponse({
      response,
      stream,
      headers: { 'Cache-Control': 'no-store' },
    });
  };
  return {
    send,
    async stop(chatId: string, clientMessageId: string, generationId: string) {
      const generation = active.get(generationId);
      if (
        !generation ||
        generation.chatId !== chatId ||
        generation.clientMessageId !== clientMessageId
      )
        return false;
      generation.cancellation.abort(
        new GenerationError('STOPPED', 'Generation stopped.'),
      );
      // Acknowledge only after partial content/status is saved, so Retry is safe.
      return generation.finished;
    },
  };
}
