/**
 * Chasing money owed, with evidence (record 112, chain 5, "Money loop": the
 * second step of the chase-and-reconciliation agent, under the one-yes-per-
 * task rule of 2026-11-22).
 *
 * Each run, for one firm:
 *  1. A bill that was sent, is past its due date, still has money owed by
 *     the cents of the payments placed on it, and never had a chase task is
 *     PROPOSED as one task with a card for a yes, owed by Accounts
 *     Receivable, else Finance, else the Owner. A bill is never proposed
 *     twice, whatever became of the first task. A bill whose customer has an
 *     open reconciliation decision (a short pay, an overpay, a drift, a
 *     payment of another currency) is not proposed until it is recorded.
 *  2. Every released task is walked to its end: closed the moment payments
 *     reach the bill's total, else the next letter if the plan says it is
 *     due, else done with "no answer" once the reminders are spent.
 *
 * The letter goes to the person the supplier recorded at the customer as
 * receiving bills, through the mail door with the task's id. It names the
 * bill, the amount owed and the due date, and carries the bill's own link
 * (the page the bill was sent with: every line, the signed weeks, where to
 * pay) and one line per signed week it covers.
 *
 * What this never does: a final notice, a payroll hold, a write-off, a
 * promise of a date, or any change to the bill. Each is a person's, and its
 * own task with its own yes. Nothing is sent on Drafts only, even after a
 * yes. It runs under its own key, `money-owed-chase`; reconciliation's open
 * decisions hold it (a decision is read, never opened here).
 */

import { prisma } from '@/lib/db'
import { mailedBase } from '@/lib/app-url'
import { daysOffFor } from '@/lib/days-off'
import { dayAround } from '@/lib/decision-queue'
import { openDecision } from '@/lib/decision-items'
import { formatDay } from '@/lib/format-date'
import { minorFromWhole } from '@/lib/money'
import { amount } from '@/lib/money-display'
import { invoicesRaisedBy } from '@/lib/money/invoice-parties'
import { ownerForRoles, RECEIVABLES_ROLES } from '@/lib/money/agent-owners'
import { sendMail, mailSendsAbout } from '@/lib/notify/mail-door'
import { hello, paragraphs, bullets } from '@/lib/notify/letters'
import { billLinkOpen, billLinkToken, billLinkUrl } from '@/lib/notify/bill-letter'
import { chaseNumbersOf, planWith, numbersSource } from '@/lib/agents/chase-numbers'
import { nextLetter, agentStamp } from '@/lib/notify/timesheet-chase-agent'
import { registerAgent, type AgentContext } from '@/lib/agents/runner'
import { TASK_RECORD, approvalOf, closeTask, proposeTask, type TaskPlan } from '@/lib/agents/tasks'

export const MONEY_OWED_CHASE_KIND = 'MONEY_OWED_CHASE'
export const MONEY_OWED_CHASE_TEMPLATE = 'money-owed-chase'
export const MONEY_OWED_RECORD = 'Invoice'

/**
 * PROPOSED DEFAULTS, AWAITING THE OWNER. Nobody has decided these numbers.
 * One letter, then up to two reminders, five working days apart, closing
 * when the bill is paid in full.
 */
export const PROPOSED_MONEY_CHASE = { letters: 1, retries: 2, workingDaysApart: 5 } as const

export const PROPOSED_MONEY_CHASE_PLAN: TaskPlan = {
  messages: [{ template: MONEY_OWED_CHASE_TEMPLATE, label: 'Overdue bill reminder' }],
  retries: PROPOSED_MONEY_CHASE.retries,
  daysApart: PROPOSED_MONEY_CHASE.workingDaysApart,
  closesWhen: 'the bill is paid in full',
}

/** A bill is chased only while it is sent and not held or disputed by the firm that pays it. */
export const CHASEABLE_STATUSES: readonly string[] = ['SUBMITTED', 'PARTIALLY_PAID']

const DAY_MS = 86_400_000
const dayOf = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())

/** What is still owed, in cents of the bill's own currency, from the payments placed on it. A payment of another currency is not counted. Pure. */
export function owedCents(bill: { total: { toString(): string } | number; currency: string }, payments: readonly { amount: { toString(): string } | number; currency: string }[]): number {
  const paid = payments.filter((p) => p.currency === bill.currency).reduce((s, p) => s + minorFromWhole(p.amount, p.currency), 0)
  return minorFromWhole(bill.total, bill.currency) - paid
}

/** Whole days after the due date up to the day given; 0 or less where it is not yet past. Pure. */
export function daysPastDue(dueAt: Date, today: Date): number {
  return Math.round((dayOf(today) - dayOf(dueAt)) / DAY_MS)
}

/** The card's question, with the plan said as a proposal. Pure. */
export function moneyChaseQuestion(f: { customer: string; number: string; owedMinor: number; currency: string; dueAt: Date; daysPast: number }, plan: TaskPlan = PROPOSED_MONEY_CHASE_PLAN, ownerSet = false): string {
  const n = plan.retries
  return `${f.customer} owes ${amount(f.owedMinor, f.currency)} on bill ${f.number}, due ${formatDay(f.dueAt)}, ${f.daysPast} ${f.daysPast === 1 ? 'day' : 'days'} past it. ` +
    `Send a letter asking for it? Proposed: one letter, then up to ${n} ${n === 1 ? 'reminder' : 'reminders'}, ${plan.daysApart} working days apart, ` +
    `closing when the bill is paid in full. ${numbersSource(ownerSet)}`
}

export interface SignedWeek { person: string; periodStart: Date; periodEnd: Date; hours: number; signedAt: Date | null }

export interface MoneyChaseLetterInput {
  supplierName: string
  customerName: string
  contactName: string | null
  number: string
  owedMinor: number
  currency: string
  dueAt: Date
  daysPast: number
  /** The bill's own link: every line, the signed weeks, where to pay. Null where this deployment has no lasting address. */
  link: string | null
  /** The link has stopped opening. */
  linkClosed: boolean
  weeks: SignedWeek[]
  /** 1 for the first letter, 2 for the first reminder. */
  attempt: number
}

const week = (w: SignedWeek) => {
  const a = formatDay(w.periodStart, { year: false }); const b = formatDay(w.periodEnd, { year: false })
  const hours = Math.round(w.hours * 100) / 100
  return `${w.person}, ${a === b ? a : `${a} to ${b}`}: ${hours} ${hours === 1 ? 'hour' : 'hours'}, ${w.signedAt ? `signed ${formatDay(w.signedAt)}` : 'not yet signed'}`
}

/**
 * The letter: which bill, what is still owed, the due date, and the
 * evidence. Plain words. It asks for payment or for the reason; it promises
 * no date, threatens nothing and offers no change to the bill. Pure.
 */
export function moneyChaseLetter(i: MoneyChaseLetterInput): { subject: string; text: string } {
  const owed = amount(i.owedMinor, i.currency)
  const again = i.attempt > 1 ? 'This is a reminder. ' : ''
  const evidence = i.link
    ? `The bill, with each line and the signed weeks it rests on, is here:\n${i.link}`
    : null
  const closed = i.linkClosed ? 'The link to the bill has stopped opening. Reply to this letter and we will send it again.' : null
  return {
    subject: `${i.attempt > 1 ? 'Reminder: ' : ''}Bill ${i.number}: ${owed} owed, due ${formatDay(i.dueAt)}`,
    text: paragraphs(
      hello(i.contactName),
      `${again}${i.supplierName} has not received payment of bill ${i.number} to ${i.customerName}. ${owed} is still owed. It was due on ${formatDay(i.dueAt)}, ${i.daysPast} ${i.daysPast === 1 ? 'day' : 'days'} ago.`,
      i.weeks.length ? `The bill covers these signed weeks:\n${bullets(i.weeks.map(week))}` : null,
      i.linkClosed ? closed : evidence,
      'If it is already paid, or you disagree with the amount, reply to this letter and tell us which.',
    ),
  }
}

// ── The database half ────────────────────────────────────────────────

const OPEN = ['PROPOSED', 'APPROVED', 'RUNNING'] as const

/** Whether a reconciliation decision about this bill, a line on it or a payment placed on it is open. A chase's own card is not one. */
async function openDecisionAbout(companyId: string, bill: { id: string; invoiceLines: { id: string }[]; payments: { id: string }[] }): Promise<boolean> {
  const links = [
    { recordType: 'Invoice', recordId: bill.id },
    ...bill.invoiceLines.map((l) => ({ recordType: 'InvoiceLine', recordId: l.id })),
    ...bill.payments.map((p) => ({ recordType: 'Payment', recordId: p.id })),
  ]
  const n = await prisma.decisionItem.count({
    where: { companyId, state: 'OPEN', agentTasks: { none: {} }, OR: links.map((l) => ({ proofLinks: { array_contains: [l] } })) },
  })
  return n > 0
}

const billRead = {
  id: true, number: true, status: true, currency: true, total: true, dueAt: true, billToId: true,
  payments: { select: { id: true, amount: true, currency: true } },
  invoiceLines: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true, hours: true, expenseId: true, milestoneId: true,
      person: { select: { name: true, primaryEmail: true } },
      timesheet: { select: { periodStart: true, periodEnd: true, clientApprovedAt: true } },
      sellContract: { select: { clientCompanyId: true } },
    },
  },
  engagement: { select: { msa: { select: { clientId: true } } } },
} as const

/** The customer's name: the firm the bill names, else the client on its agreement or its lines. */
async function customerOf(bill: { billToId: string | null; engagement: { msa: { clientId: string } | null }; invoiceLines: { sellContract: { clientCompanyId: string | null } | null }[] }) {
  const id = bill.billToId ?? bill.engagement.msa?.clientId ?? bill.invoiceLines.map((l) => l.sellContract?.clientCompanyId).find(Boolean) ?? null
  if (!id) return null
  const c = await prisma.company.findUnique({ where: { id }, select: { id: true, name: true } })
  return c
}

/** The person the supplier recorded at the customer as receiving bills: accounts payable where it recorded one, else anybody it recorded there. Never a worker on the bill. */
async function billingContact(supplierId: string, customerId: string, workerEmails: string[]): Promise<{ email: string; name: string | null } | null> {
  const workers = new Set(workerEmails.map((e) => e.trim().toLowerCase()))
  const contacts = await prisma.companyContact.findMany({
    where: { companyId: supplierId, atCompanyId: customerId, email: { not: null } },
    select: { email: true, name: true, kind: true }, orderBy: { createdAt: 'asc' },
  })
  const usable = contacts.filter((c) => c.email && !workers.has(c.email.trim().toLowerCase()))
  const pick = usable.find((c) => c.kind === 'AP') ?? usable[0]
  return pick ? { email: pick.email!.trim(), name: pick.name } : null
}

/** Open one card for a gap, the first time only: any card of this wording on this link, open or decided, means it was asked. Returns whether it opened one. */
async function raiseOnce(i: { companyId: string; agentKey: string; owner: string | null; now: Date; prefix: string; link: { recordType: string; recordId: string }; question: string; proof: string }): Promise<boolean> {
  if (!i.owner) return false
  const asked = await prisma.decisionItem.count({ where: { companyId: i.companyId, question: { startsWith: i.prefix }, proofLinks: { array_contains: [i.link] } } })
  if (asked > 0) return false
  const stamp = await agentStamp(i.companyId, i.agentKey)
  if (!stamp) return false
  await openDecision({ ...stamp, companyId: i.companyId, ownerPersonId: i.owner, openedOn: i.now, question: i.question, proof: i.proof, proofLinks: [i.link] })
  return true
}

export async function moneyOwedChaseStep(ctx: AgentContext, deps: { send?: typeof sendMail } = {}): Promise<void> {
  const send = deps.send ?? sendMail
  const { companyId, now } = ctx
  const dayStart = dayAround(now).from

  // 1. Propose a task for every sent bill past due with money owed.
  const owner = await ownerForRoles(companyId, RECEIVABLES_ROLES, now)
  const late = await prisma.invoice.findMany({
    where: { ...invoicesRaisedBy(companyId), status: { in: [...CHASEABLE_STATUSES] }, dueAt: { lt: dayStart } },
    select: billRead, orderBy: [{ dueAt: 'asc' }, { number: 'asc' }], take: 500,
  })
  for (const b of late) {
    const owed = owedCents(b, b.payments)
    if (owed <= 0) continue
    if ((await prisma.agentTask.count({ where: { companyId, agentKey: ctx.agentKey, kind: MONEY_OWED_CHASE_KIND, recordType: MONEY_OWED_RECORD, recordId: b.id } })) > 0) continue
    if (await openDecisionAbout(companyId, b)) continue
    if (!owner) continue
    const customer = await customerOf(b)
    if (!customer) continue
    if (!(await ctx.mayAct(2))) break // proposing writes two counted rows
    const daysPast = daysPastDue(b.dueAt, now)
    // The firm's own numbers, if the Owner set any, are taken now and kept in the task's plan.
    const set = await chaseNumbersOf(companyId, ctx.agentKey)
    const plan = planWith(PROPOSED_MONEY_CHASE_PLAN, set)
    const task = await proposeTask({
      companyId, agentKey: ctx.agentKey, kind: MONEY_OWED_CHASE_KIND, recordType: MONEY_OWED_RECORD, recordId: b.id,
      plan, ownerPersonId: owner, openedOn: now,
      question: moneyChaseQuestion({ customer: customer.name, number: b.number, owedMinor: owed, currency: b.currency, dueAt: b.dueAt, daysPast }, plan, set !== null),
    })
    await ctx.act({ recordType: TASK_RECORD, recordId: task.id, action: 'MONEY_CHASE_PROPOSED', summary: `Proposed a chase of ${customer.name} for bill ${b.number}, ${amount(owed, b.currency)} owed. Nothing is sent until a person says yes.` })
  }

  // 2. Walk every released task.
  const daysOff = await daysOffFor(companyId)
  const supplier = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } })
  const tasks = await prisma.agentTask.findMany({
    where: { companyId, agentKey: ctx.agentKey, kind: MONEY_OWED_CHASE_KIND, recordType: MONEY_OWED_RECORD, state: { in: [...OPEN] } },
    orderBy: { createdAt: 'asc' },
  })
  for (const t0 of tasks) {
    const { task } = await approvalOf(t0.id)
    if (task.state !== 'APPROVED' && task.state !== 'RUNNING') continue
    const b = await prisma.invoice.findUnique({ where: { id: task.recordId }, select: billRead })
    if (!b || ['CANCELLED', 'VOID'].includes(b.status)) { await closeTask(task.id, 'The bill this chase was about is no longer on the record as owed.', 'STOPPED'); continue }
    const owed = owedCents(b, b.payments)
    if (owed <= 0 || b.status === 'PAID') { await closeTask(task.id, 'The bill is paid in full, so the chase is closed.', 'CLOSED_BY_ARRIVAL'); continue }
    if (ctx.mode !== 'ON') continue // Drafts only: nothing is sent, even after a yes.
    if (!CHASEABLE_STATUSES.includes(b.status)) continue // Held or disputed by the customer: a person's to settle.
    if (await openDecisionAbout(companyId, b)) continue // A short pay or drift is a person's to record first.

    const plan = task.plan as unknown as TaskPlan
    const left = (await mailSendsAbout(companyId, MONEY_OWED_RECORD, b.id)).filter((r) => r.agentTaskId === task.id) // every attempt counts, sent or not
    const next = nextLetter(plan, left.length, left.length ? left[left.length - 1].createdAt : null, now, daysOff)
    if (next.act === 'WAIT') continue
    if (next.act === 'END') {
      // Nothing left at all: say so, never "no answer", and tell a person once.
      if (!left.some((r) => r.outcome === 'SENT')) {
        const why = left.length ? left[left.length - 1].note ?? 'the mail service gave no reason' : 'no attempt was recorded'
        await closeTask(task.id, `No letter could leave: ${why} Nothing was sent, so nobody was asked. A person follows up.`, 'DONE')
        const stampNL = await agentStamp(companyId, ctx.agentKey)
        const ownerNL = owner
        if (stampNL && ownerNL) {
          await openDecision({
            ...stampNL, companyId, ownerPersonId: ownerNL, openedOn: now,
            question: `Failed delivery: no letter about bill ${b.number} could leave. Follow up by hand?`,
            proof: `Every attempt in the plan was made and none left. The last reason: ${why}`,
            proofLinks: [{ recordType: TASK_RECORD, recordId: task.id }],
          })
        }
        continue
      } await closeTask(task.id, 'No answer: every attempt in the plan was made and the bill is still owed. Any further step is a person’s to take.', 'DONE'); continue }

    if (!(await ctx.mayAct())) return // the letter and its row are one unit
    const customer = await customerOf(b)
    const contact = customer ? await billingContact(companyId, customer.id, b.invoiceLines.map((l) => l.person?.primaryEmail ?? '').filter(Boolean)) : null
    if (!customer || !contact) {
      // One card for a person the first time, then quiet until a contact is recorded (the next run then sends as planned).
      const who = customer?.name ?? 'The customer'
      const raised = await raiseOnce({
        companyId, agentKey: ctx.agentKey, owner, now, prefix: `${who} has no one recorded to receive bills`,
        link: { recordType: 'Company', recordId: customer?.id ?? companyId },
        question: `${who} has no one recorded to receive bills, so bill ${b.number} cannot be chased. Add someone to receive bills (a contact at ${who}) on the customer’s page?`,
        proof: `Letter ${next.attempt} was ready and has nowhere to go. Once someone to receive bills is recorded for this customer, the chase goes ahead as approved.`,
      })
      if (raised) await ctx.act({ recordType: TASK_RECORD, recordId: task.id, action: 'MONEY_CHASE_NOT_SENT', summary: `Letter ${next.attempt} for bill ${b.number} was not sent: no one to receive bills is recorded at ${who}. One card asks for it.` })
      continue
    }
    const base = mailedBase()
    const url = base ? billLinkUrl(billLinkToken(b.id, contact.email), base) : null
    if (!url) {
      const raised = await raiseOnce({
        companyId, agentKey: ctx.agentKey, owner, now, prefix: 'Bills cannot be chased',
        link: { recordType: 'Company', recordId: companyId },
        question: `Bills cannot be chased, such as bill ${b.number}: this deployment does not know its own web address, so the link to the bill would not open. Set the web address?`,
        proof: 'Letters about bills carry a link to the bill. Once the deployment has a lasting web address, the chase goes ahead as approved.',
      })
      if (raised) await ctx.act({ recordType: TASK_RECORD, recordId: task.id, action: 'MONEY_CHASE_NOT_SENT', summary: `Letter ${next.attempt} for bill ${b.number} was not sent: this deployment does not know its own web address. One card asks for it.` })
      continue
    }
    const weeks = new Map<string, SignedWeek>()
    for (const l of b.invoiceLines) {
      if (!l.timesheet || l.expenseId || l.milestoneId) continue
      const key = `${l.person?.name ?? ''}|${l.timesheet.periodStart.toISOString()}`
      const was = weeks.get(key)
      weeks.set(key, { person: l.person?.name ?? 'Somebody', periodStart: l.timesheet.periodStart, periodEnd: l.timesheet.periodEnd, hours: (was?.hours ?? 0) + Number(l.hours), signedAt: l.timesheet.clientApprovedAt })
    }
    const letter = moneyChaseLetter({
      supplierName: supplier?.name ?? 'Your supplier', customerName: customer.name, contactName: contact.name, number: b.number,
      owedMinor: owed, currency: b.currency, dueAt: b.dueAt, daysPast: daysPastDue(b.dueAt, now),
      link: billLinkOpen(b.dueAt, now) ? url : null, linkClosed: !billLinkOpen(b.dueAt, now), weeks: [...weeks.values()], attempt: next.attempt,
    })
    const res = await send({
      to: contact.email, subject: letter.subject, text: letter.text,
      about: { companyId, agentKey: ctx.agentKey, agentTaskId: task.id, agentAttempt: next.attempt, recordType: MONEY_OWED_RECORD, recordId: b.id, template: MONEY_OWED_CHASE_TEMPLATE, chase: true },
    })
    const went = res.outcome === 'SENT'
    await ctx.act({
      recordType: TASK_RECORD, recordId: task.id, action: went ? 'MONEY_CHASE_SENT' : 'MONEY_CHASE_NOT_SENT',
      summary: went ? `Sent letter ${next.attempt} to ${customer.name} for bill ${b.number}, ${amount(owed, b.currency)} owed.` : `Letter ${next.attempt} to ${customer.name} for bill ${b.number} was not sent: ${res.note}`,
    })
    if (res.outcome === 'FAILED_DELIVERY') {
      const stamp = await agentStamp(companyId, ctx.agentKey)
      if (stamp && owner) {
        await openDecision({
          ...stamp, companyId, ownerPersonId: owner, openedOn: now,
          question: `Failed delivery: letter ${next.attempt} to ${customer.name} for bill ${b.number} did not arrive. Check the address recorded for the person who receives bills.`,
          proof: `The mail service said: ${res.note}`,
          proofLinks: [{ recordType: TASK_RECORD, recordId: task.id }],
        })
      }
    }
  }
}

export const MONEY_OWED_CHASE_AGENT = 'money-owed-chase'
export const MONEY_OWED_CHASE_RULES = 'money-owed-chase-1'

/** Put the step in the runner's registry under its own key. Called by the cron route that runs agents. */
export function registerMoneyOwedChase() {
  registerAgent(MONEY_OWED_CHASE_AGENT, { ruleVersion: MONEY_OWED_CHASE_RULES, step: (ctx) => moneyOwedChaseStep(ctx) })
}

/** A payment reached a bill: close its open chase at once. Never throws; the payment is the act that matters. */
export async function closeChaseOnPayment(invoiceId: string): Promise<void> {
  try {
    const bill = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { currency: true, total: true, payments: { select: { amount: true, currency: true } } } })
    if (!bill || owedCents(bill, bill.payments) > 0) return
    const tasks = await prisma.agentTask.findMany({ where: { kind: MONEY_OWED_CHASE_KIND, recordType: MONEY_OWED_RECORD, recordId: invoiceId, state: { in: [...OPEN] } }, select: { id: true } })
    for (const t of tasks) await closeTask(t.id, 'The bill is paid in full, so the chase is closed.', 'CLOSED_BY_ARRIVAL')
  } catch { /* the nightly step closes it on its next run */ }
}
