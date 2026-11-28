import { prisma } from '@/lib/db'
import { pluginOn } from '@/lib/plugins'
import { buildProof, type Proof } from '@/lib/training/proof'

/**
 * The proof for the people on this firm's own bench who came from one of
 * its cohorts, keyed by the listing. Only while the firm has the plugin on
 * (off hides, never deletes), and only this firm's own cohorts and rows:
 * nothing of another firm's reaches here.
 */
export async function proofsForListings(
  companyId: string,
  listings: { listingId: string; personId: string; sourceCohortId: string | null }[],
  now: Date
): Promise<Map<string, Proof>> {
  const out = new Map<string, Proof>()
  const sourced = listings.filter((l) => l.sourceCohortId)
  if (sourced.length === 0 || !(await pluginOn(companyId, 'TRAIN_TO_BENCH'))) return out
  const listingRows = await prisma.benchListing.findMany({
    where: { id: { in: sourced.map((l) => l.listingId) }, companyId },
    select: { id: true, state: true, grantedAt: true, respondedAt: true, revokedAt: true },
  })
  const listingById = new Map(listingRows.map((r) => [r.id, r]))
  const enrollments = await prisma.enrollment.findMany({
    where: {
      OR: sourced.map((l) => ({ personId: l.personId, cohortId: l.sourceCohortId! })),
      course: { companyId },
    },
    select: {
      personId: true, cohortId: true,
      cohort: { select: { name: true } },
      course: { select: { title: true } },
      assessments: { select: { skill: true, score: true, attempt: true, assessedAt: true } },
      certifications: { select: { title: true, issuedAt: true, expiresAt: true } },
      benchAsks: { select: { benchListingId: true, answeredVia: true, askedAt: true }, orderBy: { askedAt: 'desc' } },
    },
  })
  for (const l of sourced) {
    const e = enrollments.find((x) => x.personId === l.personId && x.cohortId === l.sourceCohortId)
    if (!e) continue
    const proof = buildProof(
      {
        cohort: e.cohort ? { name: e.cohort.name, courseTitle: e.course.title } : null,
        assessments: e.assessments,
        certifications: e.certifications,
        // Her consent is the listing's; the ask only says which door she used.
        listing: listingById.get(l.listingId) ?? null,
        ask: e.benchAsks.find((a) => a.benchListingId === l.listingId) ?? null,
      },
      now
    )
    if (proof) out.set(l.listingId, proof)
  }
  return out
}
