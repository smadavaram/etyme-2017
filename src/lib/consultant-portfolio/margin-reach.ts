/**
 * Supply's readers of what placements make, narrowed by the Owner's grants
 * (founder, 2026-11-08: "Owner should control who should see what … by
 * team hierarchy or individual role or company as well").
 *
 * A grant of `margin.read` or `pnl.read` to one team or to somebody's own
 * work opens the yes-or-no door (`NARROWED_AT_THE_QUERY` in
 * lib/permission-grants), so every reader behind those two permissions
 * must narrow its query, or a grant for the Dayton team would open the
 * firm's whole book. This file is that narrowing for supply's readers:
 *
 *   - bench profit's people (`benchPeopleInReach`);
 *   - a bill rate printed beside one person's placement (`billRateReach`):
 *     the bill rate is `margin.read`'s field (lib/permissions), so a seat
 *     given margin on its team reads the bill rate on its team's lines and
 *     on no other;
 *   - the firm-wide money figures (`readsFirmMargin`): a concentration
 *     share or a supplier's spend is about the whole firm, so it is read
 *     only at the whole company's reach.
 *
 * The lines a reach opens are money's (`sellLinesInReach`), so supply,
 * Profitability and the placement page agree on what "her team's lines"
 * and "his own book" are. Nothing here widens: a read that fails is no
 * lines and nobody, never all of them.
 */

import { prisma } from '@/lib/db'
import { permissionScope, type ScopedCaller } from '@/lib/permission-grants'
import { marginReachFor, sellLinesInReach, teamsSay, type MarginReach } from '@/lib/money/margin-reach'
import { peopleInReach, type BenchReach } from '@/lib/bench-profit'

export interface ReachCaller extends ScopedCaller {
  person: { id: string }
}

/** Which of the firm's sell lines a seat reads a bill rate on. */
export interface LineReach {
  /** Every line at the firm. */
  all: boolean
  ids: ReadonlySet<string>
}

const NO_LINES: LineReach = { all: false, ids: new Set() }
const ALL_LINES: LineReach = { all: true, ids: new Set() }

/** Whether a reach opens this line. Pure. */
export function opensLine(reach: LineReach, sellContractId: string): boolean {
  return reach.all || reach.ids.has(sellContractId)
}

/**
 * The sell lines this seat reads a bill rate on, at its own firm: every
 * line where its role holds `margin.read` or a grant gives it for the
 * whole company; the team's lines for a team grant; the reader's own book
 * for an own-work grant; none without.
 */
export async function billRateReach(caller: ReachCaller): Promise<LineReach> {
  const companyId = caller.company?.id
  if (!companyId) return NO_LINES
  const s = await permissionScope(caller, 'margin.read')
  if (s.scope === 'COMPANY') return ALL_LINES
  if (s.scope === 'NONE') return NO_LINES
  const ids = await sellLinesInReach(companyId, s, caller.person.id)
  return ids == null ? ALL_LINES : { all: false, ids: new Set(ids) }
}

/**
 * The reader's reach over what placements make, and whether it is the
 * whole firm's. A firm-wide money figure is read only where it is.
 */
export async function readsFirmMargin(caller: ScopedCaller): Promise<{ firm: boolean; reach: MarginReach }> {
  const reach = await marginReachFor(caller)
  return { firm: reach.scope === 'COMPANY', reach }
}

/** "the Dayton team", for a sentence. */
export function teamsOf(reach: Pick<MarginReach, 'unitNames'>): string {
  return teamsSay(reach.unitNames)
}

/**
 * The refusal of a firm-wide money figure to a seat that reads margin
 * only for a team or for its own work. Pure.
 */
export function firmWideRefusal(what: string, reach: Pick<MarginReach, 'scope' | 'unitNames'>, companyName: string): string {
  const yours = reach.scope === 'UNIT' ? `for ${teamsSay(reach.unitNames)}` : 'on your own placements'
  return `${what} is a figure about the whole of ${companyName}. You read margin ${yours}, so it is read by the Owner, and by anybody the Owner gives the whole company’s margin.`
}

/**
 * Whose people a bench profit reader sees at this firm: null for the
 * whole bench, otherwise the set (`peopleInReach`, pure, decides).
 */
export async function benchPeopleInReach(
  companyId: string,
  reach: { scope: BenchReach; unitIds: readonly string[] },
  readerPersonId: string
): Promise<Set<string> | null> {
  if (reach.scope === 'COMPANY') return null
  if (reach.scope === 'NONE') return new Set()
  try {
    const lines = (await sellLinesInReach(companyId, { scope: reach.scope, unitIds: [...reach.unitIds] }, readerPersonId)) ?? []
    const [onLines, seated, putForward] = await Promise.all([
      lines.length
        ? prisma.sellContract.findMany({ where: { companyId, id: { in: lines } }, select: { personId: true } })
        : Promise.resolve([] as { personId: string }[]),
      reach.scope === 'UNIT' && reach.unitIds.length
        ? prisma.context.findMany({ where: { companyId, orgUnitId: { in: [...reach.unitIds] }, revokedAt: null }, select: { personId: true } })
        : Promise.resolve([] as { personId: string }[]),
      reach.scope === 'PERSON'
        ? prisma.submission.findMany({ where: { submittedById: readerPersonId, fromCompanyId: companyId }, select: { personId: true }, take: 5000 })
        : Promise.resolve([] as { personId: string }[]),
    ])
    return peopleInReach({
      scope: reach.scope,
      onLinesInReach: onLines.map((l) => l.personId),
      seatedInUnits: seated.map((c) => c.personId),
      putForwardByReader: putForward.map((s) => s.personId),
      readerPersonId,
    })
  } catch {
    return new Set()
  }
}
