/**
 * The one writer of a commission row (`ContractCommission`).
 *
 * The schema cannot say "exactly one of the sell line and the buy line" or
 * "exactly one of a share and a fixed figure"; this does, in a sentence
 * per refusal (`checkCommission`), and then what only the record can
 * answer:
 *
 *   - the line is at the setter's own firm (a client never sets, or
 *     reads, a supplier's commission);
 *   - the setter is the Owner or a Contract Manager there;
 *   - whoever earns it holds a live seat at that firm: a commission is the
 *     firm's pay to its own people, and a person at another company never
 *     earns one here.
 *
 * The award's default rows go through `writeDefaultCommissions`, which
 * keeps every check but the setter's role: the award is not the Owner
 * editing a line, it is the firm's own setting applied, and the rows say
 * so in their reason.
 */

import { prisma } from '@/lib/db'
import {
  checkCommission, maySetCommission, defaultsFrom, defaultCommissionRows,
  type CommissionDraft, type CommissionTerms, type AwardFacts, type DefaultRows,
} from '@/lib/money/commission-rows'
import { storedFrom, defaultFitsLine } from '@/lib/money/commission-defaults'

export type WriteResult =
  | { ok: true; id: string; terms: CommissionTerms }
  | { ok: false; status: 403 | 404 | 422; field: string | null; says: string }

export interface Setter {
  personId: string
  companyId: string | null
  companyName: string
  roleName: string | null
}

async function lineCompany(terms: Pick<CommissionTerms, 'sellContractId' | 'buyContractId'>): Promise<string | null> {
  if (terms.sellContractId) {
    return (await prisma.sellContract.findUnique({ where: { id: terms.sellContractId }, select: { companyId: true } }))?.companyId ?? null
  }
  return (await prisma.buyContract.findUnique({ where: { id: terms.buyContractId! }, select: { companyId: true } }))?.companyId ?? null
}

async function seatedAt(personId: string, companyId: string): Promise<{ name: string } | null> {
  const seat = await prisma.context.findFirst({
    where: { personId, companyId, revokedAt: null },
    select: { person: { select: { name: true } } },
  })
  return seat ? { name: seat.person.name } : null
}

/**
 * Set a commission on a line, or change one (`id`). Every refusal names
 * the field it is about where there is one.
 */
export async function setCommission(draft: CommissionDraft & { id?: string | null }, setter: Setter): Promise<WriteResult> {
  const shape = checkCommission(draft)
  if (!shape.ok) return { ok: false, status: 422, field: shape.field, says: shape.says }
  const terms = shape.terms

  const companyId = await lineCompany(terms)
  if (!companyId) return { ok: false, status: 404, field: null, says: 'That line is not on the record.' }
  const refused = maySetCommission({ roleName: setter.roleName, callerCompanyId: setter.companyId, lineCompanyId: companyId, companyName: setter.companyName })
  if (refused) return { ok: false, status: 403, field: null, says: refused }

  if (!(await seatedAt(terms.earnedById, companyId))) {
    return { ok: false, status: 422, field: 'earnedById', says: `Whoever earns a commission works at ${setter.companyName}. Choose somebody seated here.` }
  }

  const data = {
    companyId,
    sellContractId: terms.sellContractId, buyContractId: terms.buyContractId,
    earnedById: terms.earnedById, kind: terms.kind, basis: terms.basis,
    rateBps: terms.rateBps, amountCents: terms.amountCents, capCents: terms.capCents,
    fromDate: terms.fromDate, toDate: terms.toDate, accrueOn: terms.accrueOn,
    setById: setter.personId, setAt: new Date(), reason: terms.reason,
  }

  if (draft.id) {
    const existing = await prisma.contractCommission.findFirst({ where: { id: draft.id, companyId }, select: { id: true, sellContractId: true, buyContractId: true } })
    if (!existing) return { ok: false, status: 404, field: null, says: `There is no such commission at ${setter.companyName}.` }
    if (existing.sellContractId !== terms.sellContractId || existing.buyContractId !== terms.buyContractId) {
      return { ok: false, status: 422, field: null, says: 'A commission stays on the line it was set on. End this one and set a new one on the other line.' }
    }
    const row = await prisma.contractCommission.update({ where: { id: existing.id }, data, select: { id: true } })
    return { ok: true, id: row.id, terms }
  }
  const row = await prisma.contractCommission.create({ data, select: { id: true } })
  return { ok: true, id: row.id, terms }
}

/**
 * The rows the award writes from the firm's own defaults, before writing.
 * Demand's award route calls this with who sold and who recruited; a firm
 * with no defaults (the shipped default) gets no rows. Reads
 * `Company.commissionDefaults` and nothing else.
 */
export async function defaultCommissionRowsFor(companyId: string, award: AwardFacts): Promise<DefaultRows> {
  const co = await prisma.company.findUnique({ where: { id: companyId }, select: { commissionDefaults: true } })
  return defaultCommissionRows(defaultsFrom(co?.commissionDefaults ?? null), award)
}

/**
 * Write the award's default rows. Each is checked as a person's would be,
 * except for the setter's role; an earner not seated at the firm is left
 * out and said, never written.
 */
export async function writeDefaultCommissions(companyId: string, award: AwardFacts): Promise<{ written: string[]; notWritten: string[] }> {
  const co = await prisma.company.findUnique({ where: { id: companyId }, select: { commissionDefaults: true } })
  const json = co?.commissionDefaults ?? null
  const { rows, notWritten } = defaultCommissionRows(defaultsFrom(json), award)
  // Who set each default, and the currency of a fixed amount or a cap
  // (lib/money/commission-defaults). A share fits a line in any currency;
  // a fixed figure only a line in its own.
  const stored = storedFrom(json)
  const written: string[] = []
  for (const t of rows) {
    const shape = checkCommission(t)
    if (!shape.ok) { notWritten.push(shape.says); continue }
    const line = await lineOf(t)
    if (line?.companyId !== companyId) { notWritten.push('A default commission was not written: the line is not this firm’s.'); continue }
    const misfit = defaultFitsLine(t.kind, stored[t.kind] ?? t, line.currency)
    if (misfit) { notWritten.push(misfit); continue }
    if (!(await seatedAt(t.earnedById, companyId))) { notWritten.push('A default commission was not written: whoever would earn it is not seated at the firm.'); continue }
    const row = await prisma.contractCommission.create({
      data: { companyId, ...t, setById: award.setById, setAt: new Date() },
      select: { id: true },
    })
    written.push(row.id)
  }
  return { written, notWritten }
}

/** The line's firm and the currency it bills or pays in. */
async function lineOf(terms: Pick<CommissionTerms, 'sellContractId' | 'buyContractId'>): Promise<{ companyId: string; currency: string | null } | null> {
  if (terms.sellContractId) {
    const s = await prisma.sellContract.findUnique({ where: { id: terms.sellContractId }, select: { companyId: true, billCurrency: true } })
    return s ? { companyId: s.companyId, currency: s.billCurrency ?? null } : null
  }
  const b = await prisma.buyContract.findUnique({ where: { id: terms.buyContractId! }, select: { companyId: true, payCurrency: true } })
  return b ? { companyId: b.companyId, currency: b.payCurrency ?? null } : null
}

/**
 * Who may read a line's commissions, and whose. The firm's: the Owner, a
 * Contract Manager (they set them) and whoever reads payroll. Anyone else
 * at the firm reads only their own rows. Anybody at another firm, a client
 * first, reads nothing. Pure.
 */
export function commissionReader(args: {
  callerCompanyId: string | null
  lineCompanyId: string | null
  roleName: string | null
  readsPayroll: boolean
}): 'FIRM' | 'OWN' | 'NONE' {
  if (!args.callerCompanyId || args.callerCompanyId !== args.lineCompanyId) return 'NONE'
  if (args.readsPayroll || args.roleName === 'Owner' || args.roleName === 'Contract Manager') return 'FIRM'
  return 'OWN'
}
