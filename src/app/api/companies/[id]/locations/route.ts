import { NextRequest, NextResponse } from 'next/server'
import { getSessionEmail } from '@/lib/api-context'
import { prisma } from '@/lib/db'

/**
 * GET /api/companies/:id/locations
 *
 * Lists work locations for a company. Used by the contracts creation
 * form to pick a work site, and by the program dashboard to show
 * where contractors are physically located.
 *
 * BRD Addendum C: "The end client (endClientCompanyId) is the
 * enterprise where the consultant physically works." Locations are
 * the specific sites within that enterprise.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const email = await getSessionEmail()
  if (!email) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  const { id } = await params

  const company = await prisma.company.findUnique({
    where: { id },
    select: { id: true, name: true },
  })

  if (!company) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Company not found' } },
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
 * Add a new work location for a company.
 * Body: { name, address?, city?, state?, country?, isRemote?, isPrimary? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const email = await getSessionEmail()
  if (!email) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  const { id } = await params

  const company = await prisma.company.findUnique({
    where: { id },
    select: { id: true, name: true },
  })

  if (!company) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Company not found' } },
      { status: 404 }
    )
  }

  const body = await request.json()
  const { name, address, city, state, country, isRemote, isPrimary } = body

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'name is required' } },
      { status: 422 }
    )
  }

  // If setting isPrimary, unset any existing primary location
  if (isPrimary) {
    await prisma.companyLocation.updateMany({
      where: { companyId: id, isPrimary: true },
      data: { isPrimary: false },
    })
  }

  const location = await prisma.companyLocation.create({
    data: {
      companyId: id,
      name: name.trim(),
      address: address?.trim() ?? null,
      city: city?.trim() ?? null,
      state: state?.trim() ?? null,
      country: country?.trim() ?? null,
      isRemote: isRemote ?? false,
      isPrimary: isPrimary ?? false,
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
        country: location.country,
        isRemote: location.isRemote,
        isPrimary: location.isPrimary,
      },
    },
  }, { status: 201 })
}
