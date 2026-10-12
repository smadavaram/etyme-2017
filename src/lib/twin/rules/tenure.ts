/**
 * The job twin's time-limit rule.
 *
 * The founder's brief, 2026-10-12: a headless twin acting as the program
 * manager watches the record daily and surfaces only exceptions. This is
 * the first rule it watches — the time limit, with warnings at 90, 60 and
 * 30 days before it and a breach at or past it.
 *
 * **It is the ledger read by a machine, not a second ledger.** Every day
 * here is counted by `lib/tenure-days` — the union of every supplier's
 * lines at the client, a chain's rungs counted once, the last day of a
 * line a day on site, a served break resetting the count — through the
 * same `standingAgainstLimit` and `bookedLimitDay` the award, activation,
 * extension and the tenure page read. So the day this rule names and the
 * day the door would refuse cannot disagree. Nothing is re-derived.
 *
 * **It attests, it does not decide.** A warning is a fact about the
 * record with the numbers that make it: "On site 487 days across two
 * suppliers; the 18-month time limit falls on 2026-12-11, in 60 days."
 * It never says a person must leave, and the twin may not end, extend or
 * ask anybody back (`TENURE_TWIN_ACTIONS`). Those are BLOCK decisions
 * under Addendum E and employment decisions that stay with a person.
 *
 * **The numbers are the company's.** The time limit and the break are the
 * client's own TENURE_CAP and BREAK_IN_SERVICE rules — the setting every
 * door already reads. The warning days are the company's twin rule set,
 * read through `ruleSetFor` in lib/twin/rule-set: the nightly run passes
 * them in, and a caller that passes nothing gets the same row read here.
 */

import { prisma } from '@/lib/db'
import { endClientFilter } from '@/lib/resolve-end-client'
import { recordAccess } from '@/lib/access-log'
import { mayNameSubVendors, namesForClient } from '@/lib/chain-names'
import { DEFAULT_RULE_SET, ruleSetFor } from '@/lib/twin/rule-set'
import {
  bookedLimitDay,
  linesCounted,
  standingAgainstLimit,
  type Period,
  type SiteLine,
} from '@/lib/tenure-days'

const DAY = 86_400_000

// ── The numbers ───────────────────────────────────────────────────────

/** The company's numbers for this rule. */
export interface TenureRuleSet {
  /**
   * The time limit in months. Undefined: read the company's own
   * TENURE_CAP rule, else the default. Null: the company set no limit,
   * and nothing is warned.
   */
  capMonths?: number | null
  /** Days away that reset the count. Undefined: the company's BREAK_IN_SERVICE rule. */
  breakDays?: number | null
  /** Days before the limit at which a warning fires, any order. */
  warnAtDays: readonly number[]
}

/** The default time limit where a company has set none: eighteen months. */
export const DEFAULT_TIME_LIMIT_MONTHS = 18

/**
 * The default rule set: warn at 90, 60 and 30 days, the limit and break
 * read from the company's own governance rules. The days are the twin
 * rule set's own default, so a company with no `RuleSet` row is warned on
 * the same days whichever door reads it.
 */
export const DEFAULT_TENURE_RULES: TenureRuleSet = { warnAtDays: DEFAULT_RULE_SET.tenureWarnAtDays }

// ── What the twin may do with a warning ───────────────────────────────

/**
 * The three tiers of the role contract (CLAUDE.md, "The job twin").
 * Named here as the architect's contract will carry them.
 */
export type TwinTier = 'ACTS_ALONE' | 'NEEDS_APPROVAL' | 'NEVER'

/** The action names this rule hands the role contract, with their tier and the reason. */
export const TENURE_TWIN_ACTIONS = [
  { action: 'tenure.warning.record', tier: 'ACTS_ALONE',
    why: 'Writing the warning to the twin’s ledger changes nothing about the person and can be read back.' },
  { action: 'tenure.warning.notify_program_owner', tier: 'ACTS_ALONE',
    why: 'Telling the client’s own program owner is a reminder inside the company whose rule it is.' },
  { action: 'tenure.warning.notify_supplier', tier: 'NEEDS_APPROVAL',
    why: 'A message to a supplier leaves the company; a person approves it first.' },
  { action: 'placement.end', tier: 'NEVER',
    why: 'Ending a placement is an employment decision and the time limit is a BLOCK a person enforces.' },
  { action: 'placement.extend', tier: 'NEVER',
    why: 'Extending a placement writes an end date past which the limit may fall; the contract door decides that.' },
  { action: 'alumni.ask_back', tier: 'NEVER',
    why: 'Asking somebody back is offered only by the ledger to a person, after the break, never by the twin.' },
] as const satisfies readonly { action: string; tier: TwinTier; why: string }[]

export type TenureTwinAction = (typeof TENURE_TWIN_ACTIONS)[number]['action']

/** The tier for an action. An action this rule does not name is NEVER: closed by default. */
export function tenureActionTier(action: string): TwinTier {
  return TENURE_TWIN_ACTIONS.find((a) => a.action === action)?.tier ?? 'NEVER'
}

// ── The warning ───────────────────────────────────────────────────────

export type TenureTier = 'WARN_90' | 'WARN_60' | 'WARN_30' | 'BREACH' | `WARN_${number}`

/** One line on the client's site, from any supplier at any rung. */
export interface TenureLine extends SiteLine {
  personId: string
  personName: string
  /**
   * The firm on this line, as the client may read it (`lib/chain-names`):
   * the rung the client pays by name, a lower rung only where the
   * client's agreement with the prime requires disclosure. Null where the
   * name is withheld: the days count, the sub-vendor's name is the
   * prime's to keep.
   */
  supplierName: string | null
}

export interface TenureWarning {
  personId: string
  personName: string
  tier: TenureTier
  /** The days the limit counts — since the last break served, else every day. */
  daysOnSite: number
  /** The firms the client paid for those days, by the name the client may read. */
  suppliers: string[]
  capMonths: number
  /** Whether the limit is the company's own rule or the default. */
  limitIsDefault: boolean
  /** The day the limit is reached, counted the way the block counts it. */
  limitOn: Date
  /** Days from today to that day; zero or less at or past it. */
  daysToLimit: number
  /** The numbers, in a sentence. */
  ruleCited: string
  /** Why it matters and what a person does next, in plain English. */
  rationale: string
  /** One key per person, tier and limit day, so the ledger records a tier once. */
  key: string
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
const count = (n: number, noun: string) => `${n < WORDS.length ? WORDS[n] : n} ${noun}${n === 1 ? '' : 's'}`
const isoDay = (d: Date) => d.toISOString().slice(0, 10)
const midnight = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())

/**
 * The tier a person is in, from days to the limit and the company's
 * warning days. At or past the limit is BREACH. Otherwise the narrowest
 * warning band the days fall inside — 75 days is the 90-day warning, 60
 * is the 60-day, 12 is the 30-day. Further out than the widest, nothing.
 */
export function tierFor(daysToLimit: number, warnAtDays: readonly number[]): TenureTier | null {
  if (daysToLimit <= 0) return 'BREACH'
  const bands = [...warnAtDays].filter((d) => d > 0).sort((a, b) => a - b)
  const band = bands.find((d) => daysToLimit <= d)
  return band == null ? null : (`WARN_${band}` as TenureTier)
}

/**
 * The warnings, from the lines. Pure: the caller reads the lines and
 * passes `now`.
 *
 * Only people on site today. Somebody away is the ledger's and the ask-
 * back door's question, not an exception for the twin to raise. The
 * limit day is read off the paper booked (`bookedLimitDay`): a person
 * whose contracts end before the limit has no limit day on the record,
 * and is not warned about a contract nobody signed.
 */
export function tenureWarningsFor(
  lines: TenureLine[],
  rules: { capMonths: number | null; breakDays: number | null; warnAtDays: readonly number[]; limitIsDefault?: boolean },
  now: Date = new Date()
): TenureWarning[] {
  if (rules.capMonths == null || !(rules.capMonths > 0)) return []
  const capMonths = rules.capMonths
  const limitRules = { capMonths, breakDays: rules.breakDays }
  const today = now.getTime()

  const byPerson = new Map<string, TenureLine[]>()
  for (const l of lines) byPerson.set(l.personId, [...(byPerson.get(l.personId) ?? []), l])

  const out: TenureWarning[] = []
  for (const [personId, own] of byPerson) {
    const standing = standingAgainstLimit(own, limitRules, now)
    if (!standing.onSiteNow) continue

    // The ledger's convention: an ended line stops at its end or today.
    const counted = linesCounted(own, standing)
    const booked: Period[] = counted.map((l) => ({
      startDate: l.startDate,
      endDate: l.live ? l.endDate : new Date(Math.min((l.endDate ?? now).getTime(), today)),
    }))
    const limitOn = bookedLimitDay(booked, limitRules, now)
    if (!limitOn) continue

    const daysToLimit = Math.round((midnight(limitOn) - midnight(now)) / DAY)
    const tier = standing.pastLimit ? 'BREACH' : tierFor(daysToLimit, rules.warnAtDays)
    if (!tier) continue

    const suppliers = [...new Set(counted.map((l) => l.supplierName).filter((s): s is string => !!s))].sort()
    const personName = own[0].personName
    const days = standing.countedDays
    const across = suppliers.length > 0 ? ` across ${count(suppliers.length, 'supplier')}` : ''
    const since = standing.countsFrom ? ` since a break ended ${isoDay(standing.countsFrom)}` : ''
    const which = rules.limitIsDefault ? `default ${capMonths}-month time limit` : `${capMonths}-month time limit`
    const when = daysToLimit > 0
      ? `falls on ${isoDay(limitOn)}, in ${daysToLimit} day${daysToLimit === 1 ? '' : 's'}`
      : daysToLimit === 0
        ? `falls today, ${isoDay(limitOn)}`
        : `fell on ${isoDay(limitOn)}, ${-daysToLimit} day${daysToLimit === -1 ? '' : 's'} ago`
    const ruleCited = `On site ${days} days${since}${across}; the ${which} ${when}.`
    const firms = suppliers.length ? ` (${suppliers.join(', ')})` : ''
    const rationale = tier === 'BREACH'
      ? `${personName} has reached the time limit and is still on site${firms}. Counted across every supplier, a chain counted once. ` +
        'A person decides what happens next; the twin does not end or extend the placement.'
      : `${personName} reaches the time limit in ${daysToLimit} days${firms}, counted across every supplier, a chain counted once. ` +
        'Plan the end date or the break now, while the contract dates can still change.'

    out.push({
      personId, personName, tier, daysOnSite: days, suppliers, capMonths,
      limitIsDefault: !!rules.limitIsDefault, limitOn, daysToLimit, ruleCited, rationale,
      key: `tenure:${personId}:${tier}:${isoDay(limitOn)}`,
    })
  }
  return out.sort((a, b) => a.daysToLimit - b.daysToLimit)
}

/**
 * Every time-limit warning at a client today.
 *
 * Reads the client's own TENURE_CAP and BREAK_IN_SERVICE rules (the
 * company's existing setting), falling back to eighteen months where it
 * set no limit and saying so in the citation; and every line at the
 * client — running, paused and ended, every supplier, every rung — the
 * same lines the tenure ledger reads.
 *
 * Every person read is a read of their data, so it writes an AccessLog
 * row per person, filed under the pair: `actor` — the program owner whose
 * authority the twin acts on — and the twin's kind, PROGRAM_MANAGER. A
 * reader of the trail sees the twin made the read for that person, never
 * that the person looked. The rows are awaited before any warning is
 * returned: a nightly run has no reader waiting, and a read with no row
 * behind it is the one thing the log exists to prevent. If the rows
 * cannot be written this throws, and the run reports it for this client.
 *
 * Writes nothing else. Recording a warning and telling anybody is the
 * twin runner's, through the role contract, against `TENURE_TWIN_ACTIONS`.
 */
export async function tenureWarnings(
  companyId: string,
  rules?: TenureRuleSet,
  opts: { now?: Date; actor?: { personId?: string; companyId?: string } } = {}
): Promise<TenureWarning[]> {
  const now = opts.now ?? new Date()
  if (!rules) rules = { warnAtDays: (await ruleSetFor(companyId)).tenureWarnAtDays }
  const govern = await prisma.governanceRule.findMany({
    where: { policy: { companyId, isActive: true }, isActive: true, ruleType: { in: ['TENURE_CAP', 'BREAK_IN_SERVICE'] } },
    select: { ruleType: true, parameters: true },
  })
  const capRule = govern.find((r) => r.ruleType === 'TENURE_CAP')
  const breakRule = govern.find((r) => r.ruleType === 'BREAK_IN_SERVICE')
  const ownCap = capRule ? Number((capRule.parameters as Record<string, unknown>).maxMonths ?? NaN) : NaN
  const ownBreak = breakRule ? Number((breakRule.parameters as Record<string, unknown>).breakDays ?? NaN) : NaN

  const limitIsDefault = rules.capMonths === undefined && !(ownCap > 0)
  const capMonths = rules.capMonths !== undefined ? rules.capMonths : ownCap > 0 ? ownCap : DEFAULT_TIME_LIMIT_MONTHS
  const breakDays = rules.breakDays !== undefined ? rules.breakDays : ownBreak > 0 ? ownBreak : null

  const rows = await prisma.sellContract.findMany({
    where: { ...endClientFilter(companyId), state: { in: ['IN_PROGRESS', 'ENDED', 'PAUSED'] } },
    select: {
      id: true, personId: true, clientCompanyId: true, companyId: true, startDate: true, endDate: true, state: true,
      person: { select: { name: true } },
      company: { select: { name: true } },
    },
  })

  // Whose name the program owner may read. The warning goes to the
  // client, so a firm is named through lib/chain-names: the rung the
  // client pays by name, a sub-vendor below it only where the client's
  // agreement with that prime requires disclosure. A withheld firm's days
  // still count; the firm is simply not listed.
  const disclosureTerms = await prisma.masterAgreement.findMany({
    where: { clientId: companyId },
    select: { clientId: true, vendorId: true, disclosesSubVendors: true, status: true },
  })
  const seenNames = namesForClient(
    rows.map((r) => ({
      id: r.id, personId: r.personId, companyId: r.companyId,
      companyName: r.company.name, clientCompanyId: r.clientCompanyId,
    })),
    companyId,
    (primeCompanyId: string) => mayNameSubVendors(disclosureTerms, companyId, primeCompanyId)
  )

  const personIds = [...new Set(rows.map((r) => r.personId))]
  await recordAccess(personIds, {
    actorPersonId: opts.actor?.personId,
    actorCompanyId: opts.actor?.companyId ?? companyId,
    actorKind: 'TWIN',
    actorTwinKind: 'PROGRAM_MANAGER',
    action: 'TENURE_VIEW',
    reason: 'Time-limit rule, read by the job twin for the program owner',
  })

  return tenureWarningsFor(
    rows.map((r) => ({
      personId: r.personId,
      personName: r.person.name,
      supplierName: (() => {
        const seen = seenNames.get(r.companyId)
        return seen && !seen.masked ? seen.name : null
      })(),
      startDate: r.startDate,
      endDate: r.endDate,
      live: r.state !== 'ENDED',
    })),
    { capMonths, breakDays, warnAtDays: rules.warnAtDays, limitIsDefault },
    now
  )
}
