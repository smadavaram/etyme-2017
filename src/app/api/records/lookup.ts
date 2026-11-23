import { prisma } from '@/lib/db'
import { invoiceBetween } from '@/lib/money/invoice-parties'
import type { RecordType, ProofType } from '@/lib/decision-queue'
import { amountsOf, periodWords } from '@/lib/money/money-chain'
import { historySays, monthKeyOf, placementHref, seeMonth, stateLabel } from '@/lib/money-loop'
import { money } from '@/lib/order'
import { formatDay } from '@/lib/format-date'

/**
 * Which records are on a firm's book, by type (record 107, A2's proof
 * picker and A6's record view). One where-clause per type, read by both,
 * so the picker never offers a record the view would refuse.
 *
 *  - a company: the firm itself, or one on its own register;
 *  - a contract: a sell line the firm sells, buys or is the end client of;
 *  - a person: somebody seated at the firm, or on one of its contracts;
 *  - an invoice receipt: one the firm pays or issued;
 *  - a bill: one the firm is a party to (`invoiceBetween`);
 *  - a decision: one of the firm's own;
 *  - a consultant's month from timesheet to payment: one of the firm's own.
 */
function onBook(companyId: string, type: RecordType): Record<string, unknown> {
  switch (type) {
    case 'Company': return { OR: [{ id: companyId }, { counterpartyOf: { some: { companyId } } }] }
    case 'SellContract': return { OR: [{ companyId }, { clientCompanyId: companyId }, { endClientCompanyId: companyId }] }
    case 'Person': return {
      OR: [
        { contexts: { some: { companyId, revokedAt: null } } },
        { sellContracts: { some: { OR: [{ companyId }, { clientCompanyId: companyId }, { endClientCompanyId: companyId }] } } },
      ],
    }
    case 'VendorBill': return { OR: [{ companyId }, { vendorCompanyId: companyId }] }
    case 'Invoice': return invoiceBetween(companyId)
    case 'DecisionItem': return { companyId }
    case 'MoneyChain': return { companyId }
    case 'AgentTask': return { companyId }
    case 'AgentSwitch': return { companyId }
  }
}

type Named = { id: string; name: string }

/** One record on the firm's book, with the name a person reads; null when it is not on the book. */
export async function findOnBook(companyId: string, type: RecordType, id: string): Promise<Named | null> {
  const where = { AND: [{ id }, onBook(companyId, type)] } as any
  switch (type) {
    case 'Company': {
      const r = await prisma.company.findFirst({ where, select: { id: true, name: true } })
      return r
    }
    case 'SellContract': {
      const r = await prisma.sellContract.findFirst({ where, select: { id: true, person: { select: { name: true } }, clientCompany: { select: { name: true } } } })
      return r ? { id: r.id, name: `${r.person.name} at ${r.clientCompany.name}` } : null
    }
    case 'Person': {
      const r = await prisma.person.findFirst({ where, select: { id: true, name: true } })
      return r
    }
    case 'VendorBill': {
      const r = await prisma.vendorBill.findFirst({ where, select: { id: true, number: true, vendorCompany: { select: { name: true } } } })
      return r ? { id: r.id, name: `Invoice receipt ${r.number} from ${r.vendorCompany.name}` } : null
    }
    case 'Invoice': {
      const r = await prisma.invoice.findFirst({ where, select: { id: true, number: true } })
      return r ? { id: r.id, name: `Bill ${r.number}` } : null
    }
    case 'DecisionItem': {
      const r = await prisma.decisionItem.findFirst({ where, select: { id: true, question: true } })
      return r ? { id: r.id, name: r.question } : null
    }
    case 'AgentSwitch': {
      const r = await prisma.agentSwitch.findFirst({ where, select: { id: true, agentKey: true } })
      return r ? { id: r.id, name: `Switch for ${r.agentKey}` } : null
    }
    case 'AgentTask': {
      const r = await prisma.agentTask.findFirst({ where, select: { id: true, kind: true, decision: { select: { question: true } } } })
      return r ? { id: r.id, name: r.decision.question } : null
    }
    case 'MoneyChain': {
      const r = await prisma.moneyChain.findFirst({ where, select: { id: true, periodStart: true, periodEnd: true, person: { select: { name: true } } } })
      return r ? { id: r.id, name: `${r.person.name}, ${periodWords(r)}` } : null
    }
  }
}

/** Where a consultant's month is worked: that placement's month page, and whose month it is. Null where there is no such month. */
export async function monthPageOf(id: string): Promise<{ href: string; words: string; personId: string } | null> {
  const r = await prisma.moneyChain.findUnique({ where: { id }, select: { sellContractId: true, personId: true, periodStart: true, periodEnd: true } })
  return r ? { href: placementHref(r.sellContractId, monthKeyOf(r.periodStart)), words: seeMonth(periodWords(r)), personId: r.personId } : null
}

/** Whose data a refused read was about, for the access log: the record's own firm or person, else null. */
export async function subjectOf(type: RecordType, id: string): Promise<{ companyId: string } | { personId: string } | null> {
  switch (type) {
    case 'Company': return (await prisma.company.findUnique({ where: { id }, select: { id: true } })) ? { companyId: id } : null
    case 'Person': return (await prisma.person.findUnique({ where: { id }, select: { id: true } })) ? { personId: id } : null
    case 'SellContract': {
      const r = await prisma.sellContract.findUnique({ where: { id }, select: { personId: true } })
      return r ? { personId: r.personId } : null
    }
    case 'VendorBill': {
      const r = await prisma.vendorBill.findUnique({ where: { id }, select: { companyId: true } })
      return r ? { companyId: r.companyId } : null
    }
    case 'Invoice': {
      const r = await prisma.invoice.findUnique({ where: { id }, select: { payerId: true, soldToId: true } })
      const firm = r?.payerId ?? r?.soldToId
      return firm ? { companyId: firm } : null
    }
    case 'DecisionItem': {
      const r = await prisma.decisionItem.findUnique({ where: { id }, select: { companyId: true } })
      return r ? { companyId: r.companyId } : null
    }
    case 'AgentSwitch': {
      const r = await prisma.agentSwitch.findUnique({ where: { id }, select: { companyId: true } })
      return r ? { companyId: r.companyId } : null
    }
    case 'AgentTask': {
      const r = await prisma.agentTask.findUnique({ where: { id }, select: { companyId: true } })
      return r ? { companyId: r.companyId } : null
    }
    case 'MoneyChain': {
      const r = await prisma.moneyChain.findUnique({ where: { id }, select: { personId: true } })
      return r ? { personId: r.personId } : null
    }
  }
}

/** Records of one type on the firm's book, for the proof picker, matching a few typed letters. */
export async function recordsOnBook(companyId: string, type: ProofType, q: string, take = 20): Promise<Named[]> {
  const words = q.trim()
  const base = onBook(companyId, type)
  switch (type) {
    case 'Company':
      return prisma.company.findMany({ where: { AND: [base, words ? { name: { contains: words, mode: 'insensitive' } } : {}] } as any, select: { id: true, name: true }, orderBy: { name: 'asc' }, take })
    case 'Person':
      return prisma.person.findMany({ where: { AND: [base, words ? { name: { contains: words, mode: 'insensitive' } } : {}] } as any, select: { id: true, name: true }, orderBy: { name: 'asc' }, take })
    case 'SellContract': {
      const rows = await prisma.sellContract.findMany({
        where: { AND: [base, words ? { person: { name: { contains: words, mode: 'insensitive' } } } : {}] } as any,
        select: { id: true, person: { select: { name: true } }, clientCompany: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take,
      })
      return rows.map((r) => ({ id: r.id, name: `${r.person.name} at ${r.clientCompany.name}` }))
    }
    case 'VendorBill': {
      const rows = await prisma.vendorBill.findMany({
        where: { AND: [base, words ? { number: { contains: words, mode: 'insensitive' } } : {}] } as any,
        select: { id: true, number: true, vendorCompany: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take,
      })
      return rows.map((r) => ({ id: r.id, name: `Invoice receipt ${r.number} from ${r.vendorCompany.name}` }))
    }
    case 'Invoice': {
      const rows = await prisma.invoice.findMany({
        where: { AND: [base, words ? { number: { contains: words, mode: 'insensitive' } } : {}] } as any,
        select: { id: true, number: true }, orderBy: { number: 'desc' }, take,
      })
      return rows.map((r) => ({ id: r.id, name: `Bill ${r.number}` }))
    }
  }
}

export interface Fact { label: string; value: string }

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null)

/**
 * A record's own key fields, drawn above its history on the record view
 * (A6): its name, the parties and its dates. Read only after `findOnBook`
 * found it on the firm's book. Days are calendar days (YYYY-MM-DD); the
 * screen writes them out.
 */
export async function factsOf(type: RecordType, id: string): Promise<Fact[]> {
  const f = (label: string, value: string | null | undefined): Fact[] => (value ? [{ label, value }] : [])
  switch (type) {
    case 'Company': {
      const r = await prisma.company.findUnique({ where: { id }, select: { name: true, createdAt: true } })
      return r ? [...f('Name', r.name), ...f('On Etyme since', day(r.createdAt))] : []
    }
    case 'Person': {
      const r = await prisma.person.findUnique({ where: { id }, select: { name: true } })
      return r ? f('Name', r.name) : []
    }
    case 'SellContract': {
      const r = await prisma.sellContract.findUnique({
        where: { id },
        select: { state: true, startDate: true, endDate: true, person: { select: { name: true } }, company: { select: { name: true } }, clientCompany: { select: { name: true } }, endClientCompany: { select: { name: true } } },
      })
      return r ? [
        ...f('Consultant', r.person.name), ...f('Supplier', r.company.name), ...f('Client', r.clientCompany.name),
        ...f('Works at', r.endClientCompany?.name), ...f('Starts', day(r.startDate)), ...f('Ends', day(r.endDate)),
      ] : []
    }
    case 'VendorBill': {
      const r = await prisma.vendorBill.findUnique({ where: { id }, select: { number: true, receivedAt: true, dueAt: true, vendorCompany: { select: { name: true } } } })
      return r ? [...f('Their number', r.number), ...f('From', r.vendorCompany.name), ...f('Received', day(r.receivedAt)), ...f('Due', day(r.dueAt))] : []
    }
    case 'Invoice': {
      const r = await prisma.invoice.findUnique({ where: { id }, select: { number: true, issuedAt: true, dueAt: true } })
      return r ? [...f('Number', r.number), ...f('Sent', day(r.issuedAt)), ...f('Due', day(r.dueAt))] : []
    }
    case 'DecisionItem': {
      const r = await prisma.decisionItem.findUnique({ where: { id }, select: { question: true, openedOn: true, state: true, ownerPerson: { select: { name: true } } } })
      return r ? [...f('Question', r.question), ...f('Owed by', r.ownerPerson.name), ...f('Opened', day(r.openedOn))] : []
    }
    case 'AgentSwitch': {
      const r = await prisma.agentSwitch.findUnique({ where: { id }, select: { agentKey: true, state: true, dailyCap: true } })
      return r ? [...f('Agent', r.agentKey), ...f('Switch', r.state === 'ON' ? 'On' : r.state === 'DRAFT_ONLY' ? 'Drafts only' : 'Off'), ...f('Daily cap', r.dailyCap === null ? 'None' : String(r.dailyCap))] : []
    }
    case 'AgentTask': {
      const r = await prisma.agentTask.findUnique({ where: { id }, select: { agentKey: true, kind: true, state: true, sentCount: true, closedReason: true } })
      return r ? [...f('Agent', r.agentKey), ...f('Kind', r.kind), ...f('State', r.state), ...f('Sent', String(r.sentCount)), ...f('Closed because', r.closedReason)] : []
    }
    case 'MoneyChain': {
      // Read only after the route found a seat that reads payroll: these are the amounts people stated.
      const r = await prisma.moneyChain.findUnique({ where: { id }, include: { person: { select: { name: true } }, sellContract: { select: { clientCompany: { select: { name: true } } } } } })
      if (!r) return []
      const a = amountsOf(r)
      const stated = (s: { cents: number; currency: string } | null) => (s ? money(s.cents, s.currency) : 'Not stated yet')
      return [
        ...f('Consultant', r.person.name), ...f('Client', r.sellContract.clientCompany.name), ...f('Month', periodWords(r)),
        ...f('State', stateLabel(r.state)), ...f('Stated on the timesheet', stated(a.timesheet)), ...f('Invoiced', stated(a.invoiced)), ...f('Paid', stated(a.paid)),
        ...f('History', r.source && r.asOf ? historySays(r.source, formatDay(r.asOf)) : null),
      ]
    }
  }
}
