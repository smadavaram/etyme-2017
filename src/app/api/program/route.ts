import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { programView } from './view'

/**
 * GET /api/program
 *
 * Client-side program overview — the enterprise/demand perspective.
 * Aggregates contractors, vendors, spend, and pending items
 * from the client company's viewpoint.
 *
 * BRD §17.1 Option C (mid-market, no VMS) — what an enterprise
 * hiring manager sees: their contractors, pending approvals,
 * vendor performance, and upcoming contract endings.
 *
 * The reads and the arithmetic are `programView` in ./view, shared with
 * `programQueue` in ./queue. A seat on a region reads its region only and a
 * seat on a plant its plant (founder, 2026-10-27, the region map).
 */
export async function GET(request: NextRequest) {
  // Narrowed for a seat on a region or a plant (`./reader-scope`, applied
  // to every read in `programView`), so a regional manager's Today opens.
  const { caller, error } = await getCallerContext(request, { narrowsToRegion: true })
  if (error) return error
  const view = await programView(caller, request.nextUrl.searchParams.get('clientCompanyId'))
  if (view.error) return view.error
  return NextResponse.json({ data: view.data })
}
