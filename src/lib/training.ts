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

/**
 * What a button says for each move: the thing it does, never the state it
 * leaves behind. "Started" beside a status chip read as a status (bench
 * tester, 2026-10-01).
 */
export const MOVE_ACTIONS: Record<EnrollmentMove, string> = {
  start: 'Start',
  complete: 'Finish',
  drop: 'Drop',
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
  /**
   * Null means the job requests could not be read — a refusal, not an
   * empty list. Read as empty, every skill on the bench came out "spare"
   * and the page told a desk with no access that nothing was wanted.
   */
  demand: { skills: string[] }[] | null,
  /** Null means the supply side could not be read at all — not that it is empty. */
  supply: SupplySide | null
): SkillGapReading {
  if (demand === null) {
    return {
      rows: [],
      skillsTracked: null,
      inDeficit: null,
      people: supply ? supply.people.length : null,
      peopleWithSkills: supply ? supply.people.filter((p) => p.skills.some((s) => s.trim())).length : null,
      comparable: false,
      says:
        'The gap is not shown, because the job requests could not be read. ' +
        'The people side alone reads as everybody spare, which would be invented.',
    }
  }

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

// ── Who a firm could field, and put on a course ──────────────────────

export interface FieldablePerson {
  personId: string
  name: string
  skills: string[]
  /** BENCH — on the firm's bench by their own yes; EMPLOYEE — employed, with work on the record. */
  kind: 'BENCH' | 'EMPLOYEE'
  /** NOW · SOON (within 14 days) · LATER · PLACED · UNKNOWN */
  free: 'NOW' | 'SOON' | 'LATER' | 'PLACED' | 'UNKNOWN'
}

/**
 * The people a firm could put on a job or a course: everybody on its
 * bench, and every employee whose work is on the record. Somebody with
 * nothing on the record — the owner, the recruiter, the finance clerk —
 * is staff, not supply, and counting them is how the owner ended up in
 * "people you could field" and on the course picker (bench tester,
 * 2026-10-01). The same rule bench profit's utilization reads.
 *
 * When each is free is read from the one door: a listing carries the
 * route's `whenFree`, an employee's roster standing says it.
 */
export function fieldable(
  listings: { personId: string; name: string; skills: string[]; consent?: string | null; free: { state: string; on: string | null } | null }[],
  roster: { personId: string; name: string; skills: string[]; standing: string; freeForDays?: number | null }[],
  now: Date
): FieldablePerson[] {
  const soon = now.getTime() + 14 * 86_400_000
  const out = new Map<string, FieldablePerson>()
  for (const l of listings) {
    if (l.consent && l.consent !== 'GRANTED') continue
    const f = l.free
    const free: FieldablePerson['free'] =
      !f ? 'UNKNOWN'
        : f.state === 'NOW' ? 'NOW'
          : f.state === 'PLACED' ? 'PLACED'
            : f.state === 'FROM' && f.on ? (Date.parse(`${f.on}T00:00:00Z`) <= soon ? 'SOON' : 'LATER')
              : 'UNKNOWN'
    out.set(l.personId, { personId: l.personId, name: l.name, skills: l.skills, kind: 'BENCH', free })
  }
  for (const r of roster) {
    if (r.standing === 'NOT_ON_THE_RECORD') continue
    const had = out.get(r.personId)
    if (had) {
      if (had.skills.length === 0) had.skills = r.skills
      continue
    }
    const free: FieldablePerson['free'] =
      r.standing === 'BETWEEN_PROJECTS' ? 'NOW' : r.standing === 'ON_PROJECT' || r.standing === 'STARTING_SOON' ? 'PLACED' : 'UNKNOWN'
    out.set(r.personId, { personId: r.personId, name: r.name, skills: r.skills, kind: 'EMPLOYEE', free })
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name))
}

// ── Cohorts, assessments, certifications and the ask (record 120) ─────
//
// Pure rules, one sentence per refusal, no database. The routes under
// /api/training call these and only these to decide.

export type CohortState = 'PLANNED' | 'RUNNING' | 'COMPLETE' | 'CANCELLED'
export type CohortMove = 'start' | 'complete' | 'cancel'

export const COHORT_MOVES: Record<CohortState, CohortMove[]> = {
  PLANNED: ['start', 'cancel'],
  RUNNING: ['complete', 'cancel'],
  COMPLETE: [],
  CANCELLED: [],
}

/** A cohort's state in a recruiter's words. */
export function cohortWord(state: string): string {
  switch (state) {
    case 'PLANNED': return 'Planned'
    case 'RUNNING': return 'Running'
    case 'COMPLETE': return 'Finished'
    case 'CANCELLED': return 'Cancelled'
    default: return state.toLowerCase()
  }
}

export type Refusal = { ok: false; message: string }
export type Ok = { ok: true }

/** Where a cohort may go from here, or the sentence that says it cannot. */
export function cohortNext(state: string, move: CohortMove, name: string): { ok: true; state: CohortState } | Refusal {
  const allowed = COHORT_MOVES[state as CohortState] ?? []
  if (!allowed.includes(move)) {
    return {
      ok: false,
      message:
        state === 'COMPLETE' ? `${name} is finished. There is nothing more to record on it.`
          : state === 'CANCELLED' ? `${name} was cancelled. Start a new cohort instead.`
            : `${name} is ${cohortWord(state).toLowerCase()}; it cannot be ${move === 'start' ? 'started' : move === 'complete' ? 'finished' : 'cancelled'} from there.`,
    }
  }
  return { ok: true, state: move === 'start' ? 'RUNNING' : move === 'complete' ? 'COMPLETE' : 'CANCELLED' }
}

/** Capacity is enforced. A cohort with no capacity set has no limit. */
export function cohortFull(o: { capacity: number | null; enrolled: number; name: string }): Ok | Refusal {
  if (o.capacity == null) return { ok: true }
  if (o.enrolled >= o.capacity) {
    return { ok: false, message: `${o.name} holds ${o.capacity} ${o.capacity === 1 ? 'person' : 'people'} and is full.` }
  }
  return { ok: true }
}

/** A trainee is in a cohort only for the course the cohort teaches. */
export function sameCourse(o: { enrollmentCourseId: string; cohortCourseId: string; courseTitle: string; cohortName: string }): Ok | Refusal {
  if (o.enrollmentCourseId !== o.cohortCourseId) {
    return { ok: false, message: `${o.cohortName} teaches a different course than ${o.courseTitle}. Pick a cohort for this course.` }
  }
  return { ok: true }
}

/** A cohort takes people only while it is planned or running. */
export function cohortOpen(state: string, name: string): Ok | Refusal {
  if (state === 'PLANNED' || state === 'RUNNING') return { ok: true }
  return { ok: false, message: `${name} is ${cohortWord(state).toLowerCase()} and takes nobody new.` }
}

/**
 * The next attempt at a skill. An attempt is never overwritten: a retake
 * is the next number. The score is a whole number from 0 to 100.
 */
export function nextAttempt(
  existing: { skill: string; attempt: number }[],
  skill: string,
  score: unknown
): { ok: true; skill: string; score: number; attempt: number } | Refusal {
  const name = skill.trim()
  if (!name) return { ok: false, message: 'Say which skill was assessed.' }
  const n = typeof score === 'number' ? score : typeof score === 'string' && score.trim() !== '' ? Number(score) : NaN
  if (!Number.isInteger(n) || n < 0 || n > 100) {
    return { ok: false, message: 'A score is a whole number from 0 to 100.' }
  }
  const same = existing.filter((a) => a.skill.trim().toLowerCase() === name.toLowerCase())
  const attempt = same.reduce((m, a) => Math.max(m, a.attempt), 0) + 1
  // Keep the first spelling typed for this skill, so a skill reads one way.
  return { ok: true, skill: same.length ? existing.find((a) => a.skill.trim().toLowerCase() === name.toLowerCase())!.skill : name, score: n, attempt }
}

/** A recruiter develops people and sells them; she never grades or certifies them. An extra guard. */
const NEVER_GRADES = ['Recruiter']

/**
 * Who may enter an assessment. The rule follows a named person, not a
 * label (record 120, review 2026-11-25):
 *
 *  - nobody assesses themselves;
 *  - the cohort must have a trainer, and the caller must be that trainer;
 *  - a recruiter never assesses, even one named trainer (extra guard).
 */
export function mayAssess(o: {
  callerPersonId: string
  callerRole: string | null
  trainerPersonId: string | null
  /** The person on the course being assessed. */
  enrolledPersonId: string
}): Ok | Refusal {
  if (o.callerPersonId === o.enrolledPersonId) {
    return { ok: false, message: 'Nobody assesses themselves. Another person enters this assessment.' }
  }
  if (o.callerRole && NEVER_GRADES.includes(o.callerRole)) {
    return { ok: false, message: 'A recruiter does not assess a trainee. The cohort’s trainer does.' }
  }
  if (!o.trainerPersonId) {
    return { ok: false, message: 'Name the cohort’s trainer first.' }
  }
  if (o.trainerPersonId !== o.callerPersonId) {
    return { ok: false, message: 'Only the cohort’s trainer enters an assessment for this cohort.' }
  }
  return { ok: true }
}

/**
 * Of an enrollment's assessments, the people who assessed her in her
 * current run. A person dropped and enrolled again keeps the old rows
 * (attempts are never deleted); a past run's assessor does not certify the
 * new run, because only assessments made on or after the day the enrollment
 * last began count.
 */
export function currentRunAssessors(
  assessments: { assessorPersonId: string; assessedAt: Date }[],
  runStartedAt: Date
): string[] {
  return [...new Set(assessments.filter((a) => a.assessedAt.getTime() >= runStartedAt.getTime()).map((a) => a.assessorPersonId))]
}

/** A trainee never trains her own cohort. */
export function mayNameTrainer(o: { trainerPersonId: string; traineePersonIds: string[]; cohortName: string }): Ok | Refusal {
  if (o.traineePersonIds.includes(o.trainerPersonId)) {
    return { ok: false, message: `That person is a trainee on ${o.cohortName}. A trainee cannot be its trainer.` }
  }
  return { ok: true }
}

/**
 * A certification needs a finished course, and is issued only by the
 * cohort's trainer or by a person who assessed this enrollment, and never
 * by the trainee herself. Never a recruiter, even one who is also named on
 * the cohort.
 */
export function mayCertify(o: {
  enrollmentStatus: string
  personName: string
  callerPersonId: string
  callerRole: string | null
  trainerPersonId: string | null
  assessorPersonIds: string[]
  /** The person on the course being certified. */
  enrolledPersonId: string
}): Ok | Refusal {
  if (o.enrollmentStatus !== 'COMPLETED') {
    return { ok: false, message: `${o.personName} has not finished the course. Finish it first, then certify.` }
  }
  if (o.callerPersonId === o.enrolledPersonId) {
    return { ok: false, message: 'Nobody certifies themselves. The trainer or an assessor does.' }
  }
  if (o.callerRole && NEVER_GRADES.includes(o.callerRole)) {
    return { ok: false, message: 'A recruiter does not certify. The person who assessed her, or the cohort’s trainer, does.' }
  }
  const isTrainer = o.trainerPersonId != null && o.trainerPersonId === o.callerPersonId
  if (!isTrainer && !o.assessorPersonIds.includes(o.callerPersonId)) {
    return { ok: false, message: `Only the person who assessed ${o.personName}, or the cohort’s trainer, may certify her.` }
  }
  return { ok: true }
}

export type CertificationStanding = 'CURRENT' | 'EXPIRING' | 'EXPIRED'

const DAY = 86_400_000
const dayOf = (d: Date) => Math.floor(d.getTime() / DAY)

/**
 * Computed on read from the expiry date, never stored. Valid through the
 * whole of its last day. No expiry date means it does not lapse.
 * Expiring is the last 30 days.
 */
export function certificationStanding(expiresAt: Date | null, now: Date): CertificationStanding {
  if (!expiresAt) return 'CURRENT'
  const left = dayOf(expiresAt) - dayOf(now)
  if (left < 0) return 'EXPIRED'
  return left <= 30 ? 'EXPIRING' : 'CURRENT'
}

/** The ask is offered when her own course is complete, not when the cohort is. */
export function mayAskOntoBench(o: { enrollmentStatus: string; personName: string }): Ok | Refusal {
  if (o.enrollmentStatus !== 'COMPLETED') {
    return { ok: false, message: `${o.personName} has not finished the course yet. Ask her onto the bench once she has.` }
  }
  return { ok: true }
}

/**
 * A cohort is finished only when every trainee has a result. A trainee is
 * anybody on it who has not dropped; a result is at least one assessment.
 */
export function mayCompleteCohort(o: {
  name: string
  trainees: { name: string; status: string; assessments: number }[]
}): Ok | Refusal {
  const without = o.trainees.filter((t) => t.status !== 'DROPPED' && t.assessments === 0).map((t) => t.name)
  if (without.length === 0) return { ok: true }
  return { ok: false, message: `${o.name} cannot be finished: ${without.join(', ')} ${without.length === 1 ? 'has' : 'have'} no result yet.` }
}

/**
 * The ask's record may be answered once, by her, and never by the firm.
 * Only an ask she was asked (her own page, or the email link) is filled
 * by her answer; a firm's employee who was told is never stamped as a yes.
 */
export function mayRecordAnswer(ask: { answer: string | null; method: string }): Ok | Refusal {
  if (ask.method !== 'OWN_PAGE' && ask.method !== 'EMAIL_LINK') {
    return { ok: false, message: 'She was told, not asked. There is no answer to record on this one.' }
  }
  if (ask.answer != null) return { ok: false, message: 'She has already answered this ask. An answer is written once.' }
  return { ok: true }
}

export type AskMethod = 'EMAIL_LINK' | 'OWN_PAGE' | 'EMPLOYEE_TOLD'

/**
 * How the ask reaches her. A firm's own employee is told, not asked.
 * Somebody with an account of her own finds it on her own page; anybody
 * else gets the email link.
 */
export function askMethod(o: { employed: boolean; hasOwnAccount: boolean }): AskMethod {
  return o.employed ? 'EMPLOYEE_TOLD' : o.hasOwnAccount ? 'OWN_PAGE' : 'EMAIL_LINK'
}
