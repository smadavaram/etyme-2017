import { NextResponse } from 'next/server'
import type { CallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { paysInvoiceReceipts } from '../settings/coding/guard'
import { hasPermission } from '@/lib/permissions'
import { recordRefusal } from '@/lib/access-log'
import { CLIENT_CODES_NOT_PAYER, CLIENT_CODES_REFUSED, VENDOR_NUMBER_HELP } from '@/lib/counterparty'

/**
 * The payer's own vendor number for a supplier, on the payer's register row.
 *
 * GET   /api/counterparties?vendorNumberFor=<supplierId>
 * PATCH /api/counterparties { vendorNumberFor: <supplierId>, vendorNumber }
 *
 * Only the paying client that keeps the row, and only a seat that manages
 * settings. The row is this caller's own, so no other firm's is read, and
 * the supplier is never told.
 */
async function refuse(caller: CallerContext, doing: string, notPayer: boolean) {
  await recordRefusal([{ companyId: caller.company!.id }], {
    actorPersonId: caller.isService ? undefined : caller.person.id,
    actorCompanyId: caller.company!.id,
    action: 'CONTRACT_VIEW',
    reason: `Refused: ${doing}, which only the paying company’s settings seat does.`,
  })
  return NextResponse.json({ error: { code: 'FORBIDDEN', message: notPayer ? CLIENT_CODES_NOT_PAYER : CLIENT_CODES_REFUSED } }, { status: 403 })
}

async function mayHold(caller: CallerContext) {
  return hasPermission(caller.permissions, 'settings.manage') && (await paysInvoiceReceipts(caller))
}

const supplierRow = (companyId: string, supplierId: string) =>
  prisma.counterparty.findFirst({
    where: { companyId, otherCompanyId: supplierId, relationship: 'SUPPLIER' },
    select: { id: true, vendorNumber: true },
  })

const NOT_A_SUPPLIER = { error: { code: 'NOT_FOUND', message: 'That firm is not a supplier on your register.' } }

export async function readVendorNumber(caller: CallerContext, supplierId: string) {
  if (!(await mayHold(caller))) return refuse(caller, 'Reading a vendor number', !(await paysInvoiceReceipts(caller)))
  const row = supplierId ? await supplierRow(caller.company!.id, supplierId) : null
  if (!row) return NextResponse.json(NOT_A_SUPPLIER, { status: 404 })
  return NextResponse.json({ data: { vendorNumber: row.vendorNumber, says: VENDOR_NUMBER_HELP } })
}

export async function nameVendorNumber(caller: CallerContext, body: { vendorNumberFor?: unknown; vendorNumber?: unknown }) {
  if (!(await mayHold(caller))) return refuse(caller, 'Changing a vendor number', !(await paysInvoiceReceipts(caller)))
  const companyId = caller.company!.id
  if (typeof body.vendorNumber !== 'string' && body.vendorNumber !== null) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Type the vendor number, or leave the box empty.', field: 'vendorNumber' } }, { status: 422 })
  }
  const value = typeof body.vendorNumber === 'string' ? body.vendorNumber.trim() : ''
  if (value.length > 30) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'A vendor number is at most 30 characters.', field: 'vendorNumber' } }, { status: 422 })
  }
  const supplierId = typeof body.vendorNumberFor === 'string' ? body.vendorNumberFor : ''
  const row = supplierId ? await supplierRow(companyId, supplierId) : null
  if (!row) return NextResponse.json(NOT_A_SUPPLIER, { status: 404 })

  const updated = await prisma.counterparty.update({ where: { id: row.id }, data: { vendorNumber: value || null }, select: { vendorNumber: true } })
  const supplier = await prisma.company.findUnique({ where: { id: supplierId }, select: { name: true } })
  await prisma.automationLog.create({
    data: {
      companyId,
      action: 'VENDOR_NUMBER_CHANGED',
      summary: `${caller.person.name} changed the vendor number for ${supplier?.name ?? 'a supplier'}`,
      reason: 'Edited on the register by a seat that manages settings',
      payload: { by: caller.isService ? null : caller.person.id, supplierId },
      reversible: false,
    },
  })
  return NextResponse.json({ data: { vendorNumber: updated.vendorNumber, says: VENDOR_NUMBER_HELP } })
}
