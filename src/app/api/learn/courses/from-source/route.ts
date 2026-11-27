import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'
import { pluginGate } from '@/lib/plugin-gate'
import { fromSource } from '@/lib/training/adoption'

/**
 * POST /api/learn/courses/from-source  { sourceCourseId, title }
 *
 * A firm makes its own course from another supplier's content. The new
 * course is the firm's own; the source course and its supplier are kept in
 * its provenance. No price is copied or set.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Training')
  if (notStaff) return notStaff
  const off = await pluginGate(caller, 'TRAIN_TO_BENCH')
  if (off) return off
  if (!hasPermission(caller.permissions, 'consultants.write')) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: `Making a course is for whoever develops the bench at ${caller.company!.name}.` } }, { status: 403 })
  }
  const body = await request.json().catch(() => ({}))
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Name the new course.', field: 'title' } }, { status: 422 })
  const src = typeof body.sourceCourseId === 'string' ? await prisma.course.findFirst({ where: { id: body.sourceCourseId, isPublic: true }, select: { id: true, companyId: true, description: true, category: true, duration: true, trackKey: true } }) : null
  if (!src) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That course is not offered right now.' } }, { status: 404 })
  const prov = fromSource({ sourceCourseId: src.id, sourceCompanyId: src.companyId, ownCompanyId: caller.company!.id })
  if (!prov.ok) return NextResponse.json({ error: { code: 'OWN_COURSE', message: prov.message } }, { status: 409 })
  const made = await prisma.course.create({
    data: { companyId: caller.company!.id, title, description: src.description, category: src.category, duration: src.duration, trackKey: src.trackKey, isPublic: false, sourceCourseId: prov.sourceCourseId, sourceCompanyId: prov.sourceCompanyId },
    select: { id: true },
  })
  await prisma.automationLog.create({
    data: {
      companyId: caller.company!.id, action: 'COURSE_MADE_FROM_SOURCE', summary: `${caller.company!.name} made ${title} from another supplier’s course.`,
      reason: 'The new course is the firm’s own; its source course and supplier are kept as history.', payload: { courseId: made.id, sourceCourseId: src.id, sourceCompanyId: src.companyId }, reversible: false,
    },
  })
  return NextResponse.json({ data: { id: made.id, sourceCourseId: src.id, sourceCompanyId: src.companyId } }, { status: 201 })
}
