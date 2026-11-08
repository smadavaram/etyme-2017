/**
 * The bank check against the database: who at the paying firm checks,
 * what the supplier entered, and the check itself. The rules are in
 * lib/money/bank-check; this only reads and writes.
 *
 * The check writes the same three columns on the supplier's payment
 * details that the supplier walk's Finance item writes
 * (app/api/supplier-requests/[id]), so `mayPayFirm` in lib/setup-gates
 * passes on either, and a later change to the bank clears both
 * (`bankChange` in lib/money/remit-change).
 */

import { prisma } from '@/lib/db'
import { NOT_THE_SAMPLE_SEAT } from '@/lib/sample-seat'
import { mayPayFirm } from '@/lib/setup-gates'
import {
  bankCheckers, bankHeldSays, bankCheckWrite, mayCheckBank,
  type BankHeld, type PayerSeat, type BankFactsShown,
} from '@/lib/money/bank-check'

type Firm = { id: string; name: string }

/** Every live seat at the paying firm, with its role, for `bankCheckers`. */
export async function payerSeats(companyId: string): Promise<PayerSeat[]> {
  const rows = await prisma.context.findMany({
    where: { companyId, revokedAt: null, type: { not: 'CONSULTANT' }, ...NOT_THE_SAMPLE_SEAT },
    select: { personId: true, person: { select: { name: true } }, role: { select: { name: true, permissions: true } } },
    orderBy: { grantedAt: 'asc' },
  })
  return rows.map((r) => ({
    personId: r.personId,
    name: r.person.name,
    roleName: r.role?.name ?? null,
    permissions: r.role?.permissions ?? [],
  }))
}

/** The payment details a check is made on: the default, else the first entered (the walk's order). */
async function payeeRemit(payeeId: string) {
  return prisma.remitTo.findFirst({
    where: { companyId: payeeId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, bankName: true, accountName: true, legalName: true, accountLast4: true },
  })
}

function factsOf(r: Awaited<ReturnType<typeof payeeRemit>>): BankFactsShown | null {
  if (!r) return null
  return { bankName: r.bankName, accountName: r.accountName ?? r.legalName, accountLast4: r.accountLast4 }
}

/** What a held receipt says about the bank, to this reader (null: the twin, a queue line). */
export async function bankHoldAt(a: { payer: Firm; payee: Firm; viewerId: string | null }): Promise<BankHeld> {
  const [seats, remit] = await Promise.all([payerSeats(a.payer.id), payeeRemit(a.payee.id)])
  return bankHeldSays({
    payee: a.payee.name,
    payer: a.payer.name,
    checkers: bankCheckers(seats),
    viewerId: a.viewerId,
    facts: factsOf(remit),
  })
}

export type BankCheckResult =
  | { ok: true; says: string }
  | { ok: false; status: 403 | 409 | 422; code: string; says: string }

/**
 * The check, by a person at the paying firm. Refused in a sentence where
 * the person is not who checks there, where nothing was entered, or where
 * the details are already checked.
 */
export async function checkPayeeBank(a: { payer: Firm; payee: Firm; by: { personId: string; name: string }; at?: Date }): Promise<BankCheckResult> {
  const gate = await mayPayFirm(a.payer.id, a.payee.id)
  if (gate.ok) return { ok: false, status: 409, code: 'ALREADY_CHECKED', says: `${a.payee.name}’s bank details are already checked.` }
  const [seats, remit] = await Promise.all([payerSeats(a.payer.id), payeeRemit(a.payee.id)])
  const may = mayCheckBank(a.by.personId, bankCheckers(seats), a.payer.name)
  if (!may.ok) return { ok: false, status: 403, code: 'FORBIDDEN', says: may.says }
  const write = bankCheckWrite({ payee: a.payee.name, payer: a.payer, by: a.by, facts: factsOf(remit), at: a.at ?? new Date() })
  if (!write.ok || !remit) return { ok: false, status: 422, code: 'NO_BANK_DETAILS', says: write.says }
  await prisma.remitTo.update({ where: { id: remit.id }, data: write.data })
  return { ok: true, says: write.says }
}
