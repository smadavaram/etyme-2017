import { payGate, type PayGate } from '@/lib/invoice-match'
import { heldFor, type FailingCheck } from '@/app/api/decisions/receipt-to-pay'
import { weekSays } from '@/app/api/timesheets/chain-turn'

/**
 * What an invoice receipt's own page draws where the money is paid: the
 * Pay form, or the reason it is held and the way forward. Never both.
 *
 * ── The fault this exists for ────────────────────────────────────────
 *
 * The second production walk, 2026-10-26: PR-2026-0442 bills 41.5 hours
 * against 40 signed. The queue already called it held, but its own page
 * drew "Pay $4,067.00", and the payment route answered 409. A screen that
 * offers an act the route will refuse is a screen that lies. The page
 * drew Pay from the desk alone (`lib/money/pay-desk`) and never asked the
 * gate the route asks.
 *
 * ── One gate ─────────────────────────────────────────────────────────
 *
 * The payer's side is judged by `payGate` in `lib/invoice-match` — the
 * pure core of `mayPayInvoiceReceipt`, over the match the route already
 * ran — which is the gate the payment route, the twin and the queue all
 * read. So the page, the queue and the route cannot disagree. The side
 * that is paid (recording money that came in) is not gated on the check
 * by the route, and is not gated here either.
 *
 * Pure. No database.
 */

export interface HoursHeld {
  person: string
  /** "Oct 4–10", or null where the line names no week. */
  week: string | null
  billed: number
  /** What the payer signed; null where nobody has. */
  signed: number | null
  /** "Lucía Fernández, Oct 4–10: 41.5 hours billed, 40 signed." */
  says: string
}

export type ReceiptPayPanel =
  /** Draw the Pay form (the desk decides separately who may press it). */
  | { kind: 'PAY' }
  /** Not submitted yet: the page's own "not yet" sentence stands. */
  | { kind: 'NOT_SUBMITTED'; says: string }
  /** Paid, cancelled or void: nothing to pay, and the gate's sentence says why. */
  | { kind: 'CLOSED'; says: string }
  /** Held: what holds it, the hours, the way forward, and no Pay. */
  | {
      kind: 'HELD'
      /** "Held: hours don’t match" — the queue's own words for the row. */
      headline: string
      /** The gate's own sentence, as the route would refuse with it. */
      says: string
      hours: HoursHeld[]
      /** One sentence per way forward, in the order a person tries them. */
      wayForward: string[]
    }

export interface ReceiptPanelLine {
  kind: 'HOURS' | 'EXPENSE' | 'MILESTONE'
  personName: string
  periodStart: string | null
  periodEnd: string | null
  hoursBilled: number
  hoursSigned: number | null
}

export function receiptPayPanel(i: {
  direction: 'PAYABLE' | 'RECEIVABLE' | 'NEITHER'
  invoice: { number: string; status: string }
  match: {
    matched: boolean
    summary: string
    voidedWaiver?: string | null
    checks: ReadonlyArray<{ code: string; outcome: string; overridable?: boolean }>
    lines: ReadonlyArray<ReceiptPanelLine>
  } | null
  supplierName: string
}): ReceiptPayPanel {
  // The route gates the payer only; money coming in is recorded as it comes.
  if (i.direction !== 'PAYABLE') return { kind: 'PAY' }
  const gate: PayGate = payGate(i.invoice, i.match)
  if (gate.ok) return { kind: 'PAY' }
  if (gate.code === 'NOT_SUBMITTED') return { kind: 'NOT_SUBMITTED', says: gate.says }
  if (gate.code === 'INVALID_STATE') return { kind: 'CLOSED', says: gate.says }

  const hours = (i.match?.lines ?? []).filter((l) => l.kind === 'HOURS').map(hoursHeld)

  if (gate.code === 'HELD') {
    return {
      kind: 'HELD',
      headline: 'On hold',
      says: gate.says,
      hours,
      wayForward: ['Lift the hold on this page first, then pay it.'],
    }
  }

  // MATCH_FAILED: what the check found, in the queue's words.
  const failing: FailingCheck[] = (i.match?.checks ?? [])
    .filter((c) => c.outcome === 'FAIL')
    .map((c) => ({ code: c.code, overridable: c.overridable }))
  const supplier = i.supplierName
  const wayForward: string[] = []
  if (!i.match) {
    wayForward.push('The check could not be run, so nothing can be paid on its say-so. Open the page again; if it still fails, staff have been told.')
  } else if (failing.some((f) => f.code === 'RECEIPT')) {
    wayForward.push('It can be paid once every week on it is signed and accepted.')
  } else if (failing.length > 0 && failing.every((f) => f.overridable === true)) {
    wayForward.push(`Ask ${supplier} to correct it and send it again.`)
    wayForward.push('Or record an exception with a reason under the check below, and it can be paid.')
  } else {
    wayForward.push(`It can be paid once ${supplier} corrects it and sends it again.`)
  }
  if (i.match?.voidedWaiver) wayForward.push(i.match.voidedWaiver)

  return {
    kind: 'HELD',
    headline: `Held: ${heldFor(failing)}`,
    says: gate.says,
    hours,
    wayForward,
  }
}

function hoursHeld(l: ReceiptPanelLine): HoursHeld {
  const week = l.periodStart && l.periodEnd ? weekSays(l.periodStart, l.periodEnd) : null
  const signed = l.hoursSigned == null ? 'none signed' : `${num(l.hoursSigned)} signed`
  return {
    person: l.personName,
    week,
    billed: l.hoursBilled,
    signed: l.hoursSigned,
    says: `${l.personName}${week ? `, ${week}` : ''}: ${num(l.hoursBilled)} hours billed, ${signed}.`,
  }
}

function num(h: number): string {
  return Number.isInteger(h) ? String(h) : String(Math.round(h * 100) / 100)
}
