/**
 * The weekly overtime line a worker's pay is judged on.
 *
 * ── The founder's rule, 2026-09-29 ────────────────────────────────────
 *
 * "Yes to all": a nonexempt US worker is owed overtime after 40 hours a
 * week even where the contract sets no line, because the law sets it
 * (29 U.S.C. §207(a)(1)). Before this, a pay line whose buy and sell
 * contracts both left `overtimeAfterHours` empty paid every hour at
 * straight time — a forty-five-hour week for a nonexempt US employee
 * went out five hours of premium short, on the run, the screen, the file
 * and back pay alike.
 *
 * ── The line, in order ────────────────────────────────────────────────
 *
 *   1. The buy line's own threshold, where it sets one — what the
 *      employer agreed with the worker.
 *   2. Else the sell line's, as before: the only weekly line anybody
 *      wrote down for the placement, and the one the approval desk
 *      decided against.
 *   3. Else, for a nonexempt worker whose work is in the US, the law's
 *      forty.
 *   4. Else none, and every hour is straight time, as before.
 *
 * One addition the rule's own reason forces: a line set ABOVE forty does
 * not hold a nonexempt US worker past the law's forty. A contract cannot
 * waive the statute any more than an empty one can — so forty governs
 * and the week says why. A line at or under forty is the line's.
 *
 * ── Who the law's forty never reaches here ───────────────────────────
 *
 *   - somebody this firm does not pay as a wage — a corp-to-corp
 *     company, a sole trader, a sub-vendor's employee — whose overtime
 *     duty, if any, is whoever signs their paycheck;
 *   - an exempt worker, who keeps the contract's terms, as before;
 *   - a worker nobody has classified. Picking "nonexempt" to fill the gap
 *     would be a guess, and so would straight time: 46 hours at $96 is
 *     $4,416 at straight time and $4,704 if not exempt, $288 apart. So a
 *     week over the line is held off pay until somebody records the
 *     answer (`heldForExemption`, 2026-11-14), and then paid once, with
 *     the premium where one is owed. A week at or under the line is paid
 *     as it always was: no answer changes it;
 *   - work outside the US: the employer's record names another country's
 *     rules, or the work site, the paying entity or the pay currency is
 *     outside the US. Then the US forty is not applied and the week over
 *     forty says why.
 *
 * ── What this never touches ───────────────────────────────────────────
 *
 * The client's bill. What a client is billed for an hour past a line is
 * a term on the sell contract; the law's forty is a duty the EMPLOYER
 * owes its worker. Nothing on the billing side reads this file.
 *
 * Pure. The caller reads the rows; this says which line stands.
 */

import { saysCannotClassify, wageRuleLabel, type WageRuleName } from '@/lib/worker-classification'
import { weekStart } from '@/lib/overtime'
import { localOvertimeRuleFor } from '@/lib/money/local-overtime-rule'
import { payBands, payCut } from '@/lib/money/pay-hours'
import type { AcceptedCut } from '@/lib/periods'
import type { CutOvertime } from '@/lib/cut-overtime-choice'

/** 29 U.S.C. §207(a)(1): hours over forty in a workweek. */
export const US_WEEKLY_LINE = 40

export type LineSource = 'BUY' | 'SELL' | 'LAW' | 'NONE'

export type LineReason =
  /** A line set its own threshold, and it stands. */
  | 'LINE'
  /** Neither line set one; the worker is nonexempt and works in the US. */
  | 'LAW'
  /** A line set one past forty; the worker is nonexempt and works in the US. */
  | 'LINE_ABOVE_LAW'
  /** Not this firm's wage to pay. */
  | 'NOT_OUR_WAGE'
  /** The employer asserts the worker is exempt. */
  | 'EXEMPT'
  /** Nobody has said whether the worker is exempt. */
  | 'UNRECORDED'
  /** The employer recorded another country's rules, or none. */
  | 'NOT_US'
  /** The record says US law, and something about the work says otherwise. */
  | 'US_UNCONFIRMED'

/** What the books say about where the work is and whose law pays it. */
export interface WorkPlace {
  /** The wage rule on the employer's exempt assertion. Null where there is none. */
  wageRule: string | null
  /** The currency the worker is paid in. */
  payCurrency: string | null
  /** The country of the legal entity that pays, where the line names one. */
  entityCountry: string | null
  /** The country of the client site the work is done at, where the contract names one. */
  siteCountry: string | null
}

export interface PayLineInput {
  buyAfterHours: number | null | undefined
  sellAfterHours: number | null | undefined
  personName: string
  employerName?: string | null
  contractType: string
  /** False where somebody else employs them — a sub-vendor, or their own company. */
  weAreTheEmployer: boolean
  /** EXEMPT · NONEXEMPT · null where nobody has said. */
  exemptStatus: string | null
  where: WorkPlace
}

export interface PayLine {
  /** The weekly line pay is judged on. Null is straight time. */
  afterHours: number | null
  source: LineSource
  reason: LineReason
  /** The line a contract drew, where one did — kept for the sentence. */
  drawn: number | null
  /** What says the work is outside the US, in words. Empty where nothing does. */
  outside: string[]
  /** The wage rule the employer recorded, where it recorded one. */
  wageRule: string | null
  /**
   * True where this firm pays the person a wage and nobody has recorded
   * whether they are exempt from overtime. A week over the line is then
   * held off pay (`heldForExemption`). Absent reads as false.
   */
  exemptUnrecorded?: boolean
  /**
   * The country the work is done in, in words, where it is outside the US
   * and Etyme has no overtime rule for it (`localOvertimeRuleFor`). A week
   * over the line is then held, whatever else says the work is abroad and
   * whatever the exempt answer is: recording one never releases it.
   * Set only from the work location, never the entity or the currency.
   * Never set where the wage is not this firm's.
   */
  heldAbroad?: string | null
}

const NOT_A_WAGE_TYPES = new Set(['C2C', 'CORP_TO_CORP', 'IND_1099', '1099', 'C1099'])

const COUNTRY: Record<string, string> = {
  US: 'the US', USA: 'the US', GB: 'the UK', UK: 'the UK', IN: 'India', CA: 'Canada',
  AU: 'Australia', MX: 'Mexico', DE: 'Germany', IE: 'Ireland', PH: 'the Philippines',
}
const isUS = (c: string) => ['US', 'USA'].includes(c.trim().toUpperCase())
const countryName = (c: string) => COUNTRY[c.trim().toUpperCase()] ?? c.trim().toUpperCase()

/**
 * What on the books says the work is outside the US, in words.
 *
 * Only ever used to withhold the US forty, never to apply it: a work
 * site recorded abroad, a paying entity abroad, or pay in another
 * currency each outweigh a US wage rule that the exempt screen writes
 * whenever nobody names another.
 */
export function outsideTheUS(where: WorkPlace): string[] {
  const out: string[] = []
  if (where.siteCountry && !isUS(where.siteCountry)) out.push(`the work site is in ${countryName(where.siteCountry)}`)
  if (where.entityCountry && !isUS(where.entityCountry)) {
    out.push(`the entity that pays is in ${countryName(where.entityCountry)}`)
  }
  if (where.payCurrency && where.payCurrency.trim().toUpperCase() !== 'USD') {
    out.push(`pay is in ${where.payCurrency.trim().toUpperCase()}`)
  }
  return out
}

export function payLineFor(i: PayLineInput): PayLine {
  const buy = i.buyAfterHours ?? null
  const sell = i.sellAfterHours ?? null
  const drawn = buy ?? sell
  const source: LineSource = buy != null ? 'BUY' : sell != null ? 'SELL' : 'NONE'
  const outside = outsideTheUS(i.where)
  const asDrawn = (reason: LineReason): PayLine => ({
    afterHours: drawn,
    source,
    reason: drawn != null ? 'LINE' : reason,
    drawn,
    outside,
    wageRule: i.where.wageRule ?? null,
  })

  const type = String(i.contractType).toUpperCase()
  if (!i.weAreTheEmployer || NOT_A_WAGE_TYPES.has(type)) return asDrawn('NOT_OUR_WAGE')

  // Worked in a country Etyme has no overtime rule for: a week over the
  // line is held WHATEVER the exempt answer says (walk, 2026-11-17: "Not
  // exempt" on a held row paid 86 hours at the usual rate, $8,256 for 46
  // abroad hours at $96, with no word). Exemption is a US answer; it says
  // nothing about another country's overtime law. Only a rule recorded
  // for the country, or the work location moved, releases the week.
  const site = i.where.siteCountry
  const abroad = site && !isUS(site) && !localOvertimeRuleFor(site).known ? countryName(site) : null
  const held = abroad ? { heldAbroad: abroad } : {}

  if (i.exemptStatus == null) {
    return { ...asDrawn('UNRECORDED'), exemptUnrecorded: true, ...held }
  }
  if (i.exemptStatus !== 'NONEXEMPT') return { ...asDrawn('EXEMPT'), ...held }

  // Nonexempt. Whose law?
  const rule = i.where.wageRule ?? null
  if (rule !== 'US_FLSA') return { ...asDrawn('NOT_US'), ...held }
  if (outside.length > 0) return { ...asDrawn('US_UNCONFIRMED'), ...held }

  if (drawn == null) {
    return { afterHours: US_WEEKLY_LINE, source: 'LAW', reason: 'LAW', drawn: null, outside, wageRule: rule }
  }
  if (drawn > US_WEEKLY_LINE) {
    return { afterHours: US_WEEKLY_LINE, source: 'LAW', reason: 'LINE_ABOVE_LAW', drawn, outside, wageRule: rule }
  }
  return { afterHours: drawn, source, reason: 'LINE', drawn, outside, wageRule: rule }
}

/** Hours worked each week — the sheet’s hours less paid leave — by the Sunday the week began. */
export function weeklyWorked(
  days: Record<string, number> | null | undefined,
  leaveDays?: Record<string, number> | null
): Map<string, number> {
  const out = new Map<string, number>()
  const leave = leaveDays ?? {}
  for (const [key, h] of Object.entries(days ?? {})) {
    const day = key.slice(0, 10)
    const hours = Number(h) || 0
    const worked = Math.max(0, hours - Math.min(hours, Math.max(0, Number(leave[day] ?? leave[key] ?? 0) || 0)))
    if (worked <= 0) continue
    const w = weekStart(day)
    out.set(w, Math.round(((out.get(w) ?? 0) + worked) * 100) / 100)
  }
  return out
}

const longDay = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })

const hrs = (n: number) => `${n} ${n === 1 ? 'hour' : 'hours'}`

/**
 * What the line means for the weeks that went over forty, in sentences a
 * payroll clerk can act on. Null where nothing needs saying — no week
 * went over forty, or the line is simply the contract's own.
 */
export function payLineSays(
  line: PayLine,
  who: { personName: string; employerName?: string | null },
  worked: Map<string, number>
): string | null {
  const name = who.personName
  const employer = who.employerName ?? 'The employer'
  const over = [...worked.entries()]
    .filter(([, h]) => h > US_WEEKLY_LINE)
    .sort((a, b) => a[0].localeCompare(b[0]))
  if (over.length === 0) return null

  // A week worked where Etyme has no overtime rule is held over the line,
  // whatever else is recorded; "paid at straight time" would be untrue.
  if (line.heldAbroad) {
    const weeks = over.map(([w, h]) => `${hrs(h)} in the week of ${longDay(w)}`).join(', ')
    return (
      `${name} worked ${weeks} in ${line.heldAbroad}, and Etyme has no overtime rule recorded for ${line.heldAbroad}. ` +
      `A week accepted over ${US_WEEKLY_LINE} hours is held, whether or not ${name} is exempt. ` +
      `It is paid once a rule is recorded or the work location is moved.`
    )
  }

  switch (line.reason) {
    case 'LAW':
      // The law is 29 U.S.C. §207(a)(1); the clerk reads what it means.
      return (
        `${name} is not exempt and works in the US, so hours over ${US_WEEKLY_LINE} in a week are paid ` +
        `at time and a half. Neither contract sets its own overtime line.`
      )
    case 'LINE_ABOVE_LAW':
      return (
        `${name}'s contract sets overtime after ${line.drawn} hours a week. ${name} is not exempt and works ` +
        `in the US, where overtime starts after ${US_WEEKLY_LINE} hours, and a contract cannot set it later. ` +
        `So hours over ${US_WEEKLY_LINE} are paid as overtime.`
      )
    case 'UNRECORDED': {
      // Nobody has said whether the person is exempt, and something says
      // the work is outside the US. The week is not held, because the US
      // forty is not applied, and the row says so rather than nothing
      // (found by hand, 2026-11-14: 46 hours at $96 paid $4,416 silently).
      if (line.outside.length > 0) {
        const weeks = over.map(([w, h]) => `${hrs(h)} in the week of ${longDay(w)}`).join(', ')
        return (
          `${name} worked ${weeks}. The US ${US_WEEKLY_LINE}-hour overtime line is not applied, because ` +
          `${line.outside.join(' and ')}. Nobody has recorded whether ${name} is exempt, or which ` +
          `country's overtime rules apply. Neither contract sets an overtime line, so every hour is paid at straight time.`
        )
      }
      return over
        .map(([weekOf, h]) => {
          // The existing sentence, up to the part about the payroll file:
          // with no line on either contract the week is paid as it always
          // was, so saying it was left off would be untrue.
          const existing = saysCannotClassify(name, weekOf, Math.round((h - US_WEEKLY_LINE) * 100) / 100, who.employerName ?? 'The employer')
          const cut = existing.indexOf(' The week is left off')
          const head = cut > 0 ? existing.slice(0, cut) : existing
          return (
            `${head} Neither contract sets an overtime line, so they are paid at straight time, as before, ` +
            `until somebody records it.`
          )
        })
        .join(' ')
    }
    case 'NOT_US':
    case 'US_UNCONFIRMED': {
      const weeks = over.map(([w, h]) => `${hrs(h)} in the week of ${longDay(w)}`).join(', ')
      const tail = 'Neither contract sets an overtime line, so every hour is paid at straight time.'
      if (line.reason === 'US_UNCONFIRMED') {
        return (
          `${name} worked ${weeks}. ${employer}'s record says US wage law governs ${name}'s pay, but ` +
          `${line.outside.join(' and ')}, so the US ${US_WEEKLY_LINE}-hour overtime line is not applied until ` +
          `somebody records which country's rules govern. ${tail}`
        )
      }
      const rule = line.wageRule as WageRuleName | null
      const under =
        rule && rule !== 'DEFAULT'
          ? `recorded ${name}'s work under the ${wageRuleLabel(rule)}, not US law`
          : `has recorded no country's wage rules for ${name}'s work`
      return `${name} worked ${weeks}. The US ${US_WEEKLY_LINE}-hour overtime line is not applied, because ${employer} ${under}. ${tail}`
    }
    default:
      return null
  }
}

/**
 * The line for one person on one buy line, read off the rows every pay
 * reader already loads: the buy line, the sell line the hours are on,
 * the person's own pay currency, and the employer's exempt assertion.
 */
export function payLineOn(
  bc: {
    overtimeAfterHours: number | null
    contractType: string
    vendorCompanyId: string | null
    supplierSellContractId: string | null
    payCurrency?: string | null
    entity?: { country: string | null } | null
    company?: { name: string } | null
  },
  sell: { overtimeAfterHours: number | null; workLocation?: { country: string | null } | null } | null | undefined,
  person: { name: string; payCurrency?: string | null },
  row: { status: string; wageRule?: string | null } | null | undefined
): PayLine {
  return payLineFor({
    buyAfterHours: bc.overtimeAfterHours,
    sellAfterHours: sell?.overtimeAfterHours ?? null,
    personName: person.name,
    employerName: bc.company?.name ?? null,
    contractType: bc.contractType,
    // Ours to pay as a wage only where nobody sits between us and the worker.
    weAreTheEmployer: !bc.vendorCompanyId && !bc.supplierSellContractId,
    exemptStatus: row?.status ?? null,
    where: {
      wageRule: row ? (row.wageRule ?? null) : null,
      payCurrency: person.payCurrency ?? bc.payCurrency ?? null,
      entityCountry: bc.entity?.country ?? null,
      siteCountry: sell?.workLocation?.country ?? null,
    },
  })
}

// ── A week held until somebody says whether the person is exempt ──────
//
// The skeptic's figures, 2026-11-14, worked by hand:
//   46 hours at $96: not exempt 40 x 96 + 6 x 144 = $4,704; exempt or at
//   straight time 46 x 96 = $4,416. Paid at straight time, $288 short.
//   46 hours at $45: not exempt 1,800 + 6 x 67.50 = $2,205; straight
//   time $2,070. $135 short.
// Straight time was the figure paid while nobody had said. A plausible
// wrong figure is worse than a blank, so the week is held off the run,
// the pay file and the period total, and the row says why in words.

/** One week held off pay because nobody has said whether the person is exempt. */
export interface HeldWeek {
  /** The Sunday the week began, ISO. */
  weekOf: string
  /** Hours worked that week, as accepted. Paid leave is not worked. */
  workedHours: number
  /** Of them, hours over the line a person not exempt is judged on. */
  overHours: number
  /** The country, in words, where the week was worked and Etyme has no overtime rule for it. Absent for a home week. */
  workedIn?: string
}

/**
 * The line a week would be judged on if the person is not exempt: the
 * contract's own where it is at or under forty, else the law's forty.
 */
function lineIfNotExempt(line: PayLine): number {
  return line.drawn != null && line.drawn <= US_WEEKLY_LINE ? line.drawn : US_WEEKLY_LINE
}

/**
 * The weekly line a reader judges the week on, so a week over it can be
 * held: the line a person not exempt is judged on, where nobody has said
 * whether they are exempt and nothing says the work is outside the US;
 * else the pay line's own. The payroll file judges on this, and the wage
 * rules then leave a held week off the file in their own sentence.
 */
export function judgedLine(line: PayLine): number | null {
  if (line.heldAbroad) return lineIfNotExempt(line)
  if (line.exemptUnrecorded && line.outside.length === 0) return lineIfNotExempt(line)
  return line.afterHours
}

/**
 * Every week of a sheet held off pay because nobody has recorded whether
 * the person is exempt, or because it was worked in a country Etyme has
 * no overtime rule for (held whatever the exempt answer). Otherwise empty
 * where the answer is recorded, where the
 * wage is not this firm's, where anything says the work is outside the
 * US, or where no week as accepted goes over the line. Judged on the
 * hours the employer accepted, cut under the pay line's own rule, so a
 * week accepted at 40 of 46 is not held: it is straight time either way.
 */
export function heldForExemption(i: {
  line: PayLine
  /** The days as filed on this pay line. */
  days: Record<string, number> | null | undefined
  leaveDays?: Record<string, number> | null
  /** What the employer accepted on these days (`paySheet`'s `accepted`). Null pays every hour filed. */
  accepted: AcceptedCut | null
  cutOvertime: CutOvertime
}): HeldWeek[] {
  // Work abroad holds only where the work LOCATION's country has no rule
  // recorded, and then whatever the exempt answer is: recording one never
  // releases it. The entity country and the pay currency are the home
  // employment and never hold or release a week (decisions/92, answer 4).
  const workedIn = i.line.heldAbroad ?? null
  if (!i.line.exemptUnrecorded && !workedIn) return []
  if (i.line.outside.length > 0 && !workedIn) return []
  if (!i.days || Object.keys(i.days).length === 0) return []
  const at = lineIfNotExempt(i.line)
  const cut = payCut(payBands(i.days, i.leaveDays ?? null, at), i.accepted, at, i.cutOvertime)
  return cut.weeks
    .filter((w) => w.over > 0)
    .map((w) => ({ weekOf: w.weekOf, workedHours: Math.round((w.regular + w.over) * 100) / 100, overHours: w.over, ...(workedIn ? { workedIn } : {}) }))
    .sort((a, b) => a.weekOf.localeCompare(b.weekOf))
}

/** The days to pay with the held weeks taken out, and how many hours that took out. */
export function withoutHeldWeeks(
  days: Record<string, number>,
  held: readonly HeldWeek[]
): { days: Record<string, number>; hoursHeld: number } {
  if (held.length === 0) return { days, hoursHeld: 0 }
  const weeks = new Set(held.map((h) => h.weekOf))
  const out: Record<string, number> = {}
  let hoursHeld = 0
  for (const [k, h] of Object.entries(days)) {
    if (weeks.has(weekStart(k.slice(0, 10)))) hoursHeld += Number(h) || 0
    else out[k] = h
  }
  return { days: out, hoursHeld: Math.round(hoursHeld * 100) / 100 }
}

/**
 * What a payroll person reads on the row for each held week, and the step
 * that releases it. Null where nothing is held.
 */
export function heldSays(personName: string, held: readonly HeldWeek[]): string | null {
  if (held.length === 0) return null
  const home = held.filter((h) => !h.workedIn)
  const abroad = held.filter((h) => h.workedIn)
  const parts: string[] = []
  if (home.length > 0) {
    const weeks = home.map((h) => `${personName}'s week of ${longDay(h.weekOf)}, ${hrs(h.workedHours)}, is held off this pay.`)
    parts.push(
      `${weeks.join(' ')} Nobody has recorded whether ${personName} is exempt from overtime. ` +
      `Whoever runs payroll records it on this row. The week is then paid once, with any overtime owed.`
    )
  }
  for (const h of abroad) parts.push(heldAbroadSays(personName, h))
  return parts.join(' ')
}

/** The sentence for a week held because the country it was worked in has no overtime rule recorded. */
export function heldAbroadSays(personName: string, h: HeldWeek): string {
  return (
    `${personName}'s week of ${longDay(h.weekOf)} is held: ${hrs(h.workedHours)} worked in ${h.workedIn}, ` +
    `and Etyme has no overtime rule recorded for ${h.workedIn}. No screen records a country's rule yet. ` +
    `Recording whether ${personName} is exempt does not release it. ` +
    `The week is paid once, when a rule is recorded or the work location is moved.`
  )
}

/**
 * A week paid at straight time before the person was recorded as not
 * exempt, and the overtime premium still owed on it. The run pays it
 * once Calculate covers it; the row says so first, never silently.
 */
export function owedSinceRecordedSays(
  personName: string,
  weeks: ReadonlyArray<{ weekOf: string; premiumCents: number }>,
  money: (cents: number) => string
): string | null {
  const owed = weeks.filter((w) => w.premiumCents > 0).sort((a, b) => a.weekOf.localeCompare(b.weekOf))
  if (owed.length === 0) return null
  return owed
    .map((w) =>
      `${personName}'s week of ${longDay(w.weekOf)} was paid at straight time before the answer on overtime was recorded. ` +
      `${money(w.premiumCents)} of overtime is still owed.`
    )
    .join(' ') + ' Calculate, then pay it with this period.'
}
