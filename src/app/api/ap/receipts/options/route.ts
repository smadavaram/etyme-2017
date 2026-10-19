import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { staffOnly } from '@/lib/seat'
import { mayRecordSupplierInvoice, NOT_THE_PAYING_DESK } from '@/lib/money/desks'
import { booksFor, noteMoneyRead, seatedRefusal } from '@/lib/money/seated-books'
import { suppliersFor, lineOptionsFor } from '@/lib/money/receipt-options'

/**
 * GET /api/ap/receipts/options                    the suppliers and their buy lines
 * GET /api/ap/receipts/options?buyContractId=…    what an invoice on that line may bill
 *
 * What the "Record an invoice receipt" form offers: a week this firm
 * accepted, with the hours accepted and the agreed rate beside it; an
 * expense approved on the line; a milestone accepted on its order. Only to
 * whoever records invoice receipts, the same answer the intake asks.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Invoice receipts')
  if (notStaff) return notStaff
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'An invoice receipt is owed by a company' } },
      { status: 403 }
    )
  }
  const { books: reading, error: booksError } = await booksFor(caller, request)
  if (booksError) return booksError

  if (!mayRecordSupplierInvoice(reading.caller.permissions)) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: reading.seat ? seatedRefusal(reading.seat, 'Recording what a supplier has invoiced') : NOT_THE_PAYING_DESK,
        },
      },
      { status: 403 }
    )
  }

  const buyContractId = request.nextUrl.searchParams.get('buyContractId')
  if (!buyContractId) {
    noteMoneyRead(reading, 'Buy lines read to record an invoice receipt')
    return NextResponse.json({ data: { suppliers: await suppliersFor(reading.companyId) } })
  }
  const line = await lineOptionsFor(reading.companyId, buyContractId)
  if (!line) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such buy line here', field: 'buyContractId' } },
      { status: 404 }
    )
  }
  noteMoneyRead(reading, 'Accepted weeks read to record an invoice receipt')
  return NextResponse.json({ data: line })
}
