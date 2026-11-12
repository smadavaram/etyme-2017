import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { seatCapSays, sentAgainSays, SENDS_PER_SEAT_PER_HOUR } from '@/lib/access-grant'
import { recordRefusal } from '@/lib/access-log'
import { copyTextFor, invitationEmailsSince, modeOf, sendInvitationMail } from '../../invite/one'
import { waitingSeatFor } from '../waiting-seat'

/**
 * POST /api/access/:contextId/resend
 *
 * "Send the invitation again" on a waiting row (founder, 2026-11-12). The
 * page used to say "Invite them again", and inviting the same address was
 * refused with "They already have a seat here", so there was no way to
 * send it at all short of withdrawing the seat and starting over.
 *
 * The same seat, the same role: no second seat, no second person. It goes
 * only to the address on the person's record, never one from the request.
 * A new set-password link kills the older one. Only a seat invited and
 * never signed in, not paused or ended; an Admin never sends again to an
 * Owner's seat. At most three invitation emails to one seat in an hour.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ contextId: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { contextId } = await params

  const { seat, refused } = await waitingSeatFor(caller, contextId, 'Sending an invitation again')
  if (refused) return refused

  const email = seat.person.primaryEmail
  const now = new Date()
  const window = await invitationEmailsSince(seat.id, new Date(now.getTime() - 3_600_000))
  if (window.count >= SENDS_PER_SEAT_PER_HOUR) {
    const again = new Date((window.oldest ?? now).getTime() + 3_600_000)
    const message = seatCapSays(email, again, null)
    await recordRefusal([seat.person.id], {
      actorPersonId: caller.person.id,
      actorCompanyId: seat.company.id,
      action: 'INVITATION_SEND_AGAIN',
      reason: message,
    })
    // The moment goes as an instant too, said by the screen in the reader's zone.
    return NextResponse.json({ error: { code: 'TOO_MANY_THIS_HOUR', message, cap: 'SEAT', email, again: again.toISOString() } }, { status: 429 })
  }

  const mode = await modeOf(seat.company.id)
  const sent = await sendInvitationMail({
    contextId: seat.id,
    person: seat.person,
    inviterName: caller.person.name,
    company: seat.company,
    roleName: seat.roleName,
    mode,
    now,
  })

  await prisma.automationLog.create({
    data: {
      companyId: seat.company.id,
      action: 'PERSON_INVITED',
      summary: `${caller.person.name} sent the invitation to ${email} again`,
      reason: 'Asked for on the waiting row. The same seat; nothing was duplicated.',
      payload: { contextId: seat.id, email, act: 'SENT_AGAIN', mail: sent.mail.state },
      reversible: true,
    },
  })

  return NextResponse.json({
    data: {
      says: sentAgainSays(email, sent.mail.state, sent.mail.why),
      contextId: seat.id,
      mail: sent.mail,
      copyText: copyTextFor({ inviterName: caller.person.name, companyName: seat.company.name, roleName: seat.roleName, email, mode }),
    },
  })
}
