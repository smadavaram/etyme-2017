import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'

/**
 * POST   /api/settings/locations      — add a work site
 * PATCH  /api/settings/locations      — edit one, or make it primary
 * DELETE /api/settings/locations?id=  — remove one
 *
 * Where people actually work. This matters more than it looks: tenure is
 * counted at a place, tax follows a place, and a contract with no location
 * cannot answer either question.
 */

async function guard(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return { caller: null, error }
  if (!caller.company) {
    return {
      caller: null,
      error: NextResponse.json(
        { error: { code: 'NO_COMPANY', message: 'Locations belong to a company' } },
        { status: 403 }
      ),
    }
  }
  if (!hasPermission(caller.permissions, 'settings.manage')) {
    return {
      caller: null,
      error: NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Changing locations needs settings.manage' } },
        { status: 403 }
      ),
    }
  }
  return { caller, error: null }
}

export async function POST(request: NextRequest) {
  const { caller, error } = await guard(request)
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const name = String(body.name ?? '').trim()
  if (!name) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'A location needs a name people would recognise', field: 'name' } },
      { status: 422 }
    )
  }

  const isRemote = Boolean(body.isRemote)
  const makePrimary = Boolean(body.isPrimary)

  // Exactly one primary. Two would make "the default work site" a question
  // with two answers, which every caller would resolve differently.
  if (makePrimary) {
    await prisma.companyLocation.updateMany({
      where: { companyId: caller!.company!.id, isPrimary: true },
      data: { isPrimary: false },
    })
  }

  const location = await prisma.companyLocation.create({
    data: {
      companyId: caller!.company!.id,
      name,
      address: body.address ? String(body.address).trim() : null,
      city: body.city ? String(body.city).trim() : null,
      state: body.state ? String(body.state).trim() : null,
      country: String(body.country ?? 'US').toUpperCase().slice(0, 2),
      isRemote,
      isPrimary: makePrimary,
    },
  })

  return NextResponse.json({ data: { location } }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const { caller, error } = await guard(request)
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const id = String(body.id ?? '')
  const existing = await prisma.companyLocation.findFirst({
    where: { id, companyId: caller!.company!.id },
  })
  if (!existing) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such location here' } },
      { status: 404 }
    )
  }

  if (body.isPrimary === true) {
    await prisma.companyLocation.updateMany({
      where: { companyId: caller!.company!.id, isPrimary: true },
      data: { isPrimary: false },
    })
  }

  const location = await prisma.companyLocation.update({
    where: { id },
    data: {
      ...(typeof body.name === 'string' && body.name.trim() ? { name: body.name.trim() } : {}),
      ...('address' in body ? { address: body.address ? String(body.address).trim() : null } : {}),
      ...('city' in body ? { city: body.city ? String(body.city).trim() : null } : {}),
      ...('state' in body ? { state: body.state ? String(body.state).trim() : null } : {}),
      ...(typeof body.country === 'string' ? { country: body.country.toUpperCase().slice(0, 2) } : {}),
      ...('isRemote' in body ? { isRemote: Boolean(body.isRemote) } : {}),
      ...('isPrimary' in body ? { isPrimary: Boolean(body.isPrimary) } : {}),
    },
  })

  return NextResponse.json({ data: { location } })
}

export async function DELETE(request: NextRequest) {
  const { caller, error } = await guard(request)
  if (error) return error

  const id = request.nextUrl.searchParams.get('id') ?? ''
  const existing = await prisma.companyLocation.findFirst({
    where: { id, companyId: caller!.company!.id },
    select: { id: true, name: true, isPrimary: true, _count: { select: { sellContracts: true } } },
  })
  if (!existing) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such location here' } },
      { status: 404 }
    )
  }

  // A location somebody works at is not a row to delete. Deleting it would
  // silently detach live contracts from the place their tenure is counted.
  if (existing._count.sellContracts > 0) {
    return NextResponse.json(
      {
        error: {
          code: 'IN_USE',
          message: `${existing.name} is the work site on ${existing._count.sellContracts} contract(s), so it cannot be removed. Rename it instead.`,
        },
      },
      { status: 409 }
    )
  }

  await prisma.companyLocation.delete({ where: { id } })

  return NextResponse.json({
    data: {
      removed: existing.name,
      // Losing the primary silently is how a location picker ends up with
      // no default and every new contract gets asked a question nobody
      // knows the answer to.
      warning: existing.isPrimary ? 'That was your primary location. Set another one.' : null,
    },
  })
}
