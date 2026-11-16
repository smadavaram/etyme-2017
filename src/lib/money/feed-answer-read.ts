import { prisma } from '@/lib/db'
import { accessActor, recordRefusal } from '@/lib/access-log'
import { receiptFile } from '@/lib/money/receipt-file'
import { loadRunReceipts } from '@/lib/money/receipt-file-read'
import { parseAnswer, decideAnswer, type AnswerField, type AnswerRow, type SentRow } from '@/lib/money/feed-answer'
import { standingMessage } from '@/lib/money/bill-feed'
import { confirmRunPayments } from '@/lib/money/run-confirm-door'
import { paymentReference, decimalAmount, csvCell } from '@/lib/money/run-file'
import { parseDay } from '@/lib/money/run-confirm'
import type { getCallerContext } from '@/lib/api-context'

/**
 * Take the client's system's answer about the lines it was sent, and
 * record it (Layer 9, slice 3; records 80, 86, 87).
 *
 * Every answered row is an IN message, keyed by the send it answers and
 * its status, so the same answer twice writes nothing the second time.
 * Accepted is recorded. Rejected is recorded with its reason, and the line
 * stays held until it is fixed (`mayGoInFile`); the supplier reads the
 * reason. Paid goes through the one confirmation that marks a receipt
 * paid (`confirmRunPayments`: the proof rule, the three-way check, the
 * bank check, the one write, the supplier told the day it is paid). There
 * is no second way to paid here, and no bank detail is read or written.
 * A row for another company's line is refused in a sentence and logged
 * before the sentence is sent.
 */

type CallerCtx = NonNullable<Awaited<ReturnType<typeof getCallerContext>>['caller']>

export type AnswerInput =
  | { by: 'FILE'; runId: string; csv: string; map?: Partial<Record<AnswerField, string>> }
  | { by: 'TYPED'; runId: string; receipt: string; paidOn: string; reference: string }

export type AnswerResult =
  | { ok: true; recorded: number; alreadyRecorded: number; paid: { number: string; vendorName: string }[]; refused: { line: number; says: string }[]; says: string }
  | { ok: false; status: 403 | 404 | 422; code: string; says: string }

const MESSAGE_SELECT = {
  id: true, lineId: true, shareKey: true, direction: true, state: true, reason: true, externalRef: true,
  answeredAt: true, createdAt: true, attempts: true, idempotencyKey: true, vendorBillId: true,
} as const

export async function takeAnswer(caller: CallerCtx, companyId: string, input: AnswerInput): Promise<AnswerResult> {
  const loaded = await loadRunReceipts(caller, companyId, input.runId, ['APPROVED', 'PAID'])
  if (!loaded.ok) return { ok: false, status: loaded.status === 404 ? 404 : 422, code: loaded.code, says: loaded.says }
  const { run, receipts } = loaded
  const byBill = new Map(receipts.map((r) => [r.billId, r]))

  const msgs = await prisma.billFeedMessage.findMany({ where: { runId: run.id, companyId }, select: MESSAGE_SELECT })
  const rowKey = (m: { lineId: string | null; shareKey: string }) => `${m.lineId}:${m.shareKey}`

  // What each row carried: worked out as the file builds it, whatever the gate says today.
  const asSent = receiptFile(
    run,
    receipts.map((r) => ({ ...r, gate: { ok: true as const }, owedCents: r.amountCents })),
  ).items
  const amountOf = new Map(asSent.map((i) => [i.rowId, i.amountCents]))

  const sent: SentRow[] = []
  for (const out of msgs.filter((m) => m.direction === 'OUT' && m.state !== 'SUPERSEDED' && m.lineId)) {
    const r = byBill.get(out.vendorBillId)
    if (!r) continue
    const same = msgs.filter((m) => rowKey(m) === rowKey(out))
    const stands = standingMessage(same.map((m) => ({ ...m, direction: m.direction as 'OUT' | 'IN', state: m.state as never })))
    sent.push({
      runId: run.id, billId: r.billId, runItemId: r.runItemId, number: r.number, vendorName: r.vendorName,
      lineId: out.lineId!, shareKey: out.shareKey, rowId: rowKey(out), generation: out.attempts,
      currency: r.currency, amountCents: amountOf.get(rowKey(out)) ?? null, state: stands?.state ?? out.state,
      answeredKeys: same.filter((m) => m.direction === 'IN').map((m) => m.idempotencyKey),
    })
  }
  const billLineIds = new Map(receipts.map((r) => [r.billId, r.lines.map((l) => l.id)]))

  // ── The rows ──
  let rows: AnswerRow[]
  if (input.by === 'FILE') {
    const parsed = parseAnswer(input.csv, input.map)
    if (!parsed.ok) return { ok: false, status: 422, code: 'VALIDATION', says: parsed.says }
    rows = parsed.rows
  } else {
    const wanted = input.receipt.trim()
    const hits = receipts.filter((r) => r.billId === wanted || r.number === wanted)
    if (hits.length !== 1) {
      return {
        ok: false, status: 422, code: 'VALIDATION',
        says: hits.length === 0
          ? `No invoice receipt “${wanted}” in this run. Write the supplier’s invoice number.`
          : `More than one invoice receipt in this run is numbered “${wanted}”. Use the one that has the supplier’s name.`,
      }
    }
    const r = hits[0]
    return typedPaid(caller, companyId, run.id, r, input, sent)
  }

  // A row that names another company's line is logged before it is refused.
  const named = new Set(rows.map((r) => r.lineId || r.rowId.split(':')[0]).filter(Boolean))
  const mine = new Set(receipts.flatMap((r) => r.lines.map((l) => l.id)))
  const outside = [...named].filter((id) => !mine.has(id))
  const foreign = new Map<string, string>()
  if (outside.length > 0) {
    const found = await prisma.vendorBillLine.findMany({
      where: { id: { in: outside }, vendorBill: { companyId: { not: companyId } } },
      select: { id: true, vendorBill: { select: { companyId: true } } },
    })
    for (const f of found) foreign.set(f.id, f.vendorBill.companyId)
  }
  const decided = decideAnswer(rows, sent, new Set(foreign.keys()), billLineIds)
  if (foreign.size > 0) {
    await recordRefusal([...new Set(foreign.values())].map((id) => ({ companyId: id })), {
      ...accessActor(caller),
      action: 'CONTRACT_VIEW',
      reason: `Refused an answer row for invoice lines that are not the reader's books, in payment run ${run.id}.`,
    })
  }
  const refused: { line: number; says: string }[] = decided.refused.map((x) => ({ line: x.line, says: x.says }))

  // ── Paid, through the one confirmation, a receipt at a time ──
  const paidNow: { number: string; vendorName: string }[] = []
  const toWrite = decided.apply.filter((d) => d.status !== 'PAID')
  const paidBy = new Map<string, typeof decided.apply>()
  for (const d of decided.apply.filter((x) => x.status === 'PAID')) {
    paidBy.set(d.target.billId, [...(paidBy.get(d.target.billId) ?? []), d])
  }
  for (const [billId, group] of paidBy) {
    const r = byBill.get(billId)!
    const first = group[0]
    if (group.some((g) => g.row.reference !== first.row.reference || g.row.paidOn !== first.row.paidOn)) {
      for (const g of group) refused.push({ line: g.row.line, says: `Line ${g.row.line}: the rows of ${r.vendorName}’s invoice ${r.number} carry different paid dates or references. Nothing was written for it.` })
      continue
    }
    if (r.owedCents <= 0) { toWrite.push(...group); continue } // already paid: only the record is made
    const done = await payReceipt(caller, companyId, run.id, r, first.row.paidOn, first.row.reference)
    if (done.ok) { toWrite.push(...group); paidNow.push({ number: r.number, vendorName: r.vendorName }) }
    else for (const g of group) refused.push({ line: g.row.line, says: `Line ${g.row.line}: ${done.says}` })
  }

  const wrote = await writeAnswers(companyId, run.id, toWrite)
  refused.sort((a, b) => a.line - b.line)
  return {
    ok: true, recorded: wrote, alreadyRecorded: decided.alreadyRecorded.length, paid: paidNow, refused,
    says:
      `${wrote} row${wrote === 1 ? '' : 's'} recorded.` +
      (decided.alreadyRecorded.length > 0 ? ` ${decided.alreadyRecorded.length} ${decided.alreadyRecorded.length === 1 ? 'row was' : 'rows were'} already recorded and not written again.` : '') +
      (paidNow.length > 0 ? ` ${paidNow.length} invoice receipt${paidNow.length === 1 ? '' : 's'} marked paid, and the supplier told.` : '') +
      (refused.length > 0 ? ` ${refused.length} row${refused.length === 1 ? ' was' : 's were'} refused, and nothing was written for ${refused.length === 1 ? 'it' : 'them'}.` : ''),
  }
}

async function writeAnswers(companyId: string, runId: string, list: { row: AnswerRow; target: SentRow; status: string; key: string; paidOn: Date | null }[]): Promise<number> {
  if (list.length === 0) return 0
  const made = await prisma.billFeedMessage.createMany({
    skipDuplicates: true,
    data: list.map((d) => ({
      companyId, runId, vendorBillId: d.target.billId, lineId: d.target.lineId, shareKey: d.target.shareKey,
      direction: 'IN', state: d.status, reason: d.row.reason || null, externalRef: d.row.reference || null,
      // For a paid answer, the day the money left; otherwise the day the answer came.
      answeredAt: d.paidOn ?? new Date(), idempotencyKey: d.key,
    })),
  })
  return made.count
}

/** One receipt paid, by the confirmation the payment-runs route also uses. */
async function payReceipt(
  caller: CallerCtx, companyId: string, runId: string,
  r: { runItemId: string; amountCents: number; currency: string },
  paidOn: string, reference: string,
): Promise<{ ok: true } | { ok: false; says: string }> {
  // A seat in the client's program pays under the client's book where the
  // client's role for it holds payments.record; the answer route checked that
  // before it called here, and `companyId` is the book that route resolved.
  const ref = paymentReference(r.runItemId)
  const csv = ['etyme_payment_reference,amount,paid_date,payer_reference', [ref, decimalAmount(r.amountCents, r.currency), paidOn, reference].map(csvCell).join(',')].join('\r\n')
  const done = await confirmRunPayments(caller, companyId, { action: 'confirm', id: runId, csv })
  const body = done.body as { data?: { paid?: { reference: string }[]; refused?: { says: string }[] }; error?: { message: string } }
  if (done.status === 200 && body.data?.paid?.some((p) => p.reference === ref)) return { ok: true }
  return { ok: false, says: body.error?.message ?? body.data?.refused?.[0]?.says ?? 'The invoice receipt was not marked paid.' }
}

/** A small system's one line: the receipt, the paid date, the reference. The existing confirmation, for one receipt. */
async function typedPaid(
  caller: CallerCtx, companyId: string, runId: string,
  r: { billId: string; runItemId: string; number: string; vendorName: string; amountCents: number; currency: string; owedCents: number },
  input: { paidOn: string; reference: string },
  sent: SentRow[],
): Promise<AnswerResult> {
  const reference = input.reference.trim()
  const paidOn = input.paidOn.trim().slice(0, 10)
  if (!reference) return { ok: false, status: 422, code: 'VALIDATION', says: 'Enter the reference your system gave this payment.' }
  if (!parseDay(paidOn)) return { ok: false, status: 422, code: 'VALIDATION', says: 'Enter the day the money left, as YYYY-MM-DD.' }
  const done = await payReceipt(caller, companyId, runId, r, paidOn, reference)
  if (!done.ok) return { ok: true, recorded: 0, alreadyRecorded: 0, paid: [], refused: [{ line: 0, says: done.says }], says: '1 row was refused, and nothing was written for it.' }
  // Where the lines were sent as a file, each row is answered paid too.
  const mine = sent.filter((s) => s.billId === r.billId)
  const wrote = await writeAnswers(companyId, runId, mine.map((t) => ({
    row: { line: 0, rowId: t.rowId, lineId: t.lineId, status: 'paid', reason: '', reference, paidOn, amount: '' },
    target: t, status: 'PAID', paidOn: parseDay(paidOn),
    key: `${t.runId}:${t.lineId}:${t.shareKey}:IN:${t.generation}:PAID`,
  })))
  return {
    ok: true, recorded: wrote, alreadyRecorded: 0, paid: [{ number: r.number, vendorName: r.vendorName }], refused: [],
    says: `${r.vendorName}’s invoice ${r.number} is marked paid, and the supplier told.`,
  }
}
