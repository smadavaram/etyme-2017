import { prisma } from '@/lib/db'

/**
 * The firms a company buys from directly — its own supplier register.
 *
 * The same union `GET /api/suppliers` draws: an agreement with the firm,
 * a standing set on it, an invitation sent to it, a contract it bills
 * this company on, or an onboarding this company approved. A firm this
 * company reaches only through a prime is none of those — its contract is
 * with the prime — so it is never here.
 *
 * Read by the release door, which sent Northbend Athletic's job to
 * whatever id it was handed: the panel offered Techpeple, Computer
 * Systems' sub-vendor, out of the whole company directory, and the door
 * took it. A sub-vendor's name is the prime's to keep (CLAUDE.md,
 * 2026-09-17), and a job sent to it would be the client going round the
 * prime.
 */
export async function directSupplierIds(companyId: string): Promise<Set<string>> {
  const [agreements, standings, invites, lines, approved] = await Promise.all([
    prisma.masterAgreement.findMany({ where: { clientId: companyId }, select: { vendorId: true } }),
    prisma.counterparty.findMany({
      where: { companyId, relationship: 'SUPPLIER' },
      select: { otherCompanyId: true },
    }),
    prisma.supplierInvite.findMany({ where: { byId: companyId, state: { not: 'REVOKED' } }, select: { companyId: true } }),
    prisma.sellContract.findMany({ where: { clientCompanyId: companyId }, select: { companyId: true }, distinct: ['companyId'] }),
    prisma.supplierRequest.findMany({
      where: { companyId, state: 'APPROVED', firmCompanyId: { not: null } },
      select: { firmCompanyId: true },
    }),
  ])
  return new Set<string>([
    ...agreements.map((a) => a.vendorId),
    ...standings.map((s) => s.otherCompanyId!).filter(Boolean),
    ...invites.map((i) => i.companyId),
    ...lines.map((l) => l.companyId),
    ...approved.map((r) => r.firmCompanyId!).filter(Boolean),
  ])
}

/**
 * The firms a company reaches only through somebody else: a firm with a
 * contract for work at this company's sites, billed to a firm other than
 * this company, and no direct relationship of its own. In a chain that
 * is the prime's sub-vendor — the name the prime keeps.
 *
 * A firm with no history here at all is not in this set: it is simply
 * new, and releasing to a new firm is the program office's call.
 */
export async function reachedOnlyThrough(companyId: string): Promise<Set<string>> {
  const [below, own] = await Promise.all([
    prisma.sellContract.findMany({
      where: { endClientCompanyId: companyId, clientCompanyId: { not: companyId } },
      select: { companyId: true },
      distinct: ['companyId'],
    }),
    directSupplierIds(companyId),
  ])
  return new Set(below.map((b) => b.companyId).filter((id) => !own.has(id)))
}

/**
 * Which of these firms this company already deals with, read from facts
 * the other firm took part in: a row on this company's own register at
 * one of `positions`, an agreement between the two, the other firm's
 * register naming this one, an order or a contract line between them, or
 * a job the other firm sent this one.
 *
 * Why not `workTogether` as it stands: it counts a job sent either way,
 * and a job this company sent is a row this company wrote alone. Counted,
 * one send to a stranger made the stranger "worked with" for every later
 * gate (review, 2026-11-13). So here only the other firm's own job counts;
 * the rest are `workTogether`'s clauses read the same way.
 *
 * Why the own register row counts: every door that writes this company's
 * own row for a firm on Etyme checks first (the paste door and Extend
 * read `workTogether`, a supplier approval needs the firm's own part in
 * it, a trade-link yes writes both rows), so the row is history this
 * company earned. A firm it recorded itself that the firm later claimed
 * keeps that row, and keeps being its supplier.
 *
 * Read by every demand door that writes on another firm's books or sends
 * it something: a job sent down (distribute, the send on approval), a
 * person sent up (send on), and an approval that would tie a firm to a
 * client. A firm in none of these is answered as if it were not there.
 */
export async function dealsWith(me: string, firmIds: readonly string[], positions: readonly string[]): Promise<Set<string>> {
  const ids = [...new Set(firmIds)].filter((id) => id !== me)
  if (ids.length === 0) return new Set()
  const pair = <T extends string>(x: T, y: T) => [{ [x]: me, [y]: { in: ids } }, { [x]: { in: ids }, [y]: me }]
  const [own, theirs, agreements, orders, lines, jobs] = await Promise.all([
    prisma.counterparty.findMany({
      where: { companyId: me, otherCompanyId: { in: ids }, relationship: { in: [...positions] } },
      select: { otherCompanyId: true },
    }),
    prisma.counterparty.findMany({ where: { companyId: { in: ids }, otherCompanyId: me }, select: { companyId: true } }),
    prisma.masterAgreement.findMany({ where: { OR: pair('vendorId', 'clientId') }, select: { vendorId: true, clientId: true } }),
    prisma.workOrder.findMany({ where: { OR: pair('issuedById', 'issuedToId') }, select: { issuedById: true, issuedToId: true } }),
    prisma.sellContract.findMany({ where: { OR: pair('companyId', 'clientCompanyId') }, select: { companyId: true, clientCompanyId: true } }),
    // Only a job the other firm sent this one: never this company's own send.
    prisma.requirementInvitation.findMany({
      where: { toCompanyId: me, requirement: { companyId: { in: ids } } },
      select: { requirement: { select: { companyId: true } } },
    }),
  ])
  const out = new Set<string>()
  const add = (id: string | null | undefined) => { if (id && id !== me && ids.includes(id)) out.add(id) }
  for (const r of own) add(r.otherCompanyId)
  for (const r of theirs) add(r.companyId)
  for (const a of agreements) { add(a.vendorId); add(a.clientId) }
  for (const o of orders) { add(o.issuedById); add(o.issuedToId) }
  for (const l of lines) { add(l.companyId); add(l.clientCompanyId) }
  for (const j of jobs) add(j.requirement.companyId)
  return out
}
