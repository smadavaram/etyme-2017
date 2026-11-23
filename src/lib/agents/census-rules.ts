/**
 * The census keeper's rules (record 112, chain 1, "Win work"). Pure.
 *
 * The firm's customers and suppliers, each read as active or dormant on a
 * day. Dormant means no contract, bill or submission with that company in
 * the last 90 days. The census of a day is a pure function of the dated
 * facts, so last week's census is worked out from the same facts as of a
 * week ago, and what changed is the difference. Nothing is stored, and
 * nothing here edits a company, a register row or a money field.
 */

export const CENSUS_AGENT = 'census-keeper'
export const CENSUS_RULE = 'census-keeper-v1'

/**
 * PROPOSED, AWAITING THE OWNER. Nobody has decided how many quiet days make
 * a company dormant; 90 is the number the agent activity spec gives.
 */
export const PROPOSED_DORMANT_AFTER_DAYS = 90

export const CENSUS_QUESTION_PREFIX = 'Weekly census: '

export type Side = 'CUSTOMER' | 'SUPPLIER'
export type Standing = 'ACTIVE' | 'DORMANT'

/** What a register row says the company is to the firm: Customer above us, Supplier below us. */
export function sideOf(relationship: string): Side | null {
  if (relationship === 'CLIENT' || relationship === 'PRIME' || relationship === 'MSP') return 'CUSTOMER'
  if (relationship === 'SUPPLIER') return 'SUPPLIER'
  return null
}

export interface Window { start: Date; end: Date | null }
export interface CensusFacts {
  key: string
  name: string
  side: Side
  /** When the register row was made. Before that day the company is not in the census. */
  addedAt: Date
  /** Days with a bill, an invoice receipt or a submission, or a contract's start. */
  events: Date[]
  /** Contracts that run over a span; one covering the day keeps the company active. */
  windows: Window[]
}
export interface CensusRow { key: string; name: string; side: Side; standing: Standing; lastActivity: Date | null }

const DAY = 86_400_000
const dayOf = (d: Date) => Math.floor(d.getTime() / DAY)

/** Where one company stands on `asOf`, and the last day anything happened up to it. Pure. */
export function standingOn(f: CensusFacts, asOf: Date, dormantAfterDays: number = PROPOSED_DORMANT_AFTER_DAYS): { standing: Standing; lastActivity: Date | null } {
  const today = dayOf(asOf)
  const covered = f.windows.some((w) => dayOf(w.start) <= today && (!w.end || dayOf(w.end) >= today))
  const past = f.events.filter((e) => dayOf(e) <= today).map((e) => e.getTime())
  const spans = f.windows.filter((w) => dayOf(w.start) <= today).map((w) => (w.end && dayOf(w.end) < today ? w.end : asOf).getTime())
  const all = [...past, ...spans]
  const last = all.length ? new Date(Math.max(...all)) : null
  const recent = last !== null && today - dayOf(last) < dormantAfterDays
  return { standing: covered || recent ? 'ACTIVE' : 'DORMANT', lastActivity: last }
}

/** The census on a day: every company added by then, active or dormant. Pure. */
export function censusOn(facts: readonly CensusFacts[], asOf: Date, dormantAfterDays: number = PROPOSED_DORMANT_AFTER_DAYS): CensusRow[] {
  return facts
    .filter((f) => dayOf(f.addedAt) <= dayOf(asOf))
    .map((f) => ({ key: f.key, name: f.name, side: f.side, ...standingOn(f, asOf, dormantAfterDays) }))
    .sort((a, b) => a.side.localeCompare(b.side) || a.name.localeCompare(b.name) || a.key.localeCompare(b.key))
}

export interface Change { key: string; name: string; side: Side; says: string }

/** What moved between two censuses: new, gone dormant, active again. Pure. */
export function changesBetween(before: readonly CensusRow[], after: readonly CensusRow[]): Change[] {
  const was = new Map(before.map((r) => [r.key, r]))
  const out: Change[] = []
  for (const r of after) {
    const old = was.get(r.key)
    const who = r.side === 'CUSTOMER' ? 'customer' : 'supplier'
    if (!old) out.push({ key: r.key, name: r.name, side: r.side, says: `${r.name} is new on the census as a ${who}, ${r.standing === 'ACTIVE' ? 'active' : 'dormant'}.` })
    else if (old.standing !== r.standing) {
      out.push({
        key: r.key, name: r.name, side: r.side,
        says: r.standing === 'DORMANT'
          ? `${r.name} went dormant as a ${who}${r.lastActivity ? `: last activity ${r.lastActivity.toISOString().slice(0, 10)}` : ': nothing on record'}.`
          : `${r.name} is active again as a ${who}.`,
      })
    }
  }
  return out
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The weekly list as one ledger line. Pure. */
export function weeklyLine(rows: readonly CensusRow[], changes: readonly Change[], weekOf: Date): string {
  const part = (side: Side, word: [string, string]) => {
    const r = rows.filter((x) => x.side === side)
    return `${plural(r.length, word[0], word[1])} (${r.filter((x) => x.standing === 'ACTIVE').length} active, ${r.filter((x) => x.standing === 'DORMANT').length} dormant)`
  }
  const dormant = rows.filter((r) => r.standing === 'DORMANT').map((r) => r.name)
  const shown = dormant.slice(0, 8).join(', ')
  const more = dormant.length > 8 ? ` and ${dormant.length - 8} more` : ''
  return `Census, week of ${weekOf.toISOString().slice(0, 10)}: ${part('CUSTOMER', ['customer', 'customers'])}, ${part('SUPPLIER', ['supplier', 'suppliers'])}. ` +
    `Dormant means nothing in ${PROPOSED_DORMANT_AFTER_DAYS} days, a proposal. ` +
    `${dormant.length ? `Dormant now: ${shown}${more}. ` : ''}${changes.length ? `${plural(changes.length, 'change', 'changes')} since last week.` : 'No change since last week.'}`
}

export const censusQuestion = (changes: readonly Change[], weekOf: Date): string =>
  `${CENSUS_QUESTION_PREFIX}${plural(changes.length, 'company moved', 'companies moved')} between active and dormant, or joined, in the week of ${weekOf.toISOString().slice(0, 10)}. Read the list.`

export const censusProof = (changes: readonly Change[]): string =>
  `${changes.map((c) => c.says).join(' ')} Dormant means no contract, bill or submission in ${PROPOSED_DORMANT_AFTER_DAYS} days, which is a proposal. This list changes nothing: no company, register row or amount is edited and nothing is deleted.`
