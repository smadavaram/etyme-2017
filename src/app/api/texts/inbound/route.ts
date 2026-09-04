import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { readReply, applyReply, type Kind } from '@/lib/texts'
import { lastAsked, send } from '@/lib/sms'

/**
 * POST /api/texts/inbound
 *
 * A consultant replying. This is the half that makes the loop a loop.
 *
 * Form-encoded, the shape a provider webhook posts: From and Body.
 *
 * A phone number carries no context, so the reply is read against the last
 * thing we asked that person. Somebody replying "yes" three days later is
 * answering whatever we asked last, and reading it against the wrong
 * question turns a freshness ping into consent to be submitted.
 *
 * Nothing is guessed. An unclear reply is recorded as unclear and left for
 * a person — guessing NO on a consent ask loses a placement, and guessing
 * YES submits somebody who said no.
 */
export async function POST(request: NextRequest) {
  // The provider posts form-encoded; a test or an internal caller may send
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

  const profile = await prisma.consultantProfile.findFirst({
    where: { mobile: from },
    select: { id: true, personId: true, person: { select: { name: true } } },
  })

  // A number we do not recognise is not an error to shout about — wrong
  // numbers happen — but it is worth answering so a real person does not
  // think they are shouting into a void.
  if (!profile) {
    return NextResponse.json({
      data: { known: false, said: 'We do not have this number on file. Nothing has been changed.' },
    })
  }

  const asked = await lastAsked(profile.personId)
  const kind: Kind = (asked?.kind as Kind) ?? 'FRESHNESS'
  const reply = readReply(body, kind)
  const now = new Date()
  const effect = applyReply(reply, now)

  // Record the inbound message first, whatever it turns out to mean.
  await prisma.textMessage.create({
    data: {
      companyId: asked?.companyId ?? (await anyBench(profile.personId)),
      personId: profile.personId,
      kind,
      direction: 'IN',
      body,
      status: 'SENT',
      read: reply,
      replyToId: asked?.id ?? null,
      aboutType: asked?.aboutType ?? null,
      aboutId: asked?.aboutId ?? null,
    },
  })

  // Then what it does to the record.
  await prisma.consultantProfile.update({
    where: { id: profile.id },
    data: {
      ...(effect.confirmedAt ? { confirmedAt: effect.confirmedAt, confirmedVia: 'SMS' } : {}),
      ...(effect.unanswered !== null ? { unanswered: effect.unanswered } : {}),
      ...(effect.textsOffAt ? { textsOffAt: effect.textsOffAt } : {}),
    },
  })

  // A consent answer decides a hold. This is the cheapest deduplication
  // anybody will ever build: "no, someone already put me forward there"
  // arrives before the client sees the same name twice and rejects both.
  if (kind === 'CONSENT' && (reply === 'YES' || reply === 'NO') && asked?.companyId) {
    const hold = await prisma.representation.findFirst({
      where: {
        personId: profile.personId,
        companyId: asked.companyId,
        state: { in: ['HELD', 'REQUESTED'] },
      },
      orderBy: { takenAt: 'desc' },
      select: { id: true },
    })

    if (hold) {
      await prisma.representation.update({
        where: { id: hold.id },
        data:
          reply === 'YES'
            ? { consentedAt: now, consentVia: 'SMS', state: 'HELD' }
            : {
                state: 'DECLINED',
                // Cleared, not left standing. A declined hold carrying an
                // old consent timestamp is a record that can be read two
                // ways, and the wrong reading submits somebody who said no.
                consentedAt: null,
                consentVia: null,
                endedAt: now,
                endedReason: 'They said no to being put forward for this one.',
              },
      })
    }
  }

  // Answer them. A loop that takes replies and says nothing back is one
  // people stop replying to.
  if (asked?.companyId) {
    await send({
      companyId: asked.companyId,
      personId: profile.personId,
      kind: 'LINK',
      to: from,
      body: effect.says,
    })
  }

  return NextResponse.json({
    data: {
      known: true,
      person: profile.person.name,
      answering: kind,
      read: reply,
      said: effect.says,
      sendLink: effect.sendLink,
    },
  })
}

/** Which vendor to file a reply under when we cannot tell from the ask. */
async function anyBench(personId: string): Promise<string> {
  const listing = await prisma.benchListing.findFirst({
    where: { consultant: { personId }, revokedAt: null },
    select: { companyId: true },
  })
  if (listing) return listing.companyId

  const contract = await prisma.sellContract.findFirst({
    where: { personId },
    select: { companyId: true },
  })
  return contract!.companyId
}
