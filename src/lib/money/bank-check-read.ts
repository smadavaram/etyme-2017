/**
 * The bank check against the database: who at the paying firm checks,
 * what the supplier entered, and the check itself. The rules are in
 * lib/money/bank-check; this only reads and writes.
 *
 * The check is this payer's own (record 86): a `BankCheck` row on the
 * details this payer pays (`readPayToFor`, record 87), holding what was
 * checked, so a later change to the bank voids it for this payer alone.
 * The three old columns the supplier walk's Finance item writes are
 * written too where they are empty, for the gate that still reads them
 * (`mayPayFirm` in lib/setup-gates), and never over another payer's.
 */

import { prisma } from '@/lib/db'
import { NOT_THE_SAMPLE_SEAT } from '@/lib/sample-seat'
import { readPayToFor } from '@/lib/vendor-master-read'
import { payerStandingAt, payerHeldSays } from '@/lib/money/pay-gate'
import { bankCheckerNamesAt } from '@/lib/setup-gates'
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

/**
 * The payment details a check is made on: the row this payer pays
 * (`readPayToFor`, record 87), the same row the gate asks about.
 */
async function payeeRemit(payerId: string, payeeId: string) {
  return readPayToFor(payeeId, payerId)
}

function factsOf(r: Awaited<ReturnType<typeof payeeRemit>>): BankFactsShown | null {
  if (!r) return null
  return { bankName: r.bankName, accountName: r.accountName ?? r.legalName, accountLast4: r.accountLast4 }
}

/** What a held receipt says about the bank, to this reader (null: the twin, a queue line). */
export async function bankHoldAt(a: { payer: Firm; payee: Firm; viewerId: string | null }): Promise<BankHeld> {
  const [seats, remit] = await Promise.all([payerSeats(a.payer.id), payeeRemit(a.payer.id, a.payee.id)])
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
  const at = a.at ?? new Date()
  // This payer's own standing, never another payer's check.
  const { payTo, standing } = await payerStandingAt(a.payer.id, a.payee.id, prisma, at)
  // Already checked by this payer, and the old columns the gate still
  // reads agree. Where a walk cleared those columns, the check is written
  // again so the hold can be lifted.
  if (standing.open && payTo?.verifiedAt) return { ok: false, status: 409, code: 'ALREADY_CHECKED', says: `${a.payee.name}’s bank details are already checked.` }
  // A change the supplier entered is confirmed with a call back, never by
  // this check, and a confirmed one waits its 72 hours.
  if (!standing.open && (standing.why === 'CHANGE_NOT_CONFIRMED' || standing.why === 'WAITING_72_HOURS' || standing.why === 'CHANGE_DISOWNED')) {
    return { ok: false, status: 409, code: 'CHANGE_WAITS', says: payerHeldSays(a.payee.name, standing, await bankCheckerNamesAt(a.payer.id)) }
  }
  const [seats, remit] = await Promise.all([payerSeats(a.payer.id), payeeRemit(a.payer.id, a.payee.id)])
  const may = mayCheckBank(a.by.personId, bankCheckers(seats), a.payer.name)
  if (!may.ok) return { ok: false, status: 403, code: 'FORBIDDEN', says: may.says }
  const write = bankCheckWrite({ payee: a.payee.name, payer: a.payer, by: a.by, facts: factsOf(remit), at })
  if (!write.ok || !remit) return { ok: false, status: 422, code: 'NO_BANK_DETAILS', says: write.says }
  const row = await prisma.remitTo.findUniqueOrThrow({
    where: { id: remit.id },
    select: { bankName: true, accountName: true, accountLast4: true, routingLast4: true },
  })
  const checked = { ...row, checkedById: a.by.personId, checkedAt: at }
  await prisma.$transaction([
    prisma.bankCheck.upsert({
      where: { remitToId_payerCompanyId: { remitToId: remit.id, payerCompanyId: a.payer.id } },
      create: { remitToId: remit.id, payerCompanyId: a.payer.id, ...checked },
      update: {
        ...checked,
        callbackAt: null, callbackById: null, callbackNumber: null, callbackNumberSource: null, callbackSpokeWith: null,
        callbackOutcome: null, bankChangeRequestId: null,
      },
    }),
    // The old columns, only where nobody's check stands on them.
    prisma.remitTo.updateMany({ where: { id: remit.id, verifiedAt: null }, data: write.data }),
  ])
  return { ok: true, says: write.says }
}
