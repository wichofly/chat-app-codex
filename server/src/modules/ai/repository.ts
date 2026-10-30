import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Config } from '../../config.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { Database } from '../../lib/prisma.js';
import { HttpError } from '../../middleware/errors.js';
import { plainText, type RichNode } from './content.js';

export function messageRepository(database: Database, config: Config) {
  const cutoff = () => new Date(Date.now() - config.AI_TOTAL_TIMEOUT_MS - 5000);
  async function recover(chatId: string) {
    await database.message.updateMany({
      where: { chatId, status: 'PENDING', updatedAt: { lt: cutoff() } },
      data: { status: 'FAILED', failureCode: 'INTERRUPTED' },
    });
  }
  return {
    recover,
    async begin(
      chatId: string,
      userId: string,
      clientMessageId: string,
      contentJson: RichNode,
    ) {
      return database.$transaction(
        async (tx) => {
          // Lock ordering is always account then chat. This also serializes the account's daily budget.
          await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;
          await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${chatId}, 1))`;
          if (!(await tx.chat.findFirst({ where: { id: chatId, userId } })))
            throw new HttpError(404, 'NOT_FOUND', 'Conversation not found.');
          await tx.message.updateMany({
            where: { chatId, status: 'PENDING', updatedAt: { lt: cutoff() } },
            data: { status: 'FAILED', failureCode: 'INTERRUPTED' },
          });
          const previous = await tx.message.findUnique({
            where: { chatId_clientMessageId: { chatId, clientMessageId } },
          });
          const assistant = previous
            ? await tx.message.findUnique({
                where: {
                  chatId_sequence: { chatId, sequence: previous.sequence + 1 },
                },
              })
            : null;
          if (previous && !isDeepStrictEqual(previous.contentJson, contentJson))
            throw new HttpError(
              409,
              'IDEMPOTENCY_CONFLICT',
              'This message identifier was already used for different content.',
            );
          if (assistant?.status === 'COMPLETED')
            return { user: previous, assistant, replay: true as const };
          if (
            await tx.message.findFirst({ where: { chatId, status: 'PENDING' } })
          )
            throw new HttpError(
              409,
              'GENERATION_IN_PROGRESS',
              'A response is already being generated in this conversation.',
            );
          if (previous && !assistant)
            throw new HttpError(
              409,
              'INVALID_RETRY',
              'This response cannot be retried.',
            );
          if (assistant) {
            const latest = await tx.message.aggregate({
              where: { chatId },
              _max: { sequence: true },
            });
            if (latest._max.sequence !== assistant.sequence)
              throw new HttpError(
                409,
                'INVALID_RETRY',
                'Only the latest response can be retried.',
              );
          }
          const day = new Date();
          day.setUTCHours(0, 0, 0, 0);
          const usage = await tx.generationUsage.upsert({
            where: { userId_day: { userId, day } },
            create: { userId, day, count: 1 },
            update: { count: { increment: 1 } },
          });
          if (usage.count > config.MAX_GENERATIONS_PER_USER_DAY)
            throw new HttpError(
              429,
              'DAILY_LIMIT',
              'You have reached the daily AI message limit. Please try again tomorrow.',
            );
          const sequence =
            (
              await tx.message.aggregate({
                where: { chatId },
                _max: { sequence: true },
              })
            )._max.sequence ?? 0;
          const user =
            previous ??
            (await tx.message.create({
              data: {
                chatId,
                role: 'USER',
                sequence: sequence + 1,
                clientMessageId,
                contentJson,
                plainText: plainText(contentJson).trim(),
                status: 'COMPLETED',
              },
            }));
          const generationId = randomUUID();
          const pending = assistant
            ? await tx.message.update({
                where: { id: assistant.id },
                data: {
                  status: 'PENDING',
                  plainText: '',
                  contentJson: Prisma.DbNull,
                  modelId: null,
                  failureCode: null,
                  generationId,
                },
              })
            : await tx.message.create({
                data: {
                  chatId,
                  role: 'ASSISTANT',
                  sequence: sequence + 2,
                  status: 'PENDING',
                  generationId,
                },
              });
          await tx.chat.update({
            where: { id: chatId },
            data: { updatedAt: new Date() },
          });
          return { user, assistant: pending, replay: false as const };
        },
        { maxWait: 10000, timeout: 15000 },
      );
    },
    async history(chatId: string, sequence: number) {
      const messages = await database.message.findMany({
        where: { chatId, sequence: { lt: sequence }, status: 'COMPLETED' },
        orderBy: { sequence: 'desc' },
        take: config.MAX_HISTORY_MESSAGES,
      });
      let size = 0;
      return messages
        .filter((message) => {
          size += message.plainText.length;
          return size <= 24000;
        })
        .reverse()
        .map((message) => ({
          role:
            message.role === 'USER'
              ? ('user' as const)
              : ('assistant' as const),
          content: message.plainText,
        }));
    },
    async finish(
      id: string,
      generationId: string | null,
      data: {
        status: 'COMPLETED' | 'FAILED';
        contentJson: RichNode;
        plainText: string;
        modelId: string | null;
        failureCode: string | null;
      },
    ) {
      return database.$transaction(async (tx) => {
        const updated = await tx.message.updateMany({
          where: { id, generationId, status: 'PENDING' },
          data,
        });
        if (updated.count) {
          const message = await tx.message.findUniqueOrThrow({ where: { id } });
          await tx.chat.updateMany({
            where: { id: message.chatId },
            data: { updatedAt: new Date() },
          });
        }
        return updated.count === 1;
      });
    },
  };
}
