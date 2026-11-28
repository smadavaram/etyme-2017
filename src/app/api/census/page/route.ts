import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { logBulkAccess } from '@/lib/access-log'
import { censusPage } from '@/lib/census-page'

/**
 * GET /api/census/page?id= — the one page, for the named person to read.
 *
 * `docs/census-brief.md`, step 6: "Etyme staff reviews the page, writes
 * the 'what we could not see' notes, sends it." There is no PDF pipeline
 * on Vercel, so this returns the sheet as print-styled HTML: the staff
 * person opens it, reads it, prints it to PDF and emails it — which is
 * the flow anyway, because a human sends the page.
 *
 * `?format=json` returns `{ html, gaps, numbers }` instead, which is what
 * the review route stores: `html` into `pageHtml`, the gaps into
 * `gapsNote`. Nothing here writes either column — the request's
 * lifecycle is regulatory's and this only computes.
 *
 * Staff only, for the same reason the import is: the client was promised
 * in writing that one named person reads their file, and no customer
 * role may grant itself that.
 */
const CENSUS_READ = 'CONTRACT_VIEW' as const

function refuse(status: number, code: string, says: string) {
  return NextResponse.json({ error: { code, message: says } }, { status })
}

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  if (!caller.staff) {
    return refuse(403, 'STAFF_ONLY',
      'A contractor census page is read by a named person at Etyme before it goes anywhere. That is what the ' +
      'client was promised when they sent their file, so a seat at a company cannot open it.')
  }

  const id = request.nextUrl.searchParams.get('id')
  if (!id) {
    return refuse(400, 'NO_REQUEST',
      'Name the census request — /api/census/page?id=... There is no page without one.')
  }

  const census = await prisma.censusRequest.findUnique({
    where: { id },
    select: { id: true, companyName: true, sandboxCompanyId: true },
  })
  if (!census) return refuse(404, 'NO_CENSUS', `There is no census request ${id}.`)

  if (!census.sandboxCompanyId) {
    return refuse(409, 'NOT_IMPORTED',
      `${census.companyName}'s rows have not been loaded yet, so there are no numbers to put on a page. ` +
      'Import their file first.')
  }

  let page
  try {
    page = await censusPage({ requestId: census.id })
  } catch (err) {
    return refuse(409, 'CANNOT_COMPUTE', err instanceof Error ? err.message : String(err))
  }

  // Every read of their contractors' data, including this one.
  const people = await prisma.sellContract.findMany({
    where: { clientCompanyId: census.sandboxCompanyId },
    select: { personId: true },
    distinct: ['personId'],
  })
  logBulkAccess(people.map((p) => p.personId), {
    actorPersonId: realPersonId(caller) ?? undefined,
    action: CENSUS_READ,
    reason: `Contractor census page for ${census.companyName}`,
  })

  if (request.nextUrl.searchParams.get('format') === 'json') {
    return NextResponse.json({
      data: { html: page.html, gaps: page.gaps, numbers: page.numbers },
    })
  }

  return new NextResponse(page.html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // A page about a named client's workforce is nobody's to cache.
      'cache-control': 'no-store',
    },
  })
}
