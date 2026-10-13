import { prisma } from '@/lib/db'
import { contractClearance, lineExtras } from '@/lib/contract-clearance'

/**
 * The two things on a client's desk that are not approvals and still
 * need somebody: a start the paperwork will refuse, and a supplier with
 * people on site and no agreement on file.
 *
 * ── Why one file ─────────────────────────────────────────────────────
 *
 * The program page counted both in its headline, and `GET /api/decisions`
 * — the one count for a seat, read by the Ask Etyme mark and the
 * greeting — did not. Two routes deciding "is this start held" each in
 * their own words is two answers waiting to disagree, so both read the
 * verdict from here and from nowhere else (2026-10-13).
 */

/**
 * The columns a clearance reads. `validFrom` as well as `expiresAt`,
 * because a preview that disagrees with the activation it previews is
 * worse than no preview; `provider` and `result` because a refusal has to
 * name who issued a license and its number. Shared by both queries in
 * `startPaperwork`, which is why adding a column to one would have missed.
 */
export const VERIFICATION_SHAPE = {
  type: true, status: true, issuedAt: true, validFrom: true, expiresAt: true,
  verifiedAt: true, provider: true, result: true,
} as const

/** One line not started yet, in the shape the clearance needs. */
export interface StartLine {
  id: string
  personId: string
  companyId: string
  startDate: Date
  endDate: Date | null
  person: { name: string }
  requirement?: { title: string } | null
}

/**
 * The verdict activation will give on the day, read early: PASS, WARN
 * (says something, refuses nobody) or BLOCK (the start is held).
 *
 * The same checklist activation runs, with the role so a licensed role is
 * cleared against the licensed packet, the last day so a license that
 * runs out mid-assignment says so, and what this client's own order asked
 * for on the line, last, so it beats the default shape.
 */
export async function startPaperwork(
  c: StartLine,
  opts: { supplierPhrase: string; clientName: string; now: Date }
): Promise<{ outcome: 'PASS' | 'WARN' | 'BLOCK'; says: string; fix: string | null }> {
  const [personVerifications, supplierCertificates] = await Promise.all([
    prisma.verification.findMany({ where: { personId: c.personId }, select: VERIFICATION_SHAPE }),
    // `personId: null`: a person's own file is not the firm's standing.
    prisma.verification.findMany({ where: { companyId: c.companyId, personId: null }, select: VERIFICATION_SHAPE }),
  ])
  const papers = contractClearance({
    personName: c.person.name, personVerifications,
    supplierName: opts.supplierPhrase, supplierCertificates,
    clientName: opts.clientName, on: c.startDate > opts.now ? c.startDate : opts.now,
    role: c.requirement?.title ?? null,
    through: c.endDate,
    ...(await lineExtras({ sellContractId: c.id })),
  })
  return { outcome: papers.outcome, says: papers.says, fix: papers.fix ?? null }
}

/** The suppliers, of those named, with an agreement on file with this client. */
export async function agreementsOnFile(clientId: string, vendorIds: string[]): Promise<Set<string>> {
  if (vendorIds.length === 0) return new Set()
  const rows = await prisma.masterAgreement.findMany({
    where: { clientId, vendorId: { in: vendorIds } },
    select: { vendorId: true },
  })
  return new Set(rows.map((a) => a.vendorId))
}
