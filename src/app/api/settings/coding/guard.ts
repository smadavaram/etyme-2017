import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, type CallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { recordRefusal } from '@/lib/access-log'
import { CLIENT_CODES_NOT_PAYER, CLIENT_CODES_REFUSED } from '@/lib/counterparty'

/**
 * Who may read or write a client's own codes: a seat that manages settings,
 * at the company that pays. A refusal is a sentence, and its row is written
 * before it is sent.
 */
export async function refuseUnlessPayerManager(caller: CallerContext, doing: string): Promise<NextResponse | null> {
  const company = caller.company
  const payer = company?.kind === 'CLIENT'
  const may = hasPermission(caller.permissions, 'settings.manage')
  if (company && payer && may) return null
  if (company) {
    await recordRefusal([{ companyId: company.id }], {
      actorPersonId: caller.isService ? undefined : caller.person.id,
      actorCompanyId: company.id,
      action: 'CONTRACT_VIEW',
      reason: `Refused: ${doing}, which only the paying company’s settings seat does.`,
    })
  }
  return NextResponse.json(
    { error: { code: 'FORBIDDEN', message: company && !payer ? CLIENT_CODES_NOT_PAYER : CLIENT_CODES_REFUSED } },
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
