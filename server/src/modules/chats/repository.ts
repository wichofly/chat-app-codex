import type { Database } from '../../lib/prisma.js';
import { chatCursor, type ChatListQuery } from './pagination.js';

export function chatRepository(database: Database) {
  const select = {
    id: true,
    userId: true,
    title: true,
    createdAt: true,
    updatedAt: true,
  } as const;
  return {
    list: async (
      userId: string,
      { limit = 100, cursor }: ChatListQuery = { limit: 100 },
    ) => {
      const chats = await database.chat.findMany({
        where: {
          userId,
          ...(cursor
            ? {
                OR: [
                  { updatedAt: { lt: new Date(cursor.updatedAt) } },
                  {
                    updatedAt: new Date(cursor.updatedAt),
                    id: { lt: cursor.id },
                  },
                ],
              }
            : {}),
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        select,
      });
      const data = chats.slice(0, limit);
      const last = data.at(-1);
      return {
        data,
        nextCursor: chats.length > limit && last ? chatCursor(last) : null,
      };
    },
    find: (id: string, userId: string) =>
      database.chat.findFirst({ where: { id, userId }, select }),
    create: (userId: string, title: string) =>
      database.chat.create({ data: { userId, title }, select }),
    rename: (id: string, userId: string, title: string) =>
      database.chat.updateMany({ where: { id, userId }, data: { title } }),
    delete: (id: string, userId: string) =>
      database.chat.deleteMany({ where: { id, userId } }),
  };
}

export type ChatRepository = ReturnType<typeof chatRepository>;
