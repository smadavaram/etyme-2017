import { NextRequest, NextResponse } from 'next/server'
import { publicSite } from '@/lib/public-site'

/**
 * GET /api/site/:slug
 *
 * The public page as JSON, for anybody who would rather have the data than
 * the page — a company embedding their own numbers, or a crawler.
 *
 * The page itself does not call this. A server component fetching its own
 * HTTP endpoint doubles the latency and breaks the moment the public
 * hostname does not resolve from inside the container, which is exactly
 * how it broke. Both read src/lib/public-site.ts directly.
 *
 * No authentication, because it is public — which means what comes back is
 * what we are willing to say about a customer to anybody who types their
 * name. No rates, no margins, no client names, no consultant identities.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const site = await publicSite(slug)

  if (!site) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No company at that address.' } },
      { status: 404 }
    )
  }

  return NextResponse.json({ data: site })
}
