import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { resendBillToCustomer } from '@/lib/notify/bill-delivery'

/**
 * POST /api/invoices/:id/resend
 *
 * Send a bill again to the firm that pays it: the Send again button on a
 * sent bill. A person's own act, at the firm that raised the bill, by
 * whoever sends bills there (`invoices.issue`); nothing unprompted calls
 * it and the twin has no act for it. It reads the people recorded at the
 * client again, so somebody recorded since the first sending receives it
 * now, and it is refused within five minutes of the last sending, because
 * a double press is not a second letter (`lib/notify/bill-delivery`).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  if (!hasPermission(caller.permissions, 'invoices.issue')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: askTheDesk({ doing: 'Sending a bill again', needs: 'invoices.issue', kind: caller.company?.kind, companyName: caller.company?.name }) } },
      { status: 403 }
    )
  }
  const companyId = caller.company?.id ?? null
  if (!companyId) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'A bill is between two companies, and your seat is not at one.' } },
      { status: 404 }
    )
  }

  const { id } = await params
  try {
    const r = await resendBillToCustomer({ invoiceId: id, byPersonId: caller.person.id, companyId })
    if (!r.ok) {
      return NextResponse.json({ error: { code: r.code, message: r.says } }, { status: r.status })
    }
    return NextResponse.json({ data: { sent: r.sent, to: r.to, message: r.says } })
  } catch (err) {
    reportError('Sending a bill again failed:', err, { companyId, personId: caller.person.id })
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'The bill could not be sent again. Staff have been told.' } }, { status: 500 })
  }
}
