import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { regionsView } from './read'

/**
 * GET /api/program/regions
 *
 * The program by region: the one read behind the program page's "By
 * region" tab (founder, 2026-10-27, the region map). One row per region
 * for a head of operations or a CFO; `?region=<label>` for that region's
 * hiring managers and how each of its countries runs; `?manager=<personId>`
 * (or `none`) for that manager's contractors.
 *
 * It applies `lib/region-scope` to every read it makes, so it says so
 * when it asks for the caller: a regional manager's seat opens it, and
 * reads its own region and nothing else (`./read`).
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request, { narrowsToRegion: true })
  if (error) return error
  const q = request.nextUrl.searchParams
  const view = await regionsView(caller, {
    requestedClientId: q.get('clientCompanyId'),
    region: q.get('region'),
    manager: q.get('manager'),
  })
  if (view.error) return view.error
  return NextResponse.json({ data: view.data })
}
