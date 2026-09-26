import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'
import { MOVES, MOVE_WORDS, statusWord } from '@/lib/training'

/**
 * GET  /api/training     the company's courses, and who is on each
 * POST /api/training     add a course: { title, category?, duration?, price?, isPublic? }
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Training')
  if (notStaff) return notStaff

  const courses = await prisma.course.findMany({
    where: { companyId: caller.company!.id },
    include: {
      enrollments: {
        include: { person: { select: { id: true, name: true } } },
        orderBy: { enrolledAt: 'desc' },
      },
    },
    orderBy: { title: 'asc' },
  })

  return NextResponse.json({
    data: {
      courses: courses.map((c) => ({
        id: c.id,
        title: c.title,
        category: c.category,
        duration: c.duration,
        price: c.price,
        isPublic: c.isPublic,
        counts: {
          enrolled: c.enrollments.filter((e) => e.status === 'ENROLLED').length,
          inProgress: c.enrollments.filter((e) => e.status === 'IN_PROGRESS').length,
          completed: c.enrollments.filter((e) => e.status === 'COMPLETED').length,
          dropped: c.enrollments.filter((e) => e.status === 'DROPPED').length,
        },
        enrollments: c.enrollments.map((e) => ({
          id: e.id,
          person: e.person,
          status: e.status,
          word: statusWord(e.status),
          enrolledAt: e.enrolledAt.toISOString(),
          completedAt: e.completedAt?.toISOString() ?? null,
          score: e.score,
          certificateUrl: e.certificateUrl,
          moves: (MOVES[e.status] ?? []).map((m) => ({ move: m, word: MOVE_WORDS[m] })),
        })),
      })),
    },
  })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Training')
  if (notStaff) return notStaff
  if (!hasPermission(caller.permissions, 'consultants.write')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: `Adding a course is for whoever develops the bench at ${caller.company!.name}.` } },
      { status: 403 }
    )
  }
  const body = await request.json().catch(() => ({}))
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : ''
  if (!title) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Give the course a name.' } }, { status: 422 })

  const course = await prisma.course.create({
    data: {
      companyId: caller.company!.id,
      title,
      description: typeof body.description === 'string' ? body.description.slice(0, 2000) : null,
      category: typeof body.category === 'string' && body.category ? body.category.toUpperCase() : null,
      duration: Number.isFinite(Number(body.duration)) && body.duration !== '' && body.duration != null ? Math.round(Number(body.duration)) : null,
      price: Number.isFinite(Number(body.price)) && body.price !== '' && body.price != null ? Math.round(Number(body.price) * 100) : null,
      isPublic: body.isPublic === true,
    },
    select: { id: true },
  })
  return NextResponse.json({ data: { id: course.id, says: `${title} added. Enroll somebody from the skill gap.` } }, { status: 201 })
}
