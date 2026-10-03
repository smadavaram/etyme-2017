import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { staffOnly } from '@/lib/seat'
import { logBulkAccess } from '@/lib/access-log'
import { mayRead, CANNOT_READ, NO_COMPANY, type Target } from '../desks'
import { peopleKnownTo, firmsKnownTo, matching } from '../known'

/**
 * GET /api/blacklist/subjects?type=PERSON|COMPANY&q=marsh
 *
 * What the add form on the do-not-return list offers instead of a box
 * marked "Subject ID". Nobody types a database id; they type three
 * letters of a name.
 *
 * Gated on reading the list rather than on writing it, because that is
 * what it is — the names this company already knows, which the list
 * itself prints on every row. Writing is still refused at the POST, per
 * half of the list, at the desk that owns it (`../desks`).
 */

const SHOW = 50

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'The do-not-return list')
  if (notStaff) return notStaff

  const companyId = caller.company?.id
  if (!companyId) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: NO_COMPANY } }, { status: 403 })
  }
  if (!mayRead(caller.permissions)) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: CANNOT_READ } }, { status: 403 })
  }

  const type = (request.nextUrl.searchParams.get('type') ?? 'PERSON').toUpperCase() as Target
  const q = request.nextUrl.searchParams.get('q') ?? ''

  const all = type === 'COMPANY'
    ? await firmsKnownTo(companyId)
    : await peopleKnownTo(companyId)

  const found = matching(all, q)
  const shown = found.slice(0, SHOW)

  // Names of real people, read in order to decide something about one of
  // them. Same trail the list itself writes.
  if (type === 'PERSON' && shown.length > 0) {
    logBulkAccess(shown.map((s) => s.id), {
      actorPersonId: caller.person.id,
      actorCompanyId: companyId,
      action: 'DNR_VIEW',
      reason: `Searched for somebody to add to the do-not-return list at ${caller.company!.name}`,
    })
  }

  return NextResponse.json({
    data: {
      type,
      subjects: shown,
      total: found.length,
      // Said out loud so the picker can tell an empty search from an
      // empty book — two very different things to a first-time user.
      knownAtAll: all.length,
      more: Math.max(0, found.length - shown.length),
    },
  })
}
