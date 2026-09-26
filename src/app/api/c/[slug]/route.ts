import { NextRequest, NextResponse } from 'next/server'
import { portfolioOf, movedTo } from '@/lib/portfolio-data'

/**
 * GET /api/c/:slug
 *
 * A consultant's page as JSON, for anybody who would rather have the data
 * than the page — their own site pulling it in, or a crawler.
 *
 * The page itself does not call this. A server component fetching its own
 * HTTP endpoint doubles the latency and breaks the moment the public
 * hostname does not resolve from inside the container. Both read
 * src/lib/portfolio-data.ts directly.
 *
 * No authentication, because it is public — which means what comes back is
 * only what the consultant turned on. No client names, no rates, no
 * documents.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const portfolio = await portfolioOf(slug)

  if (!portfolio) {
    // An address they used to hold still answers, so a link on a CV from
    // two years ago is never simply dead.
    const now = await movedTo(slug)
    if (now) {
      return NextResponse.json(
        { data: { movedTo: now, url: `/c/${now}` } },
        { status: 301, headers: { Location: `/api/c/${now}` } }
      )
    }
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Nobody at that address.' } },
      { status: 404 }
    )
  }

  return NextResponse.json({ data: portfolio })
}
