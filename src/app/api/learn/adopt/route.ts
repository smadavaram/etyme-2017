import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'
import { pluginGate } from '@/lib/plugin-gate'
import { isOn } from '@/lib/plugins'
import { mayAdopt } from '@/lib/training/adoption'
import { trackOf, lessonsOf } from '@/lib/training/courses/index'
import { cleanDues } from '@/lib/training/due'

/**
 * POST /api/learn/adopt  { courseId, teamRef?, grantsNamedEvidence?, personIds?, mentorPersonId?, dueOn? }
 *
 * Another firm's course, adopted. The course stays its creator's. Each
 * person assigned gets an enrollment on the ADOPTER's record, so progress
 * and completions live with the adopter. The creator reads counts only,
 * unless this adoption grants named evidence. No price is read or written.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Training')
  if (notStaff) return notStaff
  const off = await pluginGate(caller, 'TRAIN_TO_BENCH')
  if (off) return off
  if (!hasPermission(caller.permissions, 'consultants.write')) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: `Adopting a course is for whoever develops the bench at ${caller.company!.name}.` } }, { status: 403 })
  }
  const adopter = caller.company!.id
  const body = await request.json().catch(() => ({}))
  const course = typeof body.courseId === 'string'
    ? await prisma.course.findFirst({ where: { id: body.courseId, isPublic: true }, select: { id: true, companyId: true, title: true, trackKey: true, company: { select: { pluginsOn: true } } } })
    : null
  if (!course) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That course is not offered right now.' } }, { status: 404 })
  const already = await prisma.courseAdoption.findUnique({ where: { courseId_adopterCompanyId: { courseId: course.id, adopterCompanyId: adopter } }, select: { id: true } })
  const may = mayAdopt({ creatorCompanyId: course.companyId, adopterCompanyId: adopter, alreadyAdopted: !!already, creatorPluginOn: isOn(course.company.pluginsOn, 'TRAIN_TO_BENCH') })
  if (!may.ok) return NextResponse.json({ error: { code: 'CANNOT_ADOPT', message: may.message } }, { status: 409 })

  const ids: string[] = Array.isArray(body.personIds) ? body.personIds.filter((x: unknown): x is string => typeof x === 'string') : []
  const people = ids.length
    ? await prisma.person.findMany({ where: { id: { in: ids }, OR: [{ contexts: { some: { companyId: adopter, revokedAt: null } } }, { consultant: { listings: { some: { companyId: adopter, revokedAt: null } } } }] }, select: { id: true } })
    : []
  // The path each person is assigned: the whole track in reading order, under a mentor who holds a seat here.
  const track = course.trackKey ? trackOf(course.trackKey) : null
  const steps = track ? lessonsOf(track).map((l) => l.lesson.key) : []
  const due = cleanDues({ dueOn: body.dueOn, steps })
  if (!due.ok) return NextResponse.json({ error: { code: 'VALIDATION', message: due.message, field: due.field } }, { status: 422 })
  const mentorId = typeof body.mentorPersonId === 'string' ? body.mentorPersonId : caller.person.id
  const mentorSeat = await prisma.context.findFirst({ where: { personId: mentorId, companyId: adopter, revokedAt: null, type: { not: 'CONSULTANT' } }, select: { id: true } })
  if (track && people.length && !mentorSeat) return NextResponse.json({ error: { code: 'NO_MENTOR', message: 'A mentor holds a seat at your firm. Name one.', field: 'mentorPersonId' } }, { status: 422 })
  const adoption = await prisma.courseAdoption.create({
    data: { courseId: course.id, adopterCompanyId: adopter, adoptedByPersonId: caller.person.id, teamRef: typeof body.teamRef === 'string' ? body.teamRef.slice(0, 80) : null, grantsNamedEvidence: body.grantsNamedEvidence === true },
    select: { id: true },
  })
  let pathsMade = 0
  for (const p of people) {
    const enrollment = await prisma.enrollment.upsert({
      where: { courseId_personId: { courseId: course.id, personId: p.id } },
      create: { courseId: course.id, personId: p.id, companyId: adopter, adoptionId: adoption.id },
      update: {}, select: { id: true },
    })
    // Nobody mentors their own path, so a person named as her own mentor is assigned the course and no path.
    if (track && p.id !== mentorId) {
      await prisma.learningPath.create({
        data: {
          companyId: adopter, personId: p.id, courseId: course.id, enrollmentId: enrollment.id, generationType: 'SYSTEM',
          sourceSignals: { adoptionId: adoption.id, teamRef: typeof body.teamRef === 'string' ? body.teamRef.slice(0, 80) : null },
          mentorPersonId: mentorId, steps, state: 'PROPOSED', dueOn: due.dueOn ? new Date(`${due.dueOn}T00:00:00Z`) : null,
        },
      })
      pathsMade++
    }
  }
  await prisma.automationLog.create({
    data: {
      companyId: adopter, action: 'COURSE_ADOPTED',
      summary: `${caller.company!.name} adopted ${course.title} and assigned it to ${people.length} ${people.length === 1 ? 'person' : 'people'}.`,
      reason: 'A course stays its creator’s; an adopter assigns it to its own people and holds their progress.',
      payload: { adoptionId: adoption.id, courseId: course.id, namedEvidence: body.grantsNamedEvidence === true }, reversible: false,
    },
  })
  return NextResponse.json({ data: { id: adoption.id, assigned: people.length, paths: pathsMade, skipped: ids.length - people.length } }, { status: 201 })
}
