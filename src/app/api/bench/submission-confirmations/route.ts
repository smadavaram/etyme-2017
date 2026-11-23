import { NextRequest, NextResponse } from 'next/server'
import { hasPermission } from '@/lib/permissions'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { roleWords } from '@/lib/access-grant'
import { refused, refusalOf } from '@/app/api/decision-items/door'
import { recordConfirmation, trackerItems } from '@/lib/agents/confirmation-tracker'
import { CHANNELS } from '@/lib/agents/confirmation-rules'

/**
 * GET  /api/bench/submission-confirmations?submissionId=…
 * POST /api/bench/submission-confirmations — { submissionId, channel, note?, mailSendId?, actingEntityId? }
 *
 * Record 112, chain 1. Where a submission stands against its confirmation
 * (not sent, awaiting, confirmed, failed delivery, on hold), and a
 * person's record that the other side confirmed it. The seat that put
 * people forward (`submissions.create`) records it; any seat that reads
 * submissions reads where it stands. Only the firm's own submissions are
 * seen, and a draft, a submission held as a double authorization, or one
 * already confirmed is refused in a sentence.
 */

/** A working seat at a firm, never a bench seat or a key; the caller check first. */
async function firmSeat(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return { seat: null, error }
  if (!caller.company || caller.isService || caller.context.type === 'CONSULTANT') {
    return { seat: null, error: refused(403, 'Submissions are a firm’s, and this seat is not a working seat at one.') }
  }
  const role = caller.context.roleId ? await prisma.role.findUnique({ where: { id: caller.context.roleId }, select: { name: true } }) : null
  return { seat: { caller, companyId: caller.company.id, personId: caller.person.id, heldAs: roleWords(role?.name ?? null) }, error: null }
}

const STATE_WORDS: Record<string, string> = {
  NOT_SENT: 'Not sent yet', AWAITING: 'Waiting for their confirmation', CONFIRMED: 'Confirmed',
  FAILED_DELIVERY: 'Failed delivery', BLOCKED: 'On hold: put forward twice for the same job',
}

export async function GET(request: NextRequest) {
  const { seat, error } = await firmSeat(request)
  if (error) return error
  if (!hasPermission(seat.caller.permissions, 'submissions.read')) return refused(403, 'Reading where a submission stands is for the seats that read submissions.')
  const id = request.nextUrl.searchParams.get('submissionId')
  if (!id) return refused(422, 'Say which submission.', 'submissionId')
  const [item] = await trackerItems(seat.companyId, new Date(), id)
  if (!item) return refused(404, 'There is no such submission at this firm.')
  const entities = await prisma.legalEntity.findMany({ where: { companyId: seat.companyId }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
  return NextResponse.json({
    data: {
      entities, submissionId: id, state: item.state, says: STATE_WORDS[item.state], channels: CHANNELS,
      confirmations: item.confirmations.map((c) => ({ id: c.id, at: c.confirmedAt })),
    },
  })
}

export async function POST(request: NextRequest) {
  const { seat, error } = await firmSeat(request)
  if (error) return error
  if (!hasPermission(seat.caller.permissions, 'submissions.create')) return refused(403, 'Recording a confirmation is for the seats that put people forward.')
  const body = await request.json().catch(() => ({}))
  if (typeof body?.submissionId !== 'string' || !body.submissionId) return refused(422, 'Say which submission.', 'submissionId')
  try {
    const row = await recordConfirmation({
      companyId: seat.companyId, submissionId: body.submissionId, personId: seat.personId, heldAs: seat.heldAs,
      actingEntityId: typeof body.actingEntityId === 'string' && body.actingEntityId ? body.actingEntityId : null,
      channel: body.channel, note: typeof body.note === 'string' ? body.note : null,
      mailSendId: typeof body.mailSendId === 'string' && body.mailSendId ? body.mailSendId : null,
    })
    return NextResponse.json({ data: { id: row.id, submissionId: row.submissionId, channel: row.channel, confirmedAt: row.confirmedAt } }, { status: 201 })
  } catch (e) {
    return refusalOf(e)
  }
}
