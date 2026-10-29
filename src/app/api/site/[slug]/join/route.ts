import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { reportError } from '@/lib/alerts'
import { publicSite } from '@/lib/public-site'
import { looksScripted, normalEmail, tidy } from '@/lib/public-site/leads'
import {
  joinLetterLead,
  joinProblems,
  joinReplyFor,
  tooManyAsks,
  TOO_MANY_SAYS,
} from '@/lib/public-site/join-bench'
import { emailSender } from '@/lib/senders'
import { askOntoBench } from '@/lib/consultant-portfolio/bench-ask'

/**
 * POST /api/site/:slug/join
 *
 * "Join the bench" from a staffing or bench firm's public page (founder,
 * 2026-10-29). A person gives a name and an email; the firm's bench
 * invitation goes to that address, and the person says yes or no from
 * its link on `/bench-invite/[token]`, which thanks them. The yes is
 * never given here, because anybody can type any address into a box.
 *
 * It is the bench's own ask, the one function Add consultant calls too
 * (`askOntoBench` in lib/consultant-portfolio/bench-ask): somebody who
 * already has a record is asked on it, never made again, and a no is
 * never reopened from here. What differs is only who started it
 * (`by: null`), so no rate or term is stated.
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

  // Never says a letter went where none can leave this deployment.
  const reply = () => NextResponse.json({ data: { says: joinReplyFor(firm.name, emailSender() !== null) } })

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

    // ASKED, NOTHING, REFUSED and RACED all get the one reply: a stranger
    // learns nothing about an address, and the page states no terms, so
    // nothing it sends can be refused for them.
    await askOntoBench({
      firm: { id: firm.id, name: firm.name },
      name,
      email,
      by: null,
      letterLead: joinLetterLead(firm.name),
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
