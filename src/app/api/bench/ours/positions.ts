import { jobApart } from '@/app/api/requisitions/words'

/**
 * The Reserve list's lines, told apart where two read the same (the
 * screen walk, 2026-11-02: two job requests with one title, at one client
 * in one city, read as identical lines nobody could choose between).
 *
 * Each line already names the client and the city, so the place is said;
 * what tells two alike apart after it is demand's own rule (`jobApart` in
 * app/api/requisitions/words): the day it starts, then the day it was
 * posted, and where nothing a person reads differs, how many are alike.
 * A line with no twin reads exactly as before. Pure.
 */
export interface PositionLine {
  key: string
  title: string
  startDate?: Date | null
  postedAt?: Date | null
}

export function apartTitles(lines: readonly PositionLine[]): Map<string, string> {
  const byTitle = new Map<string, PositionLine[]>()
  for (const l of lines) byTitle.set(l.title, [...(byTitle.get(l.title) ?? []), l])
  const out = new Map<string, string>()
  for (const l of lines) {
    const alike = byTitle.get(l.title)!
    if (alike.length < 2) { out.set(l.key, l.title); continue }
    const facts = (x: PositionLine) => ({ id: x.key, location: null, startDate: x.startDate ?? null, postedAt: x.postedAt ?? null })
    const apart = jobApart(facts(l), alike.map(facts))
    // "Java developer — Northbend Athletic, Tualatin, starting Nov 3".
    out.set(l.key, apart ? `${l.title},${apart.replace(/^,/, '')}` : l.title)
  }
  return out
}
