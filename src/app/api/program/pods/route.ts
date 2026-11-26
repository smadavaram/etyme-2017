import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { seatedDesk } from '@/lib/resolve-client-company'
import { notAtACompany } from '@/app/api/people/not-at-a-company'
import { readSoldWork } from './read'

/**
 * GET /api/program/pods   the work this client bought as a team: projects, deliverables, who decides
 *
 * The client keeps reading and deciding what it bought whether or not the
 * seller's Project teams plugin is on (record 120, the owner's ruling): money
 * already owed is never stranded. So nothing here asks the plugin.
 * Deciding is the existing POST /api/program/milestones/[id]/decide, which
 * lets only the named acceptor answer. Everything returned is the allowlist
 * in `./read`; "pod" is a machine name and never in an answer.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const desk = await seatedDesk(caller)
  if (!desk) {
    return NextResponse.json({ error: { code: 'NO_COMPANY', message: notAtACompany('Projects') } }, { status: 403 })
  }
  return NextResponse.json({ data: { projects: await readSoldWork(desk.companyId, caller.person.id) } })
}
