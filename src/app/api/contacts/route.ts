import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { problems, alreadyOnFile, KINDS, type ContactKind } from '@/lib/contacts'

/**
 * GET  /api/contacts — the caller's rolodex, filterable by company and kind
 * POST /api/contacts — add somebody
 *
 * Walled to the owning company on every query. A rolodex is a commercial
 * asset — my contact at a client is mine — so there is no network view of
 * contacts, ever, and no read crosses the wall.
 */

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Contacts')
  if (notStaff) return notStaff

  const companyId = caller.company!.id
  const url = new URL(request.url)
  const at = url.searchParams.get('at')
  const q = (url.searchParams.get('q') ?? '').trim()

  const contacts = await prisma.companyContact.findMany({
    where: {
      companyId,
      ...(at ? { atCompanyId: at } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { title: { contains: q, mode: 'insensitive' } },
              { atCompany: { name: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    include: {
      atCompany: { select: { id: true, name: true } },
      person: { select: { id: true } },
    },
    orderBy: [{ atCompany: { name: 'asc' } }, { name: 'asc' }],
    take: 500,
  })

  return NextResponse.json({
    data: {
      contacts: contacts.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        title: c.title,
        kind: c.kind,
        kindLabel: KINDS[c.kind as ContactKind]?.label ?? 'Contact',
        callAbout: KINDS[c.kind as ContactKind]?.callAbout ?? null,
        at: c.atCompany,
        // On the platform themselves now — reachable in-app, not only by phone.
        joined: c.person != null,
        notes: c.notes,
      })),
      kinds: Object.entries(KINDS).map(([key, v]) => ({ key, ...v })),
    },
  })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Contacts')
  if (notStaff) return notStaff

  const companyId = caller.company!.id
  const body = await request.json().catch(() => ({}))

  const atCompanyId = String(body?.atCompanyId ?? '')
  if (!atCompanyId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Say which company they work at.', field: 'atCompanyId' } },
      { status: 422 }
    )
  }

  const found = problems({
    name: String(body?.name ?? ''),
    email: body?.email ?? null,
    kind: body?.kind ?? null,
  })
  if (found.length > 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: found[0].says, field: found[0].field } },
      { status: 422 }
    )
  }

  // Refused as a duplicate rather than quietly creating a twin. Two
  // records for one human is how somebody gets emailed at an address
  // they left.
  const existing = await prisma.companyContact.findMany({
    where: { companyId, atCompanyId },
    select: { id: true, name: true, email: true, phone: true, atCompanyId: true },
  })
  const dup = alreadyOnFile(
    { name: body.name, email: body?.email, phone: body?.phone, atCompanyId },
    existing
  )
  if (dup.duplicate) {
    return NextResponse.json(
      { error: { code: 'DUPLICATE', message: dup.says, existingId: dup.of!.id } },
      { status: 409 }
    )
  }

  const contact = await prisma.companyContact.create({
    data: {
      companyId,
      atCompanyId,
      name: String(body.name).trim(),
      email: body?.email ? String(body.email).trim().toLowerCase() : null,
      phone: body?.phone ? String(body.phone).trim() : null,
      title: body?.title ? String(body.title).trim() : null,
      kind: body?.kind && body.kind in KINDS ? body.kind : 'OTHER',
      notes: body?.notes ? String(body.notes).trim() : null,
      createdById: caller.person.id,
    },
    include: { atCompany: { select: { id: true, name: true } } },
  })

  return NextResponse.json({ data: { contact } }, { status: 201 })
}
