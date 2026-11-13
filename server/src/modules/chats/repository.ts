import type { Database } from '../../lib/prisma.js';

export function chatRepository(database: Database) {
  const select = {
    id: true,
    userId: true,
    title: true,
    createdAt: true,
    updatedAt: true,
  } as const;
  return {
    list: (userId: string) =>
      database.chat.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 100,
        select,
      }),
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
