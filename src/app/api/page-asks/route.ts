import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { accessActor, recordAccess } from '@/lib/access-log'
import { reportError } from '@/lib/alerts'
import { hasPermission } from '@/lib/permissions'
import { PAGE_ASK_ACTION, listPageAsks, type PageAskState } from '@/lib/page-asks'
import { refuseUnlessMayAnswer } from './door'

/**
 * GET /api/page-asks?status=OPEN|ANSWERED|CLOSED&q=words
 *
 * The questions asked on the caller's own firm's public page, newest first
 * (record 102, item 1). The firm is the caller's company and nothing in the
 * query can name another. Read by the seats that put candidates forward and
 * the Owner; anybody else is refused in a sentence, the refusal logged
 * before it is sent. A read is one row on the trail.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  // The permission the menu's Questions tab names; the Owner holds every one.
  if (!hasPermission(caller.permissions, 'submissions.create') || !caller.company) {
    const refused = await refuseUnlessMayAnswer(caller, 'read the questions asked on the firm’s public page without a role that puts candidates forward.')
    if (refused) return refused
  }

  const url = new URL(request.url)
  const s = url.searchParams.get('status')?.toUpperCase()
  const status = s === 'OPEN' || s === 'ANSWERED' || s === 'CLOSED' ? (s as PageAskState) : null
  const q = url.searchParams.get('q')

  try {
    const asks = await listPageAsks(caller.company!.id, { status, q })
    await recordAccess([{ companyId: caller.company!.id }], {
      ...accessActor(caller), action: PAGE_ASK_ACTION, reason: `Read ${asks.length} question${asks.length === 1 ? '' : 's'} asked on the firm’s own public page.`,
    })
    return NextResponse.json({ data: { asks, open: asks.filter((a) => a.status === 'OPEN').length } })
  } catch (err) {
    reportError('The questions asked on a firm’s page could not be read:', err)
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'The questions could not be read. Try again in a minute.' } }, { status: 500 })
  }
}
