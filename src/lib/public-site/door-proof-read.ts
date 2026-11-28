import { prisma } from '@/lib/db'
import { DOOR_OFFER, featuredIn, proofLines, type DoorLearn } from './door-proof'

/**
 * Reads the record for the door's learning section. Called only where the
 * firm's Train to bench plugin is on; a dark plugin never reaches this file.
 * Counts only: no person is selected, so no name can be drawn.
 */
export async function readDoorLearn(company: { id: string; featuredCourseIds: string[] | null }): Promise<DoorLearn> {
  const courses = await prisma.course.findMany({
    where: { companyId: company.id, isPublic: true },
    orderBy: { title: 'asc' },
    take: 50,
    select: { id: true, title: true, duration: true },
  })
  const [done, badges] = await Promise.all([
    courses.length === 0
      ? Promise.resolve([] as { courseId: string; _count: { _all: number } }[])
      : prisma.enrollment.groupBy({
          by: ['courseId'],
          where: { companyId: company.id, status: 'COMPLETED', courseId: { in: courses.map((c) => c.id) } },
          _count: { _all: true },
        }),
    prisma.learnBadge.count({ where: { companyId: company.id, revokedAt: null } }),
  ])
  const finished = new Map(done.map((d) => [d.courseId, d._count._all]))
  const available = courses.map((c) => ({ id: c.id, title: c.title, hours: c.duration ?? null }))
  return {
    featured: featuredIn(company.featuredCourseIds ?? [], available),
    proof: proofLines({
      completions: available.map((c) => ({ courseId: c.id, title: c.title, finished: finished.get(c.id) ?? 0 })),
      badges,
    }),
    offer: DOOR_OFFER,
  }
}
