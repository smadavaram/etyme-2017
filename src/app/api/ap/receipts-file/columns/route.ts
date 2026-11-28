import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, refusalFor } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'
import { prisma } from '@/lib/db'
import { mayOpen, refusal, PAYABLE } from '@/lib/money/desks'
import { recordRefusal } from '@/lib/access-log'
import { pickColumns, RECEIPT_COLUMNS } from '@/lib/money/receipt-file'
import { savedColumns } from '@/lib/money/client-codes'

/**
 * GET and PUT /api/ap/receipts-file/columns
 *
 * The columns of the invoice-lines file, kept once for the paying
 * company (`CompanyCoding.fileColumns`, Layer 9 slice 2). PUT writes only
 * that column; the company code and the rest of the coding are the
 * Settings screens' and are never touched here. A download may still ask
 * for other columns for itself. An empty list means every column.
 */
async function door(request: NextRequest, doing: string) {
  const { caller, error } = await getCallerContext(request)
  if (error) return { error }
  const notStaff = staffOnly(caller, 'The invoice lines file')
  if (notStaff) return { error: notStaff }
  if (!caller.company) {
    return { error: NextResponse.json({ error: { code: 'NO_COMPANY', message: 'The file belongs to whoever pays' } }, { status: 403 }) }
  }
  if (!mayOpen(caller.permissions, PAYABLE)) {
    await recordRefusal([{ companyId: caller.company.id }], {
      actorPersonId: caller.isService ? undefined : caller.person.id,
      actorCompanyId: caller.company.id,
      action: 'CONTRACT_VIEW',
      reason: 'Refused the invoice lines columns: the reader’s role does not open Payables.',
    })
    return { error: NextResponse.json(refusal(PAYABLE), { status: 403 }) }
  }
  if (!hasPermission(caller.permissions, 'payments.record')) {
    return {
      error: NextResponse.json(
        { error: { code: 'FORBIDDEN', message: refusalFor(caller, { doing, needs: 'payments.record' }) } },
        { status: 403 }
      ),
    }
  }
  return { caller, companyId: caller.company.id }
}

export async function GET(request: NextRequest) {
  const d = await door(request, 'Reading the columns of the invoice lines file')
  if (d.error) return d.error
  const row = await prisma.companyCoding.findUnique({ where: { companyId: d.companyId }, select: { fileColumns: true } })
  return NextResponse.json({ data: { columns: savedColumns(row?.fileColumns), saved: (row?.fileColumns.length ?? 0) > 0, available: RECEIPT_COLUMNS } })
}

export async function PUT(request: NextRequest) {
  const d = await door(request, 'Saving the columns of the invoice lines file')
  if (d.error) return d.error
  const body = await request.json().catch(() => ({}))
  const asked = Array.isArray(body.columns) ? body.columns.map((c: unknown) => String(c)) : null
  if (!asked) {
    return NextResponse.json({ error: { code: 'VALIDATION', field: 'columns', message: 'Which columns? Send the list in the order you want them.' } }, { status: 422 })
  }
  const picked = pickColumns(asked)
  if (!picked.ok) return NextResponse.json({ error: { code: 'BAD_COLUMNS', message: picked.says } }, { status: 422 })
  const ids = asked.length === 0 ? [] : picked.ids
  await prisma.companyCoding.upsert({
    where: { companyId: d.companyId },
    create: { companyId: d.companyId, fileColumns: ids },
    update: { fileColumns: ids },
  })
  return NextResponse.json({
    data: {
      columns: savedColumns(ids),
      says: ids.length === 0 ? 'Every column will be in the file.' : `Saved. The file will carry ${ids.length} column${ids.length === 1 ? '' : 's'}, in this order.`,
    },
  })
}
