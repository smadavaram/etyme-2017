import { prisma } from '@/lib/db'
import { certificationStanding, cohortFullSays, cohortWord, COHORT_MOVES, MOVES, MOVE_ACTIONS, statusWord, mayAssess, mayCertify, mayFinishCourse, mayAskOntoBench } from '@/lib/training'

/** Who is reading: what each button's own route would ask of her. */
export interface Reader { personId: string; roleName: string | null; mayWrite: boolean }

/**
 * One cohort as the Training page and the route read it: its trainees,
 * every attempt kept, what each holds, and where the ask onto the bench
 * stands. Read from the record; nothing is held beside it.
 */
export async function readCohorts(companyId: string, now: Date, only?: string, reader?: Reader) {
  const rows = await prisma.cohort.findMany({
    where: { companyId, ...(only ? { id: only } : {}) },
    include: {
      course: { select: { id: true, title: true } },
      enrollments: {
        include: {
          person: { select: { id: true, name: true } },
          assessments: { orderBy: [{ skill: 'asc' }, { attempt: 'asc' }] },
          certifications: { orderBy: { issuedAt: 'asc' } },
          benchAsks: { orderBy: { askedAt: 'desc' }, take: 1 },
        },
        orderBy: { enrolledAt: 'asc' },
      },
    },
    orderBy: [{ startsOn: 'desc' }, { name: 'asc' }],
  })
  const trainerIds = [...new Set(rows.map((c) => c.trainerPersonId).filter((x): x is string => !!x))]
  const trainers = trainerIds.length
    ? await prisma.person.findMany({ where: { id: { in: trainerIds } }, select: { id: true, name: true } })
    : []
  const trainerName = new Map(trainers.map((t) => [t.id, t.name]))
  return rows.map((c) => {
    const live = c.enrollments.filter((e) => e.status !== 'DROPPED')
    const fullSays = cohortFullSays({ name: c.name, capacity: c.capacity, enrolled: live.length })
    return {
      fullSays,
      id: c.id,
      name: c.name,
      course: c.course,
      state: c.state,
      word: cohortWord(c.state),
      startsOn: c.startsOn.toISOString().slice(0, 10),
      endsOn: c.endsOn?.toISOString().slice(0, 10) ?? null,
      capacity: c.capacity,
      seatsTaken: live.length,
      seatsSays: c.capacity == null ? `${live.length} enrolled` : `${live.length} of ${c.capacity} seats taken`,
      trainer: c.trainerPersonId ? { personId: c.trainerPersonId, name: trainerName.get(c.trainerPersonId) ?? null } : null,
      moves: (COHORT_MOVES[c.state as keyof typeof COHORT_MOVES] ?? []),
      trainees: c.enrollments.map((e) => {
        const ask = e.benchAsks[0] ?? null
        // Per button, the same rule the route applies, for the reader. With
        // no reader named nothing is offered.
        const r = reader
        const can = {
          assess: !!r && r.mayWrite && mayAssess({ callerPersonId: r.personId, callerRole: r.roleName, trainerPersonId: c.trainerPersonId, enrolledPersonId: e.person.id }).ok,
          // Once she holds one, the route answers 409: no control is offered.
          certify: !!r && r.mayWrite && e.certifications.length === 0 && mayCertify({
            enrollmentStatus: e.status, personName: e.person.name, callerPersonId: r.personId, callerRole: r.roleName,
            trainerPersonId: c.trainerPersonId, enrolledPersonId: e.person.id,
            assessorPersonIds: [...new Set(e.assessments.filter((a) => a.assessedAt.getTime() >= e.enrolledAt.getTime()).map((a) => a.assessorPersonId))],
          }).ok,
          ask: !!r && r.mayWrite && mayAskOntoBench({ enrollmentStatus: e.status, personName: e.person.name }).ok,
          finish: !!r && r.mayWrite && e.status !== 'COMPLETED' && e.status !== 'DROPPED' && mayFinishCourse({ cohortState: c.state }).ok,
        }
        return {
          can,
          enrollmentId: e.id,
          person: e.person,
          status: e.status,
          word: statusWord(e.status),
          moves: (MOVES[e.status] ?? []).map((m) => ({ move: m, word: MOVE_ACTIONS[m] })),
          // Every attempt stays: a retake is a new row, never a new value.
          assessments: e.assessments.map((a) => ({
            id: a.id, skill: a.skill, score: a.score, attempt: a.attempt,
            on: a.assessedAt.toISOString().slice(0, 10), note: a.note,
          })),
          certifications: e.certifications.map((k) => ({
            id: k.id, title: k.title,
            issued: k.issuedAt.toISOString().slice(0, 10),
            expires: k.expiresAt?.toISOString().slice(0, 10) ?? null,
            standing: certificationStanding(k.expiresAt, now),
          })),
          ask: ask
            ? {
                id: ask.id, method: ask.method, on: ask.askedAt.toISOString().slice(0, 10),
                answer: ask.answer, answeredOn: ask.answeredAt?.toISOString().slice(0, 10) ?? null, answeredVia: ask.answeredVia,
                says: ask.answer === 'YES' ? 'She said yes.' : ask.answer === 'NO' ? 'She said no.' : ask.method === 'EMPLOYEE_TOLD' ? 'She was told.' : 'Waiting for her answer.',
              }
            : null,
        }
      }),
    }
  })
}
