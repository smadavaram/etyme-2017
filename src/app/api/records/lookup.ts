import { prisma } from '@/lib/db'
import { invoiceBetween } from '@/lib/money/invoice-parties'
import { agentNameOf, type RecordType, type ProofType } from '@/lib/decision-queue'
import { amountsOf, periodWords } from '@/lib/money/money-chain'
import { historySays, monthKeyOf, placementHref, seeMonth, stateLabel } from '@/lib/money-loop'
import { money } from '@/lib/order'
import { formatDay } from '@/lib/format-date'
import { amount } from '@/lib/money-display'
import { daySpan } from '@/lib/plain-date'
import { kindWords, petitionWords } from '@/lib/agents/checklist-rules'
import { agentTaskName } from '@/lib/decision-queue'
import { weekWords } from '@/lib/notify/timesheet-chase-letter'
import { grossSays, peopleIn, type DraftRow } from '@/lib/money/payroll-draft'

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
    // A contact: only the firm's own rolodex row.
    case 'CompanyContact': return { companyId }
    case 'SellContract': return { OR: [{ companyId }, { clientCompanyId: companyId }, { endClientCompanyId: companyId }] }
    // A job: the firm's own, one it is the end client of, or one sent to it.
    case 'Requirement': return { OR: [{ companyId }, { endClientCompanyId: companyId }, { invitations: { some: { toCompanyId: companyId } } }] }
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
    case 'SkillTarget': return { companyId }
    // The firm's own paperwork, offers, confirmations and drafts: each carries the firm that keeps it.
    // An offer is the buyer's paper, and the supplier whose person it is to reads it once it is made, never a draft (the offer route's own rule).
    case 'Offer': return { OR: [{ companyId }, { state: { not: 'DRAFT' }, submission: { fromCompanyId: companyId } }] }
    case 'ChecklistItem':
    case 'Petition':
    case 'NoticePosting':
    case 'PublicAccessFile':
    case 'SubmissionConfirmation':
    case 'PayrollDraft':
    case 'Proposal':
    case 'DiversityRegistration': return { companyId }
  }
}

type Named = { id: string; name: string }

const personName = async (id: string) => (await prisma.person.findUnique({ where: { id }, select: { name: true } }))?.name ?? 'A person'
const plainKind = (k: string) => { const t = k.toLowerCase().replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1) }

/** What a chase task is about, in words: the bill, or the person and the week. Null where the kind says nothing more. */
async function taskAbout(t: { kind: string; recordType: string; recordId: string }): Promise<string | null> {
  if (t.kind === 'MONEY_OWED_CHASE' && t.recordType === 'Invoice') {
    const b = await prisma.invoice.findUnique({ where: { id: t.recordId }, select: { number: true } })
    return b ? `Chase of bill ${b.number}` : null
  }
  if (t.kind === 'SUBMISSION_CHASE' && t.recordType === 'Submission') {
    const s = await prisma.submission.findUnique({ where: { id: t.recordId }, select: { person: { select: { name: true } }, requirement: { select: { title: true } } } })
    return s ? `Chase of ${s.person.name}'s submission for ${s.requirement.title}` : null
  }
  if (t.kind === 'ESCALATION' && t.recordType === 'Invoice') {
    const b = await prisma.invoice.findUnique({ where: { id: t.recordId }, select: { number: true } })
    return b ? `Final notice for bill ${b.number}` : null
  }
  if (t.kind === 'TIMESHEET_CHASE' && t.recordType === 'Cycle') {
    const c = await prisma.cycle.findUnique({ where: { id: t.recordId }, select: { periodStart: true, periodEnd: true, dueOn: true, sellContract: { select: { person: { select: { name: true } } } } } })
    if (!c?.sellContract) return null
    return `Timesheet chase for ${c.sellContract.person.name}, week of ${c.periodStart && c.periodEnd ? weekWords(c.periodStart, c.periodEnd) : weekWords(c.dueOn, c.dueOn)}`
  }
  return null
}

/** One record on the firm's book, with the name a person reads; null when it is not on the book. */
export async function findOnBook(companyId: string, type: RecordType, id: string): Promise<Named | null> {
  const where = { AND: [{ id }, onBook(companyId, type)] } as any
  switch (type) {
    case 'Company': {
      const r = await prisma.company.findFirst({ where, select: { id: true, name: true } })
      return r
    }
    case 'CompanyContact': {
      const r = await prisma.companyContact.findFirst({ where, select: { id: true, name: true, atCompany: { select: { name: true } } } })
      return r ? { id: r.id, name: `${r.name} at ${r.atCompany.name}` } : null
    }
    case 'SellContract': {
      const r = await prisma.sellContract.findFirst({ where, select: { id: true, person: { select: { name: true } }, clientCompany: { select: { name: true } } } })
      return r ? { id: r.id, name: `${r.person.name} at ${r.clientCompany.name}` } : null
    }
    case 'Person': {
      const r = await prisma.person.findFirst({ where, select: { id: true, name: true } })
      return r
    }
    case 'Requirement': {
      const r = await prisma.requirement.findFirst({ where, select: { id: true, title: true } })
      return r ? { id: r.id, name: r.title } : null
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
      return r ? { id: r.id, name: `${agentNameOf(r.agentKey)} switch` } : null
    }
    case 'SkillTarget': {
      const r = await prisma.skillTarget.findFirst({ where, select: { id: true, subjectKey: true } })
      return r ? { id: r.id, name: `Target for ${r.subjectKey}` } : null
    }
    case 'AgentTask': {
      const r = await prisma.agentTask.findFirst({ where, select: { id: true, kind: true, agentKey: true, recordType: true, recordId: true } })
      // The task's own name, never the question its card asks (the card already says that).
      return r ? { id: r.id, name: agentTaskName(r.agentKey, await taskAbout(r)) } : null
    }
    case 'Offer': {
      const r = await prisma.offer.findFirst({ where, select: { id: true, submission: { select: { person: { select: { name: true } } } } } })
      return r ? { id: r.id, name: `Offer to ${r.submission.person.name}` } : null
    }
    case 'SubmissionConfirmation': {
      const r = await prisma.submissionConfirmation.findFirst({ where, select: { id: true, submission: { select: { person: { select: { name: true } } } } } })
      return r ? { id: r.id, name: `Confirmation for ${r.submission.person.name}` } : null
    }
    case 'ChecklistItem': {
      const r = await prisma.checklistItem.findFirst({ where, select: { id: true, label: true } })
      return r ? { id: r.id, name: r.label } : null
    }
    case 'Petition': {
      const r = await prisma.petition.findFirst({ where, select: { id: true, personId: true, kind: true } })
      return r ? { id: r.id, name: `${await personName(r.personId)}’s ${petitionWords(r.kind)}` } : null
    }
    case 'NoticePosting': {
      const r = await prisma.noticePosting.findFirst({ where, select: { id: true, kind: true, postedOn: true } })
      return r ? { id: r.id, name: `${plainKind(r.kind)} notice posted ${day(r.postedOn)}` } : null
    }
    case 'PublicAccessFile': {
      const r = await prisma.publicAccessFile.findFirst({ where, select: { id: true, petition: { select: { personId: true, kind: true } } } })
      return r ? { id: r.id, name: `Public access file for ${await personName(r.petition.personId)}’s ${petitionWords(r.petition.kind)}` } : null
    }
    case 'PayrollDraft': {
      const r = await prisma.payrollDraft.findFirst({ where, select: { id: true, periodStart: true, periodEnd: true } })
      return r ? { id: r.id, name: `Payroll draft for ${daySpan(day(r.periodStart)!, day(r.periodEnd)!)}` } : null
    }
    case 'Proposal': {
      const r = await prisma.proposal.findFirst({ where, select: { id: true, title: true } })
      return r ? { id: r.id, name: r.title } : null
    }
    case 'DiversityRegistration': {
      const r = await prisma.diversityRegistration.findFirst({ where, select: { id: true, buyerName: true } })
      return r ? { id: r.id, name: `Supplier-diversity registration for ${r.buyerName}` } : null
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
    case 'CompanyContact': return ownerFirm(await prisma.companyContact.findUnique({ where: { id }, select: { companyId: true } }))
    case 'Person': return (await prisma.person.findUnique({ where: { id }, select: { id: true } })) ? { personId: id } : null
    case 'Requirement': return ownerFirm(await prisma.requirement.findUnique({ where: { id }, select: { companyId: true } }))
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
    case 'SkillTarget': {
      const r = await prisma.skillTarget.findUnique({ where: { id }, select: { companyId: true } })
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
    case 'Offer': return ownerFirm(await prisma.offer.findUnique({ where: { id }, select: { companyId: true } }))
    case 'SubmissionConfirmation': return ownerFirm(await prisma.submissionConfirmation.findUnique({ where: { id }, select: { companyId: true } }))
    case 'ChecklistItem': return ownerFirm(await prisma.checklistItem.findUnique({ where: { id }, select: { companyId: true } }))
    case 'Petition': return ownerFirm(await prisma.petition.findUnique({ where: { id }, select: { companyId: true } }))
    case 'NoticePosting': return ownerFirm(await prisma.noticePosting.findUnique({ where: { id }, select: { companyId: true } }))
    case 'PublicAccessFile': return ownerFirm(await prisma.publicAccessFile.findUnique({ where: { id }, select: { companyId: true } }))
    case 'PayrollDraft': return ownerFirm(await prisma.payrollDraft.findUnique({ where: { id }, select: { companyId: true } }))
    case 'Proposal': return ownerFirm(await prisma.proposal.findUnique({ where: { id }, select: { companyId: true } }))
    case 'DiversityRegistration': return ownerFirm(await prisma.diversityRegistration.findUnique({ where: { id }, select: { companyId: true } }))
  }
}

const ownerFirm = (r: { companyId: string } | null) => (r ? { companyId: r.companyId } : null)

/** Records of one type on the firm's book, for the proof picker, matching a few typed letters. */
export async function recordsOnBook(companyId: string, type: ProofType, q: string, take = 20): Promise<Named[]> {
  const words = q.trim()
  const base = onBook(companyId, type)
  switch (type) {
    case 'CompanyContact':
      return (await prisma.companyContact.findMany({ where: { AND: [base, words ? { name: { contains: words, mode: 'insensitive' } } : {}] } as any, select: { id: true, name: true, atCompany: { select: { name: true } } }, orderBy: { name: 'asc' }, take })).map((r) => ({ id: r.id, name: `${r.name} at ${r.atCompany.name}` }))
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
    case 'Requirement': {
      const rows = await prisma.requirement.findMany({ where: { AND: [base, words ? { title: { contains: words, mode: 'insensitive' } } : {}] } as any, select: { id: true, title: true }, orderBy: { createdAt: 'desc' }, take })
      return rows.map((r) => ({ id: r.id, name: r.title }))
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
    case 'Offer': {
      const rows = await prisma.offer.findMany({
        where: { AND: [base, words ? { submission: { person: { name: { contains: words, mode: 'insensitive' } } } } : {}] } as any,
        select: { id: true, submission: { select: { person: { select: { name: true } } } } }, orderBy: { createdAt: 'desc' }, take,
      })
      return rows.map((r) => ({ id: r.id, name: `Offer to ${r.submission.person.name}` }))
    }
    case 'SubmissionConfirmation': {
      const rows = await prisma.submissionConfirmation.findMany({
        where: { AND: [base, words ? { submission: { person: { name: { contains: words, mode: 'insensitive' } } } } : {}] } as any,
        select: { id: true, submission: { select: { person: { select: { name: true } } } } }, orderBy: { createdAt: 'desc' }, take,
      })
      return rows.map((r) => ({ id: r.id, name: `Confirmation for ${r.submission.person.name}` }))
    }
    case 'ChecklistItem':
      return (await prisma.checklistItem.findMany({ where: { AND: [base, words ? { label: { contains: words, mode: 'insensitive' } } : {}] } as any, select: { id: true, label: true }, orderBy: { createdAt: 'desc' }, take })).map((r) => ({ id: r.id, name: r.label }))
    case 'Petition': {
      const rows = await prisma.petition.findMany({ where: base as any, select: { id: true, personId: true, kind: true }, orderBy: { createdAt: 'desc' }, take })
      const named = await Promise.all(rows.map(async (r) => ({ id: r.id, name: `${await personName(r.personId)}’s ${petitionWords(r.kind)}` })))
      return words ? named.filter((n) => n.name.toLowerCase().includes(words.toLowerCase())) : named
    }
    case 'NoticePosting':
      return (await prisma.noticePosting.findMany({ where: { AND: [base, words ? { kind: { contains: words, mode: 'insensitive' } } : {}] } as any, select: { id: true, kind: true, postedOn: true }, orderBy: { postedOn: 'desc' }, take })).map((r) => ({ id: r.id, name: `${plainKind(r.kind)} notice posted ${day(r.postedOn)}` }))
    case 'PublicAccessFile': {
      const rows = await prisma.publicAccessFile.findMany({ where: base as any, select: { id: true, petition: { select: { personId: true, kind: true } } }, orderBy: { createdAt: 'desc' }, take })
      const named = await Promise.all(rows.map(async (r) => ({ id: r.id, name: `Public access file for ${await personName(r.petition.personId)}’s ${petitionWords(r.petition.kind)}` })))
      return words ? named.filter((n) => n.name.toLowerCase().includes(words.toLowerCase())) : named
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
    case 'CompanyContact': {
      const r = await prisma.companyContact.findUnique({ where: { id }, select: { name: true, title: true, outreachOptOutAt: true, atCompany: { select: { name: true } } } })
      return r ? [...f('Name', r.name), ...f('Works at', r.atCompany.name), ...f('Title', r.title), ...f('No more outreach since', day(r.outreachOptOutAt))] : []
    }
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
    case 'Requirement': {
      const r = await prisma.requirement.findUnique({ where: { id }, select: { title: true, status: true, startDate: true, company: { select: { name: true } } } })
      return r ? [...f('Job', r.title), ...f('From', r.company.name), ...f('State', plainKind(r.status)), ...f('Starts', day(r.startDate))] : []
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
      return r ? [...f('Agent', agentNameOf(r.agentKey)), ...f('Switch', r.state === 'ON' ? 'On' : r.state === 'DRAFT_ONLY' ? 'Drafts only' : 'Off'), ...f('Daily cap', r.dailyCap === null ? 'None' : String(r.dailyCap))] : []
    }
    case 'SkillTarget': {
      const r = await prisma.skillTarget.findUnique({ where: { id }, select: { subjectKind: true, subjectKey: true, period: true, target: true } })
      return r ? [...f('For', r.subjectKey), ...f('Kind', r.subjectKind === 'AGENT' ? 'Agent' : 'Skill'), ...f('Period', { DAY: 'Day', WEEK: 'Week', MONTH: 'Month' }[r.period] ?? r.period), ...f('Target', String(r.target))] : []
    }
    case 'AgentTask': {
      const r = await prisma.agentTask.findUnique({ where: { id }, select: { agentKey: true, kind: true, state: true, sentCount: true, closedReason: true } })
      return r ? [...f('Agent', agentNameOf(r.agentKey)), ...f('Kind', plainKind(r.kind)), ...f('State', plainKind(r.state)), ...f('Sent', String(r.sentCount)), ...f('Closed because', r.closedReason)] : []
    }
    case 'Offer': {
      const r = await prisma.offer.findUnique({ where: { id }, select: { state: true, rate: true, currency: true, startDate: true, terms: true, submission: { select: { person: { select: { name: true } }, requirement: { select: { title: true } } } } } })
      return r ? [...f('Candidate', r.submission.person.name), ...f('Job', r.submission.requirement.title), ...f('State', plainKind(r.state)), ...f('Hourly rate', `${r.rate.toString()} ${r.currency}`), ...f('Starts', day(r.startDate)), ...f('Terms', r.terms)] : []
    }
    case 'SubmissionConfirmation': {
      const r = await prisma.submissionConfirmation.findUnique({ where: { id }, select: { channel: true, confirmedAt: true, note: true, submission: { select: { person: { select: { name: true } } } } } })
      return r ? [...f('Candidate', r.submission.person.name), ...f('Confirmed', day(r.confirmedAt)), ...f('How', plainKind(r.channel)), ...f('Note', r.note)] : []
    }
    case 'ChecklistItem': {
      const r = await prisma.checklistItem.findUnique({ where: { id }, select: { label: true, kind: true, state: true, agreedValue: true, actualValue: true, waivedReason: true, dueDate: true } })
      return r ? [...f('Item', r.label), ...f('State', plainKind(r.state)), ...f('Agreed', r.agreedValue), ...f('Found', r.actualValue), ...f('Waived because', r.waivedReason), ...f('Due', day(r.dueDate))] : []
    }
    case 'Petition': {
      const r = await prisma.petition.findUnique({ where: { id }, select: { personId: true, kind: true, stage: true, filedOn: true } })
      return r ? [...f('Person', await personName(r.personId)), ...f('Kind', kindWords(r.kind)), ...f('Stage', plainKind(r.stage)), ...f('Filed', day(r.filedOn))] : []
    }
    case 'NoticePosting': {
      const r = await prisma.noticePosting.findUnique({ where: { id }, select: { kind: true, postedOn: true, takenDownOn: true, fileRef: true } })
      return r ? [...f('Kind', plainKind(r.kind)), ...f('Posted', day(r.postedOn)), ...f('Taken down', day(r.takenDownOn)), ...f('Paper', r.fileRef)] : []
    }
    case 'PublicAccessFile': {
      const r = await prisma.publicAccessFile.findUnique({ where: { id }, select: { readyBy: true, readyOn: true, petition: { select: { personId: true } } } })
      return r ? [...f('Person', await personName(r.petition.personId)), ...f('Due', day(r.readyBy)), ...f('Ready', day(r.readyOn))] : []
    }
    case 'PayrollDraft': {
      // Read only after the route found a seat that reads payroll: the run's own figures, kept as a draft.
      const r = await prisma.payrollDraft.findUnique({ where: { id }, select: { periodStart: true, periodEnd: true, state: true, rows: true } })
      if (!r) return []
      const rows = r.rows as unknown as DraftRow[]
      return [
        ...f('Period', daySpan(day(r.periodStart)!, day(r.periodEnd)!)), ...f('State', r.state === 'DRAFT' ? 'Draft, not run' : 'Replaced by a newer draft'),
        ...f('People', String(peopleIn(rows))), ...f('Total gross', grossSays(rows)),
        ...rows.map((x) => ({ label: x.person, value: `${x.hours} hours, ${amount(x.grossPay, x.currency)}${x.held.length ? `; ${x.held.join('; ')}` : ''}` })),
      ]
    }
    case 'DiversityRegistration': {
      const r = await prisma.diversityRegistration.findUnique({ where: { id }, select: { buyerName: true, status: true, portalUrl: true, submittedAt: true } })
      return r ? [...f('Buyer', r.buyerName), ...f('Portal', r.portalUrl), ...f('State', plainKind(r.status)), ...f('Submitted by a person', day(r.submittedAt))] : []
    }
    case 'Proposal': {
      const r = await prisma.proposal.findUnique({ where: { id }, select: { title: true, buyer: true, state: true, dueAt: true, approvedAt: true, submittedAt: true } })
      return r ? [...f('Proposal', r.title), ...f('Agency', r.buyer), ...f('State', plainKind(r.state)), ...f('Due', day(r.dueAt)), ...f('Approved', day(r.approvedAt)), ...f('Sent by a person', day(r.submittedAt))] : []
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
