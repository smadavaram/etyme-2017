import { certificationStanding, type CertificationStanding } from '@/lib/training'

/**
 * The proof on the bench (record 120): where she was trained, what she
 * scored, what she holds, and, only after her own yes, when and how she
 * said it. Pure. Nothing is pre-filled: with no granted listing, there is no
 * consent line, and with no rows, no block.
 *
 * (Named `lib/training/proof` and not `lib/training-proof`, because the
 * ownership map reaches `lib/training/` and not a sibling name.)
 */

export interface ProofInput {
  cohort: { name: string; courseTitle: string } | null
  assessments: { skill: string; score: number; attempt: number; assessedAt: Date }[]
  certifications: { title: string; issuedAt: Date; expiresAt: Date | null }[]
  /**
   * Her bench listing: the one consent record. Her yes is read from here
   * and only while it is GRANTED and not taken back.
   */
  listing: { state: string; grantedAt: Date | null; respondedAt: Date | null; revokedAt?: Date | null } | null
  /** The ask for her listing. It supplies the door she answered by, and nothing else. */
  ask: { answeredVia: string | null } | null
}

export interface Proof {
  cohort: { name: string; courseTitle: string } | null
  /** Per skill, the latest attempt first and every earlier attempt kept. */
  scores: { skill: string; latest: number; attempts: { attempt: number; score: number; on: string }[] }[]
  certifications: { title: string; issued: string; expires: string | null; standing: CertificationStanding }[]
  /** Present only while her listing is GRANTED. The method is null where no ask recorded the door. */
  consent: { yesOn: string; method: string | null } | null
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

export function buildProof(i: ProofInput, now: Date): Proof | null {
  if (!i.cohort && i.assessments.length === 0 && i.certifications.length === 0) return null
  const bySkill = new Map<string, ProofInput['assessments']>()
  for (const a of i.assessments) {
    const key = a.skill.trim().toLowerCase()
    bySkill.set(key, [...(bySkill.get(key) ?? []), a])
  }
  const scores = [...bySkill.values()].map((rows) => {
    const sorted = [...rows].sort((a, b) => b.attempt - a.attempt)
    return {
      skill: sorted[0].skill,
      latest: sorted[0].score,
      attempts: sorted.map((a) => ({ attempt: a.attempt, score: a.score, on: iso(a.assessedAt) })),
    }
  }).sort((a, b) => a.skill.localeCompare(b.skill))
  const l = i.listing
  const yesAt = l && l.state === 'GRANTED' && !l.revokedAt ? (l.respondedAt ?? l.grantedAt) : null
  return {
    cohort: i.cohort,
    scores,
    certifications: i.certifications.map((c) => ({
      title: c.title,
      issued: iso(c.issuedAt),
      expires: c.expiresAt ? iso(c.expiresAt) : null,
      standing: certificationStanding(c.expiresAt, now),
    })),
    consent: yesAt ? { yesOn: iso(yesAt), method: i.ask?.answeredVia ?? null } : null,
  }
}

/**
 * What a client reads of a finished course: "Certified: title, issued,
 * expires", and nothing else. A lapsed certification is not read as
 * certified. Never the course, the cohort, a score or the word training.
 */
export function clientCertifiedLines(
  certs: { title: string; issuedAt: Date; expiresAt: Date | null }[],
  now: Date
): string[] {
  return certs
    .filter((c) => certificationStanding(c.expiresAt, now) !== 'EXPIRED')
    .map((c) => `Certified: ${c.title}, issued ${iso(c.issuedAt)}, ${c.expiresAt ? `expires ${iso(c.expiresAt)}` : 'does not expire'}`)
}

/** The door recorded on an ask for somebody who was already on the bench when the firm asked. */
export const ALREADY_ON_BENCH = 'ALREADY_ON_BENCH'

const DOOR_WORDS: Record<string, string> = {
  OWN_PAGE: 'on her own page',
  EMAIL_LINK: 'from the emailed link',
  [ALREADY_ON_BENCH]: 'already on the bench when asked',
}

/**
 * The Training block as plain lines, for a bench row and a consultant
 * page. The yes line is there only once she has said yes.
 */
export function proofLines(p: Proof): string[] {
  const out: string[] = []
  if (p.cohort) out.push(`${p.cohort.name}, on ${p.cohort.courseTitle}`)
  for (const s of p.scores) {
    out.push(`${s.skill}: ${[...s.attempts].sort((a, b) => a.attempt - b.attempt).map((a) => a.score).join(', then ')}`)
  }
  for (const c of p.certifications) {
    out.push(`Certified: ${c.title}, issued ${c.issued}, ${c.expires ? `expires ${c.expires}` : 'does not expire'}${c.standing === 'EXPIRED' ? ' (lapsed)' : ''}`)
  }
  if (p.consent) {
    const door = p.consent.method ? DOOR_WORDS[p.consent.method] : null
    out.push(`Said yes on ${p.consent.yesOn}${door ? `, ${door}` : ''}`)
  }
  return out
}
