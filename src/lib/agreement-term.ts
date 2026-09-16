/**
 * A master agreement has a term, a standing and a signature, and until
 * now it had none of the three.
 *
 * ── What was wrong ───────────────────────────────────────────────────
 *
 * `MasterAgreement` carried one date — `signedAt` — that somebody typed,
 * with no signer behind it, no expiry, no standing and no trail. So:
 *
 *   - an agreement could not run out, and nothing stopped a contract
 *     being written under paper that lapsed two years ago;
 *   - an agreement somebody tore up stayed live-looking forever, and its
 *     capacity and margin floor kept enforcing;
 *   - the terms were overwritten in place, so "what were the payment days
 *     on 3 March" — the only question that matters in a dispute — had no
 *     answer at all.
 *
 * This file is the arithmetic for the first two. It has no database in
 * it: every function takes the row's fields and a clock and returns a
 * verdict or a sentence. The routes do the writing.
 *
 * ── Why the term warns and never blocks ──────────────────────────────
 *
 * Addendum E is explicit about where a block is allowed: tenure, break in
 * service, work authorization, lapsed supplier insurance, segregation of
 * duties. An expired master agreement is none of those. It is a
 * commercial fact, and refusing to let a firm trade on it produces the
 * deal done in email — which is the outcome the control exists to
 * prevent, and which leaves no trail at all.
 *
 * So a lapsed agreement warns loudly, is counted, is watched nightly and
 * is told to somebody before it lapses. It is never silently permitted
 * and it never refuses. The alternative — BLOCK — is the founder's call
 * to make, and if he makes it the one place to change is
 * `lapseFinding`'s severity plus a gate at award.
 *
 * Owned with `app/api/program/agreements`. Tested by
 * `__tests__/invariants/agreement-term.test.ts`.
 */

// ── The words ─────────────────────────────────────────────────────────

/**
 * DRAFT is the placeholder the award path writes when a deal is done
 * before the paper exists. It is not an agreement anybody negotiated and
 * it should never read as one.
 */
export type AgreementStatus = 'DRAFT' | 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'TERMINATED'

export type RenewalKind = 'FIXED' | 'EVERGREEN' | 'AUTO_RENEW'

export const AGREEMENT_STATUSES: AgreementStatus[] = [
  'DRAFT',
  'ACTIVE',
  'EXPIRING',
  'EXPIRED',
  'TERMINATED',
]

export const RENEWAL_KINDS: RenewalKind[] = ['FIXED', 'EVERGREEN', 'AUTO_RENEW']

/** What each standing means, to somebody who has never seen this screen. */
export const STATUS_SAYS: Record<AgreementStatus, string> = {
  DRAFT: 'Recorded so a contract has something to hang on. Nobody has papered it.',
  ACTIVE: 'In force. Work may be written under it.',
  EXPIRING: 'In force, and running out inside three months.',
  EXPIRED: 'The term ran out. Anything written under it now is written under lapsed paper.',
  TERMINATED: 'Somebody ended it. Nothing new may be written under it.',
}

/**
 * How far along the lifecycle each standing sits.
 *
 * The calendar may only ever move an agreement forward. Without this a
 * nightly job would promote a draft to active the moment somebody typed a
 * far-off expiry date, and would flap an expired agreement back to active
 * on the day an amendment moved the date.
 */
const ORDER: Record<AgreementStatus, number> = {
  DRAFT: 0,
  ACTIVE: 0,
  EXPIRING: 1,
  EXPIRED: 2,
  TERMINATED: 3,
}

/** Three months. The window inside which somebody has to do something. */
export const EXPIRING_WINDOW_DAYS = 90

/**
 * When somebody is told, counting down. Zero is the day it lapsed.
 *
 * The same three the visa watch uses, for the same reason: ninety days is
 * enough to start a renewal, sixty is enough to chase it, thirty is enough
 * to escalate it, and nought is the news.
 */
export const EXPIRY_MILESTONES = [90, 60, 30, 0]

// ── The shape this file reasons about ─────────────────────────────────

export interface Term {
  status: string
  effectiveDate: Date | null
  expiresAt: Date | null
  renewalKind: string
  renewalMonths: number | null
  noticeDays: number | null
}

const DAY = 24 * 60 * 60 * 1000

function isStatus(value: string): value is AgreementStatus {
  return (AGREEMENT_STATUSES as string[]).includes(value)
}

export function isRenewalKind(value: string): value is RenewalKind {
  return (RENEWAL_KINDS as string[]).includes(value)
}

/**
 * Whole days from now until the term runs out. Negative once it has.
 *
 * Null rather than a number where there is no date, because zero would
 * read as "runs out today" on every agreement nobody typed a term into —
 * a plausible wrong number on hundreds of rows at once.
 */
export function daysUntilExpiry(expiresAt: Date | null, now: Date): number | null {
  if (!expiresAt) return null
  return Math.ceil((expiresAt.getTime() - now.getTime()) / DAY)
}

// ── What the calendar says ────────────────────────────────────────────

/**
 * The standing the calendar alone would give this agreement.
 *
 * Null means the calendar has no opinion: no term on file, an evergreen
 * that rolls on until somebody gives notice, or an auto-renewing term
 * that is due to roll rather than to lapse.
 */
export function calendarStatus(term: Term, now: Date): AgreementStatus | null {
  if (!term.expiresAt) return null
  if (term.renewalKind === 'EVERGREEN') return null

  const days = daysUntilExpiry(term.expiresAt, now)!

  if (days <= 0) {
    // An auto-renewing term does not lapse when it reaches its date; it
    // rolls. Calling it expired would raise an alarm about a document
    // that says, in its own words, that this is what it does.
    if (term.renewalKind === 'AUTO_RENEW') return null
    return 'EXPIRED'
  }

  if (days <= EXPIRING_WINDOW_DAYS) return 'EXPIRING'
  return 'ACTIVE'
}

/**
 * The move the nightly job should make, or null for no move.
 *
 * Forward only, and never over a termination: an agreement somebody tore
 * up stays torn up whatever the dates say, because ending it was a
 * person's act and the calendar does not get to reverse one.
 */
export function byCalendar(term: Term, now: Date): AgreementStatus | null {
  const current = isStatus(term.status) ? term.status : 'ACTIVE'
  if (current === 'TERMINATED') return null

  const next = calendarStatus(term, now)
  if (!next) return null
  if (next === current) return null
  if (ORDER[next] <= ORDER[current]) return null
  return next
}

/**
 * Where an auto-renewing term lands when it rolls, or null where it does
 * not roll at all.
 *
 * Months, added on the calendar rather than as thirty days apiece: an
 * agreement that renews for twelve months from 29 February renews to 28
 * February, and adding 365 days would put it on the first of March in
 * three years out of four.
 */
export function renewedExpiry(term: Term, now: Date): Date | null {
  if (term.renewalKind !== 'AUTO_RENEW') return null
  if (!term.expiresAt) return null
  const months = term.renewalMonths
  if (!months || months < 1) return null
  const days = daysUntilExpiry(term.expiresAt, now)!
  if (days > 0) return null

  // Roll forward as many whole terms as it takes to get past today, so a
  // job that did not run for four months does not leave the agreement one
  // term behind.
  let next = term.expiresAt
  let guard = 0
  while (next.getTime() <= now.getTime() && guard < 120) {
    next = addMonths(next, months)
    guard++
  }
  return next
}

/**
 * The same day, this many months on — and the last day of the month where
 * that day does not exist. 31 January plus one month is 28 February, not
 * 3 March.
 */
export function addMonths(from: Date, months: number): Date {
  const day = from.getUTCDate()
  const out = new Date(
    Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth() + months,
      1,
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds()
    )
  )
  const lastDay = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate()
  out.setUTCDate(Math.min(day, lastDay))
  return out
}

// ── The term, in a sentence ───────────────────────────────────────────

function onDay(d: Date): string {
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * What the term says, for somebody who will not open the contract.
 *
 * The blank case is the point of this function. An agreement with no term
 * recorded used to look exactly like one that runs forever, and the two
 * are opposite facts.
 */
export function termSays(term: Term, now: Date, endedAt?: Date | null): string {
  if (term.status === 'TERMINATED') {
    return endedAt
      ? `Ended on ${onDay(endedAt)}. Nothing new may be written under it.`
      : 'Ended. Nothing new may be written under it.'
  }

  const notice = term.noticeDays
    ? ` Either side may end it on ${plural(term.noticeDays, 'day', 'days')} notice.`
    : ''

  if (term.renewalKind === 'EVERGREEN') {
    return `Rolls on with no end date.${notice || ' Nothing on file says how much notice either side owes.'}`
  }

  if (!term.expiresAt) {
    return 'No term on file — nothing here says when this agreement runs out. Record the dates from the executed copy.'
  }

  const days = daysUntilExpiry(term.expiresAt, now)!

  if (days <= 0) {
    const ago = Math.abs(days)
    return `Ran out on ${onDay(term.expiresAt)}, ${plural(ago, 'day', 'days')} ago.${notice}`
  }

  if (term.renewalKind === 'AUTO_RENEW' && term.renewalMonths) {
    return (
      `Runs to ${onDay(term.expiresAt)} — ${plural(days, 'day', 'days')} — then renews ` +
      `itself for another ${plural(term.renewalMonths, 'month', 'months')}.${notice}`
    )
  }

  return `Runs to ${onDay(term.expiresAt)} — ${plural(days, 'day', 'days')}.${notice}`
}

// ── Signing ───────────────────────────────────────────────────────────

export type Party = 'VENDOR' | 'CLIENT'

export const SIGNING_METHODS = ['WET_INK', 'ELECTRONIC', 'COUNTERPART'] as const
export type SigningMethod = (typeof SIGNING_METHODS)[number]

export interface SignatureInput {
  party: string
  signerName: string
  signerTitle: string
  signedAt: Date | null
  method: string
}

export interface ExistingSignature {
  party: string
  signedAt: Date
}

export interface Verdict {
  ok: boolean
  /** What is missing and what to do, in a sentence. Never a bare code. */
  says: string
}

/**
 * Whether this signature may be recorded.
 *
 * Every refusal names the thing that is missing and the next move. A seat
 * that reads "INVALID_SIGNATURE" learns nothing it can act on.
 */
export function maySign(
  input: SignatureInput,
  existing: ExistingSignature[],
  status: string,
  now: Date
): Verdict {
  if (status === 'TERMINATED') {
    return {
      ok: false,
      says:
        'This agreement was ended, so a signature cannot be added to it. ' +
        'Record the new agreement and sign that instead.',
    }
  }

  if (input.party !== 'VENDOR' && input.party !== 'CLIENT') {
    return {
      ok: false,
      says: 'Say which side signed — the supplier or the client.',
    }
  }

  if (existing.some((s) => s.party === input.party)) {
    const side = input.party === 'VENDOR' ? 'supplier' : 'client'
    return {
      ok: false,
      says:
        `The ${side} has already signed this agreement. To correct who signed, ` +
        `record an amendment rather than a second signature.`,
    }
  }

  if (!input.signerName.trim()) {
    return {
      ok: false,
      says: 'Name the person who signed. A signature with nobody behind it proves nothing.',
    }
  }

  if (!input.signerTitle.trim()) {
    return {
      ok: false,
      says:
        'Give the signer’s title. Whether they had authority to sign is the ' +
        'first thing anybody asks, and a title is the only thing on file that speaks to it.',
    }
  }

  if (!input.signedAt || Number.isNaN(input.signedAt.getTime())) {
    return { ok: false, says: 'Give the date on the paper.' }
  }

  if (input.signedAt.getTime() > now.getTime() + DAY) {
    return {
      ok: false,
      says: 'That date is in the future. Record the date printed on the executed copy.',
    }
  }

  if (!(SIGNING_METHODS as readonly string[]).includes(input.method)) {
    return { ok: false, says: 'Say how it was signed — wet ink, electronically, or in counterparts.' }
  }

  return { ok: true, says: `Recorded ${input.signerName.trim()}’s signature.` }
}

/**
 * When the agreement became fully executed, or null while it has not.
 *
 * Both sides, and the later of the two dates — a document signed by the
 * supplier in March and counter-signed by the client in May was executed
 * in May, and dating it March claims three months of cover nobody had.
 */
export function executedOn(signatures: ExistingSignature[]): Date | null {
  const vendor = signatures.find((s) => s.party === 'VENDOR')
  const client = signatures.find((s) => s.party === 'CLIENT')
  if (!vendor || !client) return null
  return vendor.signedAt.getTime() >= client.signedAt.getTime() ? vendor.signedAt : client.signedAt
}

/** Who has signed and who has not, said plainly. */
export function signingSays(signatures: ExistingSignature[]): string {
  const vendor = signatures.some((s) => s.party === 'VENDOR')
  const client = signatures.some((s) => s.party === 'CLIENT')
  if (vendor && client) return 'Signed by both sides.'
  if (vendor) return 'Signed by the supplier and waiting on the client’s counter-signature.'
  if (client) return 'Signed by the client and waiting on the supplier’s counter-signature.'
  return 'Nobody has signed it.'
}

// ── Ending one ────────────────────────────────────────────────────────

export function mayEnd(status: string, reason: string | null | undefined): Verdict {
  if (status === 'TERMINATED') {
    return {
      ok: false,
      says: 'This agreement has already been ended. There is nothing left to end.',
    }
  }
  const why = (reason ?? '').trim()
  if (why.length < 4) {
    return {
      ok: false,
      says:
        'Say why this agreement is ending. An agreement torn up for no recorded ' +
        'reason is the one nobody can explain two years later.',
    }
  }
  return { ok: true, says: 'Ended.' }
}

/**
 * Whether the terms may still be amended.
 *
 * An ended agreement is a historical document. Changing the payment days
 * on one would rewrite what a closed engagement was billed under, which
 * is the exact thing the version trail exists to make impossible.
 */
export function mayAmend(status: string): Verdict {
  if (status === 'TERMINATED') {
    return {
      ok: false,
      says:
        'This agreement was ended, so its terms are history and cannot be changed. ' +
        'Record a new agreement for anything going forward.',
    }
  }
  return { ok: true, says: 'Amendable.' }
}

// ── What moved ────────────────────────────────────────────────────────

/**
 * The terms, in the words a contract manager would use.
 *
 * Never a column name. The trail is read by the person who signed the
 * thing, not by the schema's author, and "minMarginPct" on an audit
 * export is a finding of its own.
 */
export const TERM_WORDS: Record<string, string> = {
  paymentTerms: 'payment days',
  paymentTermsFrom: 'what the payment days run from',
  currency: 'currency',
  minMarginPct: 'the margin floor',
  capacity: 'how many people it allows',
  effectiveDate: 'the day it starts',
  expiresAt: 'the day it runs out',
  renewalKind: 'how it renews',
  renewalMonths: 'how long it renews for',
  noticeDays: 'the notice period',
  status: 'its standing',
  signedAt: 'the signature',
  executedFileName: 'the executed document',
}

/**
 * Which terms actually moved between two sets.
 *
 * Dates compare by their instant rather than by identity, so re-saving a
 * form does not record an amendment to a date nobody touched — and an
 * amendment that changed nothing is not an amendment.
 */
export function whatChanged(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): string[] {
  const out: string[] = []
  for (const key of Object.keys(TERM_WORDS)) {
    if (!(key in after)) continue
    const a = before[key]
    const b = after[key]
    if (same(a, b)) continue
    out.push(TERM_WORDS[key])
  }
  return out
}

function same(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
  if (a instanceof Date || b instanceof Date) {
    const at = a instanceof Date ? a.getTime() : a
    const bt = b instanceof Date ? b.getTime() : b
    return at === bt
  }
  if (a == null && b == null) return true
  return a === b
}

// ── What the terms were on a day ──────────────────────────────────────

export interface VersionRow {
  version: number
  changedAt: Date
}

/**
 * The version in force on a given day — the answer to the only question
 * anybody asks this table.
 *
 * Null rather than the earliest version where the day is before the
 * agreement was recorded at all. Handing back today's terms for a date
 * that predates the agreement is the plausible wrong answer: it reads as
 * an authoritative statement about a period this company has no record
 * of, and nobody audits an answer that looks confident.
 */
export function termsOn<T extends VersionRow>(versions: T[], on: Date): T | null {
  let best: T | null = null
  for (const v of versions) {
    if (v.changedAt.getTime() > on.getTime()) continue
    if (!best || v.changedAt.getTime() > best.changedAt.getTime()) best = v
    else if (best && v.changedAt.getTime() === best.changedAt.getTime() && v.version > best.version) {
      best = v
    }
  }
  return best
}

// ── Who is told, and when ─────────────────────────────────────────────

/**
 * The tightest milestone this agreement is now inside, or null for none.
 *
 * Tightest rather than every one it has crossed: with forty-five days
 * left the ninety-day warning is stale and the sixty-day one is the news.
 * The same reasoning, and the same bug already fixed once, as the visa
 * watch.
 */
export function milestoneNow(term: Term, now: Date): number | null {
  if (term.status === 'TERMINATED') return null
  if (term.renewalKind === 'EVERGREEN') return null
  if (!term.expiresAt) return null
  // An auto-renewing term that has reached its date rolls rather than
  // lapses, so there is nothing to warn anybody about.
  const days = daysUntilExpiry(term.expiresAt, now)!
  if (term.renewalKind === 'AUTO_RENEW' && days <= 0) return null

  const crossed = EXPIRY_MILESTONES.filter((m) => days <= m)
  if (crossed.length === 0) return null
  return Math.min(...crossed)
}

/** The line that goes in the notification. */
export function milestoneSays(
  counterpartyName: string,
  term: Term,
  now: Date
): { title: string; body: string } | null {
  const milestone = milestoneNow(term, now)
  if (milestone == null) return null
  const days = daysUntilExpiry(term.expiresAt, now)!

  if (days <= 0) {
    return {
      title: `The agreement with ${counterpartyName} has run out`,
      body:
        `It ran out on ${onDay(term.expiresAt!)}. Anything written under it now is ` +
        `written under lapsed paper. Renew it, or end it and record what replaces it.`,
    }
  }

  return {
    title: `The agreement with ${counterpartyName} runs out in ${plural(days, 'day', 'days')}`,
    body:
      `It runs to ${onDay(term.expiresAt!)}. Start the renewal now, or record the ` +
      `agreement that replaces it, so nothing is written under lapsed paper.`,
  }
}
