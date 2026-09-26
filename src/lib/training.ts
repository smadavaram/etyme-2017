/**
 * Training that starts, finishes, or stops.
 *
 * The thesis in CLAUDE.md is that recruiters become human capital
 * developers — mentoring, coaching, upgrading consultants for AI-era
 * roles. The training page showed the skill gap and nothing could be
 * done about it from there: Course and Enrollment existed, and no route
 * enrolled anybody, started them, or recorded that they finished. The
 * portfolio page promised a training list that could never fill.
 *
 * Four states, three moves:
 *
 *   ENROLLED → IN_PROGRESS → COMPLETED
 *             ↘ DROPPED    ↘ DROPPED
 *
 * Completion may carry a score and a certificate; a drop carries a
 * reason. Nothing moves backwards: a course finished is finished, and
 * one dropped is re-enrolled, not resumed.
 */

export type EnrollmentStatus = 'ENROLLED' | 'IN_PROGRESS' | 'COMPLETED' | 'DROPPED'
export type EnrollmentMove = 'start' | 'complete' | 'drop'

export const MOVES: Record<string, EnrollmentMove[]> = {
  ENROLLED: ['start', 'complete', 'drop'],
  IN_PROGRESS: ['complete', 'drop'],
  COMPLETED: [],
  DROPPED: [],
}

export const MOVE_WORDS: Record<EnrollmentMove, string> = {
  start: 'Started',
  complete: 'Finished',
  drop: 'Dropped',
}

export type MoveVerdict =
  | { ok: true; status: EnrollmentStatus; says: string }
  | { ok: false; code: 'NOT_NEXT' | 'REASON_REQUIRED'; message: string }

export function applyMove(
  status: string,
  move: EnrollmentMove,
  facts: { personName: string; courseTitle: string; score?: number | null; reason?: string | null }
): MoveVerdict {
  const allowed = MOVES[status] ?? []
  if (!allowed.includes(move)) {
    return {
      ok: false, code: 'NOT_NEXT',
      message:
        status === 'COMPLETED'
          ? `${facts.personName} finished ${facts.courseTitle}. There is nothing more to record.`
          : status === 'DROPPED'
            ? `${facts.personName} dropped ${facts.courseTitle}. Enroll them again to start over.`
            : `${facts.personName} is ${statusWord(status).toLowerCase()} on ${facts.courseTitle}; it cannot be ${MOVE_WORDS[move].toLowerCase()} from there.`,
    }
  }
  if (move === 'drop' && !facts.reason?.trim()) {
    return { ok: false, code: 'REASON_REQUIRED', message: 'Say why. A dropped course with no reason is a question every review.' }
  }
  const next: EnrollmentStatus = move === 'start' ? 'IN_PROGRESS' : move === 'complete' ? 'COMPLETED' : 'DROPPED'
  const says =
    move === 'complete'
      ? `${facts.personName} finished ${facts.courseTitle}${facts.score != null ? ` with ${facts.score}` : ''}. It is on their page now.`
      : move === 'start'
        ? `${facts.personName} has started ${facts.courseTitle}.`
        : `${facts.personName} dropped ${facts.courseTitle}: ${facts.reason!.trim()}`
  return { ok: true, status: next, says }
}

export function statusWord(status: string): string {
  switch (status) {
    case 'ENROLLED': return 'Enrolled'
    case 'IN_PROGRESS': return 'In progress'
    case 'COMPLETED': return 'Finished'
    case 'DROPPED': return 'Dropped'
    default: return status.toLowerCase()
  }
}

/** Which skills the bench is short of, that a course could close. */
export function coursesForGap(
  gaps: { skill: string; gap: number }[],
  courses: { id: string; title: string; category: string | null; skills?: string[] }[]
): { skill: string; gap: number; courses: { id: string; title: string }[] }[] {
  return gaps
    .filter((g) => g.gap > 0)
    .map((g) => ({
      skill: g.skill,
      gap: g.gap,
      courses: courses
        .filter((c) => (c.skills ?? []).some((s) => s.toLowerCase() === g.skill.toLowerCase()) || c.title.toLowerCase().includes(g.skill.toLowerCase()))
        .map((c) => ({ id: c.id, title: c.title })),
    }))
}
