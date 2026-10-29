import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { reportError } from '@/lib/alerts'
import { publicSite } from '@/lib/public-site'
import { looksScripted, normalEmail, tidy } from '@/lib/public-site/leads'
import {
  joinAct,
  joinLetterLead,
  joinProblems,
  joinReply,
  tooManyAsks,
  TOO_MANY_SAYS,
} from '@/lib/public-site/join-bench'
import { addPath } from '@/lib/consultant-portfolio'
import { invitation } from '@/lib/bench-consent'
import { inviteUrl, inviteText } from '@/lib/bench-invite'
import { askByEmail } from '@/app/api/consultants/ask-by-email'

/**
 * POST /api/site/:slug/join
 *
 * "Join the bench" from a staffing or bench firm's public page (founder,
 * 2026-10-29). A person gives a name and an email; the firm's bench
 * invitation goes to that address, and the person says yes or no from
 * its link on `/bench-invite/[token]`, which thanks them. The yes is
 * never given here, because anybody can type any address into a box.
 *
 * It is the bench's own ask, on the bench's own rule (`addPath`), its
 * own invitation (`invitation`, `inviteUrl`, `inviteText`) and its own
 * way of sending (`askByEmail`): somebody who already has a record is
 * asked on it, never made again, and a no is never reopened from here.
 * What differs from Add consultant is only who started it, so nobody is
 * seated at the firm before their yes and no rate or term is stated.
 *
 * Public, with no account: the reply is one sentence for every path, so
 * a stranger learns nothing about an address. A field nobody sees and a
 * clock stop scripts; a firm's page stops sending after an hour's cap.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const script = looksScripted({
    honeypot: typeof body.company_website === 'string' ? body.company_website : null,
    filledInMs: typeof body.filledInMs === 'number' ? body.filledInMs : null,
  })
  if (script.scripted) {
    return NextResponse.json({ error: { code: 'SCRIPTED', message: script.says } }, { status: 422 })
  }

  const wrong = joinProblems({ name: body.name as string, email: body.email as string })
  if (wrong.length > 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: wrong[0].says, field: wrong[0].field } },
      { status: 422 }
    )
  }
  const name = tidy(body.name as string)!
  const email = normalEmail(body.email as string)!

  // The page's own gates: live, spoken for by somebody there, and a
  // staffing or bench firm. A client's page has no bench to join.
  const site = await publicSite(slug)
  if (!site || !site.joinBench) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'This page has no bench to join.' } },
      { status: 404 }
    )
  }
  const firm = await prisma.company.findFirst({
    where: { slug: site.slug },
    select: { id: true, name: true },
  })
  if (!firm) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'This page has no bench to join.' } },
      { status: 404 }
    )
  }

  const reply = () => NextResponse.json({ data: { says: joinReply(firm.name) } })

  try {
    const lastHour = await prisma.automationLog.count({
      where: {
        companyId: firm.id,
        action: 'BENCH_LISTING_REQUESTED',
        at: { gte: new Date(Date.now() - 3_600_000) },
        payload: { path: ['fromPublicPage'], equals: true },
      },
    })
    if (tooManyAsks(lastHour)) {
      return NextResponse.json({ error: { code: 'TOO_MANY', message: TOO_MANY_SAYS } }, { status: 429 })
    }

    const existing = await prisma.person.findUnique({
      where: { primaryEmail: email },
      select: {
        id: true,
        name: true,
        primaryEmail: true,
        consultant: {
          select: {
            id: true,
            listings: { where: { companyId: firm.id }, select: { id: true, state: true, revokedAt: true } },
          },
        },
      },
    })
    const listing = existing?.consultant?.listings[0] ?? null
    const act = joinAct(addPath({ profileExists: Boolean(existing?.consultant), listing }))
    if (act === 'NOTHING') return reply()

    const asked = await prisma.$transaction(async (tx) => {
      // Never a second record: the person by that address, or a new one
      // where there is none. Their own name stays theirs.
      const person = existing ?? (await tx.person.create({ data: { name, primaryEmail: email }, select: { id: true, name: true, primaryEmail: true } }))
      const profileId =
        existing?.consultant?.id ??
        (await tx.consultantProfile.create({ data: { personId: person.id, visibility: 'INTERNAL' }, select: { id: true } })).id

      const row =
        act === 'ASK_AGAIN'
          ? await tx.benchListing.update({
              where: { id: listing!.id },
              // Asked again, never restored: revoking is never a suggestion.
              data: { tier: 'MARKETING', ...invitation(new Date()), revokedAt: null, declinedNote: null },
            })
          : await tx.benchListing.create({
              data: { consultantId: profileId, companyId: firm.id, tier: 'MARKETING', ...invitation(new Date()) },
            })

      await tx.automationLog.create({
        data: {
          companyId: firm.id,
          action: 'BENCH_LISTING_REQUESTED',
          summary: `"${person.name}" asked to join the bench from ${firm.name}’s public page. Pending their yes from the letter.`,
          reason: 'Join the bench on the public page: the bench’s own invitation, sent to the address the person gave, answered only from its link.',
          payload: {
            listingId: row.id,
            consultantId: profileId,
            personId: person.id,
            requestedBy: null,
            tier: 'MARKETING',
            fromPublicPage: true,
          },
          reversible: true,
        },
      })
      return { listingId: row.id, person }
    })

    const url = inviteUrl(asked.listingId)
    const msg = inviteText({ personName: asked.person.name, vendorName: firm.name, url, terms: null })
    await askByEmail({
      companyId: firm.id,
      personId: asked.person.id,
      to: asked.person.primaryEmail,
      url,
      subject: msg.subject,
      body: joinLetterLead(firm.name) + msg.body,
      listingId: asked.listingId,
    })
    return reply()
  } catch (err: any) {
    // Two people asking with one address in the same second: the first
    // ask stands, and the reply is the same.
    if (err?.code === 'P2002') return reply()
    reportError('Join the bench from a public page failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'That did not send. Try again in a minute.' } },
      { status: 500 }
    )
  }
}
