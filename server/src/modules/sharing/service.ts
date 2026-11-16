import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Config } from '../../config.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { Database } from '../../lib/prisma.js';
import { HttpError } from '../../middleware/errors.js';
import { documentSchema, paragraph } from '../ai/content.js';

const snapshotSchema = z
  .object({
    title: z.string(),
    messages: z.array(
      z
        .object({
          role: z.enum(['USER', 'ASSISTANT']),
          contentJson: documentSchema(64000),
        })
        .strict(),
    ),
    sharedAt: z.iso.datetime(),
  })
  .strict();

export function sharingService(
  database: Database,
  config: Pick<Config, 'CLIENT_ORIGIN' | 'DATABASE_URL'>,
) {
  // Match the adapter's configured schema, including isolated integration schemas.
  const schema =
    new URL(config.DATABASE_URL).searchParams.get('schema') ?? 'public';
  const chatTable = Prisma.raw(`"${schema.replaceAll('"', '""')}"."Chat"`);
  const notFound = () =>
    new HttpError(404, 'NOT_FOUND', 'Shared conversation not found.');
  const state = (
    share: { token: string; revokedAt: Date | null; updatedAt: Date } | null,
  ) =>
    share && !share.revokedAt
      ? {
          url: new URL(`/shared/${share.token}`, config.CLIENT_ORIGIN).href,
          sharedAt: share.updatedAt.toISOString(),
        }
      : { url: null };

  async function owned(chatId: string, userId: string) {
    const chat = await database.chat.findFirst({
      where: { id: chatId, userId },
      select: { id: true },
    });
    if (!chat) throw new HttpError(404, 'NOT_FOUND', 'Conversation not found.');
  }

  // Lock the owned chat before reading its title/messages or mutating its link.
  // This serializes rotation/revocation and prevents deletion during capture.
  async function mutate(chatId: string, userId: string, revoke: boolean) {
    return database.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM ${chatTable} WHERE "id" = ${chatId}::uuid AND "userId" = ${userId} FOR UPDATE`;
      if (!rows.length)
        throw new HttpError(404, 'NOT_FOUND', 'Conversation not found.');
      if (revoke) {
        await tx.shareLink.updateMany({
          where: { chatId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return { url: null };
      }
      const chat = await tx.chat.findUniqueOrThrow({
        where: { id: chatId },
        select: {
          title: true,
          messages: {
            where: { status: 'COMPLETED' },
            orderBy: { sequence: 'asc' },
            select: { role: true, contentJson: true, plainText: true },
          },
        },
      });
      const now = new Date();
      const snapshot = {
        title: chat.title,
        messages: chat.messages.map((message) => {
          const parsed = documentSchema(64000).safeParse(message.contentJson);
          return {
            role: message.role,
            contentJson: parsed.success
              ? parsed.data
              : paragraph(message.plainText),
          };
        }),
        sharedAt: now.toISOString(),
      };
      const token = randomBytes(32).toString('base64url');
      const data = {
        token,
        snapshotJson: snapshot,
        revokedAt: null,
        updatedAt: now,
      };
      return state(
        await tx.shareLink.upsert({
          where: { chatId },
          create: { chatId, ...data },
          update: data,
        }),
      );
    });
  }

  return {
    get: async (chatId: string, userId: string) => {
      await owned(chatId, userId);
      return state(await database.shareLink.findUnique({ where: { chatId } }));
    },
    create: (chatId: string, userId: string) => mutate(chatId, userId, false),
    revoke: async (chatId: string, userId: string) => {
      await mutate(chatId, userId, true);
    },
    read: async (token: string) => {
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw notFound();
      const share = await database.shareLink.findFirst({
        where: { token, revokedAt: null },
        select: { snapshotJson: true },
      });
      if (!share) throw notFound();
      return snapshotSchema.parse(share.snapshotJson);
    },
  };
}
