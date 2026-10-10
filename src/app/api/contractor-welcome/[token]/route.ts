import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { linkIsOpen, stateAfterAnswer, type Answer, type InviteState, type Represents } from '@/lib/contractor-invite'
import { notify } from '@/lib/notify'

/**
 * GET  /api/contractor-welcome/[token]  — what they see
 * POST /api/contractor-welcome/[token]  — what they say
 *
 * The person's side, reached with nothing but the link. No sign-in: a
 * contractor deciding whether to talk to a client should not have to
 * make an account first, and the link is the credential.
 *
 * What it gives back is deliberately thin. It names the client and who
 * asked, because they are entitled to know who is contacting them, and
 * the client's approved suppliers, because that is the question they
 * are answering. It never gives back the client's roles, its rates, or
 * anybody else on its register.
 */

async function load(token: string) {
  return prisma.contractorInvitation.findUnique({
    where: { token },
    select: {
      id: true, name: true, email: true, reason: true, skills: true, state: true,
      companyId: true, invitedById: true,
      company: { select: { id: true, name: true } },
    },
  })
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const row = await load(token)
  if (!row) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'This link is not one of ours, or it has been replaced.' } }, { status: 404 })
  }
  if (!linkIsOpen(row.state as InviteState)) {
    return NextResponse.json(
      { error: { code: 'CLOSED', message: `Thank you — you have already answered ${row.company.name}. Nothing else is needed from you here.` } },
      { status: 409 }
    )
  }

  const inviter = await prisma.person.findUnique({ where: { id: row.invitedById }, select: { name: true } })

  // The suppliers this client has approved, so "who represents you" is a
  // list they can recognize rather than a name they have to spell. Only
  // approved ones: naming a firm still on probation as an option would
  // be the client telling them something it has not decided.
  const approved = await prisma.counterparty.findMany({
    where: { companyId: row.companyId, relationship: 'SUPPLIER', tier: { in: ['APPROVED', 'PREFERRED'] } },
    select: { otherCompany: { select: { id: true, name: true } } },
    orderBy: { otherCompany: { name: 'asc' } },
  })

  return NextResponse.json({
    data: {
      name: row.name,
      client: row.company.name,
      invitedBy: inviter?.name ?? 'somebody',
      reason: row.reason,
      skills: row.skills,
      suppliers: approved.map((c) => ({ id: c.otherCompany.id, name: c.otherCompany.name })),
      says:
        `${row.company.name} contracts through staffing suppliers rather than employing ` +
        `contractors directly, so who represents you decides what happens next.`,
    },
  })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const row = await load(token)
  if (!row) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'This link is not one of ours, or it has been replaced.' } }, { status: 404 })
  }
  if (!linkIsOpen(row.state as InviteState)) {
    return NextResponse.json(
      { error: { code: 'CLOSED', message: `You have already answered ${row.company.name}. Nothing else is needed from you here.` } },
      { status: 409 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const interested = body?.interested === true
  const represents = (['ON_BENCH', 'OTHER_FIRM', 'NOBODY'] as const).includes(body?.represents)
    ? (body.represents as Represents)
    : null
  const firmName = typeof body?.firmName === 'string' ? body.firmName.trim() : ''
  const firmCompanyId = typeof body?.firmCompanyId === 'string' ? body.firmCompanyId : null
  const note = typeof body?.note === 'string' ? body.note.trim() : ''

  if (interested && !represents) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'One more thing: who represents you today? Pick a firm, name one, or say nobody does.', field: 'represents' } },
      { status: 422 }
    )
  }
  if (interested && represents === 'ON_BENCH' && !firmCompanyId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Pick the firm from the list, so we ask the right one.', field: 'firmCompanyId' } },
      { status: 422 }
    )
  }
  if (interested && represents === 'OTHER_FIRM' && firmName.length < 2) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'What is the firm called? They will be asked to supply their paperwork.', field: 'firmName' } },
      { status: 422 }
    )
  }

  // A firm they picked has to actually be one this client approved.
  // Otherwise the field is a way to point the ask at any company id.
  let supplierCompanyId: string | null = null
  if (interested && represents === 'ON_BENCH') {
    const ok = await prisma.counterparty.findFirst({
      where: { companyId: row.companyId, otherCompanyId: firmCompanyId!, relationship: 'SUPPLIER', tier: { in: ['APPROVED', 'PREFERRED'] } },
      select: { otherCompanyId: true },
    })
    if (!ok) {
      return NextResponse.json(
        { error: { code: 'NOT_A_SUPPLIER', message: `${row.company.name} does not have that firm as an approved supplier. Pick another, or name it instead.` } },
        { status: 409 }
      )
    }
    supplierCompanyId = ok.otherCompanyId
  }

  const answer: Answer = {
    interested,
    represents,
    firmName: represents === 'OTHER_FIRM' ? firmName : null,
    firmCompanyId: supplierCompanyId,
    note: note || null,
    at: new Date().toISOString(),
  }
  const state = stateAfterAnswer({ interested, represents })

  await prisma.contractorInvitation.update({
    where: { id: row.id },
    data: { state, answer: answer as unknown as object, supplierCompanyId },
  })

  // Whoever asked hears back, on their own channel. The desk that acts
  // is the desk that hears: a NEEDS_SUPPLIER answer is work for them.
  void notify({
    personId: row.invitedById,
    companyId: row.companyId,
    type: 'SYSTEM',
    entityId: row.id,
    channel: 'EMAIL',
    title: interested ? `${row.name} answered you` : `${row.name} is not looking`,
    body: !interested
      ? `${row.name} said they are not looking at the moment.${note ? ` "${note}"` : ''}`
      : state === 'NEEDS_SUPPLIER'
        ? `${row.name} is interested and no firm represents them. Pick one of your suppliers to take them on — open Contractors, under Pending.`
        : `${row.name} is interested. ${answer.firmName ?? 'Their firm'} represents them.`,
    data: { href: '/dashboard/people' },
  })

  return NextResponse.json({
    data: {
      state,
      // What they hear follows *their* answer, not the state it landed
      // in. Naming a firm and being told the client will pick one is
      // the kind of small lie that makes somebody stop trusting a page.
      says: !interested
        ? `Thank you — we have told ${row.company.name} you are not looking. Nobody will chase you.`
        : represents === 'NOBODY'
          ? `Thank you. ${row.company.name} will choose one of its staffing suppliers to take you on, and that firm will contact you.`
          : represents === 'OTHER_FIRM'
            ? `Thank you. ${row.company.name} will speak to ${answer.firmName} about representing you, and you will hear from them rather than from us.`
            : `Thank you. ${row.company.name} will speak to your firm, and you will hear from them rather than from us.`,
    },
  })
}
