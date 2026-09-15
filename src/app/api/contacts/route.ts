import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { problems, alreadyOnFile, KINDS, kindOfRole, type ContactKind } from '@/lib/contacts'

/**
 * GET  /api/contacts — the people at the firms you trade with, filterable by company and kind
 * POST /api/contacts — add somebody by hand
 *
 * Two sources, one list. What you typed or imported — the rolodex, a
 * commercial asset walled to the owning company. And the people seated
 * at the firms you trade with, read off their seats: for a client, the
 * whole team at each of its suppliers, because a staffing firm's staff
 * are the people who work its accounts; for a supplier, only the people
 * at a client it has actually dealt with — whoever raised a role it was
 * invited to, is the hiring manager on its contract, signed its hours,
 * or wrote on a thread with it — never a client's whole staff. Nothing
 * here crosses to a firm you have no dealings with.
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

  const typed = contacts.map((c) => ({
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
    via: null as string | null,
  }))

  const seated = await peopleAtYourFirms(companyId, caller.company!.kind, at, q)
  // Somebody typed in by hand who also holds a seat is one person, not two.
  const known = new Set(typed.map((t) => t.email?.toLowerCase()).filter(Boolean))
  const merged = [...typed, ...seated.filter((p) => !p.email || !known.has(p.email.toLowerCase()))]
    .sort((a, b) => a.at.name.localeCompare(b.at.name) || a.name.localeCompare(b.name))

  return NextResponse.json({
    data: {
      contacts: merged,
      kinds: Object.entries(KINDS).map(([key, v]) => ({ key, ...v })),
    },
  })
}

type Row = {
  id: string; name: string; email: string | null; phone: string | null; title: string | null; kind: string; kindLabel: string
  callAbout: string | null; at: { id: string; name: string }; joined: boolean; notes: string | null; via: string | null
}

/** The people seated at the firms this company trades with. */
async function peopleAtYourFirms(companyId: string, kind: string, at: string | null, q: string): Promise<Row[]> {
  const buyer = kind === 'CLIENT' || kind === 'MSP'
  const rows: Row[] = []
  const seen = new Set<string>()
  const push = (personId: string, name: string, email: string | null, roleName: string | null, company: { id: string; name: string }, via: string) => {
    const key = `${personId}:${company.id}`
    if (seen.has(key)) return
    if (at && company.id !== at) return
    if (q && ![name, email ?? '', roleName ?? '', company.name].some((x) => x.toLowerCase().includes(q.toLowerCase()))) return
    seen.add(key)
    const k = kindOfRole(roleName)
    rows.push({ id: `seat:${personId}:${company.id}`, name, email, phone: null, title: roleName, kind: k, kindLabel: KINDS[k].label, callAbout: KINDS[k].callAbout, at: company, joined: true, notes: null, via })
  }

  if (buyer) {
    // Every firm you buy from: on the register, under an agreement, or on a contract.
    const [reg, agreements, contracts] = await Promise.all([
      prisma.counterparty.findMany({ where: { companyId, relationship: 'SUPPLIER' }, select: { otherCompanyId: true } }),
      prisma.masterAgreement.findMany({ where: { clientId: companyId }, select: { vendorId: true } }),
      prisma.sellContract.findMany({ where: { clientCompanyId: companyId }, select: { companyId: true }, distinct: ['companyId'] }),
    ])
    const firms = [...new Set([...reg.map((r) => r.otherCompanyId), ...agreements.map((a) => a.vendorId), ...contracts.map((c) => c.companyId)])].filter((id) => id !== companyId)
    if (firms.length === 0) return rows
    const seats = await prisma.context.findMany({
      where: { companyId: { in: firms }, revokedAt: null, NOT: { roleId: null }, type: { in: ['EMPLOYEE', 'PARTNER'] } },
      select: { personId: true, person: { select: { name: true, primaryEmail: true } }, role: { select: { name: true } }, company: { select: { id: true, name: true } } },
      orderBy: { grantedAt: 'asc' },
    })
    for (const s of seats) if (s.company) push(s.personId, s.person.name, s.person.primaryEmail, s.role?.name ?? null, s.company, `${s.role?.name ?? 'Staff'} at ${s.company.name}`)
    return rows
  }

  // A supplier sees the people at a client it has dealt with, and nobody else there.
  const [invited, sold, signed, threads] = await Promise.all([
    prisma.requirementInvitation.findMany({ where: { toCompanyId: companyId }, select: { requirement: { select: { raisedById: true, ownerId: true, title: true, company: { select: { id: true, name: true } } } } }, take: 500 }),
    prisma.sellContract.findMany({ where: { companyId, hiringManagerId: { not: null } }, select: { hiringManagerId: true, clientCompany: { select: { id: true, name: true } }, person: { select: { name: true } } }, take: 500 }),
    prisma.timesheet.findMany({ where: { sellContract: { companyId }, clientApprovedById: { not: null } }, select: { clientApprovedById: true, sellContract: { select: { clientCompany: { select: { id: true, name: true } } } } }, take: 500 }),
    prisma.conversation.findMany({ where: { OR: [{ companyId }, { withCompanyId: companyId }], NOT: { withCompanyId: null } }, select: { companyId: true, withCompanyId: true, messages: { select: { authorId: true }, take: 50 } }, take: 200 }),
  ])
  const wanted = new Map<string, { firmId: string; via: string }>()
  const want = (personId: string | null | undefined, firmId: string, via: string) => { if (personId && !wanted.has(`${personId}:${firmId}`)) wanted.set(`${personId}:${firmId}`, { firmId, via }) }
  for (const i of invited) { want(i.requirement.raisedById, i.requirement.company.id, `Raised ${i.requirement.title}`); want(i.requirement.ownerId, i.requirement.company.id, `Owns ${i.requirement.title}`) }
  for (const c of sold) want(c.hiringManagerId, c.clientCompany.id, `Hiring manager for ${c.person.name}`)
  for (const t of signed) want(t.clientApprovedById, t.sellContract.clientCompany.id, 'Signs your hours')
  for (const th of threads) { const other = th.companyId === companyId ? th.withCompanyId! : th.companyId; for (const m of th.messages) want(m.authorId, other, 'On a thread with you') }
  if (wanted.size === 0) return rows
  const seats = await prisma.context.findMany({
    where: { OR: [...wanted.keys()].map((k) => { const [personId, firmId] = k.split(':'); return { personId, companyId: firmId } }), revokedAt: null },
    select: { personId: true, person: { select: { name: true, primaryEmail: true } }, role: { select: { name: true } }, company: { select: { id: true, name: true } } },
  })
  for (const s of seats) if (s.company) push(s.personId, s.person.name, s.person.primaryEmail, s.role?.name ?? null, s.company, wanted.get(`${s.personId}:${s.company.id}`)?.via ?? '')
  return rows
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
