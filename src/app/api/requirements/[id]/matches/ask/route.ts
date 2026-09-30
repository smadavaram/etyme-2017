import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { poolFor, actionFor } from '@/lib/match-pool'
import { tellThread } from '@/lib/thread-notices'
import type { Participant } from '@/lib/threads'
import { matchViewer, NOT_HERE } from '../viewer'
import { askState, askedAlreadySays } from '../asked'
import { lastAsk } from '../asked-read'


/**
 * POST /api/requirements/:id/matches/ask   { matchId, note? }
 *
 * A client adds a supplier's matched person to its job request. A client
 * never submits anybody — Etyme places nobody and the client buys — so
 * "add to the application" on the buyer's side is asking the firm that
 * holds the person's consent to put them forward, on the thread for this
 * job. The submission, and the rate, then come from that firm through
 * the submit door, with every rule it has.
 *
 * Only a match from a supplier or a firm the client trades with can be
 * asked for. A suggestion cannot: its firm is not a supplier, and the one
 * thing to do with it is ask to add the firm (`../add-firm`). A firm
 * approved to work under a prime is asked through the prime, never round
 * it.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: requirementId } = await params
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const requirement = await prisma.requirement.findUnique({
    where: { id: requirementId },
    select: {
      id: true, title: true, status: true, approvalState: true, companyId: true, payerCompanyId: true, endClientCompanyId: true,
      company: { select: { kind: true, name: true } },
    },
  })
  const viewer = requirement ? await matchViewer(caller, requirement) : null
  if (!requirement || !viewer) return NextResponse.json(NOT_HERE, { status: 404 })

  if (!viewer.buyer) {
    return NextResponse.json(
      { error: { code: 'NOT_THE_BUYER', message: 'You put your own matches forward from the job itself. Asking is for the company the job is for.' } },
      { status: 409 }
    )
  }
  if (!hasPermission(viewer.permissions, 'requirements.write')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Asking a supplier for somebody is for whoever raises job requests here — the hiring manager or the program office.' } },
      { status: 403 }
    )
  }
  if (requirement.status !== 'OPEN' || requirement.approvalState === 'PENDING_APPROVAL') {
    return NextResponse.json(
      { error: { code: 'NOT_PUBLISHED', message: `${requirement.title} is not open, so nobody can be submitted to it yet.` } },
      { status: 409 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const matchId = typeof body?.matchId === 'string' ? body.matchId : null
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 500) : ''
  const match = matchId
    ? await prisma.match.findFirst({ where: { id: matchId, requirementId }, select: { consultantId: true } })
    : null
  if (!match) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That match is not on this job request any more. Run matching again.' } }, { status: 404 })
  }

  const pool = await poolFor(requirement, viewer.companyId, { suggest: viewer.suggest })
  const entry = pool.entries.find((e) => e.consultantId === match.consultantId)
  if (!entry) {
    return NextResponse.json(
      { error: { code: 'NOT_AVAILABLE', message: 'That person is no longer offered to you — their firm or they themselves took it back, or they were put forward already.' } },
      { status: 409 }
    )
  }

  const approvedUnder = await prisma.supplierRequest.findFirst({
    where: { companyId: viewer.companyId, firmCompanyId: entry.firmId, state: 'APPROVED', comesInAs: 'SUB_UNDER_PRIME', underCompanyId: { not: null } },
    select: { underCompanyId: true },
  })
  const underFirm = approvedUnder?.underCompanyId
    ? await prisma.company.findUnique({ where: { id: approvedUnder.underCompanyId }, select: { id: true, name: true } })
    : null
  const action = actionFor({
    entry,
    viewer: { companyId: viewer.companyId, buyer: true },
    under: underFirm ? { companyId: underFirm.id, name: underFirm.name } : null,
  })
  if (action.kind !== 'ASK') {
    return NextResponse.json(
      { error: { code: action.kind === 'ASK_TO_ADD' ? 'NOT_YOUR_SUPPLIER' : 'NOTHING_TO_ASK', message: action.says } },
      { status: 409 }
    )
  }

  const now = new Date()

  // Asked once, said once. The same person asked of this job inside the
  // last three days is refused in a sentence rather than sent again
  // (`../asked`); the match row says when it was asked instead of
  // offering the button.
  const last = await lastAsk(viewer.companyId, requirement.id, entry.personId)
  const standing = askState(last, now)
  if (last && standing && !standing.mayAskAgain) {
    return NextResponse.json(
      {
        error: {
          code: 'ASKED_ALREADY',
          message: askedAlreadySays({ firm: action.toName, person: entry.name, at: last }),
          askedAt: last.toISOString(),
        },
      },
      { status: 409 }
    )
  }

  const me = { id: viewer.companyId, name: viewer.companyName }
  const firm = { id: action.toCompanyId, name: action.toName }
  const opener: Participant = { personId: caller.person.id, name: caller.person.name, companyId: me.id, joinedAt: now.toISOString() }
  const through = firm.id !== entry.firmId ? ` They are with ${entry.firmName}, who works for us under you, so the ask comes to you.` : ''
  const text =
    `${me.name} would like to see ${entry.name} for ${requirement.title}. They came up when we matched this job against ` +
    `the bench offered to us. Please submit them if they are available.${through}${note ? ` ${note}` : ''}`

  let thread = await prisma.conversation.findFirst({
    where: { companyId: me.id, withCompanyId: firm.id, topic: 'REQUIREMENT', topicId: requirement.id },
    select: { id: true },
  })
  if (!thread) {
    thread = await prisma.conversation.create({
      data: {
        companyId: me.id, withCompanyId: firm.id, topic: 'REQUIREMENT', topicId: requirement.id,
        title: `${requirement.title} — ${firm.name}`, participants: [opener] as unknown as object,
      },
      select: { id: true },
    })
  }
  await prisma.message.create({
    data: {
      conversationId: thread.id, authorId: caller.person.id, body: text, type: 'ASK',
      metadata: {
        personId: entry.personId, personName: entry.name, requirementId: requirement.id, roleTitle: requirement.title,
        supplierId: firm.id, supplierName: firm.name, via: 'MATCH', matchId,
      },
    },
  })
  await prisma.conversation.update({ where: { id: thread.id }, data: { updatedAt: now } })
  void tellThread({
    conversationId: thread.id,
    author: { personId: caller.person.id, name: caller.person.name, companyId: me.id, companyName: me.name },
    body: text,
  })

  return NextResponse.json(
    {
      data: {
        asked: firm.name,
        threadId: thread.id,
        says: `${firm.name} has been asked to put ${entry.name} forward for ${requirement.title}. You will see the submission when it lands.`,
        // What the row says from now on, in place of the button.
        askedFor: askState(now, now),
      },
    },
    { status: 201 }
  )
}
