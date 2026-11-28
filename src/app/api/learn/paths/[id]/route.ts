import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { staffOnly } from '@/lib/seat'
import { pluginGate } from '@/lib/plugin-gate'
import { allLessonKeys } from '@/lib/training/courses/index'
import { hasPermission } from '@/lib/permissions'
import { mayDecide, pathNext, type PathMove } from '@/lib/training/paths/state'
import { cleanDues } from '@/lib/training/due'

/**
 * PATCH /api/learn/paths/:id  { move: 'approve' | 'adjust' | 'dates' | 'reassign', steps?, videoSource?, dueOn?, stepDues?, mentorPersonId? }
 *
 * The named mentor adjusts (reorders or trims the lessons, anchors a video),
 * sets what is due and approves. Nobody else, and never the learner. Approving
 * is what makes the path hers to follow. Dates change nothing about its
 * state. Handing the path to another mentor is the current mentor's, or a
 * seat that develops the bench; the new mentor holds a seat and is not the learner.
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
  const move: PathMove | 'dates' | 'reassign' | null = body.move === 'approve' || body.move === 'adjust' || body.move === 'dates' || body.move === 'reassign' ? body.move : null
  if (!move) return NextResponse.json({ error: { code: 'VALIDATION', message: 'move must be approve, adjust, dates or reassign.', field: 'move' } }, { status: 422 })
  const path = await prisma.learningPath.findFirst({ where: { id, companyId: caller.company!.id } })
  if (!path) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That path is not on your books.' } }, { status: 404 })
  if (move === 'reassign') return reassign(caller, path, body.mentorPersonId)
  const may = mayDecide({ deciderPersonId: caller.person.id, mentorPersonId: path.mentorPersonId, learnerPersonId: path.personId })
  if (!may.ok) return NextResponse.json({ error: { code: 'NOT_MENTOR', message: may.message } }, { status: 403 })
  if (move === 'dates') return setDates(caller, path, body)
  const next = pathNext(path.state, move)
  if (!next.ok) return NextResponse.json({ error: { code: 'NOT_NEXT', message: next.message } }, { status: 409 })

  const data: Record<string, unknown> = { state: next.state }
  if (move === 'adjust') {
    const known = allLessonKeys()
    const steps = Array.isArray(body.steps) ? [...new Set((body.steps as unknown[]).filter((s): s is string => typeof s === 'string' && known.includes(s)))] : null
    if (!steps || steps.length === 0) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Send the lessons in the order she takes them.', field: 'steps' } }, { status: 422 })
    data.steps = steps
    // A lesson date for a lesson the mentor just took off the path goes with it.
    const sd = path.stepDues as Record<string, string> | null
    if (sd) { const kept = Object.fromEntries(Object.entries(sd).filter(([k]) => steps.includes(k))); data.stepDues = Object.keys(kept).length ? kept : Prisma.DbNull }
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

type Caller = Awaited<ReturnType<typeof getCallerContext>>['caller']
type PathRow = NonNullable<Awaited<ReturnType<typeof prisma.learningPath.findFirst>>>

/** The mentor sets what is due: the whole path, and any lesson on it. Her state does not move. */
async function setDates(caller: NonNullable<Caller>, path: PathRow, body: Record<string, unknown>) {
  if (path.state === 'COMPLETE') return NextResponse.json({ error: { code: 'NOT_NEXT', message: 'This path is finished; nothing is due on it.' } }, { status: 409 })
  const steps = Array.isArray(path.steps) ? (path.steps as string[]) : []
  const said = cleanDues({ dueOn: body.dueOn, stepDues: body.stepDues, steps })
  if (!said.ok) return NextResponse.json({ error: { code: 'VALIDATION', message: said.message, field: said.field } }, { status: 422 })
  if (said.dueOn === undefined && said.stepDues === undefined) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Send the day the path is due, or a day for a lesson.', field: 'dueOn' } }, { status: 422 })
  // The whole-path date and the lesson dates are read together, so the one left as it was is checked too.
  const dueOn = said.dueOn === undefined ? (path.dueOn ? path.dueOn.toISOString().slice(0, 10) : null) : said.dueOn
  const stepDues = said.stepDues === undefined ? (path.stepDues as Record<string, string> | null) : said.stepDues
  const both = cleanDues({ dueOn, stepDues, steps })
  if (!both.ok) return NextResponse.json({ error: { code: 'VALIDATION', message: both.message, field: both.field } }, { status: 422 })
  await prisma.learningPath.update({ where: { id: path.id }, data: { dueOn: dueOn ? new Date(`${dueOn}T00:00:00Z`) : null, stepDues: stepDues ?? Prisma.DbNull } })
  await prisma.automationLog.create({
    data: {
      companyId: caller.company!.id, action: 'LEARNING_PATH_ADJUSTED',
      summary: `${caller.person.name}, her mentor, set what is due on the path${dueOn ? ` (the whole path by ${dueOn})` : ''}.`,
      reason: 'A mentor sets the days a path is due; the path’s state does not change.', payload: { pathId: path.id, personId: path.personId, dueOn, stepDues }, reversible: false,
    },
  })
  return NextResponse.json({ data: { id: path.id, state: path.state, dueOn, stepDues } })
}

/** A new mentor for a path that is not finished. The learner never picks her own. */
async function reassign(caller: NonNullable<Caller>, path: PathRow, to: unknown) {
  const companyId = caller.company!.id
  const may = path.mentorPersonId === caller.person.id || (caller.person.id !== path.personId && hasPermission(caller.permissions, 'consultants.write'))
  if (!may) return NextResponse.json({ error: { code: 'NOT_MENTOR', message: 'Only the path’s mentor, or whoever develops the bench here, hands it to another mentor.' } }, { status: 403 })
  if (path.state === 'COMPLETE') return NextResponse.json({ error: { code: 'NOT_NEXT', message: 'This path is finished; it has no mentor to change.' } }, { status: 409 })
  const id = to === 'me' ? caller.person.id : typeof to === 'string' ? to : ''
  if (!id || id === path.personId) return NextResponse.json({ error: { code: 'NO_MENTOR', message: 'Name a mentor who holds a seat here and is not the learner.', field: 'mentorPersonId' } }, { status: 422 })
  const seat = await prisma.context.findFirst({ where: { personId: id, companyId, revokedAt: null, type: { not: 'CONSULTANT' } }, select: { id: true } })
  if (!seat) return NextResponse.json({ error: { code: 'NO_MENTOR', message: 'A mentor holds a seat at your firm. Name one.', field: 'mentorPersonId' } }, { status: 422 })
  // A yes already given stays given by the mentor who gave it; a path still waiting now waits for the new one.
  await prisma.learningPath.update({ where: { id: path.id }, data: { mentorPersonId: id } })
  await prisma.automationLog.create({
    data: {
      companyId, action: 'LEARNING_PATH_ADJUSTED',
      summary: `${caller.person.name} named a new mentor for the path.`,
      reason: 'A path is always held by one named mentor; handing it on is a person’s act.', payload: { pathId: path.id, personId: path.personId, from: path.mentorPersonId, to: id }, reversible: false,
    },
  })
  return NextResponse.json({ data: { id: path.id, state: path.state, mentorPersonId: id } })
}
