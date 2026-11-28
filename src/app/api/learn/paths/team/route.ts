import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'
import { pluginGate, pluginGateAlso } from '@/lib/plugin-gate'
import { proposeTeamPaths } from '@/lib/training/paths/team-db'

/**
 * POST /api/learn/paths/team  { podId, mentorPersonId?, trackKey? }
 *
 * A team's skill gaps, as paths: one PROPOSED path per member whose role
 * needs a skill she has not learned here, each waiting for the mentor's
 * yes. Both plugins must be on; while Project teams is off this refuses
 * and nothing is read.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Training')
  if (notStaff) return notStaff
  const off = (await pluginGate(caller, 'TRAIN_TO_BENCH')) ?? (await pluginGateAlso(caller, ['PODS']))
  if (off) return off
  if (!hasPermission(caller.permissions, 'consultants.write')) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: `Proposing a path is for whoever develops the bench at ${caller.company!.name}.` } }, { status: 403 })
  }
  const companyId = caller.company!.id
  const body = await request.json().catch(() => ({}))
  if (typeof body.podId !== 'string') return NextResponse.json({ error: { code: 'VALIDATION', message: 'Say which team.', field: 'podId' } }, { status: 422 })
  const mentorId = typeof body.mentorPersonId === 'string' ? body.mentorPersonId : caller.person.id
  const seat = await prisma.context.findFirst({ where: { personId: mentorId, companyId, revokedAt: null, type: { not: 'CONSULTANT' } }, select: { id: true } })
  if (!seat) return NextResponse.json({ error: { code: 'NO_MENTOR', message: 'A mentor holds a seat at your firm. Name one.' } }, { status: 422 })
  const r = await proposeTeamPaths({ companyId, podId: body.podId, mentorPersonId: mentorId, trackKey: typeof body.trackKey === 'string' ? body.trackKey : 'it-upgrade' })
  if (!r.ok) return NextResponse.json({ error: { code: 'NOT_FOUND', message: r.message } }, { status: 404 })
  return NextResponse.json({ data: { made: r.made, skipped: r.skipped, says: r.made.length ? 'Proposed. None is live until its mentor says yes.' : 'No member needs a path from this team.' } }, { status: r.made.length ? 201 : 200 })
}
