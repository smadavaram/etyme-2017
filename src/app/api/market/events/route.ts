import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionEmail } from '@/lib/api-context'
import { reportError } from '@/lib/alerts'
import { mayReadTheList } from '@/lib/public-site/leads'
import {
  readMarketEvent, summarize, MARKET_TYPE_PREFIX, MARKET_EVENTS, type MarketEventRow,
} from '@/lib/public-site/market-events'

/**
 * What visitors to the public site did, counted first-party.
 *
 * POST is open: a visitor has no account. It takes one of five event
 * names, a page path and a random visit id, and stores nothing personal
 * (see `lib/public-site/market-events`). A body that is not that shape is
 * refused in a sentence and nothing is written.
 *
 * GET is Etyme's own, gated on being us the way the lead list is
 * (`mayReadTheList` over ETYME_STAFF_EMAILS and the etyme.com domain):
 * a summary of the last thirty days, or `?days=n` up to a year.
 */

function staff() {
  return {
    domains: ['etyme.com'],
    emails: (process.env.ETYME_STAFF_EMAILS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const read = readMarketEvent(body ?? {})
  if (!read.ok) {
    return NextResponse.json({ error: { code: 'NOT_COUNTED', message: read.says } }, { status: 400 })
  }
  try {
    await prisma.event.create({
      data: {
        companyId: null,
        type: `${MARKET_TYPE_PREFIX}${read.row.event}`,
        subjectType: 'Visit',
        subjectId: read.row.visit,
        // A visitor is not a person on the record, an automation or a
        // service; the column is a free string and says which.
        actorKind: 'VISITOR',
        payload: { page: read.row.page },
      },
    })
  } catch (err) {
    await reportError('A public-site count was not stored', err, { path: '/api/market/events' })
    return NextResponse.json({ error: { code: 'NOT_STORED', message: 'Not counted. Nothing else is affected.' } }, { status: 500 })
  }
  return NextResponse.json({ data: { counted: true } })
}

export async function GET(request: NextRequest) {
  const email = await getSessionEmail()
  const verdict = mayReadTheList(email, staff())
  if (!verdict.ok) {
    return NextResponse.json(
      { error: { code: email ? 'NOT_YOURS' : 'UNAUTHORIZED', message: verdict.says } },
      { status: email ? 403 : 401 }
    )
  }
  const asked = Number(request.nextUrl.searchParams.get('days') ?? '30')
  const days = Number.isInteger(asked) && asked >= 1 && asked <= 366 ? asked : 30
  const since = new Date(Date.now() - days * 86_400_000)
  const rows = await prisma.event.findMany({
    where: {
      companyId: null,
      type: { in: MARKET_EVENTS.map((e) => `${MARKET_TYPE_PREFIX}${e}`) },
      occurredAt: { gte: since },
    },
    select: { type: true, subjectId: true, payload: true },
    take: 100_000,
  })
  const read: MarketEventRow[] = rows.map((r) => ({
    event: r.type.slice(MARKET_TYPE_PREFIX.length) as MarketEventRow['event'],
    visit: r.subjectId,
    page: String((r.payload as { page?: unknown } | null)?.page ?? '/'),
  }))
  return NextResponse.json({ data: summarize(read, since) })
}
