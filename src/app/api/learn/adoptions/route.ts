import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { pluginGate } from '@/lib/plugin-gate'
import { creatorReading } from '@/lib/training/adoption'

/**
 * GET /api/learn/adoptions
 *
 * `asCreator`: for each course this firm made that others adopted, how many
 * started and finished, by adopter. Counts only; a person is named only where
 * that adoption granted named evidence, and the query selects no person
 * otherwise. `asAdopter`: this firm's own adoptions and its own learners.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Training')
  if (notStaff) return notStaff
  const off = await pluginGate(caller, 'TRAIN_TO_BENCH')
  if (off) return off
  const me = caller.company!.id

  const made = await prisma.courseAdoption.findMany({ where: { course: { companyId: me } }, select: { id: true, grantsNamedEvidence: true, course: { select: { title: true } }, adopterCompany: { select: { name: true } } } })
  const asCreator = []
  for (const a of made) {
    const rows = await prisma.enrollment.findMany({
      where: { adoptionId: a.id },
      select: a.grantsNamedEvidence ? { status: true, completedAt: true, personId: true, person: { select: { name: true } } } : { status: true },
    })
    const reading = creatorReading(rows.map((r: any) => ({ personId: r.personId ?? '', name: r.person?.name ?? '', status: r.status, completedAt: r.completedAt ?? null })), a.grantsNamedEvidence)
    asCreator.push({ adoptionId: a.id, course: a.course.title, adopter: a.adopterCompany.name, ...reading })
  }
  const mine = await prisma.courseAdoption.findMany({ where: { adopterCompanyId: me }, select: { id: true, teamRef: true, course: { select: { title: true, company: { select: { name: true } } } }, enrollments: { select: { status: true, person: { select: { name: true } } } } } })
  const asAdopter = mine.map((a) => ({ adoptionId: a.id, course: a.course.title, from: a.course.company.name, teamRef: a.teamRef, learners: a.enrollments.map((e) => ({ name: e.person.name, status: e.status })) }))
  return NextResponse.json({ data: { asCreator, asAdopter } })
}
