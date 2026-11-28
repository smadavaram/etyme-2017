import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { regionScopeFor } from '@/lib/region-scope'
import { setSiteSuppliers } from '@/lib/sites'
import { notYourSites, outsideYourRegion } from '@/lib/site-rules'

/**
 * PUT /api/settings/locations/:id/suppliers — { supplierIds: string[] }
 *
 * The suppliers this site names, as the ticks on Settings → Sites read
 * (founder, 2026-10-28). Every firm must already be approved for the
 * company: Procurement approves a firm first, under Suppliers, and then
 * any site may name it. The first that is not is refused in that
 * sentence and nothing is written (`setSiteSuppliers` in lib/sites).
 *
 * Named by the company's own settings or Procurement seat. Never by
 * another firm (a supplier, or an MSP seated in the client's program),
 * and never by a region seat outside its region.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller, error } = await getCallerContext(request, { narrowsToRegion: true })
  if (error) return error
  if (!caller.company) {
    return NextResponse.json({ error: { code: 'NO_COMPANY', message: 'Sites are a company’s, and you are not signed in at one.' } }, { status: 403 })
  }
  const { id } = await params
  const site = await prisma.companyLocation.findUnique({
    where: { id },
    select: { id: true, name: true, region: true, companyId: true, company: { select: { name: true } } },
  })
  if (!site) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That site is not on the record.' } }, { status: 404 })
  if (site.companyId !== caller.company.id) {
    return NextResponse.json({ error: { code: 'NOT_YOUR_SITES', message: notYourSites(site.company.name) } }, { status: 403 })
  }
  if (!hasPermission(caller.permissions, 'settings.manage') && !hasPermission(caller.permissions, 'vendors.manage')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: askTheDesk({ doing: 'Naming the suppliers at a site', needs: ['settings.manage', 'vendors.manage'], kind: caller.company.kind, companyName: caller.company.name }) } },
      { status: 403 }
    )
  }
  if (caller.region) {
    const scope = await regionScopeFor(caller.company.id, caller.region.unitId)
    if (!scope || !scope.siteIds.includes(site.id)) {
      return NextResponse.json(
        { error: { code: 'OUTSIDE_YOUR_REGION', message: outsideYourRegion(site.name, site.region, caller.region.label) } },
        { status: 403 }
      )
    }
  }

  const body = await request.json().catch(() => ({}))
  if (!Array.isArray(body.supplierIds)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Say which suppliers this site names, as a list. An empty list names none.', field: 'supplierIds' } },
      { status: 422 }
    )
  }
  const result = await setSiteSuppliers(site.id, body.supplierIds.map(String), caller.person.id)
  if (!result.ok) {
    return NextResponse.json({ error: { code: 'NOT_APPROVED', message: result.says } }, { status: 409 })
  }
  return NextResponse.json({ data: { named: result.named, site: site.name } })
}
