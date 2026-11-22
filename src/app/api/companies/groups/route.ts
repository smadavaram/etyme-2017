import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly, isConsultantSeat } from '@/lib/seat'
import { hasPermission } from '@/lib/permissions'
import { pickerOptions, sellsToSomebody } from '@/lib/counterparty'
import { listWithGroups } from '../groups'

/**
 * GET /api/companies/groups — customers, clients and suppliers on the caller's own list
 * GET /api/companies/groups?for=bill-to — who a bill can go to: customers
 * GET /api/companies/groups?for=worksite — where a person can work: clients
 *
 * Record 110, A1. One reader (`listWithGroups`) behind the Companies
 * tabs, the Classify page and both pickers. Each row says what the
 * caller's own contracts say and what a person said, apart. A picker
 * offers a company that still needs classifying only with those words
 * beside its name. Reads the caller's own register and lines only.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Companies')
  if (notStaff) return notStaff
  if (!caller.company || isConsultantSeat(caller)) {
    return NextResponse.json({ error: { code: 'NO_COMPANY', message: 'Customers, clients and suppliers are a company’s list, and you are not signed in at one.' } }, { status: 403 })
  }
  const me = caller.company
  const sells = sellsToSomebody(me.kind)
  const list = await listWithGroups(caller)

  const asked = request.nextUrl.searchParams.get('for')
  if (asked) {
    if (asked !== 'bill-to' && asked !== 'worksite') {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'Ask for bill-to or worksite.', field: 'for' } }, { status: 422 })
    }
    // A firm that only buys bills nobody and places nobody at a client.
    const onEtyme = new Map(list.rows.map((r) => [r.id, r.onEtyme]))
    const options = sells
      ? pickerOptions(asked === 'bill-to' ? 'BILL_TO' : 'WORKSITE', list.rows).map((o) => ({ ...o, onEtyme: onEtyme.get(o.id) === true }))
      : []
    return NextResponse.json({ data: { for: asked, options } })
  }

  const entities = await prisma.legalEntity.findMany({ where: { companyId: me.id }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
  return NextResponse.json({
    data: {
      sells,
      totals: list.totals,
      says: list.says,
      mayClassify: sells && hasPermission(caller.permissions, 'vendors.manage'),
      entities,
      companies: list.rows.map((r) => ({
        id: r.id,
        name: r.name,
        groups: r.read.groups,
        said: r.read.said,
        onContracts: r.read.onContracts,
        needsClassifying: r.read.needsClassifying,
        notClassified: r.read.notClassified,
        other: r.read.other,
        suggestion: r.read.suggestion,
        classifiedAt: r.read.classifiedAt,
        classifiedByName: r.read.classifiedByName,
      })),
    },
  })
}
