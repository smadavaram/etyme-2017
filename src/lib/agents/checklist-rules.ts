/**
 * The arithmetic of chains 3 and 6 (record 112): checklist items with an
 * agreed value against an actual one, the papers of one petition, and the
 * working-day periods of a posted notice and a public access file. Pure:
 * no database, so every branch is a unit test.
 *
 * Nothing here decides anything about a person, signs, files or publishes.
 * A rule that has not been confirmed by regulatory with its source warns
 * and never blocks; none of these blocks.
 */

import { formatDay } from '@/lib/format-date'
import { amount as money } from '@/lib/money-display'
import { isDayOff } from '@/lib/days-off'

// ── Proposals, awaiting the owner or regulatory. Nobody has decided these numbers. ──

/** PROPOSED: the onboarding pack card goes to HR this many days before a start. */
export const PROPOSED_PACK_LEAD_DAYS = 5
/** PROPOSED (the spec says ten business days): a notice stays up this many working days. */
export const PROPOSED_NOTICE_WORKING_DAYS = 10
/** PROPOSED (the spec says one working day): the public access file is ready this many working days after the filing. */
export const PROPOSED_ACCESS_FILE_WORKING_DAYS = 1

const DAY_MS = 86_400_000
const key = (d: Date) => d.toISOString().slice(0, 10)
export const dayStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

/** Whether a day is a working day: not one of the firm's days off, not on its holiday calendar. Pure. */
export function isWorkingDay(d: Date, daysOff: readonly number[], holidays: ReadonlySet<string>): boolean {
  return !isDayOff(d, daysOff) && !holidays.has(key(d))
}

/**
 * The day that is `n` working days after `from`. Day zero is `from` itself,
 * whatever it is; each following working day counts one. Pure.
 */
export function addWorkingDays(from: Date, n: number, daysOff: readonly number[], holidays: ReadonlySet<string>): Date {
  const d = dayStart(from)
  let left = n
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1)
    if (isWorkingDay(d, daysOff, holidays)) left--
  }
  return d
}

/** Whole calendar days from one day to another, negative once past. Pure. */
export function daysFromTo(from: Date, to: Date): number {
  return Math.round((dayStart(to).getTime() - dayStart(from).getTime()) / DAY_MS)
}

// ── Contracts checklist ─────────────────────────────────────────────

export const CONTRACT_LABELS = {
  RATE: 'Bill rate',
  TERMS: 'Payment terms',
  WINDOW: 'Line dates inside the order',
} as const
export type ContractLabel = (typeof CONTRACT_LABELS)[keyof typeof CONTRACT_LABELS]

/** What a placement's line, its agreement and its order say, as the checklist reads them. */
export interface LineFacts {
  billRateCents: number
  billCurrency: string
  paymentTerms: number
  startDate: Date
  endDate: Date | null
  /** The master agreement the line sits under, where it has one. */
  msa: { paymentTerms: number } | null
  /** The order the line bills under, where it is on one. */
  order: { number: string; startDate: Date; endDate: Date | null } | null
}

export interface Wanted {
  label: ContractLabel
  /** What the paper says now: the agreed value the first time the item is listed. */
  firstAgreed: string
  /** What the line says now. */
  actual: string
}

export const rateWords = (cents: number, currency: string) => `${money(cents, currency)} an hour`
const windowOf = (start: Date, end: Date | null) => `${key(start)}..${end ? key(end) : ''}`
export const windowWords = (w: string) => {
  const [a, b] = w.split('..')
  return `${formatDay(a)} to ${b ? formatDay(b) : 'no end date'}`
}
const termsWords = (days: number) => `Net ${days}`

/**
 * The items a placement's checklist holds, from what exists on the record.
 * An MSA line appears only where the line sits under an agreement, an order
 * line only where it bills under an order. Nothing is invented for a paper
 * that is not there. Pure.
 */
export function contractItemsFor(f: LineFacts): Wanted[] {
  const items: Wanted[] = [
    { label: CONTRACT_LABELS.RATE, firstAgreed: rateWords(f.billRateCents, f.billCurrency), actual: rateWords(f.billRateCents, f.billCurrency) },
  ]
  if (f.msa) items.push({ label: CONTRACT_LABELS.TERMS, firstAgreed: termsWords(f.msa.paymentTerms), actual: termsWords(f.paymentTerms) })
  if (f.order) items.push({ label: CONTRACT_LABELS.WINDOW, firstAgreed: windowOf(f.order.startDate, f.order.endDate), actual: windowOf(f.startDate, f.endDate) })
  return items
}

/** Whether a line's window lies inside an order's, both as "start..end" with an empty end for none. Pure. */
export function windowInside(line: string, order: string): boolean {
  const [ls, le] = line.split('..')
  const [os, oe] = order.split('..')
  if (ls < os) return false
  if (oe && (!le || le > oe)) return false
  return true
}

export type ItemState = 'MET' | 'DRIFT'

/** Agreed against actual. A window is judged as inside; every other value is judged as equal. Pure. */
export function judgeContractItem(label: string, agreed: string | null, actual: string | null): ItemState {
  if (agreed === null || actual === null) return 'DRIFT'
  if (label === CONTRACT_LABELS.WINDOW) return windowInside(actual, agreed) ? 'MET' : 'DRIFT'
  return agreed === actual ? 'MET' : 'DRIFT'
}

/** The value as a person reads it on a card. Pure. */
export function valueWords(label: string, v: string | null): string {
  if (v === null) return 'not recorded'
  return label === CONTRACT_LABELS.WINDOW ? windowWords(v) : v
}

export interface Drift { question: string; proof: string }

/** The card a drift opens. It says what the agent did not do. Pure. */
export function driftWords(o: { person: string; client: string; label: string; agreed: string | null; actual: string | null }): Drift {
  const agreed = valueWords(o.label, o.agreed)
  const actual = valueWords(o.label, o.actual)
  const what = o.label === CONTRACT_LABELS.WINDOW
    ? `${o.person}’s dates at ${o.client} run ${actual}, outside the order’s ${agreed}.`
    : `${o.label} for ${o.person} at ${o.client} reads ${actual} on the line. The agreed value is ${agreed}.`
  return {
    question: `${what} Look at it?`,
    proof: `${what} The agent changed nothing. The agreed value changes only when a person records a signed paper that says so, and signing is a person’s.`,
  }
}

// ── Immigration checklist ───────────────────────────────────────────

/** PROPOSED lines of one petition, one paper each. Counsel confirms the list. Signature lines route a card to the signatory seat. */
export const PETITION_LINES = [
  { label: 'Labor condition application', signature: true },
  { label: 'Petition form', signature: true },
  { label: 'Representation form', signature: true },
  { label: 'Approval notice copy', signature: false },
] as const

/** Stages after which a petition has no lines to chase. Free text on the record; these are the ends the agent knows. */
export const ENDED_PETITION_STAGES: readonly string[] = ['DENIED', 'WITHDRAWN', 'CLOSED']

/** A petition is complete only when every line is met. A waiver does not complete it: a paper the law asks for is not waived. Pure. */
export function petitionComplete(states: readonly string[]): boolean {
  return states.length > 0 && states.every((s) => s === 'MET')
}

/** The labels of petition lines still missing, for the card and the ledger. Pure. */
export function petitionMissing(items: readonly { label: string; state: string }[]): string[] {
  return items.filter((i) => i.state !== 'MET').map((i) => i.label)
}

export function signatureWords(o: { person: string; label: string }): Drift {
  return {
    question: `The ${o.label.toLowerCase()} for ${o.person}’s petition needs your signature. Is it signed?`,
    proof: `The ${o.label.toLowerCase()} for ${o.person}’s petition is waiting on a signature. Etyme files nothing and signs nothing; it passes on no paper’s contents. A person records here that the signed paper is on hand.`,
  }
}

// ── Onboarding pack ─────────────────────────────────────────────────

/** Whether a start is near enough for the pack card: today up to `lead` days ahead, never a start already past. Pure. */
export function packDue(daysUntilStart: number | null, lead: number = PROPOSED_PACK_LEAD_DAYS): boolean {
  return daysUntilStart !== null && daysUntilStart >= 0 && daysUntilStart <= lead
}

export function packWords(o: { person: string; client: string; startDate: Date; days: number; missing: string[] }): Drift {
  const when = o.days === 0 ? 'today' : o.days === 1 ? 'tomorrow' : `in ${o.days} days`
  const list = o.missing.join('; ')
  return {
    question: `${o.person} starts at ${o.client} ${when}, and ${o.missing.length === 1 ? 'one paper is' : `${o.missing.length} papers are`} still missing: ${list}. Chase them?`,
    proof: `Start day ${formatDay(o.startDate)}. Still missing: ${list}. The agent sent nothing. A start cannot happen without the papers the law asks for.`,
  }
}

// ── Compliance watch (tenure) ───────────────────────────────────────

/** The narrowest warning day already crossed, from the firm's own list (90, 60 and 30 by default); null where none is. Pure. */
export function crossedWarning(daysLeft: number, warnAtDays: readonly number[]): number | null {
  const crossed = [...warnAtDays].filter((d) => daysLeft <= d).sort((a, b) => a - b)
  return crossed.length ? crossed[0] : null
}

export function tenureWords(o: { person: string; client: string; capMonths: number; limitDay: Date; daysLeft: number }): Drift {
  const says = o.daysLeft < 0
    ? `${o.person} passed the ${o.capMonths}-month time limit at ${o.client} on ${formatDay(o.limitDay)} and is still on site.`
    : o.daysLeft === 0
      ? `${o.person} reaches the ${o.capMonths}-month time limit at ${o.client} today.`
      : `${o.person} reaches the ${o.capMonths}-month time limit at ${o.client} on ${formatDay(o.limitDay)}, in ${o.daysLeft} ${o.daysLeft === 1 ? 'day' : 'days'}.`
  return {
    question: `${says} Review the placement now?`,
    proof: `${says} Days counted are the person’s at this client across every supplier, each day once. Extending, ending or letting it run out is a person’s decision. The agent changed nothing.`,
  }
}

// ── Notice posting ──────────────────────────────────────────────────

export function noticeEndsOn(postedOn: Date, daysOff: readonly number[], holidays: ReadonlySet<string>, workingDays: number = PROPOSED_NOTICE_WORKING_DAYS): Date {
  return addWorkingDays(postedOn, workingDays, daysOff, holidays)
}

/** Whether a posting's period is over on `today`. Pure. */
export function noticePeriodOver(endsOn: Date, today: Date): boolean {
  return dayStart(today).getTime() >= endsOn.getTime()
}

export function noticeWords(o: { kind: string; site: string; postedOn: Date; endsOn: Date }): Drift {
  return {
    question: `The ${o.kind} notice posted at ${o.site} on ${formatDay(o.postedOn)} has been up its required time. Take it down and record the removal?`,
    proof: `Posted ${formatDay(o.postedOn)}. The required posting period ended ${formatDay(o.endsOn)}. A person takes the notice down and records the day. The agent removed nothing and published nothing.`,
  }
}

/** Whether a removal date is before the period ended: allowed, with a reason on the record. Pure. */
export function removedEarly(removedOn: Date, endsOn: Date): boolean {
  return dayStart(removedOn).getTime() < endsOn.getTime()
}

// ── Public access file ──────────────────────────────────────────────

export function accessFileReadyBy(filedOn: Date, daysOff: readonly number[], holidays: ReadonlySet<string>, workingDays: number = PROPOSED_ACCESS_FILE_WORKING_DAYS): Date {
  return addWorkingDays(filedOn, workingDays, daysOff, holidays)
}

export function accessFileWords(o: { person: string; readyBy: Date; today: Date }): Drift {
  const late = dayStart(o.today).getTime() > o.readyBy.getTime()
  const when = late ? `was due ${formatDay(o.readyBy)} and is not approved` : `is due ${formatDay(o.readyBy)}`
  return {
    question: `The public access file for ${o.person}’s petition ${when}. Is it ready to approve?`,
    proof: `The file is due within one working day of the filing. The agent tracks the day. A person checks it is ready and approves it; the agent publishes nothing.`,
  }
}

/** Whether an approval is after the day it was due: allowed, said plainly on the record. Pure. */
export function approvedLate(readyOn: Date, readyBy: Date): boolean {
  return dayStart(readyOn).getTime() > readyBy.getTime()
}

/** Visa classes and permits that print in capitals, letters after a hyphen included: H-1B, L-1, O-1A, TN, OPT. */
const VISA_WORD = /^([a-z])-?(\d)([a-z]?)$/i
const PERMIT_WORD = /^(tn|opt|cpt|ead|stem|ds)$/i

/**
 * A petition's kind as people write it: a visa class prints as H-1B, L-1,
 * O-1; a machine word (SPECIALTY_OCCUPATION) is turned into words; any
 * other text stays as typed. Pure.
 */
export function kindWords(kind: string): string {
  const k = kind.trim()
  const machine = /^[A-Za-z0-9]+(_[A-Za-z0-9]+)+$/.test(k) && k === k.toUpperCase()
  const words = k.replace(/_/g, ' ').split(/\s+/).map((w, i) => {
    const v = VISA_WORD.exec(w)
    if (v) return `${v[1].toUpperCase()}-${v[2]}${v[3].toUpperCase()}`
    if (PERMIT_WORD.test(w)) return w.toUpperCase()
    if (!machine) return w
    const lower = w.toLowerCase()
    return i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower
  })
  return words.join(' ')
}

/** "H-1B transfer petition": the word "petition" is added only where the kind does not already end with it. Pure. */
export function petitionWords(kind: string): string {
  const k = kindWords(kind)
  return /\bpetition$/i.test(k) ? k : `${k} petition`
}
