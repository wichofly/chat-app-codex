import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.js'

export function createPrisma(databaseUrl: string) {
  const schema = new URL(databaseUrl).searchParams.get('schema') ?? 'public'
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }, { schema }) })
}

export type Database = ReturnType<typeof createPrisma>
