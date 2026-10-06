import { prisma } from '@/lib/db'
import type { DoorFacts } from './seats'

/**
 * The day Karthik Menon's last contract at Teleworld ended, from the
 * record. Null where the world is not seeded or the database does not
 * answer — the door then says nothing about when, rather than a guess.
 */
export async function karthikLastDay(): Promise<Date | null> {
  try {
    const last = await prisma.sellContract.findFirst({
      where: {
        person: { name: 'Karthik Menon' }, company: { slug: 'world-teleworld' },
        endDate: { not: null, lte: new Date() },
      },
      orderBy: { endDate: 'desc' },
      select: { endDate: true },
    })
    return last?.endDate ?? null
  } catch {
    return null
  }
}

/** Every fact a door on /demo reads from the record. */
export async function doorFacts(): Promise<DoorFacts> {
  return { karthikLastDay: await karthikLastDay() }
}
