import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, type CallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { regionScopeFor, type RegionScope } from '@/lib/region-scope'
import { sitesOf, placementsAt } from '@/lib/sites'
import { daysOffFor } from '@/lib/days-off'
import { notYourSites, outsideYourRegion, placementsStillAt, pastPlacementsAt } from '@/lib/site-rules'

/**
 * GET    /api/settings/locations      — every site, with its managers, suppliers and contractors
 * POST   /api/settings/locations      — add a site
 * PATCH  /api/settings/locations      — edit one, or make it primary
 * DELETE /api/settings/locations?id=  — remove one
 *
 * Where people actually work. Tenure is counted at a company across every
 * site, tax and days off follow a site, and since 2026-10-28 a job names
 * its site and a site names its suppliers ("Sites — where people work",
 * CLAUDE.md). The screen is Settings → Sites; the reads and the rules are
 * lib/sites and lib/site-rules.
 *
 * Who may change a site: the company's own Owner, Admin or whoever holds
 * settings.manage. Never another firm: a supplier, or an MSP seated in
 * the client's program, is refused in a sentence naming whose sites they
 * are. A seat that reads one region reads and changes that region's
 * sites only. A site with a placement at it is not deleted.
 *
 * No access log: a site, its supplier firms and its colleagues' names are
 * the company's own setup, not another person's data. A refusal names no
 * person and reads nothing.
 */

function refuse(code: string, message: string, status = 403) {
  return NextResponse.json({ error: { code, message } }, { status })
}

async function scopeOf(caller: CallerContext): Promise<RegionScope | null> {
  return caller.region ? regionScopeFor(caller.company!.id, caller.region.unitId) : null
}

/** A site by id at any company, so a stranger's site is refused by name rather than "not found". */
async function siteFor(caller: CallerContext, id: string) {
  const site = await prisma.companyLocation.findUnique({
    where: { id },
    select: { id: true, companyId: true, name: true, city: true, region: true, isPrimary: true, company: { select: { name: true } } },
  })
  if (!site) return { site: null, error: refuse('NOT_FOUND', 'That site is not on the record.', 404) }
  if (site.companyId !== caller.company!.id) return { site: null, error: refuse('NOT_YOUR_SITES', notYourSites(site.company.name)) }
  const scope = await scopeOf(caller)
  if (scope && !scope.siteIds.includes(site.id)) {
    return { site: null, error: refuse('OUTSIDE_YOUR_REGION', outsideYourRegion(site.name, site.region, scope.label)) }
  }
  return { site, error: null }
}

async function writer(request: NextRequest) {
  const { caller, error } = await getCallerContext(request, { narrowsToRegion: true })
  if (error) return { caller: null, error }
  if (!caller.company) {
    return { caller: null, error: refuse('NO_COMPANY', 'Sites are a company’s, and you are not signed in at one.') }
  }
  if (!hasPermission(caller.permissions, 'settings.manage')) {
    return {
      caller: null,
      error: refuse('FORBIDDEN', askTheDesk({ doing: 'Changing sites', needs: 'settings.manage', kind: caller.company.kind, companyName: caller.company.name })),
    }
  }
  return { caller, error: null }
}

const text = (v: unknown) => (v == null || String(v).trim() === '' ? null : String(v).trim())

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request, { narrowsToRegion: true })
  if (error) return error
  if (!caller.company) return refuse('NO_COMPANY', 'Sites are a company’s, and you are not signed in at one.')
  // Another company's sites are its own. A supplier or a seated MSP asking
  // for a client's is told whose they are, and nothing is read.
  const asked = request.nextUrl.searchParams.get('companyId')
  if (asked && asked !== caller.company.id) {
    const other = await prisma.company.findUnique({ where: { id: asked }, select: { name: true } })
    return refuse('NOT_YOUR_SITES', notYourSites(other?.name ?? 'That company'))
  }
  if (!hasPermission(caller.permissions, 'settings.manage') && !hasPermission(caller.permissions, 'vendors.manage')) {
    return refuse('FORBIDDEN', askTheDesk({ doing: 'Reading sites', needs: ['settings.manage', 'vendors.manage'], kind: caller.company.kind, companyName: caller.company.name }))
  }
  const scope = await scopeOf(caller)
  const [read, daysOff] = await Promise.all([sitesOf(caller.company.id, scope?.siteIds), daysOffFor(caller.company.id)])
  return NextResponse.json({
    data: {
      ...read,
      company: { id: caller.company.id, name: caller.company.name, kind: caller.company.kind },
      region: scope?.label ?? null,
      // The company's days off, 0 Sunday to 6 Saturday: a site follows them.
      daysOff,
      mayEdit: hasPermission(caller.permissions, 'settings.manage'),
      mayName: hasPermission(caller.permissions, 'settings.manage') || hasPermission(caller.permissions, 'vendors.manage'),
    },
  })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await writer(request)
  if (error) return error

  const body = await request.json().catch(() => ({}))
  if (body.companyId && body.companyId !== caller!.company!.id) {
    const other = await prisma.company.findUnique({ where: { id: String(body.companyId) }, select: { name: true } })
    return refuse('NOT_YOUR_SITES', notYourSites(other?.name ?? 'That company'))
  }
  const name = text(body.name)
  if (!name) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'A site needs a name people would recognize', field: 'name' } },
      { status: 422 }
    )
  }
  // A seat that reads one region adds sites in that region only.
  const scope = await scopeOf(caller!)
  const region = scope ? scope.label : text(body.region)
  if (scope && body.region && text(body.region) !== scope.label) {
    return refuse('OUTSIDE_YOUR_REGION', outsideYourRegion(name, text(body.region), scope.label))
  }

  const makePrimary = Boolean(body.isPrimary)
  // Exactly one primary. Two would make "the default site" a question
  // with two answers, which every caller would resolve differently.
  if (makePrimary) {
    await prisma.companyLocation.updateMany({ where: { companyId: caller!.company!.id, isPrimary: true }, data: { isPrimary: false } })
  }

  const location = await prisma.companyLocation.create({
    data: {
      companyId: caller!.company!.id,
      name,
      address: text(body.address),
      city: text(body.city),
      state: text(body.state),
      country: String(body.country ?? 'US').toUpperCase().slice(0, 2),
      timeZone: text(body.timeZone),
      region,
      isRemote: Boolean(body.isRemote),
      isPrimary: makePrimary,
      source: 'PERSON',
      recordedById: caller!.person.id,
      recordedAt: new Date(),
    },
  })

  return NextResponse.json({ data: { location } }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const { caller, error } = await writer(request)
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const { site, error: refused } = await siteFor(caller!, String(body.id ?? ''))
  if (refused) return refused

  // A region seat moves nothing out of its region.
  const scope = await scopeOf(caller!)
  if (scope && 'region' in body && text(body.region) !== scope.label) {
    return refuse('OUTSIDE_YOUR_REGION', outsideYourRegion(site!.name, text(body.region), scope.label))
  }

  if (body.isPrimary === true) {
    await prisma.companyLocation.updateMany({ where: { companyId: caller!.company!.id, isPrimary: true }, data: { isPrimary: false } })
  }

  const location = await prisma.companyLocation.update({
    where: { id: site!.id },
    data: {
      ...(text(body.name) ? { name: text(body.name)! } : {}),
      ...('address' in body ? { address: text(body.address) } : {}),
      ...('city' in body ? { city: text(body.city) } : {}),
      ...('state' in body ? { state: text(body.state) } : {}),
      ...(typeof body.country === 'string' ? { country: body.country.toUpperCase().slice(0, 2) } : {}),
      ...('timeZone' in body ? { timeZone: text(body.timeZone) } : {}),
      ...('region' in body ? { region: text(body.region) } : {}),
      ...('isRemote' in body ? { isRemote: Boolean(body.isRemote) } : {}),
      ...('isPrimary' in body ? { isPrimary: Boolean(body.isPrimary) } : {}),
      // A person correcting a site makes it theirs, with the time.
      source: 'PERSON',
      recordedById: caller!.person.id,
      recordedAt: new Date(),
    },
  })

  return NextResponse.json({ data: { location } })
}

export async function DELETE(request: NextRequest) {
  const { caller, error } = await writer(request)
  if (error) return error

  const { site, error: refused } = await siteFor(caller!, request.nextUrl.searchParams.get('id') ?? '')
  if (refused) return refused

  // Somebody placed at a site is moved first; deleting it would detach a
  // live placement from the place its days off and time zone come from.
  const { live, past } = await placementsAt(site!.id)
  if (live > 0) return refuse('PLACEMENTS_AT_SITE', placementsStillAt(site!, live), 409)
  // And a past placement's time there is counted at it.
  if (past > 0) return refuse('PAST_PLACEMENTS_AT_SITE', pastPlacementsAt(site!, past), 409)

  await prisma.companyLocation.delete({ where: { id: site!.id } })

  return NextResponse.json({
    data: {
      removed: site!.name,
      // Losing the primary silently is how a site picker ends up with no
      // default and every new job is asked a question nobody knows the
      // answer to.
      warning: site!.isPrimary ? 'That was your primary site. Set another one.' : null,
    },
  })
}
