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
