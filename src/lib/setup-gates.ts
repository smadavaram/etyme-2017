/**
 * What a skipped setup item refuses, and nothing else.
 *
 * The founder, 2026-10-22: "A skipped item refuses only the act that
 * needs it, in a sentence that names the step: no bill without a billing
 * address, no payment to a firm without verified bank details, no
 * colleague joining by domain until the domain is verified, no I-9 chased
 * for a party whose set was never confirmed. Everything else works on the
 * defaults."
 *
 * One function per refusal, each answering `{ ok: true }` or the sentence
 * and the step it names, so the route that does the act calls it and says
 * the sentence. The bill and the payment are money's routes, the chase is
 * regulatory's; this file is the rule they read, and they cannot drift
 * apart because there is one copy of it. The domain door is wired here
 * (`decideEntry` in lib/company-domains reads `mayJoinByDomain`).
 */

import { prisma } from '@/lib/db'
import { PARTY_SAYS, type Party } from '@/lib/document-stages/required-sets'
import {
  NO_BILLING_ADDRESS, billingAddressGate, bankGate, paperChaseGate, type Gate, type BankCheckerNames, type PayerCheck,
} from '@/lib/setup-gate-rules'
import { readCheckedFor } from '@/lib/vendor-master-read'

export * from '@/lib/setup-gate-rules'

type Db = typeof prisma

// ── No bill without a billing address ───────────────────────────────

/**
 * May this company send a bill? Money's send route calls it before a bill
 * goes out (`POST /api/invoices/[id]/send`, the generator that sends, and
 * the twin's send), and says the sentence.
 */
export async function mayIssueBill(issuerCompanyId: string, db: Db = prisma): Promise<Gate> {
  const [c, addresses, remit] = await Promise.all([
    db.company.findUnique({ where: { id: issuerCompanyId }, select: { billingSameAsLegal: true } }),
    db.companyAddress.findMany({ where: { companyId: issuerCompanyId }, select: { kind: true, street: true, city: true } }),
    db.remitTo.findFirst({ where: { companyId: issuerCompanyId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }], select: { addressLines: true } }),
  ])
  if (!c) return { ok: false, says: NO_BILLING_ADDRESS, step: 'ADDRESSES' }
  return billingAddressGate({
    billingSameAsLegal: c.billingSameAsLegal,
    legal: addresses.find((a) => a.kind === 'LEGAL') ?? null,
    billing: addresses.find((a) => a.kind === 'BILLING') ?? null,
    remitAddressLines: remit?.addressLines ?? [],
  })
}

// ── No payment to a firm whose bank details are not checked ──────────

/**
 * May this firm pay that one? Money's payment routes call it before a
 * payment is recorded to a firm (`recordInvoicePayment` in
 * lib/money/invoice-payment, the AP bill payment, a payment run's items),
 * never before payroll to a person.
 *
 * Records 86 and 87: answered per payer, by money's gate
 * (`mayPayFirmFor` in lib/money/pay-gate). The row this payer pays and
 * this payer's own confirmation decide; another payer's check, or an old
 * check that names no payer, counts for nobody. Where the payee has no
 * details on Etyme, this payer's supplier walk decides, as before.
 * Imported at the call, because lib/money/pay-gate reads this file.
 */
export async function mayPayFirm(payerCompanyId: string, payeeCompanyId: string, db: Db = prisma, now: Date = new Date()): Promise<Gate> {
  const { mayPayFirmFor } = await import('@/lib/money/pay-gate')
  return mayPayFirmFor(payerCompanyId, payeeCompanyId, db, now)
}

/**
 * Has this paying firm, itself, checked the details a payment to that
 * firm goes to? Record 86: each payer confirms for itself. Record 87: the
 * details are the ones that firm chose for this payer, else its default.
 * Read from this payer's own standing (`payerStandingAt` in
 * lib/money/pay-gate), the same answer the payment gate gives: a change
 * the supplier entered and this payer has not confirmed by call back, or
 * one still inside its 72 hours, is not checked.
 */
export async function bankCheckedBy(payerCompanyId: string, payeeCompanyId: string, db: Db = prisma, now: Date = new Date()): Promise<PayerCheck> {
  const { payerStandingAt } = await import('@/lib/money/pay-gate')
  const [check, at] = await Promise.all([
    readCheckedFor(payerCompanyId, payeeCompanyId, db),
    payerStandingAt(payerCompanyId, payeeCompanyId, db, now),
  ])
  if (!check.checked || at.standing.open) return check
  return { checked: false, why: at.standing.why === 'NO_DETAILS' ? 'NO_DETAILS' : at.standing.why === 'NOT_CHECKED' ? 'NOT_CHECKED' : 'DETAILS_CHANGED' }
}

/**
 * Who checks a supplier's bank details at this firm, by name, through
 * money's reader (`payerSeats`, `bankCheckers` in lib/money). Imported at
 * the call, because lib/money/bank-check-read reads this file's gate.
 * Null where the read fails, which says the old line rather than nothing.
 */
export async function bankCheckerNamesAt(payerCompanyId: string): Promise<BankCheckerNames | null> {
  try {
    const [{ payerSeats }, { bankCheckers, namesOf }, payer] = await Promise.all([
      import('@/lib/money/bank-check-read'),
      import('@/lib/money/bank-check'),
      prisma.company.findUnique({ where: { id: payerCompanyId }, select: { name: true } }),
    ])
    const checkers = bankCheckers(await payerSeats(payerCompanyId))
    return { by: checkers.by, names: namesOf(checkers), payer: payer?.name ?? 'your company' }
  } catch {
    return null
  }
}

// ── No colleague joining by domain until it is verified ──────────────

// ── No paper chased for a party whose set was never confirmed ────────

/**
 * May Etyme chase this company's party for a paper? Regulatory's nightly
 * chase (`cron/watch`'s letters, `lib/credential-chase`, the packet
 * reminders) calls it per company and party before it writes, and skips
 * with the sentence where the set was never confirmed.
 */
export async function mayChasePaper(companyId: string, party: Party, db: Db = prisma): Promise<Gate> {
  const n = await db.documentRequirement.count({ where: { companyId, party } })
  return paperChaseGate(party, n > 0 ? [party] : [])
}

/** The party words the step draws, re-exported so a screen and a refusal say one thing. */
export { PARTY_SAYS }
