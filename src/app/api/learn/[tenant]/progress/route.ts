import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { learnTenant } from '@/lib/training/learn-read'
import { saveProgress, ensureCourse } from '@/lib/training/learn-db'
import { readProgress } from '@/lib/training/learn-progress'
import { pathIsLive } from '@/lib/training/paths/state'
import { asCalendarDate } from '@/lib/training/due'
import { credentialPath } from '@/lib/training/credential'

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'There is no learning site at this address.' } }

/**
 * GET and POST /api/learn/:tenant/progress
 *
 * A signed-in worker's own progress at one firm's learning site. A visitor
 * never calls this: her progress stays in her browser. The row is hers and
 * the firm's, on the one record (record 133).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { tenant } = await params
  const t = await learnTenant(tenant)
  if (!t) return NextResponse.json(NOT_FOUND, { status: 404 })
  const track = new URL(request.url).searchParams.get('track') ?? ''
  const c = await ensureCourse(t.id, track)
  const enrollment = c ? await prisma.enrollment.findUnique({ where: { courseId_personId: { courseId: c.id, personId: caller.person.id } }, select: { id: true, status: true, progress: true, completedAt: true } }) : null
  // The path she follows is the newest the mentor said yes to; a newer proposal waiting for a yes does not displace it.
  // A path from an adoption sits on the creator's course row, so the track is matched through the course too.
  const mine = { personId: caller.person.id, companyId: t.id, OR: [{ courseId: c?.id ?? '' }, { course: { trackKey: track } }] }
  const path = c
    ? (await prisma.learningPath.findFirst({ where: { ...mine, state: { in: ['APPROVED', 'ACTIVE', 'COMPLETE'] } }, orderBy: { createdAt: 'desc' } })) ??
      (await prisma.learningPath.findFirst({ where: mine, orderBy: { createdAt: 'desc' } }))
    : null
  const mentor = path?.mentorPersonId ? await prisma.person.findUnique({ where: { id: path.mentorPersonId }, select: { name: true } }) : null
  const credential = enrollment?.status === 'COMPLETED'
    ? await prisma.learnCredential.findUnique({ where: { enrollmentId: enrollment.id }, select: { verificationCode: true, shownAt: true, revokedAt: true } })
    : null
  const live = path ? pathIsLive(path.state) : false
  return NextResponse.json({
    data: {
      credential: credential?.shownAt && !credential.revokedAt ? { shown: true, code: credential.verificationCode, address: credentialPath(t.slug, credential.verificationCode) } : { shown: false },
      progress: readProgress(enrollment?.progress), status: enrollment?.status ?? null, completedAt: enrollment?.completedAt ?? null,
      // A path waiting for the mentor's yes is told as waiting and its steps are not hers to follow yet.
      path: path ? {
        id: path.id, state: path.state, live, steps: live ? path.steps : null, mentorName: mentor?.name ?? null, generationType: path.generationType,
        // Dates are hers to read only once the mentor's yes made the path live.
        dueOn: live ? asCalendarDate(path.dueOn) : null, stepDues: live ? path.stepDues : null,
      } : null,
    },
  })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { tenant } = await params
  const t = await learnTenant(tenant)
  if (!t) return NextResponse.json(NOT_FOUND, { status: 404 })
  const body = await request.json().catch(() => ({}))
  const tick = body.tick && typeof body.tick.project === 'string' && typeof body.tick.item === 'string' ? { project: body.tick.project, item: body.tick.item, on: body.tick.on !== false } : undefined
  const lessonKey = typeof body.lessonKey === 'string' ? body.lessonKey : undefined
  if (!lessonKey && !tick) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Send the lesson finished or the item ticked.' } }, { status: 422 })
  const r = await saveProgress({ tenantId: t.id, tenantName: t.name, trackKey: String(body.track ?? ''), personId: caller.person.id, personName: caller.person.name, move: { lessonKey, tick } })
  if (!r.ok) return NextResponse.json({ error: { code: 'NO_TRACK', message: r.message } }, { status: 404 })
  return NextResponse.json({ data: { progress: r.progress, complete: r.complete } })
}
