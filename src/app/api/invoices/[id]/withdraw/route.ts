import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { withdrawDraft } from '@/lib/money/bill-withdraw'

/**
 * POST /api/invoices/:id/withdraw   { reason }
 *
 * Withdraws a draft bill the firm raised and has not sent — the supplier's
 * twin's draft, typically — so its weeks can be billed again from the
 * Bills page or by Ask Etyme's next run (release walk, 2026-10-18).
 * Only a draft: a raised or sent bill is refused in a sentence. Only
 * whoever sends bills (`invoices.issue`) at the firm that raised it, and
 * only with a reason, which goes on the trail with their name
 * (`lib/money/bill-withdraw`).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  if (!hasPermission(caller.permissions, 'invoices.issue')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: askTheDesk({ doing: 'Withdrawing a draft bill', needs: 'invoices.issue', kind: caller.company?.kind, companyName: caller.company?.name }) } },
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
  const body = await request.json().catch(() => ({}))
  const reason = typeof body?.reason === 'string' ? body.reason : null

  try {
    const out = await withdrawDraft({ invoiceId: id, companyId, by: { personId: caller.person.id, name: caller.person.name }, reason: reason ?? '' })
    if (!out.ok) {
      return NextResponse.json({ error: { code: out.code, message: out.says } }, { status: out.status })
    }
    return NextResponse.json({ data: { number: out.number, withdrawn: true, message: out.says } })
  } catch (err) {
    reportError('Withdrawing a draft bill failed:', err)
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'The draft could not be withdrawn.' } }, { status: 500 })
  }
}
