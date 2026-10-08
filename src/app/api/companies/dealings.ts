import { prisma } from '@/lib/db'
import { isConsultantSeat } from '@/lib/seat'
import { mayNameSubVendors, namesForClient } from '@/lib/chain-names'
import type { CallerContext } from '@/lib/api-context'

/**
 * Every company this caller has dealings with.
 *
 * Six ways a relationship exists, and a name is readable if any one of
 * them does: the caller's own register, an agreement either way, a sell
 * contract either way, a buy contract either way, a requirement
 * invitation either way, and a program-office desk held or granted.
 *
 * A consultant is the seventh case and a different question — the
 * benches that list them and the places they are placed — because a
 * person has no register.
 */
export async function dealingsOf(
  caller: CallerContext,
  includesOwn: boolean
): Promise<Set<string>> {
  const ids = new Set<string>()

  if (isConsultantSeat(caller)) {
    const [benches, placements] = await Promise.all([
      prisma.benchListing.findMany({
        where: { consultant: { personId: caller.person.id }, revokedAt: null },
        select: { companyId: true },
      }),
      prisma.sellContract.findMany({
        where: { personId: caller.person.id },
        select: { companyId: true, clientCompanyId: true, endClientCompanyId: true },
      }),
    ])
    for (const b of benches) ids.add(b.companyId)
    for (const c of placements) {
      ids.add(c.companyId)
      ids.add(c.clientCompanyId)
      if (c.endClientCompanyId) ids.add(c.endClientCompanyId)
    }
    return ids
  }

  const me = caller.company?.id
  if (!me) return ids
  if (includesOwn) ids.add(me)

  // Every sell line the caller is on, at any rung, with the seller's
  // name — read on its own so the names are handed to lib/chain-names
  // before any of them is listed.
  const sells = await prisma.sellContract.findMany({
    where: { OR: [{ companyId: me }, { clientCompanyId: me }, { endClientCompanyId: me }] },
    select: {
      id: true, personId: true, companyId: true, clientCompanyId: true, endClientCompanyId: true,
      company: { select: { name: true } },
    },
  })

  const [register, agreements, buys, invitations, seats] = await Promise.all([
    prisma.counterparty.findMany({
      where: { companyId: me },
      select: { otherCompanyId: true },
    }),
    prisma.masterAgreement.findMany({
      where: { OR: [{ clientId: me }, { vendorId: me }] },
      select: { clientId: true, vendorId: true },
    }),
    prisma.buyContract.findMany({
      where: { OR: [{ companyId: me }, { vendorCompanyId: me }] },
      select: { companyId: true, vendorCompanyId: true },
    }),
    prisma.requirementInvitation.findMany({
      where: { OR: [{ fromCompanyId: me }, { toCompanyId: me }] },
      select: { fromCompanyId: true, toCompanyId: true },
    }),
    prisma.programSeat.findMany({
      where: { OR: [{ officeCompanyId: me }, { clientCompanyId: me }] },
      select: { officeCompanyId: true, clientCompanyId: true },
    }),
  ])

  for (const r of register) ids.add(r.otherCompanyId)
  for (const a of agreements) { ids.add(a.clientId); ids.add(a.vendorId) }
  // A line this caller is a party to names both parties, and the seller
  // knows the site it works at. A line where the caller is only the end
  // client is a rung below the firm it pays — a prime's sub-vendor —
  // and its name is the prime's to keep unless the caller's agreement
  // with that prime requires disclosure (lib/chain-names). Listing it
  // here printed a sub-vendor on the client's Companies page with the
  // term off: Northbend Athletic read Techpeple, Computer Systems' sub,
  // on 2026-09-30.
  const below = sells.filter((c) => c.companyId !== me && c.clientCompanyId !== me)
  for (const c of sells) {
    if (c.companyId !== me && c.clientCompanyId !== me) continue
    ids.add(c.companyId)
    ids.add(c.clientCompanyId)
    if (c.endClientCompanyId) ids.add(c.endClientCompanyId)
  }
  if (below.length > 0) {
    const terms = await prisma.masterAgreement.findMany({
      where: { clientId: me, disclosesSubVendors: true },
      select: { clientId: true, vendorId: true, disclosesSubVendors: true, status: true },
    })
    const seen = namesForClient(
      sells
        .filter((c) => c.companyId !== me)
        .map((c) => ({
          id: c.id, personId: c.personId, companyId: c.companyId,
          companyName: c.company.name, clientCompanyId: c.clientCompanyId,
        })),
      me,
      (prime) => mayNameSubVendors(terms, me, prime)
    )
    for (const c of below) {
      if (seen.get(c.companyId)?.masked === false) ids.add(c.companyId)
    }
  }
  for (const c of buys) { ids.add(c.companyId); if (c.vendorCompanyId) ids.add(c.vendorCompanyId) }
  for (const i of invitations) { ids.add(i.fromCompanyId); ids.add(i.toCompanyId) }
  for (const s of seats) { ids.add(s.officeCompanyId); ids.add(s.clientCompanyId) }

  // A sandbox and a real book are separate universes, whatever else is
  // true: a visitor must never read a customer's name and a customer
  // must never read a stranger's sandbox. Dealings never cross the line
  // today; this is the belt on top of the braces.
  if (!includesOwn) ids.delete(me)
  return ids
}
