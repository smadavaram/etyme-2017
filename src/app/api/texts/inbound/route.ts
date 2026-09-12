import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { readReply, type Kind } from '@/lib/texts'
import { lastAsked, send } from '@/lib/messages'
import { recordAnswer } from '@/lib/answers'

/**
 * POST /api/texts/inbound
 *
 * A consultant writing back, rather than clicking one of the buttons.
 *
 * Most people click. Plenty do not — they hit reply and type "no im on a
 * contract till march", which answers the question perfectly well, and
 * treating that as silence would push a responsive consultant down the
 * rankings for being polite.
 *
 * This is where an inbound-email webhook lands: Resend's inbound route or
 * SendGrid's Inbound Parse, both of which post From and Body. Nothing is
 * pointed at it yet — turning inbound email on is a DNS record and a
 * provider setting, not code — so until that is done this is reachable
 * only by an internal caller, and the buttons carry the loop on their
 * own.
 *
 * An email address carries no context, so the reply is read against the
 * last thing we asked that person. Somebody replying "yes" three days
 * later is answering whatever we asked last, and reading it against the
 * wrong question turns a freshness ping into consent to be submitted.
 *
 * Nothing is guessed. An unclear reply is recorded as unclear and left for
 * a person — guessing NO on a consent ask loses a placement, and guessing
 * YES submits somebody who said no.
 */
export async function POST(request: NextRequest) {
  // A provider posts form-encoded; a test or an internal caller may send
  // JSON. Both are read rather than one being the only way in.
  let from = ''
  let body = ''

  const type = request.headers.get('content-type') ?? ''
  if (type.includes('application/json')) {
    const json = await request.json().catch(() => ({}))
    from = String(json.From ?? json.from ?? '')
    body = String(json.Body ?? json.body ?? '')
  } else {
    const form = await request.formData().catch(() => null)
    from = String(form?.get('From') ?? '')
    body = String(form?.get('Body') ?? '')
  }

  if (!from || !body) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'From and Body are required.' } },
      { status: 422 }
    )
  }

  // Mail clients send "Ravi Patel <ravi@example.com>". The address is the
  // part that identifies anybody.
  const address = (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase()

  const profile = await prisma.consultantProfile.findFirst({
    where: { person: { primaryEmail: address } },
    select: { id: true, personId: true, person: { select: { name: true } } },
  })

  // An address we do not recognise is not an error to shout about —
  // forwarded mail happens — but it is worth answering so a real person
  // does not think they are writing into a void.
  if (!profile) {
    return NextResponse.json({
      data: { known: false, said: 'We do not have this address on file. Nothing has been changed.' },
    })
  }

  const asked = await lastAsked(profile.personId)
  const kind: Kind = (asked?.kind as Kind) ?? 'FRESHNESS'
  const reply = readReply(body, kind)

  const recorded = await recordAnswer({
    profileId: profile.id,
    personId: profile.personId,
    asked: kind,
    reply,
    heard: body,
  })

  // Answer them. A loop that takes replies and says nothing back is one
  // people stop replying to.
  await send({
    companyId: recorded.companyId,
    personId: profile.personId,
    kind: 'LINK',
    to: address,
    subject: 'Thanks — got it',
    body: recorded.says,
  })

  return NextResponse.json({
    data: {
      known: true,
      person: profile.person.name,
      answering: kind,
      read: reply,
      said: recorded.says,
      needsFollowUp: recorded.needsFollowUp,
    },
  })
}
