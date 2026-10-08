import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { readReply, verifyInbound, reportRefusalNow, INBOUND_SECRET_ENV, type Kind } from '@/lib/texts'
import { lastAsked, send } from '@/lib/messages'
import { recordAnswer } from '@/lib/answers'
import { reportError } from '@/lib/alerts'

/** When each source was last reported for a refused delivery, so staff hear once an hour per source. */
const reported = new Map<string, number>()

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
 * pointed at it yet — turning inbound email on is a DNS record, a
 * provider setting and the signing secret below, not code — and until
 * that is done the buttons carry the loop on their own. SendGrid's
 * Inbound Parse signs nothing, so it cannot be accepted here.
 *
 * An email address carries no context, so the reply is read against the
 * last thing we asked that person. Somebody replying "yes" three days
 * later is answering whatever we asked last, and reading it against the
 * wrong question turns a freshness ping into consent to be submitted.
 *
 * Nothing is guessed. An unclear reply is recorded as unclear and left for
 * a person — guessing NO on a consent ask loses a placement, and guessing
 * YES submits somebody who said no.
 *
 * Nobody but the provider may post here. A reply changes somebody's
 * profile, so before anything is read the provider's signature is checked
 * over the body exactly as it arrived (`verifyInbound` in lib/texts). With
 * no signing secret configured every delivery is refused with 503, never
 * trusted; a delivery with a missing, stale or wrong signature is refused
 * with 403 and nothing is read or written. Staff hear of a refusal once an
 * hour per source.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text().catch(() => '')
  const header = (svix: string, standard: string) =>
    request.headers.get(svix) ?? request.headers.get(standard)
  const verdict = verifyInbound({
    secret: process.env[INBOUND_SECRET_ENV],
    id: header('svix-id', 'webhook-id'),
    timestamp: header('svix-timestamp', 'webhook-timestamp'),
    signature: header('svix-signature', 'webhook-signature'),
    body: raw,
    now: new Date(),
  })
  if (!verdict.ok) {
    const source =
      verdict.code === 'INBOUND_OFF'
        ? 'configuration'
        : (request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown')
    if (reportRefusalNow(reported, source, new Date())) {
      void reportError(
        verdict.code === 'INBOUND_OFF' ? 'texts/inbound is switched off' : 'texts/inbound refused an unsigned reply',
        `${verdict.says} (source: ${source}, reason: ${verdict.code})`,
        { path: '/api/texts/inbound' }
      )
    }
    return NextResponse.json({ error: { code: verdict.code, message: verdict.says } }, { status: verdict.status })
  }

  // Signed, so now it is read. JSON is the provider's shape — the fields
  // at the top level, or under `data` as the webhook event carries them;
  // a form post is read from the same signed bytes.
  let from = ''
  let body = ''

  const type = request.headers.get('content-type') ?? ''
  if (type.includes('application/json')) {
    let json: any = {}
    try { json = JSON.parse(raw) } catch { json = {} }
    const d = json && typeof json.data === 'object' && json.data ? json.data : {}
    from = String(json.From ?? json.from ?? d.from ?? '')
    body = String(json.Body ?? json.body ?? d.text ?? d.body ?? '')
  } else {
    const form = await new Response(raw, { headers: { 'content-type': type } }).formData().catch(() => null)
    from = String(form?.get('From') ?? form?.get('from') ?? '')
    body = String(form?.get('Body') ?? form?.get('text') ?? '')
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

  // An address we do not recognize is not an error to shout about —
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
