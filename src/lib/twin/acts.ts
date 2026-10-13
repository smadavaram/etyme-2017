/**
 * The one number (founder, 2026-10-12, "Ask Etyme is the app"): acts per
 * day in Ask Etyme, on the web or on Teams. Expected to climb weekly; if
 * it does not, the answers or the questions are wrong.
 *
 * An act is a person's yes or no to what the twin asked — a ledger entry
 * with actorType PERSON, surface WEB or TEAMS, and the outcome PERFORMED
 * (a yes, done) or REJECTED (a no, with its reason). Nothing the twin did
 * on its own counts, and neither does a refused answer, which changed
 * nothing. Read off the ledger, so the number can be audited line by line.
 */
import { prisma } from '@/lib/db'

export interface DayCount {
  /** The calendar day in UTC, "2026-10-12". */
  day: string
  count: number
}

const DAY_MS = 86_400_000

function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** The days, oldest first, ending today (UTC), each with its count. A day with none reads 0. */
export async function actsPerDay(companyId: string, days = 14, now: Date = new Date()): Promise<DayCount[]> {
  const n = Math.min(Math.max(Math.floor(days), 1), 90)
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const from = new Date(todayStart - (n - 1) * DAY_MS)
  const rows = await prisma.twinAction.findMany({
    where: {
      companyId,
      actorType: 'PERSON',
      surface: { in: ['WEB', 'TEAMS'] },
      outcome: { in: ['PERFORMED', 'REJECTED'] },
      ts: { gte: from },
    },
    select: { ts: true, actorType: true, surface: true, outcome: true },
  })
  const counts = new Map<string, number>()
  for (const r of rows) {
    // The query says so; read again here so the count cannot drift from the definition.
    if (r.actorType !== 'PERSON' || !['WEB', 'TEAMS'].includes(r.surface) || !['PERFORMED', 'REJECTED'].includes(r.outcome)) continue
    if (r.ts.getTime() < from.getTime()) continue
    const k = utcDay(r.ts)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return Array.from({ length: n }, (_, i) => {
    const day = utcDay(new Date(from.getTime() + i * DAY_MS))
    return { day, count: counts.get(day) ?? 0 }
  })
}
