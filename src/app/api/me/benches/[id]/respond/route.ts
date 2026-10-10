import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { answer, type State } from '@/lib/bench-consent'
import { tellTheFirm } from '@/lib/bench-invite'
import { readStay, stayFields, staySays } from '@/lib/bench-stay'
import { agreeingTerms } from '@/lib/bench-filter'

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
 * Body: { said: 'ACCEPT' | 'DECLINE', note?: string,
 *         termsSeen?: { engagementType, payRateCents } }
 *
 * Where the firm stated terms when it listed them (2026-10-06), the yes
 * agrees those terms — `termsAgreedAt` — but only the terms their page
 * printed beside the button, sent back as `termsSeen`. If the firm
 * changed them in between, the yes is refused and they read again. A yes
 * to a listing with no terms agrees only the marketing.
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
    body.note ? String(body.note) : null,
    body.askFirst
  )

  if (!outcome.ok) {
    return NextResponse.json({ error: { code: 'INVALID_STATE', message: outcome.reason } }, { status: 409 })
  }

  // How long they stay, chosen beside the yes (`lib/bench-stay`). Nothing
  // chosen is until they cancel, so a bare yes is a complete answer.
  const stay = readStay(body.stayDays)
  if (said === 'ACCEPT' && !stay.ok) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: stay.says, field: 'stayDays' } }, { status: 422 })
  }
  const chosen = said === 'ACCEPT' && stay.ok ? stayFields(stay.days, now) : null

  // What the yes agrees about pay. A no agrees nothing and needs no check.
  const terms = said === 'ACCEPT' ? agreeingTerms(listing, body.termsSeen, listing.company.name, now) : null
  if (terms && !terms.ok) {
    return NextResponse.json({ error: { code: 'TERMS_NOT_SEEN', message: terms.says, field: 'termsSeen' } }, { status: 409 })
  }
  const agreed = terms && terms.ok ? terms : null

  await prisma.$transaction([
    prisma.benchListing.update({
      where: { id },
      data: chosen
        ? { ...outcome.data!, ...chosen, showInMatches: body.showInMatches === true, ...(agreed?.data ?? {}) }
        : outcome.data!,
    }),
    prisma.automationLog.create({
      data: {
        companyId: listing.company.id,
        action: said === 'ACCEPT' ? 'BENCH_CONSENT_GIVEN' : 'BENCH_CONSENT_DECLINED',
        summary:
          `${caller.person.name} ${said === 'ACCEPT' ? 'agreed to' : 'declined'} being marketed by ${listing.company.name}` +
          (agreed?.agreed && 'termsAgreedAt' in agreed.data ? ', and agreed the pay terms stated with the listing' : ''),
        reason: 'The consultant answered the invitation themselves.',
        payload: {
          listingId: id, said,
          ...(agreed?.agreed && 'termsAgreedAt' in agreed.data
            ? { termsAgreed: { engagementType: listing.termsEngagementType, payRateCents: listing.termsPayRateCents } }
            : {}),
        },
        // Their own answer about their own representation. A vendor
        // reversing it would be the vendor consenting on their behalf,
        // which is the whole thing this prevents.
        reversible: false,
      },
    }),
  ])

  // The firm that asked hears the answer — whoever sent the invitation
  // and every desk that puts people forward, in the app and by email.
  // It was written to the consultant's own inbox (tester, 2026-09-30).
  // Their reason reaches the firm and nobody else.
  void tellTheFirm({
    listingId: id,
    companyId: listing.company.id,
    subjectPersonId: caller.person.id,
    personName: caller.person.name,
    said,
    note: said === 'DECLINE' && body.note ? String(body.note) : null,
    askFirst: typeof body.askFirst === 'boolean' ? body.askFirst : null,
    stayDays: chosen?.stayDays ?? null,
  })

  return NextResponse.json({
    data: {
      id,
      state: said === 'ACCEPT' ? 'GRANTED' : 'DECLINED',
      termsAgreed: agreed?.agreed ?? false,
      says: chosen
        ? `${outcome.reason} ${staySays(chosen, listing.company.name, now)}${agreed ? ` ${agreed.says}` : ''}`
        : outcome.reason,
    },
  })
}
