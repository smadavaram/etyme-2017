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

// ── The skill gap ─────────────────────────────────────────────────────

/**
 * What a client asks for against what this firm can actually field.
 *
 * ── The bug this exists to stop coming back ──────────────────────────
 *
 * The gap was arithmetic inside the page component, over a bench list
 * the page read under a key the route never sent (`lib/bench-filter`'s
 * `readBench` carries that story). So the supply side of every
 * comparison was zero, on every supplier, for the life of the screen —
 * and the demand side was real. A real number minus a broken one is
 * worse than two broken ones: every skill a client asked for read as an
 * unfilled deficit, and the one page in the product about developing
 * people pointed the firm at training it did not need.
 *
 * Three rules follow, and all three are about refusing to show a figure
 * nobody can stand behind.
 *
 * **A gap needs both sides.** If the supply side could not be read, the
 * gap is not computed. `skillsTracked` and `inDeficit` come back null and
 * `says` explains, because a comparison against an unread side is not a
 * smaller answer, it is a different one.
 *
 * **A full bench with no skills recorded is a gap in the record.** Five
 * people the firm cannot describe is a data problem, and telling a
 * recruiter to go buy training for it sends them at the wrong thing. The
 * skills are counted and the deficit is not.
 *
 * **Both sides are counted, or neither.** `skillsTracked` used to be the
 * union of the two maps, which on a broken supply side was the demand
 * side wearing a name that claimed to span both.
 */
export interface SkillTally {
  skill: string
  /** Open roles asking for it. */
  demand: number
  /** People this firm can field who have it on record. */
  supply: number
  /**
   * demand − supply, and null where it is not comparable.
   *
   * Null on a bench whose skills are unknown: zero people with a skill
   * out of five people is not five people short of it.
   */
  gap: number | null
  /** The right-hand column, in a recruiter's words. */
  says: string
}

export interface SupplySide {
  /** Everybody this firm could field: bench listings and its own payroll. */
  people: { skills: string[] }[]
}

export interface SkillGapReading {
  rows: SkillTally[]
  /** Skills named on either side, and null where only one side could be read. */
  skillsTracked: number | null
  /** Skills more roles want than people have. Null where not comparable. */
  inDeficit: number | null
  /** People this firm could field. Null where the supply side was unreadable. */
  people: number | null
  /** Of those, how many have at least one skill on record. Null likewise. */
  peopleWithSkills: number | null
  /** Whether the gap column means anything at all. */
  comparable: boolean
  /** One sentence over the panel, whatever the answer. */
  says: string
}

function countSkills(sets: { skills: string[] }[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const s of sets) {
    // One person counts once per skill, however many times they list it.
    for (const skill of new Set(s.skills.map((x) => x.trim().toLowerCase()).filter(Boolean))) {
      counts.set(skill, (counts.get(skill) ?? 0) + 1)
    }
  }
  return counts
}

/** Title case for display, from the lowercased key the counting uses. */
function asWritten(key: string, seen: Map<string, string>): string {
  return seen.get(key) ?? key.charAt(0).toUpperCase() + key.slice(1)
}

export function skillGap(
  demand: { skills: string[] }[],
  /** Null means the supply side could not be read at all — not that it is empty. */
  supply: SupplySide | null
): SkillGapReading {
  // Remember the first spelling somebody actually typed, so the screen
  // reads "ERP finance" rather than "Erp finance".
  const written = new Map<string, string>()
  for (const set of [...demand, ...(supply?.people ?? [])]) {
    for (const s of set.skills) {
      const key = s.trim().toLowerCase()
      if (key && !written.has(key)) written.set(key, s.trim())
    }
  }

  const demandCounts = countSkills(demand)

  if (supply === null) {
    return {
      rows: [],
      skillsTracked: null,
      inDeficit: null,
      people: null,
      peopleWithSkills: null,
      comparable: false,
      says:
        'The gap is not shown, because the people side could not be read. ' +
        'A number here would be invented, and the demand side alone reads as a shortage of everybody.',
    }
  }

  const people = supply.people.length
  const peopleWithSkills = supply.people.filter((p) => p.skills.some((s) => s.trim())).length
  const supplyCounts = countSkills(supply.people)

  // A bench that exists and cannot be described. Nought people with a
  // skill out of five is not five people short of it.
  const describable = people === 0 || peopleWithSkills > 0

  const keys = new Set<string>([...demandCounts.keys(), ...supplyCounts.keys()])
  const rows: SkillTally[] = [...keys].map((key) => {
    const d = demandCounts.get(key) ?? 0
    const s = supplyCounts.get(key) ?? 0
    const gap = describable ? d - s : null
    return {
      skill: asWritten(key, written),
      demand: d,
      supply: s,
      gap,
      says:
        gap === null
          ? 'Not comparable'
          : gap > 0
            ? `${gap} needed`
            : gap < 0
              ? `${Math.abs(gap)} spare`
              : 'Matched',
    }
  })

  // Biggest unmet demand first; where nothing is comparable, the busiest
  // demand first, because that is the only real number on the row.
  rows.sort((a, b) => (b.gap ?? b.demand) - (a.gap ?? a.demand) || b.demand - a.demand)

  const inDeficit = describable ? rows.filter((r) => (r.gap ?? 0) > 0).length : null

  return {
    rows,
    skillsTracked: describable ? keys.size : null,
    inDeficit,
    people,
    peopleWithSkills,
    comparable: describable,
    says: gapSentence({ people, peopleWithSkills, describable, roles: demand.length, inDeficit }),
  }
}

function gapSentence(f: {
  people: number
  peopleWithSkills: number
  describable: boolean
  roles: number
  inDeficit: number | null
}): string {
  if (f.people === 0) {
    return f.roles === 0
      ? 'No open jobs and nobody to field yet, so there is nothing to compare.'
      : `Nobody on your bench or your payroll, so all ${f.roles} open ${f.roles === 1 ? 'job' : 'jobs'} are unmet.`
  }
  if (!f.describable) {
    return (
      `${f.people} ${f.people === 1 ? 'person' : 'people'} you could field and not one skill on record for any of them. ` +
      'That is a gap in the record, not in the bench — the comparison is left blank rather than guessed, ' +
      'and the fix is to put their skills on their profiles.'
    )
  }
  const unknown = f.people - f.peopleWithSkills
  const caveat =
    unknown > 0
      ? ` ${unknown} of them ${unknown === 1 ? 'has' : 'have'} no skills on record, so the real supply can only be wider.`
      : ''
  if (f.roles === 0) {
    return `No open jobs to compare against. ${f.peopleWithSkills} of ${f.people} you could field ${f.peopleWithSkills === 1 ? 'has' : 'have'} skills on record.${caveat}`
  }
  return (
    `${f.roles} open ${f.roles === 1 ? 'job' : 'jobs'} against ${f.people} ${f.people === 1 ? 'person' : 'people'} you could field. ` +
    `${f.inDeficit} ${f.inDeficit === 1 ? 'skill is' : 'skills are'} wanted by more jobs than you have people for.${caveat}`
  )
}
