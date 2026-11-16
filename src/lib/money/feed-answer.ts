import { csvRows, parseAmount, parseDay } from '@/lib/money/run-confirm'
import { decimalAmount } from '@/lib/money/run-file'
import { feedKey } from '@/lib/money/bill-feed'

/**
 * The answer that comes back from the client's own system about the lines
 * it was sent (Layer 9, slice 3; records 80, 86, 87).
 *
 * One row says what happened to one row of the file: accepted, rejected
 * with a reason, or paid with the day and the reference. This file reads
 * the rows and decides each against what was sent, in a sentence. It
 * writes nothing and moves no money; paid rows are handed on to the one
 * confirmation that marks a receipt paid.
 *
 * Pure. No database.
 */

export type AnswerField = 'rowId' | 'lineId' | 'status' | 'reason' | 'reference' | 'paidOn' | 'amount'

/** The header names each field is read from, before the client's own picker. */
export const ANSWER_COLUMNS: Record<AnswerField, readonly string[]> = {
  rowId: ['etyme_row_id', 'row_id'],
  lineId: ['etyme_line_id', 'line_id'],
  status: ['status', 'state'],
  reason: ['reason', 'message'],
  reference: ['reference', 'payer_reference', 'payment_reference', 'document_number'],
  paidOn: ['paid_on', 'paid_date', 'payment_date'],
  amount: ['amount'],
}

/** What the picker on the way in shows for each field. */
export const ANSWER_FIELD_LABELS: Record<AnswerField, string> = {
  rowId: 'Row id',
  lineId: 'Line id',
  status: 'Status (accepted, rejected or paid)',
  reason: 'Reason',
  reference: 'Your reference',
  paidOn: 'Paid on',
  amount: 'Amount',
}

export interface AnswerRow {
  /** The line of the file, counting the header as 1. */
  line: number
  rowId: string
  lineId: string
  status: string
  reason: string
  reference: string
  paidOn: string
  amount: string
}

const norm = (h: string) => h.trim().toLowerCase().replace(/[\s-]+/g, '_')

/**
 * Read the answer. `map` is the client's own picker: for a field, the
 * header its file uses. A header that is not in the file is a sentence.
 */
export function parseAnswer(
  text: string,
  map: Partial<Record<AnswerField, string>> = {},
): { ok: true; rows: AnswerRow[] } | { ok: false; says: string } {
  const all = csvRows(text).filter((r) => r.some((c) => c.trim() !== ''))
  if (all.length === 0) return { ok: false, says: 'The answer is empty. Paste or upload what your system wrote.' }
  const head = all[0].map(norm)
  const at = (f: AnswerField) => {
    const asked = map[f]?.trim()
    if (asked) return head.indexOf(norm(asked))
    return head.findIndex((h) => ANSWER_COLUMNS[f].includes(h))
  }
  for (const f of Object.keys(map) as AnswerField[]) {
    if (map[f]?.trim() && at(f) < 0) {
      return { ok: false, says: `The file has no column called “${map[f]}”. Choose the column from your own file.` }
    }
  }
  const col = {
    rowId: at('rowId'), lineId: at('lineId'), status: at('status'), reason: at('reason'),
    reference: at('reference'), paidOn: at('paidOn'), amount: at('amount'),
  }
  if (col.rowId < 0 && col.lineId < 0) {
    return { ok: false, says: 'The file names no row. Include the etyme_row_id or etyme_line_id column from the file Etyme gave you, or choose the column that holds it.' }
  }
  if (col.status < 0) {
    return { ok: false, says: 'The file has no status column. Each row says accepted, rejected or paid.' }
  }
  const cell = (r: string[], i: number) => (i < 0 ? '' : (r[i] ?? '').trim().replace(/^'(?=[=+\-@])/, ''))
  const rows = all.slice(1).map((r, n): AnswerRow => ({
    line: n + 2,
    rowId: cell(r, col.rowId), lineId: cell(r, col.lineId), status: cell(r, col.status).toLowerCase(),
    reason: cell(r, col.reason), reference: cell(r, col.reference), paidOn: cell(r, col.paidOn), amount: cell(r, col.amount),
  }))
  return { ok: true, rows }
}

/** One row of a file that was sent: what an answer can name. */
export interface SentRow {
  runId: string
  billId: string
  runItemId: string
  number: string
  vendorName: string
  lineId: string
  /** The person on the line, where the read has one: how a sentence names the line. */
  person?: string | null
  shareKey: string
  /** The row's own id in the file: `<line>:<share>`. */
  rowId: string
  /** The number of the OUT message this answers. */
  generation: number
  currency: string
  /** What the row carried, in minor units; null where it cannot be worked out today. */
  amountCents: number | null
  /** The standing state of the row's last live message. */
  state: string
  /** The IN message states already written, for the keys. */
  answeredKeys: readonly string[]
}

export interface AnswerDecision {
  row: AnswerRow
  target: SentRow
  status: 'ACCEPTED' | 'REJECTED' | 'PAID'
  key: string
  paidOn: Date | null
}

export interface AnswerRefusal {
  line: number
  says: string
  /** Set where the row names a line that is another company's: written to the access log. */
  foreign?: boolean
}

/**
 * Each row against what was sent. `foreignLineIds` holds the ids of lines
 * that exist and belong to another company: those rows are refused in a
 * sentence that does not say whose they are. `billLineIds` is every line
 * of each receipt in the run, so a paid answer is refused until it names
 * every line and share of that receipt.
 */
export function decideAnswer(
  rows: readonly AnswerRow[],
  sent: readonly SentRow[],
  foreignLineIds: ReadonlySet<string>,
  billLineIds: ReadonlyMap<string, readonly string[]>,
  today: Date = new Date(),
): { apply: AnswerDecision[]; alreadyRecorded: AnswerDecision[]; refused: AnswerRefusal[] } {
  const apply: AnswerDecision[] = []
  const alreadyRecorded: AnswerDecision[] = []
  const refused: AnswerRefusal[] = []
  const latest = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1)
  const seen = new Set<string>()

  for (const r of rows) {
    const no = (says: string) => refused.push({ line: r.line, says: `Line ${r.line}: ${says}` })
    const lineId = r.lineId || r.rowId.split(':')[0]
    if (!r.rowId && !r.lineId) { no('it names no row, so nothing was written for it.'); continue }
    if (foreignLineIds.has(lineId)) {
      refused.push({ line: r.line, says: `Line ${r.line}: it names a line that is not in your books, so nothing was written for it.`, foreign: true })
      continue
    }
    const targets = sent.filter((s) => (r.rowId ? s.rowId === r.rowId : s.lineId === lineId))
    if (targets.length === 0) { no('it names a line that was not in a file sent for this run, so nothing was written for it.'); continue }
    const status = r.status === 'accepted' ? 'ACCEPTED' : r.status === 'rejected' ? 'REJECTED' : r.status === 'paid' ? 'PAID' : null
    if (!status) { no(`“${r.status}” is not a status. Write accepted, rejected or paid.`); continue }
    if (status === 'REJECTED' && !r.reason) { no('a rejection needs its reason, because the supplier reads it. Nothing was written.'); continue }
    let paidOn: Date | null = null
    if (status === 'PAID') {
      if (!r.reference) { no('a paid row needs your payment reference. Nothing was written.'); continue }
      paidOn = parseDay(r.paidOn)
      if (!paidOn) { no(`“${r.paidOn}” is not a paid date. Write it as YYYY-MM-DD.`); continue }
      if (paidOn.getTime() > latest) { no(`${r.paidOn} has not happened yet. A paid date is the day the money left.`); continue }
    }
    if (r.amount) {
      let bad: string | null = null
      for (const t of targets) {
        const minor = parseAmount(r.amount, t.currency)
        if (minor == null) { bad = `“${r.amount}” is not an amount in ${t.currency.toUpperCase()}.`; break }
        // A line named without its share is the whole line.
        const expected = r.rowId ? t.amountCents : targets.reduce((a, x) => a + (x.amountCents ?? 0), 0)
        if (expected == null) { bad = 'the amount cannot be checked against this line today, so it was not accepted.'; break }
        if (minor !== expected) {
          bad = `your answer says ${decimalAmount(minor, t.currency)} ${t.currency.toUpperCase()} and the line was sent at ${decimalAmount(expected, t.currency)}.`
          break
        }
      }
      if (bad) { no(`${bad} Nothing was written.`); continue }
    }
    for (const t of targets) {
      const once = `${t.rowId}:${status}`
      if (seen.has(once)) { no(`${t.rowId} is named twice in this answer. It was read once.`); continue }
      seen.add(once)
      const key = `${feedKey({ runId: t.runId, lineId: t.lineId, shareKey: t.shareKey, direction: 'IN', generation: t.generation })}:${status}`
      const d: AnswerDecision = { row: r, target: t, status, key, paidOn }
      if (t.answeredKeys.includes(key)) alreadyRecorded.push(d)
      else apply.push(d)
    }
  }

  // A receipt is paid whole: every line and share of it, in this answer or already paid.
  const paidBills = new Set(apply.filter((d) => d.status === 'PAID').map((d) => d.target.billId))
  for (const billId of paidBills) {
    const mine = sent.filter((s) => s.billId === billId)
    const lines = billLineIds.get(billId) ?? []
    const covered = (s: SentRow) =>
      s.state === 'PAID' || apply.some((d) => d.status === 'PAID' && d.target.rowId === s.rowId)
    const missingRows = mine.filter((s) => !covered(s))
    const missingLines = lines.filter((id) => !mine.some((s) => s.lineId === id))
    if (missingRows.length === 0 && missingLines.length === 0) continue
    const n = missingRows.length + missingLines.length
    const who = `${mine[0]?.vendorName ?? 'The supplier'}’s invoice ${mine[0]?.number ?? ''}`.trim()
    // A rejected line is named, once, and said to hold the whole invoice.
    const rejected = new Map<string, string>()
    for (const s of missingRows.filter((x) => x.state === 'REJECTED')) {
      rejected.set(s.lineId, s.person ? `${s.person}’s line` : `the line ending ${s.lineId.slice(-6)}`)
    }
    const says = rejected.size > 0
      ? `${who} is paid whole, and ${[...rejected.values()].join(' and ')} ${rejected.size === 1 ? 'is' : 'are'} rejected. ` +
        `One rejected line holds the whole invoice: fix it and send it again, then answer paid for every line together. Nothing was written for it.`
      : `${who} is paid whole: ${n} more ${n === 1 ? 'row is' : 'rows are'} not answered paid, or ${missingLines.length > 0 ? 'not in a file yet' : 'not in this answer'}. ` +
        `Answer paid for every line of it together. Nothing was written for it.`
    // One sentence for each line of the answer, however many rows it was split into.
    const told = new Set<number>()
    for (const d of apply.filter((x) => x.status === 'PAID' && x.target.billId === billId)) {
      if (told.has(d.row.line)) continue
      told.add(d.row.line)
      refused.push({ line: d.row.line, says: `Line ${d.row.line}: ${says}` })
    }
    for (let i = apply.length - 1; i >= 0; i--) {
      if (apply[i].status === 'PAID' && apply[i].target.billId === billId) apply.splice(i, 1)
    }
  }
  refused.sort((a, b) => a.line - b.line)
  return { apply, alreadyRecorded, refused }
}
