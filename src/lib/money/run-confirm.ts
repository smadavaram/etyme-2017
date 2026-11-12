import { decimalsFor } from '@/lib/money'
import { decimalAmount, paymentReference, runItemOf, TOTAL_REFERENCE, RUN_FILE_COLUMNS } from '@/lib/money/run-file'

/**
 * The payer's system has paid: the confirmation comes back.
 *
 * The founder, 2026-11-12: "When its system has paid, the confirmation
 * comes back as a file or a typed-in reference; Etyme marks each receipt
 * paid through the one payment function and never marks one the
 * confirmation does not name."
 *
 * Two ways back:
 *   · a CSV, one row per payment, naming the Etyme payment reference the
 *     run's file carried, the amount, the paid date and the payer's own
 *     bank or system reference (the currency column is read where it is
 *     there; a run is one currency, so where it is not the amount is read
 *     in the run's currency);
 *   · one reference and one date typed for the whole run, which names
 *     every line of it.
 *
 * The rule is strict, on purpose, until the founder says otherwise: a
 * confirmation's amount must equal the balance owed on the receipt, which
 * must equal what the run was assembled to pay. A part payment, an
 * overpayment and a rounding difference are refused per row in a
 * sentence, and nothing is written for that row. A receipt already paid
 * is refused as already paid, so the same file twice pays nothing twice.
 *
 * Pure, except `confirmRun`, which is handed its reads and its one write.
 */

// ── Reading the file ──────────────────────────────────────────────────

/** The columns a confirmation must carry, and the one it may. */
export const CONFIRM_COLUMNS = {
  reference: ['etyme_payment_reference', 'etyme_reference', 'reference'],
  amount: ['amount', 'amount_paid', 'paid_amount'],
  paidOn: ['paid_date', 'payment_date', 'paid_on'],
  payerReference: ['payer_reference', 'bank_reference', 'payment_reference', 'system_reference'],
  currency: ['currency'],
} as const

export interface ConfirmRow {
  /** The row's line number in the file, counting the header as line 1. Typed: 0. */
  line: number
  reference: string
  amount: string
  paidOn: string
  payerReference: string
  currency: string | null
}

export interface RowRefusal {
  line: number
  reference: string
  says: string
}

/** Split CSV text into rows of cells. Quotes, doubled quotes, CRLF. */
export function csvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const t = text.replace(/^﻿/, '')
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (quoted) {
      if (c === '"') {
        if (t[i + 1] === '"') { cell += '"'; i++ } else quoted = false
      } else cell += c
      continue
    }
    if (c === '"') quoted = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row) }
  return rows
}

const norm = (h: string) => h.trim().toLowerCase().replace(/[\s-]+/g, '_')

/** The confirmation's rows, or the one sentence that says the file cannot be read. */
export function parseConfirmation(text: string): { ok: true; rows: ConfirmRow[] } | { ok: false; says: string } {
  const all = csvRows(text).filter((r) => r.some((c) => c.trim() !== ''))
  if (all.length === 0) return { ok: false, says: 'The file is empty. Upload the confirmation your payment system wrote.' }
  const head = all[0].map(norm)
  const at = (names: readonly string[]) => head.findIndex((h) => names.includes(h))
  const col = {
    reference: at(CONFIRM_COLUMNS.reference),
    amount: at(CONFIRM_COLUMNS.amount),
    paidOn: at(CONFIRM_COLUMNS.paidOn),
    payerReference: at(CONFIRM_COLUMNS.payerReference),
    currency: at(CONFIRM_COLUMNS.currency),
  }
  const missing = (
    [
      ['reference', 'etyme_payment_reference'],
      ['amount', 'amount'],
      ['paidOn', 'paid_date'],
      ['payerReference', 'payer_reference'],
    ] as const
  ).filter(([k]) => col[k] < 0).map(([, name]) => name)
  if (missing.length > 0) {
    return {
      ok: false,
      says:
        `The file has no ${missing.join(', ')} column${missing.length === 1 ? '' : 's'}. A confirmation names each payment by ` +
        `the etyme_payment_reference from the run's file, with the amount, the paid_date and your payer_reference.`,
    }
  }
  const cell = (r: string[], i: number) => (i < 0 ? '' : (r[i] ?? '').trim().replace(/^'(?=[=+\-@])/, ''))
  const rows: ConfirmRow[] = []
  all.slice(1).forEach((r, n) => {
    const reference = cell(r, col.reference)
    if (reference.toUpperCase() === TOTAL_REFERENCE) return
    rows.push({
      line: n + 2,
      reference,
      amount: cell(r, col.amount),
      paidOn: cell(r, col.paidOn),
      payerReference: cell(r, col.payerReference),
      currency: col.currency < 0 ? null : cell(r, col.currency) || null,
    })
  })
  return { ok: true, rows }
}

/**
 * A decimal amount as whole minor units, strictly: digits, an optional
 * point and no more places than the currency has. Thousands commas are
 * read. Null where it is anything else.
 */
export function parseAmount(text: string, currency: string): number | null {
  const t = text.trim().replace(/,(?=\d{3}(\D|$))/g, '')
  const d = decimalsFor(currency)
  const m = /^(\d+)(?:\.(\d*))?$/.exec(t)
  if (!m) return null
  const frac = m[2] ?? ''
  if (frac.length > d) return null
  const minor = Number(m[1]) * 10 ** d + Number((frac + '0'.repeat(d)).slice(0, d) || '0')
  return Number.isSafeInteger(minor) ? minor : null
}

/** YYYY-MM-DD as a UTC day, or null. */
export function parseDay(text: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim())
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.toISOString().slice(0, 10) === text.trim() ? d : null
}

// ── What the request carries ──────────────────────────────────────────

/** Every field the confirmation reads from its body. The screen sends each (`confirmBody`). */
export const CONFIRM_FIELDS = ['id', 'csv', 'reference', 'paidOn'] as const

export type ConfirmBodyRead =
  | { ok: true; runId: string; by: 'FILE'; csv: string }
  | { ok: true; runId: string; by: 'TYPED'; reference: string; paidOn: string }
  | { ok: false; says: string; field: (typeof CONFIRM_FIELDS)[number] }

/** What the confirmation asks of its body, each missing field refused in a sentence that names it. */
export function readConfirmBody(body: Record<string, unknown>): ConfirmBodyRead {
  const runId = String(body.id ?? '').trim()
  if (!runId) return { ok: false, field: 'id', says: 'Which run is this the confirmation of?' }
  const csv = typeof body.csv === 'string' ? body.csv : ''
  if (csv.trim()) return { ok: true, runId, by: 'FILE', csv }
  const reference = String(body.reference ?? '').trim()
  const paidOn = String(body.paidOn ?? '').trim()
  if (!reference) {
    return {
      ok: false, field: 'reference',
      says: 'Upload the confirmation your payment system wrote, or type the one reference it gave the whole run.',
    }
  }
  if (!paidOn) return { ok: false, field: 'paidOn', says: 'Which day did the money leave? Enter the paid date.' }
  return { ok: true, runId, by: 'TYPED', reference, paidOn }
}

/** What the screen posts. Exactly the fields the reader asks for, and only those the person filled in. */
export function confirmBody(form: { runId: string; csv?: string | null; reference?: string | null; paidOn?: string | null }) {
  const body: Record<string, string> = { action: 'confirm', id: form.runId }
  if (form.csv && form.csv.trim()) body.csv = form.csv
  if (form.reference && form.reference.trim()) body.reference = form.reference.trim()
  if (form.paidOn && form.paidOn.trim()) body.paidOn = form.paidOn.trim()
  return body
}

// ── Deciding each row ─────────────────────────────────────────────────

export interface RunLineFacts {
  runItemId: string
  billId: string
  number: string
  vendorName: string
  vendorCompanyId: string
  /** What the run was assembled to pay on this line. */
  amountCents: number
  currency: string
  totalCents: number
  paidCents: number
  status: string
  receivedAt: Date
}

export interface PayRow {
  line: number
  runItemId: string
  billId: string
  number: string
  vendorName: string
  vendorCompanyId: string
  amountCents: number
  currency: string
  paidAt: Date
  payerReference: string
  /** What the receipt's paid figure must still read when it is written. */
  expectPaidCents: number
}

/**
 * Each row of a confirmation against the run it confirms: to pay, or
 * refused in a sentence. Rows only: a line of the run the confirmation
 * does not name is never in either list.
 *
 * `gateSays` is the payment gate's refusal for a receipt today, or null
 * where it passes; asked only of what the row would otherwise pay.
 */
export function decideRows(
  run: { id: string; currency: string; lines: RunLineFacts[] },
  rows: ConfirmRow[],
  gateSays: (billId: string) => string | null,
  today: Date = new Date(),
): { pay: PayRow[]; refused: RowRefusal[] } {
  const byItem = new Map(run.lines.map((l) => [l.runItemId, l]))
  const seen = new Set<string>()
  const pay: PayRow[] = []
  const refused: RowRefusal[] = []
  const latest = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1)

  for (const r of rows) {
    const refuse = (says: string) => refused.push({ line: r.line, reference: r.reference, says })
    const where = r.line > 0 ? `Line ${r.line}` : 'The reference'
    const itemId = runItemOf(r.reference)
    const l = itemId ? byItem.get(itemId) : undefined
    if (!r.reference) { refuse(`${where} names no Etyme payment reference, so nothing was marked paid for it.`); continue }
    if (!l) { refuse(`${where}: ${r.reference} names no invoice receipt in this run, so nothing was marked paid for it.`); continue }
    if (seen.has(l.runItemId)) { refuse(`${where}: ${r.reference} is named twice in this confirmation. It was read once.`); continue }
    seen.add(l.runItemId)

    const who = `${l.vendorName}’s invoice ${l.number}`
    const cur = l.currency.toUpperCase()
    if (l.status === 'PAID' || l.totalCents - l.paidCents <= 0) {
      refuse(`${where}: ${who} is already paid. Nothing was written again.`)
      continue
    }
    if (l.status === 'CANCELLED') { refuse(`${where}: ${who} is cancelled, so it is not marked paid.`); continue }
    if (r.currency && r.currency.toUpperCase() !== cur) {
      refuse(`${where}: ${who} is owed in ${cur} and the confirmation says ${r.currency.toUpperCase()}. Nothing was written.`)
      continue
    }
    const owed = l.totalCents - l.paidCents
    const minor = parseAmount(r.amount, cur)
    if (minor == null) {
      refuse(`${where}: "${r.amount}" is not an amount in ${cur}. Nothing was written.`)
      continue
    }
    if (minor !== owed || minor !== l.amountCents) {
      refuse(
        `${where}: the confirmation says ${decimalAmount(minor, cur)} ${cur} for ${who}, and ` +
        `${decimalAmount(owed, cur)} ${cur} is owed on it. A confirmation must match the balance owed, so nothing was written.`
      )
      continue
    }
    const paidAt = parseDay(r.paidOn)
    if (!paidAt) { refuse(`${where}: "${r.paidOn}" is not a date. Write the paid date as YYYY-MM-DD.`); continue }
    if (paidAt.getTime() > latest) { refuse(`${where}: ${r.paidOn} has not happened yet. A confirmation says the day money left.`); continue }
    if (paidAt.getTime() < Date.UTC(l.receivedAt.getUTCFullYear(), l.receivedAt.getUTCMonth(), l.receivedAt.getUTCDate())) {
      refuse(`${where}: ${who} cannot be paid on ${r.paidOn}, before it arrived.`)
      continue
    }
    if (!r.payerReference) {
      refuse(`${where}: ${who} has no payer reference. Give the reference your bank or system gave the payment.`)
      continue
    }
    const gate = gateSays(l.billId)
    if (gate) { refuse(`${where}: ${gate}`); continue }

    pay.push({
      line: r.line, runItemId: l.runItemId, billId: l.billId, number: l.number, vendorName: l.vendorName,
      vendorCompanyId: l.vendorCompanyId, amountCents: minor, currency: cur, paidAt,
      payerReference: r.payerReference, expectPaidCents: l.paidCents,
    })
  }
  return { pay, refused }
}

/** One typed reference and one date for the whole run: a row per line of it, each at the run's own amount. */
export function typedRows(run: { currency: string; lines: RunLineFacts[] }, reference: string, paidOn: string): ConfirmRow[] {
  return run.lines.map((l) => ({
    line: 0,
    reference: paymentReference(l.runItemId),
    amount: decimalAmount(l.amountCents, l.currency),
    paidOn,
    payerReference: reference,
    currency: l.currency,
  }))
}

// ── Doing it ──────────────────────────────────────────────────────────

export type PayOutcome = { ok: true; paymentId: string } | { ok: false; says: string }

export interface ConfirmDeps {
  /** The proof rule: the paying company has a verified Owner, else the gate's own sentence. */
  ownerGate: () => Promise<{ ok: true } | { ok: false; says: string; href?: string }>
  /** The run, this company's only, or null. */
  loadRun: () => Promise<{ id: string; status: string; currency: string; lines: RunLineFacts[] } | null>
  /** The payment gate for one receipt today: null where it passes. */
  gateSays: (billId: string) => Promise<string | null>
  /** The one write. Refuses where the receipt moved since it was read. */
  pay: (row: PayRow) => Promise<PayOutcome>
  today?: Date
}

export type ConfirmResult =
  | { ok: false; status: 403 | 404 | 422; code: string; says: string; href?: string }
  | { ok: true; paid: (PayRow & { paymentId: string })[]; refused: RowRefusal[]; says: string }

export async function confirmRun(deps: ConfirmDeps, input: { by: 'FILE'; csv: string } | { by: 'TYPED'; reference: string; paidOn: string }): Promise<ConfirmResult> {
  const owner = await deps.ownerGate()
  if (!owner.ok) return { ok: false, status: 403, code: 'OWNER_NOT_VERIFIED', says: owner.says, href: owner.href }

  const run = await deps.loadRun()
  if (!run) return { ok: false, status: 404, code: 'NOT_FOUND', says: 'No such payment run here' }
  if (run.status !== 'APPROVED' && run.status !== 'PAID') {
    return {
      ok: false, status: 422, code: 'NOT_APPROVED',
      says: `This run is ${run.status.toLowerCase()}. A confirmation is read only for a run that was approved to pay.`,
    }
  }

  let rows: ConfirmRow[]
  if (input.by === 'FILE') {
    const parsed = parseConfirmation(input.csv)
    if (!parsed.ok) return { ok: false, status: 422, code: 'VALIDATION', says: parsed.says }
    rows = parsed.rows
  } else {
    rows = typedRows(run, input.reference, input.paidOn)
  }

  const gates = new Map<string, string | null>()
  for (const l of run.lines) {
    if (l.status === 'PAID' || l.status === 'CANCELLED' || l.totalCents - l.paidCents <= 0) continue
    gates.set(l.billId, await deps.gateSays(l.billId))
  }
  const decided = decideRows(run, rows, (id) => gates.get(id) ?? null, deps.today)

  const paid: (PayRow & { paymentId: string })[] = []
  const refused = [...decided.refused]
  for (const p of decided.pay) {
    const out = await deps.pay(p)
    if (out.ok) paid.push({ ...p, paymentId: out.paymentId })
    else refused.push({ line: p.line, reference: paymentReference(p.runItemId), says: out.says })
  }
  refused.sort((a, b) => a.line - b.line)

  const n = paid.length
  return {
    ok: true,
    paid,
    refused,
    says:
      `${n === 0 ? 'Nothing was' : `${n} invoice receipt${n === 1 ? ' was' : 's were'}`} marked paid.` +
      (refused.length > 0
        ? ` ${refused.length === 1 ? 'One row was' : `${refused.length} rows were`} refused, and nothing was written for ${refused.length === 1 ? 'it' : 'them'}.`
        : ''),
  }
}

/** The run's file columns, re-exported for the screen's help line. */
export const RUN_REFERENCE_COLUMN = RUN_FILE_COLUMNS[0]
