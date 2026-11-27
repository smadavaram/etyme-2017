/**
 * The answer key for `payment.match` (record 123, plan C3 and C9).
 *
 * The run is about one payment a person recorded as received. This reads the
 * payment, its bill and the other payments on the bill again (only those on
 * record received by the time the run was made), and judges them with the rules' own
 * readers (`judgeBill`, `judgeUnplaced`): to the cent, in the bill's own
 * currency, and never across two currencies.
 *  - A payment the ledger says was matched must read matched now: the
 *    payments in the bill's currency add up to its total exactly, or, for a
 *    payment nobody placed, exactly one open bill is owed that very amount.
 *  - A payment the ledger says was flagged must read as a short pay, an
 *    overpay, a currency mismatch, no bill or many bills, and one card with
 *    those very words (both figures in them) must be on the record, owed by
 *    the receivables seat the owner reader names, else the Owner.
 * A flagged payment that now reads matched has moved on and is not graded.
 */
import type { PrismaClient } from '@prisma/client'
import { minorFromWhole } from '@/lib/money'
import { invoicesRaisedBy } from '@/lib/money/invoice-parties'
import { RECEIVABLES_ROLES } from '@/lib/money/agent-owners'
import {
  judgeBill, judgeUnplaced, shortPayWords, overPayWords, currencyWords, noBillWords, manyBillsWords,
  type Finding, type OpenBill, type PaymentFact,
} from '@/lib/money/payment-match'
import { unknownBecause, type CheckerResult, type SkillChecker } from '../checker'
import { cardsAt, judgeCards, ownerFor } from './cards'

const NOT_A_LIVE_BILL = ['DRAFT', 'CANCELLED', 'VOID']
const NOT_OWED = ['PAID', ...NOT_A_LIVE_BILL]

type Pay = { id: string; amount: { toString(): string }; currency: string; reference: string | null }
const fact = (p: Pay): PaymentFact => ({ id: p.id, minor: minorFromWhole(p.amount, p.currency), currency: p.currency, reference: p.reference })

export const paymentMatch: SkillChecker<PrismaClient> = async (companyId, _key, window, refs, read): Promise<CheckerResult> => {
  const ref = refs[0]
  if (!ref) return unknownBecause('The run names no payment, so there is nothing to re-read.')
  const evidence = `Payment ${ref.recordId}`
  const pay = await read.payment.findFirst({ where: { id: ref.recordId, receivedByCompanyId: companyId }, select: { id: true, invoiceId: true, amount: true, currency: true, reference: true } })
  if (!pay) return { verdict: 'FAIL', reason: 'The payment the run is about is not one this firm received.', evidence, unitsFound: 0 }
  const lines = await read.recordAction.findMany({ where: { companyId, recordType: 'Payment', recordId: pay.id, action: { in: ['PAYMENT_MATCHED', 'PAYMENT_FLAGGED'] } }, select: { action: true } })
  if (lines.length === 0) return { verdict: 'FAIL', reason: 'No line on the ledger says the payment was matched or flagged.', evidence, unitsFound: 0 }
  if (lines.length > 1) return { verdict: 'FAIL', reason: `${lines.length} lines on the ledger say what became of the payment, and there should be one.`, evidence, unitsFound: 0 }
  const said = lines[0].action
  const me = fact(pay)

  // What the record says it is, and the words and link a card about it must carry.
  let matched = false
  let finding: Finding | null = null
  let link: { recordType: string; recordId: string } = { recordType: 'Payment', recordId: pay.id }
  if (pay.invoiceId) {
    const inv = await read.invoice.findFirst({
      where: { id: pay.invoiceId, ...invoicesRaisedBy(companyId), status: { notIn: NOT_A_LIVE_BILL } },
      select: { id: true, number: true, currency: true, total: true, payments: { where: { receivedAt: { lte: window.to } }, select: { id: true, amount: true, currency: true, reference: true } } },
    })
    if (!inv) return { verdict: 'FAIL', reason: 'The bill the payment was placed against is not one this firm raised, or is no longer live.', evidence, unitsFound: 0 }
    const bill = { id: inv.id, number: inv.number, currency: inv.currency, minor: minorFromWhole(inv.total, inv.currency) }
    const verdicts = judgeBill(bill, inv.payments.map(fact))
    const mine = verdicts.find((v) => (v.kind === 'CURRENCY' ? v.payment.id === pay.id : pay.currency === bill.currency))
    if (!mine) return { verdict: 'FAIL', reason: 'The payment is on no bill the rules can judge it against.', evidence, unitsFound: 0 }
    if (mine.kind === 'MATCHED') matched = true
    else if (mine.kind === 'CURRENCY') finding = currencyWords(bill, me)
    else { finding = mine.kind === 'SHORT' ? shortPayWords(bill, mine) : overPayWords(bill, mine); link = { recordType: 'Invoice', recordId: inv.id } }
  } else {
    const bills = await read.invoice.findMany({
      where: { ...invoicesRaisedBy(companyId), status: { notIn: NOT_OWED } },
      select: { id: true, number: true, currency: true, total: true, paid: true }, orderBy: { number: 'asc' }, take: 1_000,
    })
    const open = bills
      .map((b) => ({ id: b.id, number: b.number, currency: b.currency, minor: minorFromWhole(b.total, b.currency), owedMinor: minorFromWhole(b.total, b.currency) - minorFromWhole(b.paid, b.currency) }))
      .filter((b) => b.owedMinor > 0) as OpenBill[]
    const v = judgeUnplaced(me, open)
    if (v.kind === 'MATCHED') matched = true
    else finding = v.kind === 'NO_BILL' ? noBillWords(me) : v.kind === 'MANY_BILLS' ? manyBillsWords(me, v.bills) : currencyWords(v.bill, me)
  }

  if (said === 'PAYMENT_MATCHED') {
    if (!matched) return { verdict: 'FAIL', reason: 'The ledger says the payment matched its bill, and the record does not show it equal to the bill to the cent in the bill’s own currency.', evidence, unitsFound: 0 }
    return { verdict: 'PASS', reason: 'The payment equals its bill to the cent in the bill’s own currency.', evidence, unitsFound: 1 }
  }
  if (matched || !finding) return unknownBecause('The payment now reads as matched, so the flag cannot be re-read against the record.')
  const cards = await cardsAt(read, companyId, link, finding.question)
  return judgeCards(cards, await ownerFor(read, companyId, RECEIVABLES_ROLES, window.to), 'the payment that does not match, with both figures', evidence)
}
