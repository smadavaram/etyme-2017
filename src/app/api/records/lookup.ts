import { prisma } from '@/lib/db'
import { invoiceBetween } from '@/lib/money/invoice-parties'
import type { RecordType, ProofType } from '@/lib/decision-queue'

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
 *  - a decision: one of the firm's own.
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
  }
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
