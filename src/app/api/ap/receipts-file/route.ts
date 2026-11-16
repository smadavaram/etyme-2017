import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, refusalFor } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'
import { mayOpen, refusal, PAYABLE } from '@/lib/money/desks'
import { booksFor, noteMoneyRead } from '@/lib/money/seated-books'
import { recordRefusal } from '@/lib/access-log'
import { readReceiptFile } from '@/lib/money/receipt-file-read'
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
 * `columns` chooses and orders the columns; no choice is every column.
 * The choice is kept in the request and not as a company setting, because
 * no company column holds it yet. Without `run`, the answer lists the
 * columns and the approved runs that can be downloaded.
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
  const read = await readReceiptFile(caller, books.companyId, runId, columns)
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
      totals: read.file.totals,
      says: read.file.says,
    },
  })
}
