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
  NO_BILLING_ADDRESS, billingAddressGate, bankGate, checkedByPayer, paperChaseGate, type Gate, type BankCheckerNames, type PayerCheck,
} from '@/lib/setup-gate-rules'
import { payToRow } from '@/lib/money/pay-to'

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
 */
export async function mayPayFirm(payerCompanyId: string, payeeCompanyId: string, db: Db = prisma): Promise<Gate> {
  const [payee, payTo, walks] = await Promise.all([
    db.company.findUnique({ where: { id: payeeCompanyId }, select: { name: true } }),
    // The row the payment goes to, through money's one reader, never
    // "some checked row" (Layer 7 money review, 2026-11-16).
    payToRow(payeeCompanyId, db),
    db.supplierRequest.findMany({
      where: { companyId: payerCompanyId, OR: [{ supplierCompanyId: payeeCompanyId }, { firmCompanyId: payeeCompanyId }] },
      select: { checklist: true },
      orderBy: { createdAt: 'desc' },
      take: 3,
    }),
  ])
  const states = walks.map((w) => (Array.isArray(w.checklist) ? (w.checklist as any[]).find((i) => i?.key === 'BANK')?.state ?? null : null))
  const facts = {
    payee: payee?.name ?? 'This firm',
    remitOnFile: !!payTo,
    remitVerified: !!payTo?.verifiedAt,
    // The newest walk that carries a bank item says where it stands; an
    // older walk's hold never stands in for the newest walk's answer.
    walkBankState: states.find((s) => s != null) ?? null,
  }
  const open = bankGate(facts)
  if (open.ok) return open
  // Refused: say who checks at the paying firm, read the way money reads
  // it for a held receipt, so the payment, the payment run and the receipt
  // name the same people.
  return bankGate({ ...facts, who: await bankCheckerNamesAt(payerCompanyId) })
}

/**
 * Has this paying firm, itself, checked the details a payment to that
 * firm goes to? Record 86: each payer confirms for itself. The row is
 * money's one reader (`payToRow`); the answer is `checkedByPayer`, which
 * reads this payer's `BankCheck` first and the old columns second.
 *
 * Not read by `mayPayFirm` yet: who may pay does not change in this
 * slice. The payment gate, the held receipt's check and the payment run's
 * file move onto it together, in money's next slice.
 */
export async function bankCheckedBy(payerCompanyId: string, payeeCompanyId: string, db: Db = prisma): Promise<PayerCheck> {
  const payTo = await payToRow(payeeCompanyId, db)
  if (!payTo) return checkedByPayer(null, null, payerCompanyId)
  const row = await db.remitTo.findUnique({
    where: { id: payTo.id },
    select: {
      bankName: true, accountName: true, accountLast4: true, routingLast4: true, verifiedAt: true, verifiedByCompanyId: true,
      bankChecks: {
        where: { payerCompanyId },
        select: { bankName: true, accountName: true, accountLast4: true, routingLast4: true, checkedAt: true, callbackOutcome: true },
      },
    },
  })
  if (!row) return checkedByPayer(null, null, payerCompanyId)
  const { bankChecks, ...facts } = row
  return checkedByPayer(facts, bankChecks[0] ?? null, payerCompanyId)
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
