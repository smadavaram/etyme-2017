import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, refusalFor } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'
import { mayOpen, refusal, PAYABLE } from '@/lib/money/desks'
import { booksFor, noteMoneyRead } from '@/lib/money/seated-books'
import { recordRefusal } from '@/lib/access-log'
import { readReceiptFile, readLineStates } from '@/lib/money/receipt-file-read'
import { RECEIPT_COLUMNS } from '@/lib/money/receipt-file'

/**
 * GET /api/ap/receipts-file?run=<id>[&columns=a,b,c][&format=csv]
 *
 * The client's own file of the invoice receipts in an approved payment
 * run: one row per receipt line, in the client's own codes, for the
 * client's own system to pay from (Layer 9, slice 1; records 86, 87).
 *
 * Read by the company that pays, and by a firm seated in its program
 * while acting as it. The codes are the payer's own (CLAUDE.md, "A
 * client's codes are the client's"). A refusal is on the access log
 * before it is sent; the download writes a row for each person on the
 * lines. Nothing is paid and no payment row is written: this is a read.
 *
 * `columns` chooses and orders the columns; with none, the company's saved
 * choice (`CompanyCoding.fileColumns`), else every column. The request
 * overrides the saved choice and never changes it.
 *
 * A download is a message (Layer 9, slice 2): each row is written as SENT
 * in the same transaction that reads what was sent before, so a line that
 * left in one file is not in the next, and two requests at once make one
 * message per row. `again=1` sends again only the lines your system
 * rejected, after they were fixed; `line=<id>` does so for one line.
 * `state=1` reads each line's state in the client's words and draws
 * nothing into a file.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'The invoice lines file')
  if (notStaff) return notStaff
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'A payment run belongs to whoever pays' } },
      { status: 403 }
    )
  }
  const whose = await booksFor(caller, request)
  if (whose.error) return whose.error
  const books = whose.books

  // Judged by the role the reader acts in: the seat's, under a seat.
  const permissions = books.caller.permissions
  if (!mayOpen(permissions, PAYABLE)) {
    await recordRefusal([{ companyId: books.companyId }], {
      actorPersonId: caller.isService ? undefined : caller.person.id,
      actorCompanyId: caller.company.id,
      action: 'CONTRACT_VIEW',
      reason: 'Refused the invoice lines file: the reader’s role does not open Payables.',
    })
    return NextResponse.json(refusal(PAYABLE), { status: 403 })
  }
  if (!hasPermission(permissions, 'payments.record')) {
    await recordRefusal([{ companyId: books.companyId }], {
      actorPersonId: caller.isService ? undefined : caller.person.id,
      actorCompanyId: caller.company.id,
      action: 'CONTRACT_VIEW',
      reason: 'Refused the invoice lines file: the reader’s role does not release payment runs.',
    })
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: refusalFor(books.caller, { doing: 'Downloading the invoice lines of a payment run', needs: 'payments.record' }) } },
      { status: 403 }
    )
  }

  const url = request.nextUrl
  const runId = url.searchParams.get('run')
  if (!runId) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Which run?', field: 'run' } }, { status: 422 })
  }
  const asked = url.searchParams.get('columns')
  const columns = asked ? asked.split(',') : null

  noteMoneyRead(books, `the invoice lines of payment run ${runId}`)
  if (url.searchParams.get('state') === '1') {
    const states = await readLineStates(caller, books.companyId, runId)
    if (!states.ok) return NextResponse.json({ error: { code: states.code, message: states.says } }, { status: states.status })
    return NextResponse.json({ data: { runId, lines: states.lines } })
  }
  const lineId = url.searchParams.get('line') || undefined
  const resend = url.searchParams.get('again') === '1'
  const read = await readReceiptFile(caller, books.companyId, runId, columns, { lineId, resend })
  if (!read.ok) {
    return NextResponse.json({ error: { code: read.code, message: read.says } }, { status: read.status })
  }
  if (url.searchParams.get('format') === 'csv') {
    return new NextResponse(read.file.csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${read.file.filename}"`,
      },
    })
  }
  return NextResponse.json({
    data: {
      runId: read.runId,
      filename: read.file.filename,
      csv: read.file.csv,
      columns: read.file.columns,
      available: RECEIPT_COLUMNS,
      rows: read.file.rows,
      held: read.file.held,
      alreadySent: read.file.alreadySent,
      totals: read.file.totals,
      says: read.file.says,
    },
  })
}
