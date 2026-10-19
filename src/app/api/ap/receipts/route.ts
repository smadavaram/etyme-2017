import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { staffOnly } from '@/lib/seat'
import { mayOpen, refusal, PAYABLE } from '@/lib/money/desks'
import { booksFor, noteMoneyRead, seatedRefusal } from '@/lib/money/seated-books'
import { receiptsFor } from '@/lib/money/receipts-read'
import { receiptRole } from '@/lib/money/receipt-role'

/**
 * GET /api/ap/receipts — every invoice receipt this firm typed in, as the
 * Accounts payable screen reads it.
 *
 * Each with its lines, the check as it stands now in the check's own
 * sentences, the exceptions on it with who and why and whether they still
 * cover it, whether it may be paid or cancelled and the sentence where
 * not, and who paid whom. And the reader's role, once: may they record,
 * waive or pay, and if not, who may.
 *
 * Whose books: the client's where the reader sits in a seat a client gave
 * it, its own everywhere else (`booksFor`), the same as every AP route.
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

  if (!mayOpen(reading.caller.permissions, PAYABLE)) {
    return NextResponse.json(
      reading.seat
        ? { error: { code: 'FORBIDDEN', message: seatedRefusal(reading.seat, 'Invoice receipts') } }
        : refusal(PAYABLE),
      { status: 403 }
    )
  }
  noteMoneyRead(reading, 'Invoice receipts read')

  const role = receiptRole(reading)
  const receipts = await receiptsFor(reading.companyId, role)
  return NextResponse.json({
    data: {
      reading: { company: reading.companyName, inASeat: reading.seated, says: reading.says },
      role,
      receipts,
    },
  })
}
