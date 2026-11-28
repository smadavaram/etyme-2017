import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { readCaller, refuseUnlessPayerManager } from '../coding/guard'

/**
 * GET /api/settings/codes — the page where the client's own codes are kept
 *
 * The cost centers with their profit centers, for the seat that keeps the
 * codes: Finance or the Owner, or the AP clerk where no Finance seat
 * exists (`mayMaintainCodes`). The page the Settings link opens for that
 * seat, which does not hold settings.manage and cannot open the company's
 * settings page. Writing goes through the same routes as on that page.
 *
 * The first gate is the two permissions that can be that seat; the
 * second is the verdict, which answers every other seat in a sentence
 * naming who sets the codes.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await readCaller(request)
  if (error) return error
  // The two permissions that can be the keeper are the first gate (the menu offers the page by them);
  // the verdict is the second, and its sentence names who does keep the codes. The refusal is logged first.
  if (!hasPermission(caller.permissions, 'codes.manage') && !hasPermission(caller.permissions, 'payments.record')) {
    const refused = await refuseUnlessPayerManager(caller, 'Reading the company’s codes')
    if (refused) return refused
  }
  const refused = await refuseUnlessPayerManager(caller, 'Reading the company’s codes')
  if (refused) return refused
  const costCenters = await prisma.costCenter.findMany({
    where: { companyId: caller.company!.id, isActive: true },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true, glAccount: true, profitCenter: true },
  })
  return NextResponse.json({ data: { canEditCodes: true, costCenters } })
}
