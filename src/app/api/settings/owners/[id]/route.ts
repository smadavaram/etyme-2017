import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { notify } from '@/lib/notify'
import { mayDecide, lapsed, type AskerAfter } from '@/lib/owner-rules'
import { ownersDoor, seatsAt, refused } from '../seats'
import { landPass, landOwnerChange, saidNoNotice } from '../act'

/**
 * POST /api/settings/owners/:id — { decision: 'yes' | 'no' | 'cancel', reason? }
 *
 * The yes an Owner ask waits for. A pass is answered by the person taking
 * over, nobody else; a removal or a move by an Owner who did not ask. The
 * rules are read again on the day of the yes, so an ask overtaken by
 * events (the subject now the last Owner, the asker no longer one) is
 * refused rather than acted on. The asker may cancel; a cancelled,
 * declined or lapsed ask is kept and changes nothing.
 *
 * This is the one door the yes card calls, in Ask Etyme, by email and in
 * Teams, so the card and the screen cannot disagree.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const door = await ownersDoor(request)
  if (door.error) return door.error
  const { caller, company, personId } = door.ok
  const body = await request.json().catch(() => ({}))
  const decision = String(body.decision ?? '')
  if (!['yes', 'no', 'cancel'].includes(decision)) return refused("decision is 'yes', 'no' or 'cancel'.")

  const ask = await prisma.ownershipRequest.findFirst({
    where: { id: params.id, companyId: company.id },
    select: {
      id: true, kind: true, state: true, askerAfter: true, reason: true, expiresAt: true,
      askedById: true, askedBy: { select: { name: true } },
      subjectContextId: true, toRoleId: true, toRole: { select: { name: true } },
    },
  })
  if (!ask) return refused(`Nothing at ${company.name} is waiting on that.`, 404)

  const now = new Date()
  if (ask.state === 'PENDING' && lapsed(ask.expiresAt, now)) {
    await prisma.ownershipRequest.update({ where: { id: ask.id }, data: { state: 'LAPSED' } })
    return refused('This lapsed after seven days with no answer, and nothing changed. Ask again.', 409)
  }

  if (decision === 'cancel') {
    if (ask.askedById !== personId) return refused('Only the Owner who asked withdraws it.', 403, 'FORBIDDEN')
    if (ask.state !== 'PENDING') return refused('This has already been answered.', 409)
    await prisma.$transaction([
      prisma.ownershipRequest.update({ where: { id: ask.id }, data: { state: 'CANCELLED', decidedById: personId, decidedAt: now } }),
      prisma.automationLog.create({
        data: {
          companyId: company.id, action: 'OWNERSHIP_WITHDRAWN',
          summary: `${caller!.person.name} withdrew an Owner ask at ${company.name}`,
          reason: ask.reason, payload: { requestId: ask.id, kind: ask.kind }, reversible: false,
        },
      }),
    ])
    return NextResponse.json({ data: { message: 'Withdrawn. Nothing changed.' } })
  }

  // Read again now, not when it was asked.
  const seats = await seatsAt(company.id)
  const subject = seats.find((s) => s.contextId === ask.subjectContextId)
  if (!subject) return refused('The seat this is about has ended, so nothing changes.', 409)
  const asker = seats.find((s) => s.personId === ask.askedById) ?? null
  const may = mayDecide({
    kind: ask.kind, askedByPersonId: ask.askedById, deciderPersonId: personId, subject, seats,
    expired: false, pending: ask.state === 'PENDING',
  })
  if (!may.ok) return refused(may.says, 403, 'FORBIDDEN')

  if (decision === 'no') {
    await prisma.$transaction([
      prisma.ownershipRequest.update({ where: { id: ask.id }, data: { state: 'DECLINED', decidedById: personId, decidedAt: now } }),
      prisma.automationLog.create({
        data: {
          companyId: company.id, action: 'OWNERSHIP_DECLINED',
          summary: `${caller!.person.name} said no to an Owner ask at ${company.name}`,
          reason: typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 500) : 'No reason given',
          payload: { requestId: ask.id, kind: ask.kind }, reversible: false,
        },
      }),
    ])
    // What was asked, in the asker's own words (lib/notify/owner-words),
    // never "your ask about <the decider>".
    const no = saidNoNotice({
      deciderName: caller!.person.name, kind: ask.kind as 'PASS' | 'REMOVE' | 'DEMOTE',
      subjectName: subject.name, companyName: company.name, toRoleName: ask.toRole?.name ?? null,
    })
    void notify({
      personId: ask.askedById, companyId: company.id, type: 'SYSTEM',
      title: no.title, body: no.body,
      entityId: ask.id, channel: 'EMAIL',
    })
    return NextResponse.json({ data: { message: 'Answered no. Nothing changed, and the Owner who asked is told.' } })
  }

  // A pass needs the asker still an Owner, or there is nothing to pass.
  if (ask.kind === 'PASS' && (!asker || asker.roleName !== 'Owner')) {
    return refused(`${ask.askedBy.name} is no longer an Owner here, so there is no ownership of theirs to pass.`, 409)
  }
  const landing = {
    requestId: ask.id,
    company: { id: company.id, name: company.name },
    decider: { personId, name: caller!.person.name },
    asker: { personId: ask.askedById, name: ask.askedBy.name, contextId: asker?.contextId ?? null },
    subject: { personId: subject.personId, name: subject.name, contextId: subject.contextId },
    reason: ask.reason,
  }
  if (ask.kind === 'PASS') {
    // Each reader in their own words: the new Owner on the screen, the
    // Owner who passed it in the notice (lib/notify/owner-words).
    const words = await landPass({ ...landing, after: (ask.askerAfter ?? 'OWNER') as AskerAfter })
    void notify({
      personId: ask.askedById, companyId: company.id, type: 'SYSTEM',
      title: words.forAsker.title, body: words.forAsker.body,
      entityId: ask.id, channel: 'EMAIL',
    })
    return NextResponse.json({ data: { message: words.forNewOwner } })
  }
  const says = await landOwnerChange({ ...landing, kind: ask.kind, toRoleId: ask.toRoleId, toRoleName: ask.toRole?.name ?? null })

  if (ask.askedById !== personId) {
    void notify({
      personId: ask.askedById, companyId: company.id, type: 'SYSTEM',
      title: `${caller!.person.name} said yes`,
      body: says, entityId: ask.id, channel: 'EMAIL',
    })
  }
  return NextResponse.json({ data: { message: says } })
}
