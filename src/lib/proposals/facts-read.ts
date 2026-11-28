/**
 * The read behind the proposals agent's facts (record 124), over any client
 * that can read. The agent hands it the real client; the skill's checker
 * hands it the read-only one, so both count the same way. Counts and skills
 * only: never a name, never a rate.
 */
import type { ProposalFacts } from './draft-rules'
import { claimableNames } from '@/lib/attestation/certification-held'
import { certificationRows } from '@/lib/diversity/facts'

interface Reader {
  company: { findUniqueOrThrow(a: any): Promise<{ name: string; legalName: string | null }> }
  supplierCertification: { findMany(a: any): Promise<any[]> }
  benchListing: { findMany(a: any): Promise<{ consultant: { skills: string[] } }[]> }
  sellContract: { count(a: any): Promise<number>; groupBy(a: any): Promise<unknown[]> }
}

export async function readProposalFacts(db: Reader, companyId: string, today: Date = new Date()): Promise<ProposalFacts> {
  const [firm, listings, engagements, clients, certs] = await Promise.all([
    db.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true, legalName: true } }),
    // A person is counted only while her own yes to the listing stands.
    db.benchListing.findMany({ where: { companyId, state: 'GRANTED', revokedAt: null }, select: { consultant: { select: { skills: true } } } }),
    db.sellContract.count({ where: { companyId } }),
    db.sellContract.groupBy({ by: ['clientCompanyId'], where: { companyId } }),
    // Only a certification held today, with its certificate on file and in date, is a fact the draft may name (record 132).
    certificationRows(db, companyId),
  ])
  const tally = new Map<string, number>()
  for (const l of listings) for (const s of l.consultant.skills) { const k = s.trim(); if (k) tally.set(k, (tally.get(k) ?? 0) + 1) }
  const skills = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k).slice(0, 10)
  return { firm: firm.name, skills, people: listings.length, engagements, clients: clients.length, legalName: firm.legalName?.trim() || null, held: claimableNames(certs, today) }
}
