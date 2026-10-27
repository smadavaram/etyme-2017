/**
 * The counts a new party's first act is chosen from (./first-act), read
 * off the caller's own company's rows. Counts only: no person's data is
 * read, so nothing here writes an access log, and nothing here writes at
 * all. Only the count the party's act needs is read; the rest stay
 * absent, and an absent count is never said as zero.
 */

import { prisma } from '@/lib/db'
import type { Party } from './ask'
import type { FirstActFacts } from './first-act'

export async function firstActFacts(companyId: string, companyKind: string | null, party: Party): Promise<FirstActFacts> {
  const f: FirstActFacts = { party, companyKind }
  if (party === 'CLIENT') {
    const [recommended, register, jobs] = await Promise.all([
      prisma.supplierRequest.count({ where: { companyId } }),
      // Either side of the register: a client that wrote a firm down, or a firm that wrote this client down as its client.
      prisma.counterparty.count({ where: { OR: [{ companyId, relationship: { not: 'CLIENT' } }, { otherCompanyId: companyId, relationship: 'CLIENT' }] } }),
      prisma.requirement.count({ where: { companyId } }),
    ])
    f.suppliers = recommended + register
    f.jobs = jobs
  } else if (party === 'MSP') {
    // Only an MSP's own company is asked: a firm seated in a client's program already has its seat.
    if (companyKind === 'MSP') f.seats = await prisma.programSeat.count({ where: { officeCompanyId: companyId, revokedAt: null } })
  } else if (party === 'FIRM') {
    if (companyKind === 'GSI') {
      const [imported, bench, lines] = await Promise.all([
        prisma.import.count({ where: { companyId, committedAt: { not: null } } }),
        prisma.benchListing.count({ where: { companyId } }),
        prisma.sellContract.count({ where: { companyId } }),
      ])
      f.people = imported + bench + lines
    } else {
      const posture = await prisma.company.findUnique({ where: { id: companyId }, select: { supplierPosture: true } })
      if (posture?.supplierPosture === 'BENCH') {
        f.bench = true
        f.benchPeople = await prisma.benchListing.count({ where: { companyId } })
        return f
      }
      const [register, invited, lines] = await Promise.all([
        prisma.counterparty.count({ where: { OR: [{ companyId }, { otherCompanyId: companyId }] } }),
        prisma.requirementInvitation.count({ where: { toCompanyId: companyId } }),
        prisma.sellContract.count({ where: { companyId } }),
      ])
      f.clients = register + invited + lines
    }
  } else if (party === 'SOLO') {
    const [lines, papers] = await Promise.all([
      prisma.sellContract.count({ where: { companyId } }),
      prisma.verification.count({ where: { companyId } }),
    ])
    f.contracts = lines
    f.firmPapers = papers
  }
  return f
}
