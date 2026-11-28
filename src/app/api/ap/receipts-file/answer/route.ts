import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, refusalFor } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'
import { mayOpen, refusal, PAYABLE } from '@/lib/money/desks'
import { booksFor, noteMoneyRead } from '@/lib/money/seated-books'
import { recordRefusal } from '@/lib/access-log'
import { takeAnswer } from '@/lib/money/feed-answer-read'

/**
 * POST /api/ap/receipts-file/answer
 *
 * The answer back from the client's own system about the lines it was
 * sent (Layer 9, slice 3). `{ runId, csv, map? }` reads a file: the
 * columns etyme_row_id or etyme_line_id, status (accepted, rejected or
 * paid), reason, reference, paid_on, and optionally amount; `map` names
 * the client's own header for any field. `{ runId, receipt, paidOn,
 * reference }` is the one typed line for a small system: it marks that
 * receipt paid through the existing confirmation.
 *
 * Read by the company that pays. Paid goes only through the one
 * confirmation (the proof rule, the three-way check, the bank check, the
 * one write, the supplier told). A row for another company's line is
 * refused and logged first. The same answer twice writes nothing. No bank
 * detail is read or written, and no money moves.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'The answer to the invoice lines file')
  if (notStaff) return notStaff
  if (!caller.company) {
    return NextResponse.json({ error: { code: 'NO_COMPANY', message: 'A payment run belongs to whoever pays' } }, { status: 403 })
  }
  const whose = await booksFor(caller, request)
  if (whose.error) return whose.error
  const books = whose.books
  const permissions = books.caller.permissions
  if (!mayOpen(permissions, PAYABLE) || !hasPermission(permissions, 'payments.record')) {
    await recordRefusal([{ companyId: books.companyId }], {
      actorPersonId: caller.isService ? undefined : caller.person.id,
      actorCompanyId: caller.company.id,
      action: 'CONTRACT_VIEW',
      reason: 'Refused the answer to the invoice lines file: the reader’s role does not release payment runs.',
    })
    return NextResponse.json(
      !mayOpen(permissions, PAYABLE)
        ? refusal(PAYABLE)
        : { error: { code: 'FORBIDDEN', message: refusalFor(books.caller, { doing: 'Recording the answer to the invoice lines file', needs: 'payments.record' }) } },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const runId = String(body.runId ?? '')
  if (!runId) return NextResponse.json({ error: { code: 'VALIDATION', field: 'runId', message: 'Which run is this the answer for?' } }, { status: 422 })
  const csv = typeof body.csv === 'string' ? body.csv : ''
  noteMoneyRead(books, `the answer to the invoice lines of payment run ${runId}`)

  const done = csv.trim()
    ? await takeAnswer(caller, books.companyId, { by: 'FILE', runId, csv, map: typeof body.map === 'object' && body.map ? body.map : undefined })
    : body.receipt
      ? await takeAnswer(caller, books.companyId, { by: 'TYPED', runId, receipt: String(body.receipt), paidOn: String(body.paidOn ?? ''), reference: String(body.reference ?? '') })
      : null
  if (!done) {
    return NextResponse.json({ error: { code: 'VALIDATION', field: 'csv', message: 'Paste or upload the answer, or name one invoice with its paid date and reference.' } }, { status: 422 })
  }
  if (!done.ok) return NextResponse.json({ error: { code: done.code, message: done.says } }, { status: done.status })
  return NextResponse.json({ data: done })
}
