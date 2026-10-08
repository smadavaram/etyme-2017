/**
 * A person's name, only where the reader's company already knows them.
 *
 * Sign-up walk, round five (2026-10-08), problem 8. Two refusals turned
 * an id into a name across tenants: Timesheets answered Karthik, at
 * Teleworld, "Helena Marsh's timesheet is not part of your seat" for a
 * Techpeple worker Teleworld has no tie to, and the terms page told Mo,
 * a Member at Northbend, who a submission was for. A refusal that names
 * is right for a colleague the reader already knows; it is a leak when
 * the name is looked up from an id the reader typed.
 *
 * "Known" is one of three ties, and nothing else:
 *   · a live seat of any kind at the reader's company — an employee, a
 *     consultant on its bench, an owner;
 *   · a sell line the reader's company bills for the person on
 *     (`SellContract.companyId`);
 *   · a buy line the reader's company pays the person on
 *     (`BuyContract.companyId`, the person among its candidates).
 * A firm that pays somebody on its own buy line with no seat for them
 * (Teleworld and Marcus Whitfield) knows their name; a firm with no line
 * and no seat is told "That …". Being the client on somebody else's sell
 * line, or the end client, is not one of the ties: a sub-vendor's person
 * stays unnamed to a firm it has no line with.
 */
import { prisma } from '@/lib/db'

/** The three ties that let a company name a person, as queries. Exported so the rule is read in one place. */
export function knownBy(personId: string, companyId: string) {
  return {
    seat: { personId, companyId, revokedAt: null },
    billsFor: { personId, companyId },
    paysFor: { personId, buyContract: { companyId } },
  }
}

export async function nameIfKnown(
  personId: string,
  companyId: string | null | undefined
): Promise<{ exists: boolean; name: string | null }> {
  const person = await prisma.person.findUnique({ where: { id: personId }, select: { name: true } })
  if (!person) return { exists: false, name: null }
  if (!companyId) return { exists: true, name: null }
  const ties = knownBy(personId, companyId)
  const [seat, sell, buy] = await Promise.all([
    prisma.context.findFirst({ where: ties.seat, select: { id: true } }),
    prisma.sellContract.findFirst({ where: ties.billsFor, select: { id: true } }),
    prisma.buyContractCandidate.findFirst({ where: ties.paysFor, select: { id: true } }),
  ])
  return { exists: true, name: seat || sell || buy ? person.name : null }
}
