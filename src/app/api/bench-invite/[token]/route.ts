import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { readInvite } from '@/lib/bench-invite'
import { answer, awaitingAnswer, type State } from '@/lib/bench-consent'

/**
 * GET  /api/bench-invite/:token — what is being asked
 * POST /api/bench-invite/:token — the consultant's answer
 *
 * No sign-in. A consultant on a vendor's bench has no seat, and their
 * answer is now required before anybody can be submitted, so the
 * invitation has to carry its own authority — the same shape as
 * `/packet` and `/reply`.
 *
 * The split matters: mail security scanners open every link in a message
 * before the person does, and a GET that accepted on their behalf would
 * be fake consent produced by a spam filter. GET only reads.
 */

async function load(token: string) {
  const t = readInvite(token)
  if (!t) return null
  const listing = await prisma.benchListing.findUnique({
    where: { id: t.listingId },
    include: {
      company: { select: { id: true, name: true } },
      consultant: { select: { personId: true, person: { select: { name: true } } } },
    },
  })
  return listing
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const listing = await load(token)

  if (!listing) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'This link is not valid. It may have been retyped or altered.' } },
      { status: 404 }
    )
  }

  return NextResponse.json({
    data: {
      name: listing.consultant.person.name.trim().split(/\s+/)[0],
      // In the vendor's name, never ours.
      vendor: listing.company.name,
      awaiting: awaitingAnswer({ state: listing.state as State, revokedAt: listing.revokedAt }),
      state: listing.state,
      says:
        listing.state === 'GRANTED'
          ? `You already said yes to ${listing.company.name}.`
          : listing.state === 'DECLINED'
            ? `You already said no to ${listing.company.name}. They have not been able to put you forward.`
            : `${listing.company.name} would like to put you forward for contract roles.`,
    },
  })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const body = await request.json().catch(() => ({}))
  const said = String(body.said ?? '').toUpperCase()

  if (said !== 'ACCEPT' && said !== 'DECLINE') {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'said must be ACCEPT or DECLINE', field: 'said' } },
      { status: 422 }
    )
  }

  const listing = await load(token)
  if (!listing) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'This link is not valid.' } }, { status: 404 })
  }

  const now = new Date()
  const outcome = answer(
    { state: listing.state as State, revokedAt: listing.revokedAt },
    said,
    now,
    body.note ? String(body.note) : null
  )

  if (!outcome.ok) {
    return NextResponse.json({ error: { code: 'INVALID_STATE', message: outcome.reason } }, { status: 409 })
  }

  await prisma.$transaction([
    prisma.benchListing.update({ where: { id: listing.id }, data: outcome.data! }),
    prisma.notification.create({
      data: {
        personId: listing.consultant.personId,
        companyId: listing.company.id,
        type: 'BENCH',
        title:
          said === 'ACCEPT'
            ? `${listing.consultant.person.name} agreed to be marketed by you`
            : `${listing.consultant.person.name} declined your bench invitation`,
        body:
          said === 'DECLINE' && body.note
            ? `They said: ${String(body.note).slice(0, 300)}`
            : said === 'ACCEPT'
              ? 'You can put them forward for roles now.'
              : 'No reason given.',
        entityId: listing.id,
        channel: 'IN_APP',
        status: 'UNREAD',
      },
    }),
    prisma.automationLog.create({
      data: {
        companyId: listing.company.id,
        action: said === 'ACCEPT' ? 'BENCH_CONSENT_GIVEN' : 'BENCH_CONSENT_DECLINED',
        summary: `${listing.consultant.person.name} ${said === 'ACCEPT' ? 'agreed to' : 'declined'} being marketed by ${listing.company.name}`,
        reason: 'The consultant answered the invitation themselves, from the link they were sent.',
        payload: { listingId: listing.id, said, via: 'LINK' },
        // Their own answer about their own representation.
        reversible: false,
      },
    }),
  ])

  return NextResponse.json({
    data: { state: said === 'ACCEPT' ? 'GRANTED' : 'DECLINED', says: outcome.reason },
  })
}
