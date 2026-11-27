/**
 * What the firm's own record says for supplier diversity (record 132, plugin 5),
 * over any client that can read: the agent hands it the real client, the
 * skill checkers hand it the read-only one, so both count the same way.
 * Reads only this company's rows. Never writes.
 */
import { attestedFacts, certificationHeldOn, claimableNames, OWNERSHIP_WORDS, setAsideEligibility, type CertificationFact, type Eligibility, type OwnershipFact } from '@/lib/attestation/certification-held'
import type { RegistrationFacts } from './registration-rules'

interface Reader {
  supplierCertification: { findMany(a: any): Promise<any[]> }
  ownershipAttestation: { findMany(a: any): Promise<any[]> }
  company: { findUniqueOrThrow(a: any): Promise<{ legalName: string | null }> }
}

const CERT_SELECT = { kind: true, otherName: true, status: true, expiresOn: true, document: { select: { status: true, signedFileUrl: true, file: { select: { id: true } } } } } as const

/** The firm's certifications as the one reader wants them. */
export async function certificationRows(db: Pick<Reader, 'supplierCertification'>, companyId: string): Promise<CertificationFact[]> {
  return db.supplierCertification.findMany({ where: { companyId }, select: CERT_SELECT })
}

export async function readDiversityFacts(db: Reader, companyId: string, today: Date = new Date()): Promise<RegistrationFacts> {
  const [firm, rows, attestations] = await Promise.all([
    db.company.findUniqueOrThrow({ where: { id: companyId }, select: { legalName: true } }),
    certificationRows(db, companyId),
    db.ownershipAttestation.findMany({ where: { companyId }, orderBy: { attestedAt: 'asc' }, select: { fact: true, attested: true, attestedById: true, attestedAt: true, attestedBy: { select: { name: true } } } }),
  ])
  const attested = attestedFacts(attestations).map((a) => ({
    fact: a.fact, words: OWNERSHIP_WORDS[a.fact as OwnershipFact] ?? a.fact, byName: a.attestedBy.name as string, at: a.attestedAt as Date,
  }))
  return { legalName: firm.legalName?.trim() || null, held: claimableNames(rows, today), attested }
}

/** May this bid be called eligible today. An open bid always may. */
export async function bidEligibility(
  db: Pick<Reader, 'supplierCertification'>, companyId: string,
  bid: { requiresCertification: string | null; requiresCertificationName: string | null }, today: Date = new Date(),
): Promise<Eligibility> {
  if (!bid.requiresCertification) return { eligible: true, says: null }
  return setAsideEligibility({ kind: bid.requiresCertification, otherName: bid.requiresCertificationName }, await certificationRows(db, companyId), today)
}

export { certificationHeldOn }
