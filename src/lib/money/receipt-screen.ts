/**
 * What the Accounts payable screen offers on one invoice receipt, and the
 * sentences it says instead of a button. No database.
 *
 * The server already decides every one of these — the intake, the
 * waiver, the cancel door and the payment each refuse in a sentence. The
 * screen used none of them: it had no Waive, no Cancel and no lines, so
 * the work was reachable only through the API. This file is the screen's
 * half: from the receipt's state, its check as it stands now and the
 * reader's role, which doors are drawn, and where one is not, why.
 *
 * Two rules it keeps, so a button never offers what the route refuses:
 *
 *   · Waive is drawn only on a check failing now that the rules let
 *     somebody waive (`OVERRIDABLE`), and only to a role that pays
 *     (`waiveDesk`). Everybody else reads who may.
 *   · Cancel is drawn only on a receipt nothing has been paid on and no
 *     payment run is holding — the same two refusals as the cancel door.
 */

import { CHECK_NAME, OVERRIDABLE, type MatchCheck, type MatchCode } from '@/lib/three-way-match'
import { liveWaivers, type StoredWaiver } from '@/lib/money/keyed-lines'
import { amount } from '@/lib/money-display'
import { decimalsFor } from '@/lib/money'
import { formatDay } from '@/lib/format-date'
import { dayOfMomentFor } from '@/lib/when'

export interface ReceiptFacts {
  number: string
  vendorName: string
  status: string
  currency: string
  totalCents: number
  paidCents: number
  /** Payments recorded against it, counted; a part payment counts. */
  paymentCount: number
  /** A payment run being put together or approved that holds it. */
  inRun: { status: 'DRAFT' | 'APPROVED' } | null
  /** The check as it stands now. Empty on a paid or cancelled receipt. */
  checks: MatchCheck[]
  /** A refusal the match does not carry (two currencies, a rate changed inside a week). */
  hard: string | null
  waivers: StoredWaiver[]
}

export interface ReaderRole {
  /** May waive a check: a role that pays (`waiveDesk`). */
  mayWaive: boolean
  /** Who may, where the reader may not. */
  waiveSays: string | null
  /** May record a payment (`payments.record`). */
  mayPay: boolean
  paySays: string | null
  /** May record or cancel an invoice receipt (`mayRecordSupplierInvoice`). */
  mayRecord: boolean
  recordSays: string | null
}

export interface FailingCheck {
  code: string
  name: string
  /** The check's own sentence. */
  reason: string
  /** The rules let somebody waive it. */
  waivable: boolean
  /** Whether this reader is offered Waive, and the sentence where not. */
  waive: { offered: boolean; says: string | null }
}

export interface WaiverRead {
  code: string
  name: string
  reason: string
  byName: string
  at: Date
  /** Still covers the receipt at its total now. */
  live: boolean
  says: string
}

export interface Doors {
  failing: FailingCheck[]
  waivers: WaiverRead[]
  /** The sentence where an exception was recorded for another total. */
  voidedWaiver: string | null
  cancel: { offered: boolean; says: string | null }
  pay: { offered: boolean; says: string | null }
}

export const NOBODY_WAIVES = 'Nobody can wave this through.'

const name = (code: string) => CHECK_NAME[code as MatchCode] ?? code

/**
 * A waiver's time is a moment (when the exception was recorded), so it is
 * printed as the day it fell on. This file composes sentences with no
 * reader beside it, so the day is UTC's, as it was before.
 */
const waivedOn = (at: Date) => dayOfMomentFor(at, null)

/**
 * The doors on one receipt. `gate` is the payment's own answer
 * (`keyedPayGate`), passed through, so the Pay button and the payment
 * route cannot disagree.
 */
export function receiptDoors(r: ReceiptFacts, role: ReaderRole, gate: { ok: boolean; says?: string | null }): Doors {
  const open = r.status !== 'PAID' && r.status !== 'CANCELLED'

  const failing: FailingCheck[] = open
    ? r.checks
        .filter((c) => c.outcome === 'FAIL')
        .map((c) => {
          const waivable = OVERRIDABLE[c.code] === true
          return {
            code: c.code,
            name: c.name ?? name(c.code),
            reason: c.reason,
            waivable,
            waive: !waivable
              ? { offered: false, says: NOBODY_WAIVES }
              : role.mayWaive
                ? { offered: true, says: null }
                : { offered: false, says: role.waiveSays },
          }
        })
    : []

  const { live, voided } = liveWaivers(r.waivers, r.totalCents, r.currency)
  const liveCodes = new Set(live.map((w) => w.code))
  const waivers: WaiverRead[] = r.waivers
    .filter((w) => OVERRIDABLE[w.code as MatchCode] === true)
    .map((w) => {
      const stands = liveCodes.has(w.code as MatchCode) && w.totalCentsAtOverride === r.totalCents
      return {
        code: w.code,
        name: name(w.code),
        reason: w.reason,
        byName: w.byName,
        at: w.at,
        live: stands,
        says:
          `Waived by ${w.byName} on ${waivedOn(w.at)}, at ${amount(w.totalCentsAtOverride, r.currency)}: “${w.reason}” ` +
          (stands
            ? 'It no longer covers this invoice receipt if the total changes.'
            : `The invoice receipt is now ${amount(r.totalCents, r.currency)}, so it no longer covers it.`),
      }
    })

  return {
    failing,
    waivers,
    voidedWaiver: voided,
    cancel: cancelDoor(r, role),
    pay: !role.mayPay
      ? { offered: false, says: role.paySays }
      : !open
        ? { offered: false, says: null }
        : gate.ok
          ? { offered: true, says: null }
          : { offered: false, says: gate.says ?? r.hard ?? null },
  }
}

function cancelDoor(r: ReceiptFacts, role: ReaderRole): Doors['cancel'] {
  if (r.status === 'CANCELLED') return { offered: false, says: null }
  if (r.paidCents > 0 || r.paymentCount > 0 || r.status === 'PAID') {
    return {
      offered: false,
      says:
        `${amount(r.paidCents, r.currency)} has been paid on ${r.vendorName}’s invoice ${r.number}, so it is not cancelled. ` +
        `Money that went out is undone with ${r.vendorName}, not by taking the receipt off the record.`,
    }
  }
  if (r.inRun) {
    return {
      offered: false,
      says:
        `${r.vendorName}’s invoice ${r.number} is in a payment run that is ` +
        `${r.inRun.status === 'DRAFT' ? 'being put together' : 'approved and waiting to be released'}. ` +
        `Cancel the run first, then this receipt.`,
    }
  }
  if (!role.mayRecord) return { offered: false, says: role.recordSays }
  return { offered: true, says: null }
}

// ── Who paid whom ─────────────────────────────────────────────────────

export interface PaymentFacts {
  paidBy: string
  paidTo: string
  /** Minor units. */
  amountMinor: number
  currency: string
  at: Date
  method: string | null
  reference: string | null
  recordedBy: string | null
}

/** "Computer Systems paid Techpeple $4,956.00 on Oct 18, 2026 by Wire, reference CS-8102. Recorded by Dana Park." */
export function paymentSays(p: PaymentFacts): string {
  return (
    `${p.paidBy} paid ${p.paidTo} ${amount(p.amountMinor, p.currency)} on ${formatDay(p.at)}` +
    (p.method ? ` by ${p.method}` : '') +
    (p.reference ? `, reference ${p.reference}` : '') +
    '.' +
    (p.recordedBy ? ` Recorded by ${p.recordedBy}.` : '')
  )
}

// ── The form's arithmetic ─────────────────────────────────────────────

/** Whole currency as typed, to minor units. Null where it does not read as a number. */
export function toMinor(typed: string | number | null | undefined, currency: string): number | null {
  if (typed == null || String(typed).trim() === '') return null
  const v = Number(String(typed).replace(/[,\s]/g, ''))
  if (!Number.isFinite(v)) return null
  return Math.round(v * 10 ** decimalsFor(currency))
}

/** Minor units, as the form shows them for typing: 11800 → "118.00". */
export function toTyped(minor: number, currency: string): string {
  const d = decimalsFor(currency)
  return (minor / 10 ** d).toFixed(d)
}

/** An hours line's amount: hours times the hourly rate, rounded once to a whole minor unit. */
export function lineAmount(hours: number, rateMinor: number): number {
  return Math.round(hours * rateMinor)
}

export interface AcceptedWeekOption {
  timesheetId: string
  personName: string
  /** YYYY-MM-DD */
  weekOf: string
  hoursAccepted: number
  /** The agreed rate on those days; null where it changed inside the week. */
  rateMinor: number | null
}

/** A week chosen on the form: the hours accepted at the agreed rate, which the clerk then edits to what the invoice states. */
export function lineFromWeek(w: AcceptedWeekOption): { hours: number; rateMinor: number; amountMinor: number } | null {
  if (w.rateMinor == null) return null
  return { hours: w.hoursAccepted, rateMinor: w.rateMinor, amountMinor: lineAmount(w.hoursAccepted, w.rateMinor) }
}

/** Said before saving, where the lines and the total typed in disagree; null where they agree. */
export function linesAgainstTotal(lineMinors: number[], totalMinor: number | null, currency: string): string | null {
  if (lineMinors.length === 0 || totalMinor == null) return null
  const sum = lineMinors.reduce((n, x) => n + x, 0)
  if (sum === totalMinor) return null
  return (
    `The lines add up to ${amount(sum, currency)} and the total typed in is ${amount(totalMinor, currency)}. ` +
    `Type the total and each line as the supplier’s invoice states them; a receipt whose lines do not add up is refused.`
  )
}
