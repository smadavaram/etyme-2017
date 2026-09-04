import { PrismaClient } from '@prisma/client'

/**
 * Prisma client singleton.
 *
 * In development, hot-reload creates a new PrismaClient on every change.
 * The globalThis trick keeps a single connection pool across reloads.
 * In production, there is only one process and one client.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
