import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { send } from '@/lib/messages'
import { inviteUrl, inviteText } from '@/lib/bench-invite'
import { termsShown } from '@/lib/bench-filter'
import { renewAskText } from '@/lib/bench-stay'
import { possessive } from '@/lib/requisition-approval'

/**
 * POST /api/bench/listings/:id/nudge   { copyOnly? }
 *
 * The one door for a firm reaching a person about their own listing again:
 *
 * - somebody asked and **not answered yet**: the invitation is sent again;
 * - somebody whose **chosen stay ran out**: they are asked to renew it.
 *
 * `copyOnly` hands back the link without sending anything, for a recruiter
 * who would rather paste it into their own message. The link is the same
 * signed one either way, and it asks — it grants nothing: only the person's
 * yes does. Nothing to send for anybody who said yes and is still on the
 * bench, or who took the listing back themselves.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!hasPermission(caller.permissions, 'consultants.write')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: `Reaching somebody about ${possessive(caller.company?.name ?? 'your firm')} bench is for the desks that manage people there.` } },
      { status: 403 }
    )
  }
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const listing = await prisma.benchListing.findUnique({
    where: { id },
    select: {
      id: true, companyId: true, state: true, revokedAt: true, lapsedAt: true, staysUntil: true, stayDays: true,
      termsEngagementType: true, termsPayRateCents: true, termsAgreedAt: true,
      company: { select: { name: true } },
      consultant: { select: { person: { select: { id: true, name: true, primaryEmail: true } } } },
    },
  })
  if (!listing || listing.companyId !== caller.company?.id) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That listing is not on your bench.' } }, { status: 404 })
  }
  const person = listing.consultant.person
  const waiting = listing.state === 'INVITED' && !listing.revokedAt
  const ended = listing.state === 'GRANTED' && listing.lapsedAt != null
  if (!waiting && !ended) {
    const why = listing.revokedAt && !listing.lapsedAt
      ? `${person.name} took this listing back. Ask them afresh from Consultants if they might say yes again.`
      : listing.state === 'DECLINED'
        ? `${person.name} said no. Asking again is theirs to invite, not the firm's to repeat.`
        : `${person.name} said yes and is on your bench. There is nothing to send.`
    return NextResponse.json({ error: { code: 'NOTHING_TO_SEND', message: why } }, { status: 409 })
  }

  const url = inviteUrl(listing.id)
  if (!url) {
    return NextResponse.json(
      { error: { code: 'NO_LINK', message: 'This deployment has no public address set, so no link can be made. Set NEXTAUTH_URL.' } },
      { status: 409 }
    )
  }
  if (body?.copyOnly === true) {
    return NextResponse.json({ data: { url, sent: false, says: `The link for ${person.name} is copied. It asks; only their yes grants anything.` } })
  }

  const letter = waiting
    ? inviteText({ personName: person.name, vendorName: listing.company.name, url, terms: termsShown(listing, listing.company.name) })
    : renewAskText({ personName: person.name, firm: listing.company.name, endedOn: listing.lapsedAt ?? listing.staysUntil!, days: listing.stayDays, url })
  const sent = await send({
    companyId: listing.companyId, personId: person.id, kind: 'LINK', to: person.primaryEmail,
    subject: letter.subject, body: letter.body, aboutType: 'LISTING', aboutId: listing.id,
  })
  if (waiting) {
    await prisma.automationLog.create({
      data: {
        companyId: listing.companyId,
        action: 'BENCH_INVITATION_RESENT',
        summary: `${caller.person.name} sent ${person.name} the bench invitation again.`,
        reason: `${person.name} has not answered. A person at the firm pressed Resend.`,
        payload: { listingId: listing.id, messageId: sent.id, status: sent.status },
        reversible: false,
      },
    })
  } else {
    await prisma.automationLog.create({
      data: {
        companyId: listing.companyId,
        action: 'BENCH_STAY_RENEW_ASKED',
        summary: `${caller.person.name} asked ${person.name} to renew their stay on the bench.`,
        reason: `${person.name}'s chosen stay ended. A person at the firm pressed Ask to renew; renewing is still theirs to do.`,
        payload: { listingId: listing.id, messageId: sent.id, status: sent.status },
        reversible: false,
      },
    })
  }
  const says = sent.status === 'SENT'
    ? `Sent to ${person.name}.`
    : `Recorded for ${person.name} and not sent: ${sent.reason} Copy the link and send it yourself.`
  return NextResponse.json({ data: { url, sent: sent.status === 'SENT', status: sent.status, says } })
}
