import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { reportError } from '@/lib/alerts'
import { notify } from '@/lib/notify'
import { ASK_ETYME_HREF } from '@/lib/nav-table'
import { publicSite } from '@/lib/public-site'
import { looksScripted, normalEmail, tidy } from '@/lib/public-site/leads'
import {
  ASKS_PER_HOUR,
  NOBODY_READS,
  firmAskNotice,
  firmAskProblems,
  firmAskThanks,
} from '@/lib/public-site/firm-page'

/**
 * POST /api/site/:slug/ask
 *
 * The ask box on a staffing or bench firm's public page (the Tapin walk,
 * 2026-10-29). A client types a question and a work email; it lands in
 * the firm's own Ask Etyme, as a notice to the people there who put
 * consultants forward, under "Since you last looked".
 *
 * ── Why it is never a lead of Etyme's ────────────────────────────────
 *
 * The home page's ask box writes `MarketingLead`, which is Etyme's own
 * list. This one writes nothing Etyme reads: a firm's client is the
 * firm's, and Etyme keeping a list of who asked which supplier for whom
 * would be the platform competing with its own suppliers. The notice is
 * the record, kept at the firm, readable by the seats it went to.
 *
 * Public, with no account: a field nobody sees and a clock stop scripts,
 * and a firm's page stops taking questions after an hour's cap.
 */

const SEATS_TOLD = 5

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string) : '')

  const script = looksScripted({
    honeypot: str('company_website') || null,
    filledInMs: typeof body.filledInMs === 'number' ? body.filledInMs : null,
  })
  if (script.scripted) {
    return NextResponse.json({ error: { code: 'SCRIPTED', message: script.says } }, { status: 422 })
  }

  const wrong = firmAskProblems({ email: str('email'), asked: str('asked'), name: str('name'), companyName: str('companyName') })
  if (wrong.length > 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: wrong[0].says, field: wrong[0].field } },
      { status: 422 }
    )
  }

  // The page's own gates: live, spoken for, and a firm whose page asks.
  const site = await publicSite(slug)
  if (!site || !site.askBox) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'This page takes no questions.' } },
      { status: 404 }
    )
  }

  try {
    const firm = await prisma.company.findFirst({ where: { slug: site.slug }, select: { id: true, name: true } })
    if (!firm) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'This page takes no questions.' } },
        { status: 404 }
      )
    }

    const lastHour = await prisma.notification.count({
      where: {
        companyId: firm.id,
        createdAt: { gte: new Date(Date.now() - 3_600_000) },
        data: { path: ['pageAsk'], equals: 'FIRST' },
      },
    })
    if (lastHour >= ASKS_PER_HOUR) {
      return NextResponse.json(
        {
          error: {
            code: 'TOO_MANY',
            message: 'This page has taken a lot of questions in the last hour, so nothing was sent. Try again in an hour.',
          },
        },
        { status: 429 }
      )
    }

    // The seats that put consultants forward: the people a client's
    // question is for. The owner holds every permission, so a firm of one
    // is never left with nobody.
    const seats = await prisma.context.findMany({
      where: {
        companyId: firm.id,
        revokedAt: null,
        suspendedAt: null,
        role: { permissions: { hasSome: ['submissions.create', '*'] } },
      },
      select: { personId: true },
      orderBy: { grantedAt: 'asc' },
    })
    const to = [...new Set(seats.map((s) => s.personId))].slice(0, SEATS_TOLD)
    if (to.length === 0) {
      return NextResponse.json({ error: { code: 'NOBODY', message: NOBODY_READS } }, { status: 409 })
    }

    const asked = str('asked').trim()
    const email = normalEmail(str('email'))!
    const notice = firmAskNotice({ email, asked, name: tidy(str('name')), companyName: tidy(str('companyName')) })

    // Written before the reply, so "sent" is said only once it is there.
    const written = await Promise.all(
      to.map((personId, i) =>
        notify({
          personId,
          companyId: firm.id,
          type: 'SYSTEM',
          title: notice.title,
          body: notice.body,
          data: { pageAsk: i === 0 ? 'FIRST' : 'COPY', fromPublicPage: true, replyTo: email, href: ASK_ETYME_HREF },
        })
      )
    )
    if (written.every((w) => w === null)) {
      return NextResponse.json(
        { error: { code: 'INTERNAL', message: 'That did not send. Try again in a minute.' } },
        { status: 500 }
      )
    }
    return NextResponse.json({ data: { says: firmAskThanks(firm.name) } })
  } catch (err) {
    reportError('A question from a firm’s public page failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'That did not send. Try again in a minute.' } },
      { status: 500 }
    )
  }
}
