/**
 * Which buy contract was paying for a given day's work.
 *
 * ── The bug ──────────────────────────────────────────────────────────
 *
 * `ContractLink` carries `effectiveFrom` and `effectiveTo`. Award,
 * convert and import all write them. **Nothing reads them.**
 *
 * So payroll walks every link on a buy contract and picks up every
 * timesheet on the sell contract at the other end, whatever period it
 * covers. A consultant moves from one sub-vendor to another mid-
 * assignment, the old link is closed with an `effectiveTo`, and the old
 * vendor keeps being paid for hours worked under the new one. Nobody
 * notices, because both sides reconcile cleanly against a number that
 * was wrong before either of them looked.
 *
 * `payroll/reserve` had the other half of it: `buy.sellLinks[0]`, the
 * first link in whatever order Postgres returned, when there can
 * legitimately be several.
 *
 * ── Why this splits by day rather than filtering by period ───────────
 *
 * The obvious fix is to keep only the links whose window overlaps the
 * timesheet, and it is not enough. Somebody moving sub-vendor on a
 * Wednesday leaves a Monday-to-Friday timesheet overlapping two links,
 * and an overlap filter hands the whole forty hours to both.
 *
 * A timesheet already stores `days` — the hours worked on each date —
 * so the week does not have to be treated as indivisible. Monday and
 * Tuesday belong to the old contract, Wednesday onward to the new one,
 * and each is paid exactly what it is owed.
 *
 * ── What it refuses to do ────────────────────────────────────────────
 *
 * Two links covering the same day is a contradiction: two firms claiming
 * to pay for one hour. It is reported rather than resolved. Guessing
 * would pay both, and paying both reconciles perfectly on each side
 * while being twice the right number.
 *
 * A day covered by no link is reported too. Silently dropping it is how
 * somebody works a week nobody pays for.
 */

export interface Link {
  buyContractId: string
  sellContractId: string
  effectiveFrom: Date
  /** Null means open-ended. */
  effectiveTo: Date | null
}

/** A timesheet's `days` map: ISO date to hours. */
export type Days = Record<string, number>

export interface Share {
  buyContractId: string
  /** Hours from this timesheet that fall inside this link's window. */
  hours: number
  /** The dates counted, so a person can check the arithmetic. */
  dates: string[]
}

export interface Split {
  shares: Share[]
  /** Days no link covers. Worked and unpaid by anybody. */
  uncovered: { date: string; hours: number }[]
  /** Days more than one link claims. Never resolved here. */
  contested: { date: string; hours: number; buyContractIds: string[] }[]
  /** Hours accounted for by exactly one link. */
  settled: number
  says: string
}

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

/** Whether a date falls inside a link's window. Inclusive at both ends. */
export function covers(l: Link, iso: string): boolean {
  const d = day(iso).getTime()
  if (d < startOfDay(l.effectiveFrom)) return false
  if (l.effectiveTo !== null && d > startOfDay(l.effectiveTo)) return false
  return true
}

function startOfDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/**
 * Divide a timesheet's hours between the links that were actually in
 * force on each day.
 *
 * The whole point of the file. Nothing here decides what to do about a
 * contested or uncovered day — that is a person's call, and this makes
 * both visible instead of quietly picking one.
 */
export function splitByLink(links: Link[], days: Days): Split {
  const byContract = new Map<string, Share>()
  const uncovered: Split['uncovered'] = []
  const contested: Split['contested'] = []
  let settled = 0

  for (const iso of Object.keys(days).sort()) {
    const hours = Number(days[iso]) || 0
    if (hours === 0) continue

    const hits = links.filter((l) => covers(l, iso))

    if (hits.length === 0) {
      uncovered.push({ date: iso, hours })
      continue
    }

    if (hits.length > 1) {
      // Two firms claiming one hour. Paying both reconciles perfectly on
      // each side and is twice the right number.
      contested.push({ date: iso, hours, buyContractIds: hits.map((h) => h.buyContractId) })
      continue
    }

    const id = hits[0].buyContractId
    const share = byContract.get(id) ?? { buyContractId: id, hours: 0, dates: [] }
    share.hours += hours
    share.dates.push(iso)
    byContract.set(id, share)
    settled += hours
  }

  return {
    shares: [...byContract.values()],
    uncovered,
    contested,
    settled,
    says: saysOf(byContract.size, settled, uncovered, contested),
  }
}

function saysOf(
  n: number,
  settled: number,
  uncovered: Split['uncovered'],
  contested: Split['contested']
): string {
  const parts: string[] = []
  if (settled > 0) {
    parts.push(n === 1 ? `${settled} hours on one contract.` : `${settled} hours across ${n} contracts.`)
  }
  if (uncovered.length > 0) {
    const h = uncovered.reduce((a, u) => a + u.hours, 0)
    parts.push(`${h} hours on ${uncovered.length} day${uncovered.length === 1 ? '' : 's'} no contract covers — nobody is paying for those.`)
  }
  if (contested.length > 0) {
    const h = contested.reduce((a, c) => a + c.hours, 0)
    parts.push(`${h} hours claimed by more than one contract. Somebody has to say which.`)
  }
  return parts.length > 0 ? parts.join(' ') : 'No hours on this timesheet.'
}

/**
 * Hours this one buy contract is owed from this timesheet.
 *
 * The narrow question payroll actually asks, so the six call sites do
 * not each reimplement reading `shares`.
 *
 * Contested days are excluded deliberately. A contract is owed what it
 * can be shown to be owed; the disputed remainder is somebody's decision
 * and paying it early is the expensive half of the mistake.
 */
export function hoursFor(buyContractId: string, links: Link[], days: Days): number {
  return splitByLink(links, days).shares.find((s) => s.buyContractId === buyContractId)?.hours ?? 0
}

/**
 * The single link in force for a period, where the caller genuinely
 * needs one — a reserve against a contract, say.
 *
 * Returns null rather than a guess when the answer is none or several.
 * `sellLinks[0]` is what this replaces, and it was right by luck.
 */
export function theLinkFor(links: Link[], periodStart: Date, periodEnd: Date): Link | null {
  const s = startOfDay(periodStart)
  const e = startOfDay(periodEnd)
  const hits = links.filter((l) => {
    const from = startOfDay(l.effectiveFrom)
    const to = l.effectiveTo === null ? Number.MAX_SAFE_INTEGER : startOfDay(l.effectiveTo)
    return from <= e && to >= s
  })
  return hits.length === 1 ? hits[0] : null
}

/**
 * The days map, narrowed to what this contract covers.
 *
 * The primitive most callers actually want. Payroll re-derives hours
 * from `days` when it works out a pay period, so handing it a corrected
 * total is not enough — the total gets recomputed from the full week and
 * the correction is lost. Narrowing the map itself keeps every later
 * calculation consistent with it.
 */
export function daysFor(buyContractId: string, links: Link[], days: Days): Days {
  const mine = links.filter((l) => l.buyContractId === buyContractId)
  const out: Days = {}
  for (const iso of Object.keys(days)) {
    const hits = links.filter((l) => covers(l, iso))
    // Exactly one claimant, and it is this one. A contested day belongs
    // to nobody until somebody says so.
    if (hits.length === 1 && mine.some((m) => covers(m, iso))) out[iso] = days[iso]
  }
  return out
}

/**
 * The fraction of a timesheet that belongs to one buy contract.
 *
 * For callers holding a figure that is not the raw day total — an
 * employer acceptance, say, where the employer stood behind 36 of the 40
 * hours submitted. That 36 still has to be divided when the week spans
 * two contracts, and the only defensible divider is the day breakdown
 * the person actually filed.
 *
 * Returns 1 when there is no breakdown to divide by, which keeps a
 * single-contract week exactly as it was.
 */
export function fractionFor(buyContractId: string, links: Link[], days: Days): number {
  const total = Object.values(days).reduce((a, b) => a + (Number(b) || 0), 0)
  if (total === 0) return 1
  const mine = Object.values(daysFor(buyContractId, links, days)).reduce(
    (a, b) => a + (Number(b) || 0),
    0
  )
  return mine / total
}
