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
 * `programQueue` in ./queue.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const view = await programView(caller, request.nextUrl.searchParams.get('clientCompanyId'))
  if (view.error) return view.error
  return NextResponse.json({ data: view.data })
}
