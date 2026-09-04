/**
 * Filter with rules before you pay a model.
 *
 * The match engine took up to two hundred bench listings, deduplicated
 * them, and sent every one to the model in batches of twenty-five. Eight
 * calls per requirement, with one filter applied beforehand — "not already
 * submitted" — and nothing else.
 *
 * Everything else it needed to know first is arithmetic. Does this person
 * have any of the skills at all. Is their rate floor under the ceiling. Are
 * they free before the start date. Does their work authorisation match. All
 * of that is string comparison and date comparison: free, instant, and
 * right every time.
 *
 * On a forty-person bench that is forty scored where fifteen were worth
 * scoring — roughly $53 a month becoming $140, which is the difference
 * between a business at 94% gross margin and one at 70%. On a two-hundred
 * person bench it is thirteen times worse.
 *
 * ── The rule that decides the shape of this file ─────────────────────
 *
 * Use code, not a model, wherever a rule will do. Save the model for the
 * one judgement that actually needs one — is this skill claim evidenced —
 * which is exactly what the match engine is for and exactly what these
 * rules are not.
 *
 * ── Why every drop says why ──────────────────────────────────────────
 *
 * A filter that silently removes people is indistinguishable from a filter
 * that is broken. Every drop carries its reason, the reasons are counted,
 * and the counts go on the screen — so "nobody matched" is answerable
 * without reading code.
 */

/** How many reach the model, unless somebody says otherwise. */
export const DEFAULT_SHORTLIST = 15

/**
 * How long after the start date somebody can still be worth showing.
 *
 * A consultant free two weeks after a role starts is often still placed —
 * start dates slip more often than benches do. Beyond a month they are a
 * different conversation.
 */
const LATE_GRACE_DAYS = 30

export interface Role {
  skills: string[]
  location: string | null
  billMin: number | null
  billMax: number | null
  startDate: Date | null
  workAuth?: string | null
}

export interface Candidate {
  personId: string
  name: string
  skills: string[]
  location: string | null
  workAuth: string | null
  /** The least they will work for, in cents per hour. */
  rateFloor: number | null
  availableFrom: Date | null
  /** Last time the person themselves confirmed any of this. */
  confirmedAt?: Date | null
}

export interface Kept {
  candidate: Candidate
  /** How many of the role's skills they plainly have. */
  skillHits: number
  /** Ordering hint, not a score. The score is the model's job. */
  rank: number
}

export interface Dropped {
  personId: string
  name: string
  /** One sentence, in words a recruiter would use. */
  because: string
  /** Grouped for counting: SKILLS · RATE · AVAILABILITY · WORK_AUTH · STALE */
  code: string
}

export interface Sifted {
  kept: Kept[]
  dropped: Dropped[]
  considered: number
  /** Said on the screen, so "nobody matched" is answerable. */
  summary: string
}

// ── The rules ─────────────────────────────────────────────────────────

/**
 * Skills, compared the cheap way.
 *
 * Not semantic — that is what the model is for. This only asks whether
 * there is any plain overlap at all, because somebody with none of the
 * named skills is not a borderline call the model needs to make.
 *
 * Substring both ways so "SAP FICO" matches "FICO" and "React" matches
 * "React.js". Crude on purpose: the cost of keeping one extra person is
 * one more row in a batch; the cost of dropping a real match is a
 * placement.
 */
export function skillHits(roleSkills: string[], theirs: string[]): number {
  if (roleSkills.length === 0) return 1 // nothing asked for, nothing to fail

  const mine = theirs.map(norm).filter(Boolean)
  let hits = 0

  for (const want of roleSkills.map(norm).filter(Boolean)) {
    if (mine.some((have) => have.includes(want) || want.includes(have))) hits++
  }
  return hits
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9+#/.]/g, '')
}

/**
 * Can they work at this rate.
 *
 * Their floor against the role's ceiling, and nothing subtler. A floor
 * above the ceiling is not a negotiation, it is a no — and finding that
 * out from a model costs money to be told what subtraction would have
 * said.
 *
 * Unknown floor stays in. A missing number is not a reason to lose
 * somebody, and half a bench has no rate recorded.
 */
export function rateWorks(role: Role, c: Candidate): boolean {
  if (c.rateFloor == null || role.billMax == null) return true
  return c.rateFloor <= role.billMax
}

/**
 * Are they free in time.
 *
 * Free before the start date, or within a month after it — start dates
 * slip more often than benches do. Unknown availability stays in.
 */
export function freeInTime(role: Role, c: Candidate): boolean {
  if (c.availableFrom == null || role.startDate == null) return true

  const latest = new Date(role.startDate)
  latest.setDate(latest.getDate() + LATE_GRACE_DAYS)
  return c.availableFrom <= latest
}

/**
 * Does the permit match.
 *
 * Only where the role actually names one, and only on an exact match of
 * what was recorded. A role that says nothing about work authorisation
 * excludes nobody — which is most roles.
 */
export function authWorks(role: Role, c: Candidate): boolean {
  if (!role.workAuth) return true
  if (!c.workAuth) return true // unknown is not a no
  return role.workAuth.toUpperCase() === c.workAuth.toUpperCase()
}

/**
 * Has anybody confirmed this record recently.
 *
 * A bench record says somebody is free at $78 and knows Java. That was
 * true three weeks ago; since then they took a contract or raised their
 * rate, and nobody updated it because updating records is nobody's job.
 * Scoring a stale record produces confident nonsense faster than a human
 * could produce it slowly.
 *
 * So an unconfirmed record is not dropped — that would hide the whole
 * bench on day one — it is pushed down the ranking, and the reason is
 * said out loud.
 */
export function staleness(c: Candidate, now: Date): number {
  if (!c.confirmedAt) return 999
  return Math.floor((now.getTime() - c.confirmedAt.getTime()) / 86400000)
}

// ── The sift ──────────────────────────────────────────────────────────

/**
 * Two hundred in, fifteen out, and a reason for every one of the other
 * hundred and eighty-five.
 */
export function sift(
  role: Role,
  candidates: Candidate[],
  opts: { shortlist?: number; now?: Date } = {}
): Sifted {
  const shortlist = opts.shortlist ?? DEFAULT_SHORTLIST
  const now = opts.now ?? new Date()

  const kept: Kept[] = []
  const dropped: Dropped[] = []

  for (const c of candidates) {
    const hits = skillHits(role.skills, c.skills)

    if (hits === 0) {
      dropped.push({
        personId: c.personId,
        name: c.name,
        code: 'SKILLS',
        because: `none of ${role.skills.slice(0, 3).join(', ')}`,
      })
      continue
    }

    if (!rateWorks(role, c)) {
      dropped.push({
        personId: c.personId,
        name: c.name,
        code: 'RATE',
        because: `wants $${Math.round((c.rateFloor ?? 0) / 100)}, the role tops out at $${Math.round((role.billMax ?? 0) / 100)}`,
      })
      continue
    }

    if (!freeInTime(role, c)) {
      dropped.push({
        personId: c.personId,
        name: c.name,
        code: 'AVAILABILITY',
        because: `not free until ${c.availableFrom!.toISOString().slice(0, 10)}`,
      })
      continue
    }

    if (!authWorks(role, c)) {
      dropped.push({
        personId: c.personId,
        name: c.name,
        code: 'WORK_AUTH',
        because: `role needs ${role.workAuth}, they are ${c.workAuth}`,
      })
      continue
    }

    kept.push({ candidate: c, skillHits: hits, rank: 0 })
  }

  // Order before cutting. More skills first; a fresher record wins a tie,
  // because between two equal people the one who answered a text last week
  // is the one who is actually there.
  kept.sort((a, b) => {
    if (b.skillHits !== a.skillHits) return b.skillHits - a.skillHits
    return staleness(a.candidate, now) - staleness(b.candidate, now)
  })
  kept.forEach((k, i) => (k.rank = i + 1))

  const overflow = kept.slice(shortlist)
  for (const o of overflow) {
    dropped.push({
      personId: o.candidate.personId,
      name: o.candidate.name,
      code: 'SHORTLIST',
      because: `ranked ${o.rank}, and only the top ${shortlist} are scored`,
    })
  }

  const final = kept.slice(0, shortlist)

  return {
    kept: final,
    dropped,
    considered: candidates.length,
    summary: summarise(candidates.length, final.length, dropped),
  }
}

/**
 * Said on the screen.
 *
 * "Nobody matched" is not an answer a recruiter can do anything with. This
 * says what went where, so the next move is obvious — widen the rate, drop
 * a skill, or accept a later start.
 */
export function summarise(considered: number, kept: number, dropped: Dropped[]): string {
  if (considered === 0) return 'Nobody on the bench yet.'

  const counts = new Map<string, number>()
  for (const d of dropped) counts.set(d.code, (counts.get(d.code) ?? 0) + 1)

  const said: string[] = []
  const label: Record<string, string> = {
    SKILLS: 'no overlapping skills',
    RATE: 'priced above the role',
    AVAILABILITY: 'not free in time',
    WORK_AUTH: 'wrong work authorisation',
    SHORTLIST: 'ranked below the cut',
  }

  for (const code of ['SKILLS', 'RATE', 'AVAILABILITY', 'WORK_AUTH', 'SHORTLIST']) {
    const n = counts.get(code)
    if (n) said.push(`${n} ${label[code]}`)
  }

  if (kept === 0) {
    return `Nobody fits out of ${considered}: ${said.join(', ')}.`
  }

  return said.length > 0
    ? `${kept} of ${considered} worth scoring — ${said.join(', ')}.`
    : `${kept} of ${considered} worth scoring.`
}
