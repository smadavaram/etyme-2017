/**
 * Which weeks a sell line's page and a firm's Timesheets list read: the
 * weeks the bill on that line was priced on. One reader.
 *
 * ── The fault this exists for ────────────────────────────────────────
 *
 * The founder's tester, 2026-11-04 and again 2026-11-08: Helena Marsh's
 * placement at Computer Systems read "No weeks filed yet" beside 200
 * hours accepted and $23,200 invoiced, and Computer Systems' Timesheets
 * list had no row for her. Nothing dropped her weeks; they were never on
 * that line. In a chain the worker files once, on her own rung (Techpeple's
 * line to Computer Systems, CLAUDE.md 2026-09-28), and every rung above
 * bills the same signed week from there. The bill generator and the books
 * read the week at the bottom of the ladder (`whereHoursLive` in
 * lib/work-chain); the placement card read `placement.timesheets`, the
 * weeks hanging on Computer Systems' own line, which are none, and the
 * Timesheets list scoped weeks by the line's seller, which is Techpeple.
 * So the money said 200 hours and the hours said nothing.
 *
 * ── The rule ─────────────────────────────────────────────────────────
 *
 * A firm's line reads the weeks filed on the line at the bottom of its
 * ladder: its own line where the person is its own, the rung below where
 * a supplier stands between. Read down, never up, so a sub-vendor learns
 * nothing about the rungs above it. The bill generator, the books and the
 * margin read it here; the placement page and the Timesheets list are to
 * read it here too (their files are the architect's and demand's).
 */

import { prisma } from '@/lib/db'
import { whereHoursLive, type Rung } from '@/lib/work-chain'
import { ladderFor } from '@/lib/work-chain-read'

/** Pure: each of these lines, and the line its weeks are filed on. */
export function weekLinesFor(ownIds: readonly string[], rungs: readonly Rung[]): Map<string, string> {
  return new Map([...new Set(ownIds)].map((id) => [id, whereHoursLive(id, rungs)]))
}

/** Pure: the other way round — the line weeks are filed on, and which of ours bills them. */
export function billedByFor(ownIds: readonly string[], rungs: readonly Rung[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const [own, bottom] of weekLinesFor(ownIds, rungs)) out.set(bottom, own)
  return out
}

/** The line each of these sell lines' weeks are filed on. */
export async function weeksLineOf(sellContractIds: readonly string[]): Promise<Map<string, string>> {
  const ids = [...new Set(sellContractIds)]
  if (ids.length === 0) return new Map()
  return weekLinesFor(ids, await ladderFor(ids))
}

/**
 * The timesheet filter for these lines' weeks — the weeks the bill on
 * them was priced on. Spread into `prisma.timesheet.findMany({ where })`.
 */
export async function weeksWhere(sellContractIds: readonly string[]): Promise<{ sellContractId: { in: string[] } }> {
  const lines = await weeksLineOf(sellContractIds)
  return { sellContractId: { in: [...new Set(lines.values())] } }
}

/**
 * Every week a firm's own sell lines bill, wherever in the chain it was
 * filed: for the firm's Timesheets list, so a prime reads the week its
 * sub-vendor's worker filed, and its bill and its list agree.
 */
export async function firmWeeksWhere(companyId: string): Promise<{ sellContractId: { in: string[] } }> {
  const own = await prisma.sellContract.findMany({ where: { companyId }, select: { id: true } })
  return weeksWhere(own.map((l) => l.id))
}
