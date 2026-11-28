/**
 * What the chase checkers know about the money-owed chase (record 123, plan
 * C3 and C9). Reads only, through the injected read client; each question is
 * answered again from the bill, its payments, the mail ledger, the cards and
 * the seats, never from the agent's own ledger lines.
 *
 *  - A chase proposal: the bill is this firm's, was not a draft or voided,
 *    was past its due day and still owed in cents of its own currency by the
 *    payments placed on it when the task was written, had no earlier chase,
 *    and had no payment question open about it. The plan is the proposed
 *    plan, with only the letters and spacing the Owner may set.
 *  - A final notice: the chase it grows out of ended with letters that left,
 *    the bill was still owed, its plan is the one that sends nothing, and no
 *    letter on the mail ledger belongs to it. A final notice that was sent
 *    fails.
 *  - A chase closed by arrival: the payments now placed on the bill pay it
 *    in full, or the bill reads paid.
 *  - A failed-delivery or no-contact card: the mail ledger or the contacts
 *    show why, and the card is owed by the receivables seat the owner reader
 *    names.
 */
import type { PrismaClient } from '@prisma/client'
import { readChaseNumbers } from '@/lib/agents/chase-numbers'
import { invoicesRaisedBy } from '@/lib/money/invoice-parties'
import { RECEIVABLES_ROLES } from '@/lib/money/agent-owners'
import {
  CHASEABLE_STATUSES, FAILED_DELIVERY_CARD, MONEY_OWED_CHASE_AGENT, MONEY_OWED_CHASE_KIND, MONEY_OWED_RECORD, NO_CONTACT_CARD,
  PROPOSED_FINAL_NOTICE_PLAN, PROPOSED_MONEY_CHASE_PLAN, owedCents,
} from '@/lib/money/money-owed-chase'
import { unknownBecause, type CheckerResult, type CheckWindow, type ReadDb, type RecordRef } from '../checker'
import { ownerFor } from './cards'

type Read = ReadDb<PrismaClient>
const DAY_MS = 86_400_000
const ESCALATION = 'ESCALATION'
const NOT_A_SENT_BILL = ['DRAFT', 'CANCELLED', 'VOID']
const dayEnd = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + DAY_MS

/** A task of this agent's own two kinds: the chase, and the final notice that grows out of it. */
export const isMoneyTask = (t: { agentKey: string; kind: string }) => t.agentKey === MONEY_OWED_CHASE_AGENT && (t.kind === MONEY_OWED_CHASE_KIND || t.kind === ESCALATION)

const sortedJson = (v: unknown): string => JSON.stringify(v, (_k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x)

/** The payments that were on the bill by `at`: placed by then, or, where never placed, received by then. */
const paymentsBy = (at: Date) => ({ OR: [{ appliedAt: { lte: at } }, { appliedAt: null, receivedAt: { lte: at } }] })

type TaskRow = { id: string; state: string; kind: string; agentKey: string; recordId: string; plan: unknown; createdAt: Date; parentTaskId: string | null; decision: { ownerPersonId: string } | null }

/** What is wrong with one proposed task of this agent, one phrase each. Empty means the record backs it. */
export async function moneyProposalProblems(read: Read, companyId: string, t: TaskRow, window: CheckWindow): Promise<string[]> {
  const mine: string[] = []
  const bill = await read.invoice.findFirst({
    where: { id: t.recordId, ...invoicesRaisedBy(companyId) },
    select: { id: true, status: true, currency: true, total: true, dueAt: true, invoiceLines: { select: { id: true } }, payments: { where: paymentsBy(t.createdAt), select: { id: true, amount: true, currency: true } } },
  })
  if (!bill) return ['the bill it is about is not one this firm raised']
  if (NOT_A_SENT_BILL.includes(bill.status)) mine.push(`the bill reads ${bill.status}, which was never a sent bill`)
  const owed = owedCents(bill, bill.payments)
  if (owed <= 0) mine.push('the payments on the bill already covered it when the task was written')
  if (bill.dueAt.getTime() >= dayEnd(t.createdAt)) mine.push('the bill was not yet past its due day when the task was written')
  if (!t.decision) mine.push('it has no card')
  else {
    const owner = await ownerFor(read, companyId, RECEIVABLES_ROLES, window.to)
    if (owner && t.decision.ownerPersonId !== owner) mine.push('its card is owed by a seat the owner reader does not name')
  }
  const sent = await read.mailSend.count({ where: { agentTaskId: t.id } })

  if (t.kind === MONEY_OWED_CHASE_KIND) {
    const base = PROPOSED_MONEY_CHASE_PLAN
    const p = (t.plan ?? {}) as { retries?: number; daysApart?: number }
    const numbers = readChaseNumbers(MONEY_OWED_CHASE_AGENT, { retries: p.retries, daysApart: p.daysApart })
    if (sortedJson({ ...(t.plan as object), retries: base.retries, daysApart: base.daysApart }) !== sortedJson(base) || !numbers.ok) mine.push('its plan is not the plan the rules give a chase, with only the letters and spacing the Owner may set')
    if (!CHASEABLE_STATUSES.includes(bill.status) && bill.status !== 'PAID') mine.push(`the bill reads ${bill.status}, which a chase does not cover`)
    const earlier = await read.agentTask.count({ where: { companyId, agentKey: MONEY_OWED_CHASE_AGENT, kind: MONEY_OWED_CHASE_KIND, recordType: MONEY_OWED_RECORD, recordId: bill.id, createdAt: { lt: t.createdAt } } })
    if (earlier > 0) mine.push('the bill had been proposed for a chase before')
    const links = [
      { recordType: 'Invoice', recordId: bill.id },
      ...bill.invoiceLines.map((l) => ({ recordType: 'InvoiceLine', recordId: l.id })),
      ...bill.payments.map((x) => ({ recordType: 'Payment', recordId: x.id })),
    ]
    const held = await read.decisionItem.count({
      where: { companyId, agentTasks: { none: {} }, createdAt: { lte: t.createdAt }, OR: [{ state: 'OPEN' }, { decidedAt: { gt: t.createdAt } }], AND: [{ OR: links.map((l) => ({ proofLinks: { array_contains: [l] } })) }] },
    })
    if (held > 0) mine.push('a payment question about the bill was open when it was proposed')
    if (t.state === 'PROPOSED' && sent > 0) mine.push('it sent a letter before anyone said yes')
  } else {
    if (sortedJson(t.plan) !== sortedJson(PROPOSED_FINAL_NOTICE_PLAN)) mine.push('its plan is not the plan that sends nothing')
    if (sent > 0) mine.push('a letter on the mail ledger belongs to a final notice, and a final notice is only ever drafted for a person to send')
    const parent = t.parentTaskId ? await read.agentTask.findFirst({ where: { id: t.parentTaskId, companyId, agentKey: MONEY_OWED_CHASE_AGENT, kind: MONEY_OWED_CHASE_KIND, recordId: t.recordId }, select: { id: true, state: true, createdAt: true } }) : null
    if (!parent) mine.push('it grows out of no chase of this bill')
    else {
      if (parent.state !== 'DONE') mine.push(`the chase it grows out of reads ${parent.state}, not ended`)
      if ((await read.mailSend.count({ where: { agentTaskId: parent.id, outcome: 'SENT' } })) === 0) mine.push('no letter of the chase it grows out of left, so it did not end with no answer')
      const others = await read.agentTask.count({ where: { parentTaskId: parent.id, createdAt: { lt: t.createdAt } } })
      if (others > 0) mine.push('the chase already had a final notice')
    }
  }
  return mine
}

/** Why a chase closed by arrival is not backed by the bill; null where the payments now cover it. */
export async function moneyCloseProblem(read: Read, companyId: string, ref: RecordRef): Promise<string | null> {
  const bill = await read.invoice.findFirst({
    where: { id: ref.recordId, ...invoicesRaisedBy(companyId) },
    select: { status: true, currency: true, total: true, payments: { select: { amount: true, currency: true } } },
  })
  if (!bill) return 'The bill the chase was closed for is not one this firm raised.'
  if (owedCents(bill, bill.payments) > 0 && bill.status !== 'PAID') return 'The chase was closed because the bill is paid, and the payments on it do not cover it and it does not read paid.'
  return null
}

const inWindow = (w: CheckWindow) => ({ gte: w.from, lte: w.to })

/** The two card kinds this agent opens besides its task cards. */
export async function moneyCardVerdict(read: Read, companyId: string, ref: RecordRef, window: CheckWindow): Promise<CheckerResult> {
  const evidence = `${ref.recordType} ${ref.recordId}`
  const fail = (reason: string): CheckerResult => ({ verdict: 'FAIL', reason, evidence, unitsFound: 0 })
  let link: { recordType: string; recordId: string }
  let said: Record<string, unknown>
  let what: string
  if (ref.recordType === FAILED_DELIVERY_CARD) {
    const task = await read.agentTask.findFirst({ where: { id: ref.recordId, companyId, agentKey: MONEY_OWED_CHASE_AGENT }, select: { id: true } })
    if (!task) return fail('The task the card is about is not one of this agent’s.')
    const rows = await read.mailSend.findMany({ where: { agentTaskId: task.id }, select: { outcome: true } })
    if (!rows.some((r) => r.outcome !== 'SENT')) return fail('Every letter of the task left, so no card for a letter that did not arrive was owed.')
    link = { recordType: 'AgentTask', recordId: task.id }
    said = { startsWith: 'Failed delivery' }
    what = 'the letter that did not reach the customer'
  } else {
    if (ref.recordId !== companyId) {
      const contacts = await read.companyContact.count({ where: { companyId, atCompanyId: ref.recordId, email: { not: null }, createdAt: { lte: window.to } } })
      if (contacts > 0) return unknownBecause('A contact with an address was recorded at the customer by then, and the check cannot tell whether she is only a worker on the bill.')
    }
    link = { recordType: 'Company', recordId: ref.recordId }
    said = { contains: 'has no one recorded to receive bills' }
    what = 'the customer nobody is recorded at to receive bills'
  }
  const cards = await read.decisionItem.findMany({
    where: { companyId, proofLinks: { array_contains: [link] }, agentTasks: { none: {} }, question: said, createdAt: inWindow(window) },
    select: { ownerPersonId: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  if (cards.length === 0) return fail(`No card is on the record for ${what}.`)
  const owner = await ownerFor(read, companyId, RECEIVABLES_ROLES, window.to)
  if (owner && cards.some((c) => c.ownerPersonId !== owner)) return fail(`The card for ${what} is owed by a seat the owner reader does not name.`)
  return { verdict: 'PASS', reason: `A card for ${what}, owed by the seat the owner reader names, and the record shows why it was owed.`, evidence, unitsFound: 1 }
}
