import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { ledgerFeed } from '@/lib/twin/ledger'

/**
 * GET /api/twin/ledger?companyId=…&take=…
 *
 * The program manager's twin's ledger, scoped at the query by who is
 * reading (`feedWhere` in lib/twin/ledger): the program owner reads every
 * entry; anybody else at that company, what was done on their authority;
 * a supplier, only entries about records it is a party to, without the
 * payload. `companyId` is the company whose twin it is, the reader's own
 * by default.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'The twin’s ledger is read from a company seat. Choose one first.' } },
      { status: 403 }
    )
  }
  const url = new URL(request.url)
  const companyId = url.searchParams.get('companyId') || caller.company.id
  const take = Number(url.searchParams.get('take') ?? 100)
  const feed = await ledgerFeed(companyId, caller, { take: Number.isFinite(take) ? take : 100 })
  if (!feed) return NextResponse.json({ data: { view: null, rows: [] } })
  return NextResponse.json({ data: feed })
}
