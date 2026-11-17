/**
 * May this payer pay that supplier: the account this payer pays, and this
 * payer's own confirmation of it (records 86 and 87, 2026-11-16 and 17).
 *
 * Record 86: "Each payer confirms for itself, so one client's check never
 * counts for another", and a bank change is held until each paying client
 * confirms it with a call back, then for three days. Record 87: the
 * account is the one the supplier chose for this payer, else its default
 * (`readPayToFor` in lib/vendor-master-read). Three days is 72 hours from
 * the recorded call back, counted on the clock: a call back on a Friday at
 * 3 PM opens payment on the Monday at 3 PM. No working-day rule applies.
 *
 * The rule (`payerStanding`) is pure. `mayPayFirmFor` reads the rows and
 * answers as `mayPayFirm` in lib/setup-gates does, with the same
 * signature, so that gate can become one line that calls this.
 *
 * Old checks: the single check stamped on the details counts only for the
 * payer it names (`checkedByPayer` in lib/setup-gate-rules). One that
 * names no payer counts for nobody.
 */

import { prisma } from '@/lib/db'
import { momentFor } from '@/lib/when'
import { checkedFor } from '@/lib/vendor-master'
import { readPayToFor } from '@/lib/vendor-master-read'
import { bankGate, bankNotChecked, bankCheckerNamesAt, type Gate, type BankCheckerNames, type PayToFacts } from '@/lib/setup-gates'
import type { PayToRow } from '@/lib/money/pay-to'

type Db = typeof prisma

/** Record 86's three days, as the clock counts them from the call back. */
export const PAYMENT_WAITS_HOURS = 72
const HOUR_MS = 60 * 60 * 1000

/** This payer's own check on the row it pays, with the change it answered. */
export interface OwnCheck {
  payerCompanyId: string
  bankName: string | null
  accountName: string | null
  accountLast4: string | null
  routingLast4: string | null
  checkedAt: Date
  callbackAt: Date | null
  callbackOutcome: 'CONFIRMED' | 'DID_NOT_MATCH' | 'NOT_REACHED' | null
  bankChangeRequestId: string | null
}

/** The row this payer pays, as read for the gate. */
export interface PayerRowRead {
  facts: PayToFacts
  own: OwnCheck | null
  /** The newest change the supplier entered on these details, if any. */
  latestChange: { id: string; state: 'ENTERED' | 'DISOWNED' } | null
}

export type PayerStanding =
  | { open: true }
  | { open: false; why: 'NO_DETAILS' | 'NOT_CHECKED' }
  /** The supplier entered a change and this payer has not confirmed it with a call back. */
  | { open: false; why: 'CHANGE_NOT_CONFIRMED' }
  /** Confirmed by call back; payment waits until `payableFrom`. */
  | { open: false; why: 'WAITING_72_HOURS'; payableFrom: Date }
  /** An Owner of the supplier said "This was not us". */
  | { open: false; why: 'CHANGE_DISOWNED' }

/**
 * Pure: whether this payer may pay the row it pays, now.
 *
 * Its own check decides, or the old check where that names this payer.
 * Where the supplier entered a change on the details, only this payer's
 * check that answers that change, with a call back that confirmed, opens
 * payment, and only 72 hours after the call back.
 */
export function payerStanding(payerId: string, read: PayerRowRead | null, now: Date): PayerStanding {
  if (!read) return { open: false, why: 'NO_DETAILS' }
  const own = read.own && read.own.payerCompanyId === payerId ? read.own : null
  const base = checkedFor(payerId, { ...read.facts, bankChecks: own ? [own] : [] })
  const change = read.latestChange
  if (change) {
    if (change.state === 'DISOWNED') return { open: false, why: 'CHANGE_DISOWNED' }
    if (!own || own.bankChangeRequestId !== change.id) return { open: false, why: 'CHANGE_NOT_CONFIRMED' }
    if (!base.checked) return { open: false, why: 'CHANGE_NOT_CONFIRMED' }
    if (own.callbackOutcome !== 'CONFIRMED' || !own.callbackAt) return { open: false, why: 'CHANGE_NOT_CONFIRMED' }
    const payableFrom = new Date(own.callbackAt.getTime() + PAYMENT_WAITS_HOURS * HOUR_MS)
    if (now.getTime() < payableFrom.getTime()) return { open: false, why: 'WAITING_72_HOURS', payableFrom }
    return { open: true }
  }
  return base.checked ? { open: true } : { open: false, why: 'NOT_CHECKED' }
}

/** Who confirms a change at the paying firm, in a clause. */
function whoConfirms(who: BankCheckerNames | null | undefined): string {
  if (!who) return 'Your Finance team confirms the change with a call back'
  if (who.by === 'NOBODY') return `Nobody at ${who.payer} pays suppliers yet: give a seat the AP Clerk or Finance role, and that seat confirms the change with a call back`
  return `${who.names} confirms the change with a call back`
}

/** The sentence a held payment says, naming who confirms and when payment opens. */
export function payerHeldSays(payee: string, standing: Exclude<PayerStanding, { open: true }>, who?: BankCheckerNames | null): string {
  switch (standing.why) {
    case 'CHANGE_NOT_CONFIRMED':
      return `${payee} changed its bank details, so payment to ${payee} is held. ${whoConfirms(who)}. Payment opens ${PAYMENT_WAITS_HOURS} hours after that call back.`
    case 'WAITING_72_HOURS':
      return `${who?.payer ?? 'Your company'} confirmed ${payee}’s new bank details by call back. Payment to ${payee} opens ${momentFor(standing.payableFrom, null)}, ${PAYMENT_WAITS_HOURS} hours after the call back.`
    case 'CHANGE_DISOWNED':
      return `${payee}’s Owner said the latest change to its bank details was not theirs, so nothing is paid to it. ${payee} enters its details again, then your company confirms them.`
    default:
      return bankNotChecked(payee, who)
  }
}

const OWN_CHECK_SELECT = {
  payerCompanyId: true, bankName: true, accountName: true, accountLast4: true, routingLast4: true,
  checkedAt: true, callbackAt: true, callbackOutcome: true, bankChangeRequestId: true,
} as const

/** The row this payer pays this supplier, and where this payer stands on it. */
export async function payerStandingAt(
  payerId: string,
  supplierId: string,
  db: Db = prisma,
  now: Date = new Date(),
): Promise<{ payTo: PayToRow | null; standing: PayerStanding }> {
  const payTo = await readPayToFor(supplierId, payerId, db)
  if (!payTo) return { payTo: null, standing: { open: false, why: 'NO_DETAILS' } }
  const row = await db.remitTo.findUnique({
    where: { id: payTo.id },
    select: {
      bankName: true, accountName: true, accountLast4: true, routingLast4: true, verifiedAt: true, verifiedByCompanyId: true,
      bankChecks: { where: { payerCompanyId: payerId }, select: OWN_CHECK_SELECT },
      bankChangeRequests: { orderBy: [{ enteredAt: 'desc' }, { id: 'desc' }], take: 1, select: { id: true, state: true } },
    },
  })
  if (!row) return { payTo: null, standing: { open: false, why: 'NO_DETAILS' } }
  const { bankChecks, bankChangeRequests, ...facts } = row
  const read: PayerRowRead = { facts, own: bankChecks[0] ?? null, latestChange: bankChangeRequests[0] ?? null }
  return { payTo, standing: payerStanding(payerId, read, now) }
}

/**
 * May this firm pay that one: `mayPayFirm`'s question, answered per payer.
 * Where the payee has details on Etyme, the row this payer pays and this
 * payer's own confirmation decide. Where it has none, this payer's newest
 * supplier walk holding the bank item is the check, as before.
 */
export async function mayPayFirmFor(
  payerCompanyId: string,
  payeeCompanyId: string,
  db: Db = prisma,
  now: Date = new Date(),
): Promise<Gate> {
  const [payee, at] = await Promise.all([
    db.company.findUnique({ where: { id: payeeCompanyId }, select: { name: true } }),
    payerStandingAt(payerCompanyId, payeeCompanyId, db, now),
  ])
  const name = payee?.name ?? 'This firm'
  if (!at.payTo) {
    const walks = await db.supplierRequest.findMany({
      where: { companyId: payerCompanyId, OR: [{ supplierCompanyId: payeeCompanyId }, { firmCompanyId: payeeCompanyId }] },
      select: { checklist: true },
      orderBy: { createdAt: 'desc' },
      take: 3,
    })
    const states = walks.map((w) => (Array.isArray(w.checklist) ? (w.checklist as any[]).find((i) => i?.key === 'BANK')?.state ?? null : null))
    const facts = { payee: name, remitOnFile: false, remitVerified: false, walkBankState: states.find((s) => s != null) ?? null }
    const open = bankGate(facts)
    if (open.ok) return open
    return bankGate({ ...facts, who: await bankCheckerNamesAt(payerCompanyId) })
  }
  if (at.standing.open) return { ok: true }
  return { ok: false, says: payerHeldSays(name, at.standing, await bankCheckerNamesAt(payerCompanyId)), step: 'BANK' }
}
