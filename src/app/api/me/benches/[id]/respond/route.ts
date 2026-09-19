import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { answer, type State } from '@/lib/bench-consent'

/**
 * POST /api/me/benches/:id/respond
 *
 * A consultant answering a vendor who asked to market them.
 *
 * The half of CLAUDE.md's firmest invariant that never existed. A
 * submission requires a listing granted by the consultant, and until
 * now `grantedAt` was stamped the moment a vendor created the row — so
 * every listing was born consented and nobody was ever asked.
 *
 * Body: { said: 'ACCEPT' | 'DECLINE', note?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const said = String(body.said ?? '').toUpperCase()

  if (said !== 'ACCEPT' && said !== 'DECLINE') {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'said must be ACCEPT or DECLINE', field: 'said' } },
      { status: 422 }
    )
  }

  const listing = await prisma.benchListing.findUnique({
    where: { id },
    include: {
      consultant: { select: { personId: true } },
      company: { select: { id: true, name: true } },
    },
  })

  if (!listing) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No such listing.' } }, { status: 404 })
  }

  // Theirs alone. A vendor answering on somebody's behalf is the exact
  // thing this endpoint exists to stop.
  if (listing.consultant.personId !== caller.person.id) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'This is not yours to answer.' } },
      { status: 403 }
    )
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
    prisma.benchListing.update({ where: { id }, data: outcome.data! }),
    prisma.notification.create({
      data: {
        personId: caller.person.id,
        companyId: listing.company.id,
        type: 'BENCH',
        title:
          said === 'ACCEPT'
            ? `${caller.person.name} agreed to be marketed by you`
            : `${caller.person.name} declined your bench invitation`,
        // Their reason reaches the vendor who asked and nobody else.
        body:
          said === 'DECLINE' && body.note
            ? `They said: ${String(body.note).slice(0, 300)}`
            : said === 'ACCEPT'
              ? 'You can put them forward for roles now.'
              : 'No reason given.',
        entityId: id,
        channel: 'IN_APP',
        status: 'UNREAD',
      },
    }),
    prisma.automationLog.create({
      data: {
        companyId: listing.company.id,
        action: said === 'ACCEPT' ? 'BENCH_CONSENT_GIVEN' : 'BENCH_CONSENT_DECLINED',
        summary: `${caller.person.name} ${said === 'ACCEPT' ? 'agreed to' : 'declined'} being marketed by ${listing.company.name}`,
        reason: 'The consultant answered the invitation themselves.',
        payload: { listingId: id, said },
        // Their own answer about their own representation. A vendor
        // reversing it would be the vendor consenting on their behalf,
        // which is the whole thing this prevents.
        reversible: false,
      },
    }),
  ])

  return NextResponse.json({
    data: { id, state: said === 'ACCEPT' ? 'GRANTED' : 'DECLINED', says: outcome.reason },
  })
}
