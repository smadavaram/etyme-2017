import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, type CallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { mayMaintainCodes } from '@/lib/money/client-codes'
import { recordRefusal } from '@/lib/access-log'
import { mayOpen, PAYABLE } from '@/lib/money/desks'
import { CLIENT_CODES_NOT_PAYER } from '@/lib/counterparty'

/**
 * Whether a company pays invoice receipts: it is a client, or it holds a
 * supplier on its register (a stored Supplier row, or an agreement that
 * makes the other firm its supplier, as `register` reads positions), and
 * its seat opens Payables, as the receipts file asks. Kind says nothing
 * about it: a prime, an integrator or an MSP pays its sub-vendors.
 */
export async function paysInvoiceReceipts(caller: CallerContext): Promise<boolean> {
  const company = caller.company
  if (!company) return false
  if (company.kind === 'CLIENT') return true
  if (!mayOpen(caller.permissions, PAYABLE)) return false
  const [row, msa] = await Promise.all([
    prisma.counterparty.findFirst({ where: { companyId: company.id, relationship: 'SUPPLIER' }, select: { id: true } }),
    prisma.masterAgreement.findFirst({ where: { clientId: company.id }, select: { id: true } }),
  ])
  return row != null || msa != null
}

/**
 * Who may read or write a client's own codes: a seat `mayMaintainCodes` names,
 * at the company that pays. A refusal is a sentence, and its row is written
 * before it is sent.
 */
export async function refuseUnlessPayerManager(caller: CallerContext, doing: string): Promise<NextResponse | null> {
  const company = caller.company
  const payer = company ? await paysInvoiceReceipts(caller) : false
  const verdict = company && payer ? await mayMaintainCodes(caller) : null
  if (company && payer && verdict?.may) return null
  if (company) {
    await recordRefusal([{ companyId: company.id }], {
      actorPersonId: caller.isService ? undefined : caller.person.id,
      actorCompanyId: company.id,
      action: 'CONTRACT_VIEW',
      reason: `Refused: ${doing}, which only the paying company’s Finance, Owner or AP clerk does.`,
    })
  }
  return NextResponse.json(
    { error: { code: 'FORBIDDEN', message: company && !payer ? CLIENT_CODES_NOT_PAYER : verdict && !verdict.may ? verdict.says : CLIENT_CODES_NOT_PAYER } },
    { status: 403 },
  )
}

export async function logCodeChange(caller: CallerContext, action: string, what: string): Promise<void> {
  await prisma.automationLog.create({
    data: {
      companyId: caller.company!.id,
      action,
      summary: `${caller.person.name} changed ${what}`,
      reason: 'Edited in settings by a seat that manages them',
      payload: { by: caller.isService ? null : caller.person.id },
      reversible: false,
    },
  })
}

export async function readCaller(request: NextRequest) {
  return getCallerContext(request)
}
