import { z } from 'zod';

const cursorSchema = z
  .object({ updatedAt: z.iso.datetime(), id: z.uuid() })
  .strict();

export const chatListQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(100),
    cursor: z
      .string()
      .max(512)
      .transform((value, context) => {
        try {
          return cursorSchema.parse(
            JSON.parse(Buffer.from(value, 'base64url').toString('utf8')),
          );
        } catch {
          context.addIssue({
            code: 'custom',
            message: 'Invalid conversation cursor.',
          });
          return z.NEVER;
        }
      })
      .optional(),
  })
  .strict();

export type ChatListQuery = z.infer<typeof chatListQuery>;

export function chatCursor(chat: { id: string; updatedAt: Date }): string {
  return Buffer.from(
    JSON.stringify({ id: chat.id, updatedAt: chat.updatedAt.toISOString() }),
  ).toString('base64url');
}
