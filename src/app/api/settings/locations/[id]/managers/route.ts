import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { regionScopeFor } from '@/lib/region-scope'
import { notYourSites, outsideYourRegion } from '@/lib/site-rules'

/**
 * POST   /api/settings/locations/:id/managers — { personId }
 * DELETE /api/settings/locations/:id/managers?personId=
 *
 * A hiring manager named at a site by a person, for somebody who has
 * posted nothing there yet. Everyone else is read from the record (the
 * jobs they posted and the placements they manage there), so naming
 * them is never needed and removing a name never hides them
 * (`siteManagersFrom` in lib/site-rules).
 *
 * The person must hold a seat at this company: a site's hiring manager
 * is somebody who can raise a job here. Inviting one who is not seated
 * yet is Users & permissions' job, and the screen links to it.
 */

async function guard(request: NextRequest, id: string) {
  const { caller, error } = await getCallerContext(request, { narrowsToRegion: true })
  if (error) return { error }
  if (!caller.company) {
    return { error: NextResponse.json({ error: { code: 'NO_COMPANY', message: 'Sites are a company’s, and you are not signed in at one.' } }, { status: 403 }) }
  }
  const site = await prisma.companyLocation.findUnique({
    where: { id },
    select: { id: true, name: true, region: true, companyId: true, company: { select: { name: true } } },
  })
  if (!site) return { error: NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That site is not on the record.' } }, { status: 404 }) }
  if (site.companyId !== caller.company.id) {
    return { error: NextResponse.json({ error: { code: 'NOT_YOUR_SITES', message: notYourSites(site.company.name) } }, { status: 403 }) }
  }
  if (!hasPermission(caller.permissions, 'settings.manage')) {
    return {
      error: NextResponse.json(
        { error: { code: 'FORBIDDEN', message: askTheDesk({ doing: 'Naming who hires at a site', needs: 'settings.manage', kind: caller.company.kind, companyName: caller.company.name }) } },
        { status: 403 }
      ),
    }
  }
  if (caller.region) {
    const scope = await regionScopeFor(caller.company.id, caller.region.unitId)
    if (!scope || !scope.siteIds.includes(site.id)) {
      return { error: NextResponse.json({ error: { code: 'OUTSIDE_YOUR_REGION', message: outsideYourRegion(site.name, site.region, caller.region.label) } }, { status: 403 }) }
    }
  }
  return { caller, site, error: null }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guard(request, id)
  if (g.error) return g.error
  const body = await request.json().catch(() => ({}))
  const personId = String(body.personId ?? '')
  const seat = await prisma.context.findFirst({
    where: { personId, companyId: g.caller!.company!.id, type: 'EMPLOYEE', revokedAt: null },
    select: { person: { select: { name: true } } },
  })
  if (!seat) {
    return NextResponse.json(
      { error: { code: 'NOT_SEATED', message: `A hiring manager at ${g.site!.name} holds a seat at ${g.caller!.company!.name}. Invite them from Users & permissions first.` } },
      { status: 422 }
    )
  }
  await prisma.siteHiringManager.createMany({
    data: [{ locationId: g.site!.id, personId, namedById: g.caller!.person.id, source: 'PERSON' }],
    skipDuplicates: true,
  })
  return NextResponse.json({ data: { named: seat.person.name, site: g.site!.name } }, { status: 201 })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guard(request, id)
  if (g.error) return g.error
  const personId = request.nextUrl.searchParams.get('personId') ?? ''
  const removed = await prisma.siteHiringManager.deleteMany({ where: { locationId: g.site!.id, personId } })
  return NextResponse.json({ data: { removed: removed.count } })
}
