import { certificationStanding, type CertificationStanding } from '@/lib/training'

/**
 * The proof on the bench (record 120): where she was trained, what she
 * scored, what she holds, and, only after her own yes, when and how she
 * said it. Pure. Nothing is pre-filled: with no answer, there is no
 * consent line, and with no rows, no block.
 *
 * (Named `lib/training/proof` and not `lib/training-proof`, because the
 * ownership map reaches `lib/training/` and not a sibling name.)
 */

export interface ProofInput {
  cohort: { name: string; courseTitle: string } | null
  assessments: { skill: string; score: number; attempt: number; assessedAt: Date }[]
  certifications: { title: string; issuedAt: Date; expiresAt: Date | null }[]
  /** The ask for her listing, and her answer where she has given it. */
  ask: { method: string; answer: string | null; answeredAt: Date | null; answeredVia: string | null } | null
}

export interface Proof {
  cohort: { name: string; courseTitle: string } | null
  /** Per skill, the latest attempt first and every earlier attempt kept. */
  scores: { skill: string; latest: number; attempts: { attempt: number; score: number; on: string }[] }[]
  certifications: { title: string; issued: string; expires: string | null; standing: CertificationStanding }[]
  /** Present only after her YES. */
  consent: { yesOn: string; method: string } | null
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
  const yes = i.ask && i.ask.answer === 'YES' && i.ask.answeredAt
  return {
    cohort: i.cohort,
    scores,
    certifications: i.certifications.map((c) => ({
      title: c.title,
      issued: iso(c.issuedAt),
      expires: c.expiresAt ? iso(c.expiresAt) : null,
      standing: certificationStanding(c.expiresAt, now),
    })),
    consent: yes ? { yesOn: iso(i.ask!.answeredAt!), method: i.ask!.answeredVia ?? i.ask!.method } : null,
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
