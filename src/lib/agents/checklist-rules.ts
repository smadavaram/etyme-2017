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

/**
 * PROPOSED, not confirmed by regulatory (record 115, gap 3): a notice dated
 * more than this many days before the filing day it is measured against is
 * flagged as early. A notice dated after that filing day is flagged as late.
 */
export const PROPOSED_NOTICE_LEAD_DAYS = 30
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
  SOW: 'Statement of work',
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
  /** The statement of work the engagement holds, passed only where one is written. */
  sow: { signedAt: Date | null } | null
}

export interface Wanted {
  label: ContractLabel
  /** What the paper says: null until a person records a signed paper, because the agent cannot know what one says. */
  firstAgreed: string | null
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
 * line only where it bills under an order, a statement of work only where
 * the engagement has one written. The bill rate has no agreed value until a
 * person records the signed paper (never the line's own rate). Nothing is invented for a paper
 * that is not there. Pure.
 */
export function contractItemsFor(f: LineFacts): Wanted[] {
  const items: Wanted[] = [
    { label: CONTRACT_LABELS.RATE, firstAgreed: null, actual: rateWords(f.billRateCents, f.billCurrency) },
  ]
  if (f.msa) items.push({ label: CONTRACT_LABELS.TERMS, firstAgreed: termsWords(f.msa.paymentTerms), actual: termsWords(f.paymentTerms) })
  if (f.order) items.push({ label: CONTRACT_LABELS.WINDOW, firstAgreed: windowOf(f.order.startDate, f.order.endDate), actual: windowOf(f.startDate, f.endDate) })
  if (f.sow) items.push({ label: CONTRACT_LABELS.SOW, firstAgreed: 'Signed', actual: f.sow.signedAt ? 'Signed' : 'Not signed' })
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

export type ItemState = 'MET' | 'DRIFT' | 'OPEN'

/**
 * Agreed against actual. A window is judged as inside; every other value is
 * judged as equal. Nothing agreed yet is OPEN (no signed paper recorded),
 * never a drift: there is nothing to differ from. Pure.
 */
export function judgeContractItem(label: string, agreed: string | null, actual: string | null): ItemState {
  if (agreed === null) return 'OPEN'
  if (actual === null) return 'DRIFT'
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
  const what = o.label === CONTRACT_LABELS.SOW
    ? `The statement of work for ${o.person} at ${o.client} is written and not signed.`
    : o.label === CONTRACT_LABELS.WINDOW
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

export type PetitionLine = (typeof PETITION_LINES)[number] | { label: string; signature: boolean }

export interface PetitionList {
  key: 'H1B' | 'GENERAL'
  lines: readonly PetitionLine[]
  /** Same shape as `lib/document-stages/countries`: read and confirmed, with its source, or not. */
  confirmed: boolean
  source: string | null
  checkedOn: string | null
  unconfirmedBecause: string | null
}

const NOT_CONFIRMED = 'Regulatory has not confirmed this list with a source.'

/**
 * One list per petition type (record 115, gap 2). Two entries only: the
 * H-1B family keeps today's four lines, and every other kind reads the
 * general list, the same without the labor condition application, which is
 * the H-1B family's paper. Regulatory adds a type's own list when it
 * confirms it with a source; nothing is guessed here. Neither is confirmed,
 * so both warn and neither blocks.
 */
export const PETITION_LISTS: Record<PetitionList['key'], PetitionList> = {
  H1B: { key: 'H1B', lines: PETITION_LINES, confirmed: false, source: null, checkedOn: null, unconfirmedBecause: NOT_CONFIRMED },
  GENERAL: { key: 'GENERAL', lines: PETITION_LINES.filter((l) => l.label !== 'Labor condition application'), confirmed: false, source: null, checkedOn: null, unconfirmedBecause: NOT_CONFIRMED },
}

/** The list a petition of this kind (free text) is drawn from. Never throws, never empty: an unknown kind reads the general list. Pure. */
export function petitionListFor(kind: string): PetitionList {
  const n = kind.toUpperCase().replace(/[\s_-]+/g, '')
  return /^(H1B(?!\d)|SPECIALTYOCCUPATION)/.test(n) ? PETITION_LISTS.H1B : PETITION_LISTS.GENERAL
}

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
  const when = packWhen(o.days)
  const list = o.missing.join('; ')
  return {
    question: `${o.person} starts at ${o.client} ${when}, and ${o.missing.length === 1 ? 'one paper is' : `${o.missing.length} papers are`} still missing: ${list}. Get them on file before day one.`,
    proof: `Start day ${formatDay(o.startDate)}. Still missing: ${list}. The agent sent nothing. A start cannot happen without the papers the law asks for.`,
  }
}

const packWhen = (days: number) => (days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`)

/**
 * The pack when every paper the start rule needs is on file: one card to HR,
 * naming each, asking it to confirm the person is ready. HR's yes is advice;
 * Activate decides the start and refuses without what the law asks for. Pure.
 */
export function packCompleteWords(o: { person: string; client: string; startDate: Date; days: number; papers: string[] }): Drift {
  const when = packWhen(o.days)
  const n = o.papers.length
  return {
    question: `${n === 1 ? `The one paper for ${o.person} is` : `All ${n} papers for ${o.person} are`} on file, and they start at ${o.client} ${when}. Confirm ready?`,
    proof: `Start day ${formatDay(o.startDate)}. On file: ${o.papers.join('; ')}. A yes here is HR’s word that the pack is complete; Activate still decides the start and still refuses without what the law asks for. The agent sent nothing and started nobody.`,
  }
}

// ── Placement record ────────────────────────────────────────────────

/**
 * The card that asks a person to read the line the award wrote and confirm
 * it. The customer is the company billed; the worksite is named only where
 * it differs (record 110). The bill rate is the firm's own figure; no buy
 * rate is ever shown. Pure.
 */
export function placementWords(o: {
  person: string; customer: string; endClient: string | null; billRateCents: number; currency: string
  startDate: Date; endDate: Date | null; suppliers: string[]
}): Drift {
  const ends = o.endDate ? `ends ${formatDay(o.endDate)}` : 'has no end day'
  return {
    question: `Confirm the placement record for ${o.person} at ${o.customer}?`,
    proof: [
      `Customer: ${o.customer}.`,
      o.endClient ? `Worksite: ${o.endClient}.` : 'Worksite: the customer’s own site.',
      `Bill rate: ${rateWords(o.billRateCents, o.currency)}.`,
      `Starts ${formatDay(o.startDate)} and ${ends}.`,
      o.suppliers.length ? `Suppliers on this firm’s own chain: ${o.suppliers.join('; ')}.` : 'No supplier below this firm on this line.',
      'A yes here is a person’s word that the line the award wrote is right; corrections are made on the contract’s own screens. The agent changed nothing and signed nothing.',
    ].join(' '),
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

export type NoticeTiming = 'ON_TIME' | 'LATE' | 'TOO_EARLY'

/**
 * Where a notice's posting day falls against the filing day a person entered
 * for it. Null where no filing day was entered: nothing is guessed. The
 * filing day on the notice's own record is the anchor, never a petition's,
 * because which filing a notice is measured against is regulatory's to say.
 * On the filing day itself is on time. Pure.
 */
export function noticeTiming(postedOn: Date, measuredFromOn: Date | null, leadDays: number = PROPOSED_NOTICE_LEAD_DAYS): NoticeTiming | null {
  if (!measuredFromOn) return null
  const before = daysFromTo(postedOn, measuredFromOn)
  if (before < 0) return 'LATE'
  return before > leadDays ? 'TOO_EARLY' : 'ON_TIME'
}

/** The card a late or early notice opens. It asks a person to check the days, accuses nobody and says what the agent did not do. Pure. */
export function noticeTimingWords(o: { kind: string; site: string; postedOn: Date; measuredFromOn: Date; timing: 'LATE' | 'TOO_EARLY'; leadDays?: number }): Drift {
  const lead = o.leadDays ?? PROPOSED_NOTICE_LEAD_DAYS
  const what = `The ${o.kind} notice posted at ${o.site} on ${formatDay(o.postedOn)} is dated ${o.timing === 'LATE' ? 'after' : `more than ${lead} days before`} the filing day it is measured against, ${formatDay(o.measuredFromOn)}.`
  return {
    question: `${what} Check the days on the record?`,
    proof: `${what} This is a proposed rule, not confirmed by regulatory. The days are as a person entered them. The agent posted, removed and changed nothing; a person checks the days.`,
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
