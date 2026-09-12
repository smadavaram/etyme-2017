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
    // Query logging is a development convenience and a liability under
    // load: the stress simulation issues millions of statements and
    // printing every one of them costs more than the queries do.
    // PRISMA_QUIET turns it off without pretending to be production,
    // which the auth bypass still depends on.
    log:
      process.env.NODE_ENV === 'development' && !process.env.PRISMA_QUIET
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
