import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { regionScopeFor } from '@/lib/region-scope'
import { approvedSuppliersOf, siteSuppliers } from '@/lib/sites'
import { SITE_FIELD_SAYS, sendToSays, approvedAtWords, pickSite } from '@/lib/job-site'
import { whoIsHiring } from '../who-is-hiring'

/**
 * GET /api/requisitions/sites?locationId=…
 *
 * What the job form needs to draw "Site" and "Send the job to" (founder,
 * 2026-10-28, the Sites drawing): the sites a job may be posted at, the
 * one picked (the primary site where none is asked for), the suppliers
 * approved there, ticked by default, and the firms approved for the
 * company and not at the site, which cannot be ticked and are named in
 * the sentence so the hiring manager knows who to ask Procurement about.
 *
 * Whose sites: the company that is hiring, by the same four answers the
 * raise gives (`whoIsHiring`). An MSP or a prime in a seat a client
 * granted reads that client's sites; everybody else their own firm's. A
 * seat that reads one region is offered that region's sites only.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const at = await whoIsHiring(caller, request.nextUrl.searchParams.get('clientCompanyId'))
  if (at.error) return at.error
  const { client, seat, acting } = at

  if (!hasPermission(acting.permissions, 'requirements.write')) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_HIRING',
          message: `Posting a job at ${client.name} is for whoever is hiring there — a hiring manager or the program manager.`,
        },
      },
      { status: 403 }
    )
  }

  const scope = await regionScopeFor(client.id, seat ? seat.orgUnitId : caller.orgUnitId)
  const rows = await prisma.companyLocation.findMany({
    where: { companyId: client.id, ...(scope ? { id: { in: scope.siteIds } } : {}) },
    orderBy: [{ isPrimary: 'desc' }, { region: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, city: true, state: true, country: true, isPrimary: true },
  })
  const sites = rows
  const picked = pickSite(rows, request.nextUrl.searchParams.get('locationId'))

  const approved = await approvedSuppliersOf(client.id)
  if (!picked) {
    return NextResponse.json({
      data: {
        sites, site: null, siteSays: SITE_FIELD_SAYS,
        suppliers: approved.map((f) => ({ ...f, says: null })), others: [], everyApproved: true,
        says: sendToSays({ site: null, atSite: [], others: [], everyApproved: true }),
      },
    })
  }

  const here = await siteSuppliers(picked.id)
  const ids = new Set(here?.ids ?? approved.map((f) => f.id))
  const everyApproved = here?.everyApproved ?? true
  const atSite = approved.filter((f) => ids.has(f.id))
  // The firms worth asking Procurement about: approved for the company,
  // not named here, and either named at another site in this country or
  // at no site at all. A Vietnamese agency is not a firm a Dayton manager
  // asks to add, so the sentence does not offer it.
  const named = everyApproved ? [] : await prisma.siteSupplier.findMany({
    where: { location: { companyId: client.id } },
    select: { supplierCompanyId: true, location: { select: { country: true } } },
  })
  const inCountry = new Set(named.filter((n) => n.location.country === picked.country).map((n) => n.supplierCompanyId))
  const anywhere = new Set(named.map((n) => n.supplierCompanyId))
  const others = everyApproved
    ? []
    : approved.filter((f) => !ids.has(f.id) && (inCountry.has(f.id) || !anywhere.has(f.id)))
  return NextResponse.json({
    data: {
      sites,
      site: picked,
      siteSays: SITE_FIELD_SAYS,
      suppliers: atSite.map((f) => ({ ...f, says: everyApproved ? null : approvedAtWords(picked) })),
      others,
      everyApproved,
      says: sendToSays({ site: picked, atSite: atSite.map((f) => f.name), others: others.map((f) => f.name), everyApproved }),
    },
  })
}
