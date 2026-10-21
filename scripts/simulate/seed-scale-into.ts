/**
 * Seed the generated world (lib/seed-scale) into the database DATABASE_URL
 * names, then exit. Run as its own process by `world-db.ts`: the base
 * world is seeded in the same run first, and the database client is made
 * once per process with the URL it was first given, so a second database
 * needs a process of its own.
 */
import { prisma } from '@/lib/db'
import { seedScaleWorld } from '@/lib/seed-scale'

async function main() {
  const run = await seedScaleWorld()
  console.log(JSON.stringify({ done: run.done, ran: run.ran.length, skipped: run.skipped, remaining: run.remaining }))
  if (!run.done) process.exitCode = 1
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
