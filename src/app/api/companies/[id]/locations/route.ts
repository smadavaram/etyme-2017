import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { dealingsWithSides } from '../../dealings'
import { isMine } from '@/lib/counterparty'
import { recordRefusal } from '@/lib/access-log'
import { countryFromTyped } from '@/lib/setup-steps'
import { postalFromTyped } from '@/lib/site-rules'

/**
 * GET /api/companies/:id/locations
 *
 * Lists work locations for a company. Used by the contracts creation
 * form to pick a work site, and by the Companies drawer to show where a
 * counterparty's people work.
 *
 * BRD Addendum C: "The end client (endClientCompanyId) is the
 * enterprise where the consultant physically works." Locations are
 * the specific sites within that enterprise.
 *
 * Sign-up walk, round five, problem 2: this answered any company's sites
 * to anybody signed in, on a session alone. It now goes through the one
 * door, and answers the caller's own company or a company it trades
 * with — the same set the Companies register lists (`./dealings`) — and
 * nobody else's, which it answers as a company that is not there.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params

  const own = caller.company?.id === id
  // Staff reach is for a staff caller with no seat. A staff address that
  // holds a seat reads that seat's book, like anybody seated there
  // (2026-11-15). A firm on Etyme the caller reached only by its own
  // writing is one it does not work with (record 61), so its sites are
  // not the caller's to read; the caller's own records are.
  const target = own ? null : await prisma.company.findUnique({
    where: { id },
    select: { id: true, name: true, claimedAt: true, listedById: true, _count: { select: { contexts: true } } },
  })
  const sides = own || !caller.company ? null : await dealingsWithSides(caller, false)
  const onEtyme = target != null && (target.claimedAt != null || target._count.contexts > 0)
  const trades = own
    || (caller.staff && !caller.company)
    || (target != null && caller.company != null && isMine(target, caller.company.id))
    || (sides != null && sides.ids.has(id) && !(onEtyme && sides.ownSideOnly.has(id)))

  const company = trades
    ? await prisma.company.findUnique({ where: { id }, select: { id: true, name: true } })
    : null

  if (!company) {
    const says = 'That company is not one you trade with.'
    // Written before the refusal is sent (lib/access-log).
    const subject = target?.id ?? caller.company?.id
    if (subject) await recordRefusal([{ companyId: subject }], {
      actorPersonId: caller.isService ? undefined : caller.person?.id,
      actorCompanyId: caller.company?.id,
      action: 'CONTRACT_VIEW',
      reason: `Refused reading the sites of ${id}: ${says}`,
    })
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: says } },
      { status: 404 }
    )
  }

  const locations = await prisma.companyLocation.findMany({
    where: { companyId: id },
    orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
  })

  return NextResponse.json({
    data: {
      company: { id: company.id, name: company.name },
      locations: locations.map((loc) => ({
        id: loc.id,
        name: loc.name,
        address: loc.address,
        city: loc.city,
        state: loc.state,
        postalCode: loc.postalCode,
        country: loc.country,
        isRemote: loc.isRemote,
        isPrimary: loc.isPrimary,
      })),
    },
  })
}

/**
 * POST /api/companies/:id/locations
 *
 * Add a work location — to the caller's own company only, by a seat that
 * manages its settings. Settings uses /api/settings/locations; this is
 * the same act by another address, so it asks the same desk.
 * Body: { name, address?, city?, state?, postalCode?, country?, isRemote?, isPrimary? }
 * Country and ZIP are read the way Settings → Sites reads them (fix list A5).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params

  if (!caller.company || caller.company.id !== id) {
    return NextResponse.json(
      { error: { code: 'NOT_YOURS', message: 'A company adds its own work sites. You can add one only at the company you are signed in at.' } },
      { status: 403 }
    )
  }
  if (!hasPermission(caller.permissions, 'settings.manage')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: askTheDesk({ doing: 'Adding a work site', needs: 'settings.manage', kind: caller.company.kind, companyName: caller.company.name }),
        },
      },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const { name, address, city, state, country, postalCode, isRemote, isPrimary } = body ?? {}

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Give the site a name, like "Head office" or "Tualatin plant".', field: 'name' } },
      { status: 422 }
    )
  }

  const typedCountry = countryFromTyped(country)
  if (!typedCountry.ok) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: typedCountry.says, field: 'country' } }, { status: 422 })
  }
  const typedPostal = postalFromTyped(postalCode)
  if (!typedPostal.ok) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: typedPostal.says, field: 'postalCode' } }, { status: 422 })
  }

  // If setting isPrimary, unset any existing primary location
  if (isPrimary) {
    await prisma.companyLocation.updateMany({
      where: { companyId: id, isPrimary: true },
      data: { isPrimary: false },
    })
  }

  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

  const location = await prisma.companyLocation.create({
    data: {
      companyId: id,
      name: name.trim(),
      address: text(address),
      city: text(city),
      state: text(state),
      postalCode: typedPostal.code,
      // The column has a default and is not nullable; an empty country
      // was passed as null, which is the 500 round five saw.
      ...(typedCountry.code ? { country: typedCountry.code } : {}),
      isRemote: isRemote === true,
      isPrimary: isPrimary === true,
    },
  })

  return NextResponse.json({
    data: {
      location: {
        id: location.id,
        name: location.name,
        address: location.address,
        city: location.city,
        state: location.state,
        postalCode: location.postalCode,
        country: location.country,
        isRemote: location.isRemote,
        isPrimary: location.isPrimary,
      },
    },
  }, { status: 201 })
}
