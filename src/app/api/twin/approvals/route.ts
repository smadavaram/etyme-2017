import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { askTheDesk, hasAnyPermission } from '@/lib/permissions'
import { waitingQuestions } from '@/lib/twin/ledger'
import { TWIN_FEED_READERS } from '@/lib/twin/readers'

/**
 * GET /api/twin/approvals — what the program manager's twin is waiting
 * on a person for, at the reader's own company.
 *
 * The owner desks read every question; any other desk, the questions it
 * may answer. Each row says whether this reader may answer it and, where
 * not, why in a sentence, so the screen offers Approve and Reject only
 * where `POST /api/twin/approvals/:id` will take the answer.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json({ error: { code: 'NO_COMPANY', message: 'Choose a company seat first.' } }, { status: 403 })
  }
  if (!hasAnyPermission(caller.permissions, TWIN_FEED_READERS)) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: askTheDesk({ doing: 'Reading what the twin is waiting on', needs: [...TWIN_FEED_READERS], kind: caller.company.kind, companyName: caller.company.name }) } },
      { status: 403 }
    )
  }
  return NextResponse.json({ data: { questions: await waitingQuestions(caller) } })
}
