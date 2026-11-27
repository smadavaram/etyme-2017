/**
 * A tenant's own statement: what its edition would charge, the day it is on,
 * and what is due. A statement, never a payment (Etyme never moves money).
 * The pure part is `statementOf`; `readOwnStatement` reads the record.
 */
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { invoicesRaisedBy } from '@/lib/money/invoice-parties'
import { amount } from '@/lib/money-display'
import { onSiteOf, headcount } from '@/app/api/program/figures'
import {
  editionCharge, runsOwnBusiness, trialOf, usageAfterPrepay, USAGE_SAYS,
  type EditionCharge, type PricedEdition, type TrialState,
} from '@/lib/money/pricing'

export interface Statement {
  edition: PricedEdition
  trial: TrialState
  activeContractors: number
  ownBusiness: { placements: number; invoices: number; pays: boolean }
  /** What the edition comes to; null where the headcount is not a count. */
  charge: EditionCharge | null
  /** Due this month: nothing on trial, before activation, exempt or free; the month's charge once paying. Null where unknown. */
  dueMonthlyCents: number | null
  prepaid: boolean
  usage: { cents: number | null; says: string }
  says: string
}

export function statementOf(i: {
  edition: PricedEdition
  activatedAt: Date | null
  paidThrough: Date | null
  billingExempt: boolean
  annualPrepaid: boolean
  activeContractors: number
  placements: number
  invoices: number
  now: Date
}): Statement {
  const trial = trialOf(i)
  const charge = editionCharge(i.edition, i.activeContractors)
  const owes = trial.state === 'PAID' || trial.state === 'UNPAID'
  const dueMonthlyCents = charge == null ? null : owes ? charge.monthlyCents : 0
  const money = (c: EditionCharge | null) => (c ? amount(c.monthlyCents) : 'not known')
  const says =
    trial.state === 'FREE_USER' ? 'A free user inside another firm’s record. Nothing is due.'
    : trial.state === 'EXEMPT' ? 'An internal proving tenant. Nothing is due.'
    : trial.state === 'TRIAL' ? `Day ${trial.day} of 60, free. After day 60 this comes to ${money(charge)} a month.`
    : trial.state === 'NO_CLOCK' ? `Not activated yet, so the 60 days have not started. After them: ${money(charge)} a month.`
    : trial.state === 'PAID' ? `Paid through ${trial.paidThrough.toISOString().slice(0, 10)}. ${money(charge)} a month.`
    : `Day ${trial.day}: the 60 days are over and nothing is paid. ${money(charge)} a month is owed; the tenant is read-only until it is recorded as paid.`
  return {
    edition: i.edition,
    trial,
    activeContractors: i.activeContractors,
    ownBusiness: { placements: i.placements, invoices: i.invoices, pays: runsOwnBusiness(i.placements, i.invoices) },
    charge,
    dueMonthlyCents,
    prepaid: i.annualPrepaid,
    usage: { cents: usageAfterPrepay(null, i.annualPrepaid), says: USAGE_SAYS },
    says,
  }
}

/**
 * Reads the tenant's own record. Active contractors are people, one each,
 * on a line in progress: those a supplier sells (Starter) or those on site
 * at an Enterprise client, by the one on-site definition (`onSiteOf`).
 */
export async function readOwnStatement(companyId: string, now: Date = new Date()): Promise<Statement | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { edition: true, activatedAt: true, paidThrough: true, billingExempt: true, annualPrepaid: true },
  })
  if (!company) return null
  const side = company.edition === 'ENTERPRISE' ? { clientCompanyId: companyId } : { companyId }
  const [lines, placements, invoices] = await Promise.all([
    prisma.sellContract.findMany({ where: side, select: { id: true, personId: true, companyId: true, clientCompanyId: true, state: true, billRate: true, billCurrency: true } }),
    prisma.sellContract.count({ where: { companyId, state: { not: 'DRAFT' } } }),
    prisma.invoice.count({
      where: { issuedAt: { not: null }, ...(invoicesRaisedBy(companyId) as Prisma.InvoiceWhereInput) },
    }),
  ])
  const { activeContractors } = headcount(lines, onSiteOf(lines))
  return statementOf({ ...company, activeContractors, placements, invoices, now })
}
