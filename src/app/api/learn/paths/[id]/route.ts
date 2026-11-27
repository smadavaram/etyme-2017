import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { pluginGate } from '@/lib/plugin-gate'
import { allLessonKeys } from '@/lib/training/courses/index'
import { mayDecide, pathNext, type PathMove } from '@/lib/training/paths/state'

/**
 * PATCH /api/learn/paths/:id  { move: 'approve' | 'adjust', steps?, videoSource? }
 *
 * The named mentor adjusts (reorders or trims the lessons, anchors a video)
 * and approves. Nobody else, and never the learner. Approving is what makes
 * the path hers to follow.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Training')
  if (notStaff) return notStaff
  const off = await pluginGate(caller, 'TRAIN_TO_BENCH')
  if (off) return off
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const move: PathMove | null = body.move === 'approve' || body.move === 'adjust' ? body.move : null
  if (!move) return NextResponse.json({ error: { code: 'VALIDATION', message: 'move must be approve or adjust.', field: 'move' } }, { status: 422 })
  const path = await prisma.learningPath.findFirst({ where: { id, companyId: caller.company!.id } })
  if (!path) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That path is not on your books.' } }, { status: 404 })
  const may = mayDecide({ deciderPersonId: caller.person.id, mentorPersonId: path.mentorPersonId, learnerPersonId: path.personId })
  if (!may.ok) return NextResponse.json({ error: { code: 'NOT_MENTOR', message: may.message } }, { status: 403 })
  const next = pathNext(path.state, move)
  if (!next.ok) return NextResponse.json({ error: { code: 'NOT_NEXT', message: next.message } }, { status: 409 })

  const data: Record<string, unknown> = { state: next.state }
  if (move === 'adjust') {
    const known = allLessonKeys()
    const steps = Array.isArray(body.steps) ? [...new Set((body.steps as unknown[]).filter((s): s is string => typeof s === 'string' && known.includes(s)))] : null
    if (!steps || steps.length === 0) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Send the lessons in the order she takes them.', field: 'steps' } }, { status: 422 })
    data.steps = steps
    if (typeof body.videoSource === 'string') data.videoSource = body.videoSource.slice(0, 500)
  } else {
    data.approvedAt = new Date()
    data.approvedByPersonId = caller.person.id
  }
  await prisma.learningPath.update({ where: { id }, data })
  await prisma.automationLog.create({
    data: {
      companyId: caller.company!.id, action: move === 'approve' ? 'LEARNING_PATH_APPROVED' : 'LEARNING_PATH_ADJUSTED',
      summary: move === 'approve' ? `${caller.person.name}, her mentor, said yes to the path. It is now hers to follow.` : `${caller.person.name} adjusted the path; it needs a yes again.`,
      reason: 'The agent proposes; the mentor’s yes makes a path live.', payload: { pathId: id, personId: path.personId }, reversible: false,
    },
  })
  return NextResponse.json({ data: { id, state: next.state } })
}
