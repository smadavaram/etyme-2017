import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { askTheDesk, hasAnyPermission } from '@/lib/permissions'
import { ledgerFeed } from '@/lib/twin/ledger'
import { TWIN_FEED_READERS } from '@/lib/twin/readers'

/**
 * GET /api/twin/ledger?companyId=…&take=…
 *
 * The program manager's twin's ledger, scoped at the query by who is
 * reading (`feedWhere` in lib/twin/ledger): the program owner reads every
 * entry; the client's other desks, the program's entries without what
 * the rules found; a supplier, only entries about records it is a party
 * to. `companyId` is the company whose twin it is: a client's own by
 * default, and for anybody else every program whose twin names them.
 *
 * Opened by the three desks in `TWIN_FEED_READERS`, which the menu reads
 * too; anybody else is refused in a sentence.
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
  if (!hasAnyPermission(caller.permissions, TWIN_FEED_READERS)) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: askTheDesk({ doing: 'Reading the twin’s ledger', needs: [...TWIN_FEED_READERS], kind: caller.company.kind, companyName: caller.company.name }) } },
      { status: 403 }
    )
  }
  const url = new URL(request.url)
  const asked = url.searchParams.get('companyId')
  const companyId = asked || (caller.company.kind === 'CLIENT' ? caller.company.id : null)
  const take = Number(url.searchParams.get('take') ?? 100)
  const feed = await ledgerFeed(companyId, caller, { take: Number.isFinite(take) ? take : 100 })
  if (!feed) return NextResponse.json({ data: { view: null, rows: [] } })
  return NextResponse.json({ data: feed })
}
