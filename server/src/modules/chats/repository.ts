import type { Database } from '../../lib/prisma.js';

export function chatRepository(database: Database) {
  return {
    list: (userId: string) =>
      database.chat.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
    find: (id: string, userId: string) =>
      database.chat.findFirst({ where: { id, userId } }),
    create: (userId: string, title: string) =>
      database.chat.create({ data: { userId, title } }),
    rename: (id: string, userId: string, title: string) =>
      database.chat.updateMany({ where: { id, userId }, data: { title } }),
    delete: (id: string, userId: string) =>
      database.chat.deleteMany({ where: { id, userId } }),
  };
}

export type ChatRepository = ReturnType<typeof chatRepository>;
