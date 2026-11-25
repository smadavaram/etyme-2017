import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'
import { pluginGate } from '@/lib/plugin-gate'
import { readCohorts } from '@/lib/training/cohort-read'

/**
 * GET  /api/training/cohorts   the firm's cohorts, their trainees, every attempt and the ask
 * POST /api/training/cohorts   { courseId, name, startsOn, endsOn?, trainerPersonId?, capacity? }
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Training')
  if (notStaff) return notStaff
  const off = await pluginGate(caller, 'TRAIN_TO_BENCH')
  if (off) return off

  // Who may be named trainer: a seat at this firm that is not a consultant's.
  const seats = await prisma.context.findMany({
    where: { companyId: caller.company!.id, revokedAt: null, type: 'EMPLOYEE' },
    select: { person: { select: { id: true, name: true } } },
    take: 200,
  })
  const trainerChoices = [...new Map(seats.map((s) => [s.person.id, s.person])).values()].sort((a, b) => a.name.localeCompare(b.name))
  return NextResponse.json({ data: { cohorts: await readCohorts(caller.company!.id, new Date()), trainerChoices } })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Training')
  if (notStaff) return notStaff
  const off = await pluginGate(caller, 'TRAIN_TO_BENCH')
  if (off) return off
  if (!hasPermission(caller.permissions, 'consultants.write')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: `Planning a cohort is for whoever develops the bench at ${caller.company!.name}.` } },
      { status: 403 }
    )
  }
  const companyId = caller.company!.id
  const body = await request.json().catch(() => ({}))
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : ''
  const courseId = typeof body.courseId === 'string' ? body.courseId : ''
  if (!name) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Give the cohort a name.', field: 'name' } }, { status: 422 })
  if (!courseId) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Say which course the cohort takes.', field: 'courseId' } }, { status: 422 })
  const startsOn = new Date(String(body.startsOn ?? ''))
  if (!body.startsOn || Number.isNaN(startsOn.getTime())) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Say the day the cohort starts.', field: 'startsOn' } }, { status: 422 })
  }
  const endsOn = body.endsOn ? new Date(String(body.endsOn)) : null
  if (endsOn && (Number.isNaN(endsOn.getTime()) || endsOn < startsOn)) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'The cohort cannot end before it starts.', field: 'endsOn' } }, { status: 422 })
  }
  const capacity = body.capacity === undefined || body.capacity === null || body.capacity === '' ? null : Number(body.capacity)
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Capacity is a whole number of people, one or more.', field: 'capacity' } }, { status: 422 })
  }

  const course = await prisma.course.findFirst({ where: { id: courseId, companyId }, select: { id: true } })
  if (!course) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That course is not in your library.' } }, { status: 404 })

  const trainerPersonId = typeof body.trainerPersonId === 'string' && body.trainerPersonId ? body.trainerPersonId : null
  if (trainerPersonId) {
    const seat = await prisma.context.findFirst({ where: { personId: trainerPersonId, companyId, revokedAt: null }, select: { id: true } })
    if (!seat) return NextResponse.json({ error: { code: 'NOT_YOURS', message: 'The trainer must hold a seat at your firm.', field: 'trainerPersonId' } }, { status: 422 })
  }

  const cohort = await prisma.cohort.create({
    data: { companyId, courseId, name, startsOn, endsOn, trainerPersonId, capacity },
    select: { id: true },
  })
  return NextResponse.json(
    { data: { id: cohort.id, says: `${name} is planned${capacity ? ` for ${capacity} ${capacity === 1 ? 'person' : 'people'}` : ''}. Enroll people from the course.` } },
    { status: 201 }
  )
}
