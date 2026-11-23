/**
 * The reconciliation half of the chase-and-reconciliation agent (record 112,
 * chain 5, "Money loop"): payments a person recorded as received, matched to
 * the firm's bills, and a bill's rate read against its contract line's.
 *
 * What it does:
 *  - A payment that matches its bill to the cent, in the bill's own
 *    currency, is matched. Where the consultant's month for that bill is at
 *    "payment pending" and its stated amounts agree, the month moves one
 *    step to "paid, not confirmed" through the chain's own rule. Never to
 *    closed: closing is a person's.
 *  - A short pay, an overpay, a currency mismatch, a payment that matches
 *    no bill or more than one, and a bill whose rate differs from its
 *    contract line's, each open one decision with the figures in its
 *    proof, owed by the seat that keeps receivables (else the Owner). It
 *    acts no further on it. One open decision per thing, never two.
 *
 * What it never does: send anything (chasing money owed is a later task
 * under the one-yes rule), move money, place a payment against a bill,
 * change a bill, close a month, or convert one currency to another.
 *
 * On drafts only it opens decisions and moves no month: probation is scope.
 * Off, the runner never calls it.
 *
 * This file is the step. The registry that runs it beside the timesheet
 * chase, under the one key `chase-and-reconciliation`, is not here.
 */

import { prisma } from '@/lib/db'
import { LedgerRefusal } from '@/lib/record-ledger'
import { openDecision, firmToday } from '@/lib/decision-items'
import { minorFromWhole } from '@/lib/money'
import { invoicesRaisedBy } from '@/lib/money/invoice-parties'
import { advanceChain, amountsOf, mismatch } from '@/lib/money/money-chain'
import { ownerForRoles, RECEIVABLES_ROLES } from '@/lib/money/agent-owners'
import {
  judgeBill, judgeUnplaced, driftOf, shortPayWords, overPayWords, currencyWords, noBillWords, manyBillsWords, driftWords,
  type Finding, type OpenBill, type PaymentFact,
} from '@/lib/money/payment-match'
import { AGENT_HELD_AS, registerAgent, type AgentContext, type AgentDef } from './runner'

export const RECONCILIATION_RULE = 'reconcile-v1'
export const CHASE_AND_RECONCILIATION = 'chase-and-reconciliation'

/** A bill in any of these is not one a payment is matched to. */
const NOT_A_LIVE_BILL = ['DRAFT', 'CANCELLED', 'VOID']
const NOT_OWED = ['PAID', ...NOT_A_LIVE_BILL]

const dayOf = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

type Opened = 'OPENED' | 'ALREADY_OPEN' | 'ALREADY_DECIDED'

export async function reconcileStep(ctx: AgentContext): Promise<void> {
  const { companyId, now } = ctx
  const sw = await prisma.agentSwitch.findUnique({ where: { companyId_agentKey: { companyId, agentKey: ctx.agentKey } } })
  if (!sw) return
  const personId = sw.changedById
  const owner = await ownerForRoles(companyId, RECEIVABLES_ROLES, now)
  const entities = await prisma.legalEntity.findMany({ where: { companyId }, select: { id: true } })
  const entityId = entities.length === 1 ? entities[0].id : null
  const moves = ctx.mode === 'ON'

  /** One decision per thing: nothing opens where one is open, or where one was decided on these very figures. */
  const flag = async (link: { recordType: string; recordId: string }, f: Finding, actingEntityId: string | null): Promise<Opened | 'NO_OWNER' | 'REFUSED'> => {
    if (!owner) return 'NO_OWNER'
    const same = await prisma.decisionItem.findMany({
      where: { companyId, proofLinks: { array_contains: [link] }, agentTasks: { none: {} } },
      select: { state: true, proof: true },
    })
    if (same.some((d) => d.state === 'OPEN')) return 'ALREADY_OPEN'
    if (same.some((d) => d.proof === f.proof.trim())) return 'ALREADY_DECIDED'
    try {
      await openDecision({
        companyId, personId, heldAs: AGENT_HELD_AS, actingEntityId: actingEntityId ?? entityId,
        question: f.question, ownerPersonId: owner, openedOn: await firmToday(companyId, now),
        proof: f.proof, proofLinks: [link],
      }, now)
      return 'OPENED'
    } catch (e) {
      if (e instanceof LedgerRefusal) return 'REFUSED'
      throw e
    }
  }

  const handled = new Set(
    (await prisma.recordAction.findMany({
      where: { companyId, agentKey: ctx.agentKey, recordType: 'Payment', action: { in: ['PAYMENT_MATCHED', 'PAYMENT_FLAGGED'] } },
      select: { recordId: true },
    })).map((r) => r.recordId),
  )
  const mark = (id: string, action: 'PAYMENT_MATCHED' | 'PAYMENT_FLAGGED', summary: string) =>
    ctx.act({ recordType: 'Payment', recordId: id, action, summary }).then(() => { handled.add(id) })

  /** Move the one month this bill pays, where the chain's own rules allow; says why not otherwise. */
  const moveMonth = async (bill: { id: string; periodStart: Date; periodEnd: Date; currency: string; lineContractIds: string[]; minor: number }): Promise<string> => {
    if (!moves) return ' The month was not moved: this agent is on drafts only.'
    if (bill.lineContractIds.length !== 1) return ' The bill covers more than one placement, so no month was moved.'
    const chain = await prisma.moneyChain.findFirst({
      where: { companyId, sellContractId: bill.lineContractIds[0], periodStart: dayOf(bill.periodStart), periodEnd: dayOf(bill.periodEnd) },
    })
    if (!chain) return ' No month on record is for this bill’s period, so none was moved.'
    if (chain.state !== 'PAYMENT_PENDING') return ' The month is not at payment pending, so it was not moved.'
    const paid = { cents: bill.minor, currency: bill.currency }
    // The chain disputes itself on a mismatch and opens its own decision. An agent never causes that: it moves a month only where every stated amount agrees.
    if (mismatch({ ...amountsOf(chain), paid })) return ' The amounts stated on the month do not agree with this payment, so it was not moved.'
    if (!owner) return ' Nobody holds receivables or the Owner seat, so the month was not moved.'
    try {
      await advanceChain({
        companyId, personId, heldAs: AGENT_HELD_AS, actingEntityId: chain.actingEntityId ?? entityId,
        chainId: chain.id, to: 'PAID_UNCONFIRMED', stated: paid, disputeOwnerPersonId: owner,
      })
    } catch (e) {
      if (e instanceof LedgerRefusal) return ` The month was not moved: ${e.message}`
      throw e
    }
    return ' The month moved to paid, not confirmed. Confirming and closing it is a person’s.'
  }

  const fact = (p: { id: string; amount: { toString(): string }; currency: string; reference: string | null }): PaymentFact =>
    ({ id: p.id, minor: minorFromWhole(p.amount, p.currency), currency: p.currency, reference: p.reference })

  const fresh = await prisma.payment.findMany({
    where: { receivedByCompanyId: companyId, vendorBillId: null, id: { notIn: [...handled] } },
    select: { id: true, invoiceId: true, amount: true, currency: true, reference: true },
    orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
    take: 500,
  })

  // ── Payments somebody placed against a bill ───────────────────────
  const byBill = new Map<string, typeof fresh>()
  for (const p of fresh) if (p.invoiceId) byBill.set(p.invoiceId, [...(byBill.get(p.invoiceId) ?? []), p])
  for (const [invoiceId, news] of byBill) {
    const inv = await prisma.invoice.findFirst({
      where: { id: invoiceId, ...invoicesRaisedBy(companyId), status: { notIn: NOT_A_LIVE_BILL } },
      select: {
        id: true, number: true, currency: true, total: true, periodStart: true, periodEnd: true,
        invoiceLines: { select: { sellContractId: true } },
        payments: { select: { id: true, amount: true, currency: true, reference: true } },
      },
    })
    if (!inv) continue
    const bill = { id: inv.id, number: inv.number, currency: inv.currency, minor: minorFromWhole(inv.total, inv.currency) }
    const newIds = new Set(news.map((p) => p.id))
    for (const v of judgeBill(bill, inv.payments.map(fact))) {
      if (v.kind === 'CURRENCY') {
        if (!newIds.has(v.payment.id)) continue
        if (!(await ctx.mayAct())) return
        const r = await flag({ recordType: 'Payment', recordId: v.payment.id }, currencyWords(bill, v.payment), null)
        if (r === 'OPENED' || r === 'ALREADY_OPEN' || r === 'ALREADY_DECIDED') {
          await mark(v.payment.id, 'PAYMENT_FLAGGED', `Payment of a different currency than bill ${bill.number}: a decision is open. Nothing was moved.`)
        }
        continue
      }
      const mine = news.filter((p) => p.currency === bill.currency)
      if (mine.length === 0) continue
      if (v.kind === 'MATCHED') {
        if (!moves) continue
        if (!(await ctx.mayAct(mine.length))) return
        const lineContractIds = [...new Set(inv.invoiceLines.map((l) => l.sellContractId).filter((x): x is string => !!x))]
        const said = await moveMonth({ ...bill, periodStart: inv.periodStart, periodEnd: inv.periodEnd, lineContractIds })
        for (const p of mine) await mark(p.id, 'PAYMENT_MATCHED', `Matched to bill ${bill.number} to the cent.${said}`)
        continue
      }
      if (!(await ctx.mayAct(mine.length))) return
      const words = v.kind === 'SHORT' ? shortPayWords(bill, v) : overPayWords(bill, v)
      const r = await flag({ recordType: 'Invoice', recordId: inv.id }, words, null)
      if (r === 'OPENED' || r === 'ALREADY_DECIDED') {
        for (const p of mine) await mark(p.id, 'PAYMENT_FLAGGED', `${v.kind === 'SHORT' ? 'Short pay' : 'Overpay'} on bill ${bill.number}: a decision is open. Nothing was moved.`)
      }
    }
  }

  // ── Payments nobody has placed ────────────────────────────────────
  const loose = fresh.filter((p) => !p.invoiceId)
  if (loose.length > 0) {
    const bills = await prisma.invoice.findMany({
      where: { ...invoicesRaisedBy(companyId), status: { notIn: NOT_OWED } },
      select: { id: true, number: true, currency: true, total: true, paid: true, periodStart: true, periodEnd: true, invoiceLines: { select: { sellContractId: true } } },
      orderBy: { number: 'asc' },
      take: 1_000,
    })
    const open = bills
      .map((b) => ({ ...b, minor: minorFromWhole(b.total, b.currency), owedMinor: minorFromWhole(b.total, b.currency) - minorFromWhole(b.paid, b.currency) }))
      .filter((b) => b.owedMinor > 0)
    for (const p of loose) {
      const f = fact(p)
      const v = judgeUnplaced(f, open as OpenBill[])
      if (v.kind === 'MATCHED') {
        if (!moves) continue
        if (!(await ctx.mayAct())) return
        const b = open.find((x) => x.id === v.bill.id)!
        const lineContractIds = [...new Set(b.invoiceLines.map((l) => l.sellContractId).filter((x): x is string => !!x))]
        const said = await moveMonth({ id: b.id, periodStart: b.periodStart, periodEnd: b.periodEnd, currency: b.currency, lineContractIds, minor: f.minor })
        await mark(p.id, 'PAYMENT_MATCHED', `Matched to bill ${b.number}, which is owed exactly this amount. The payment is not yet placed against it: placing it is a person’s.${said}`)
        continue
      }
      if (!(await ctx.mayAct())) return
      const words = v.kind === 'NO_BILL' ? noBillWords(f)
        : v.kind === 'MANY_BILLS' ? manyBillsWords(f, v.bills)
        : currencyWords(v.bill, f)
      const r = await flag({ recordType: 'Payment', recordId: p.id }, words, null)
      if (r === 'OPENED' || r === 'ALREADY_OPEN' || r === 'ALREADY_DECIDED') {
        await mark(p.id, 'PAYMENT_FLAGGED', `${words.question} A decision is open. Nothing was moved.`)
      }
    }
  }

  // ── A bill's rate against its contract line's ─────────────────────
  const owedBills = await prisma.invoice.findMany({
    where: { ...invoicesRaisedBy(companyId), status: { notIn: NOT_OWED } },
    select: {
      id: true, number: true, currency: true,
      invoiceLines: {
        where: { sellContractId: { not: null }, timesheetId: { not: null }, rateCents: { gt: 0 } },
        select: { id: true, rateCents: true, person: { select: { name: true } }, sellContract: { select: { id: true, billRate: true, billCurrency: true } } },
      },
    },
    orderBy: { number: 'asc' },
    take: 500,
  })
  const contractIds = [...new Set(owedBills.flatMap((b) => b.invoiceLines.map((l) => l.sellContract?.id)).filter((x): x is string => !!x))]
  const amended = new Set(
    contractIds.length === 0 ? [] : (await prisma.rateHistory.findMany({
      where: { contractType: 'SELL', contractId: { in: contractIds }, approvalState: 'APPROVED' }, select: { contractId: true },
    })).map((r) => r.contractId),
  )
  for (const b of owedBills) {
    for (const l of b.invoiceLines) {
      if (!l.sellContract) continue
      const d = driftOf({
        lineRateCents: l.rateCents, lineCurrency: b.currency,
        contractRateCents: l.sellContract.billRate, contractCurrency: l.sellContract.billCurrency,
        hasAmendments: amended.has(l.sellContract.id),
      })
      if (!d) continue
      if (!(await ctx.mayAct())) return
      const words = driftWords(b, l.person?.name ?? 'the consultant', d)
      const r = await flag({ recordType: 'InvoiceLine', recordId: l.id }, words, null)
      if (r === 'OPENED') await ctx.act({ recordType: 'InvoiceLine', recordId: l.id, action: 'RATE_DRIFT_FLAGGED', summary: `${words.question} A decision is open. Nothing was changed.` })
    }
  }
}

export const reconciliationAgent: AgentDef = { ruleVersion: RECONCILIATION_RULE, step: reconcileStep }

/** Put the step in the runner's registry. Called by the cron route that runs agents. */
export function registerReconciliation() { registerAgent(CHASE_AND_RECONCILIATION, reconciliationAgent) }
