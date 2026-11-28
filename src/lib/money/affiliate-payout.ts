/**
 * Statements and payouts (record 129). Etyme never moves money.
 *
 * A month's statement is made from the affiliate's ledger entries and is
 * written once. A negative month is carried into the next one: a clawback
 * after payout is taken off later pay, never collected. A payout is a
 * list that leaves as a file for the client's own bank, and it waits for
 * a verified Owner and a fresh second check. Nothing here pays anyone,
 * and the sealed account number is never read: the file carries the bank,
 * the account name and four digits.
 *
 * Nothing here reads a sell line, a buy line, a margin or a placement.
 */
import { createHash, randomBytes } from 'crypto'
import type { PrismaClient } from '@prisma/client'
import { prisma as defaultDb } from '@/lib/db'
import { buildStatement, statementMonthOf } from './affiliate-commission'
import { meterActs } from './affiliate-metering'
import { csvCell, decimalAmount } from './run-file'
import type { OwnerGate } from '@/lib/owner-gate'
import type { SpentCheck } from '@/lib/identity/second-check'
import type { Actor, AffiliateAct, Refused } from './affiliate-registry'

const NEEDS_STAFF = 'Only Etyme staff close statements and prepare payouts.'

/** Close one affiliate's month. Written once; closing again returns the same statement. Months close in order. */
export async function closeStatement(
  i: { affiliateId: string; month: string },
  actor: Actor,
  now: Date = new Date(),
  db: PrismaClient = defaultDb,
): Promise<{ ok: true; statementId: string; netCents: number; alreadyClosed: boolean; acts: AffiliateAct[] } | Refused> {
  if (!actor.staff) return { ok: false, says: NEEDS_STAFF }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(i.month)) return { ok: false, says: 'A statement is for a month written like 2027-02.' }
  if (i.month >= statementMonthOf(now)) return { ok: false, says: 'A month is closed after it ends.' }
  return db.$transaction(async (tx) => {
    const same = await tx.affiliateStatement.findUnique({ where: { affiliateId_month: { affiliateId: i.affiliateId, month: i.month } } })
    if (same) return { ok: true as const, statementId: same.id, netCents: same.netCents, alreadyClosed: true, acts: [] }
    if (!(await tx.affiliate.findUnique({ where: { id: i.affiliateId }, select: { id: true } }))) return { ok: false as const, says: 'There is no such affiliate.' }
    const later = await tx.affiliateStatement.findFirst({ where: { affiliateId: i.affiliateId, month: { gt: i.month } }, select: { month: true } })
    if (later) return { ok: false as const, says: `A later month (${later.month}) is already closed. Months close in order.` }
    const prev = await tx.affiliateStatement.findFirst({ where: { affiliateId: i.affiliateId, month: { lt: i.month } }, orderBy: { month: 'desc' } })
    const prevPaid = prev ? await tx.affiliatePayoutItem.findUnique({ where: { statementId: prev.id }, select: { id: true } }) : null
    const carriedInCents = prev && !prevPaid ? prev.netCents : 0
    const entries = await tx.affiliateCommissionEntry.findMany({ where: { affiliateId: i.affiliateId, statementMonth: i.month }, select: { commissionCents: true } })
    const f = buildStatement({ carriedInCents, entries })
    const row = await tx.affiliateStatement.create({ data: { affiliateId: i.affiliateId, month: i.month, ...f } })
    return { ok: true as const, statementId: row.id, netCents: f.netCents, alreadyClosed: false, acts: await meterActs(tx, [{ action: 'STATEMENT_CLOSED', recordType: 'AffiliateStatement', recordId: row.id, summary: `The ${i.month} statement was closed at ${f.netCents} cents.`, personId: actor.personId, heldAs: 'Etyme staff' }]) }
  })
}

export const PAYOUT_FILE_COLUMNS = [
  'etyme_payment_reference', 'affiliate', 'statement_month', 'amount', 'currency',
  'bank_name', 'account_name', 'account_last4',
  // Blank, for the payer's own system to fill in: the file can come back as its own confirmation.
  'paid_date', 'payer_reference',
] as const

export const payoutReference = (itemId: string) => `ETY-AFF-${itemId}`

export interface PayoutFileLine { reference: string; affiliate: string; month: string; amountCents: number; bankName: string | null; accountName: string | null; last4: string | null }

/** The file, pure. Dollars only; the account number has no place in it. */
export function payoutFileOf(lines: PayoutFileLine[]): string {
  const out = [PAYOUT_FILE_COLUMNS.join(',')]
  for (const l of lines) {
    out.push([l.reference, l.affiliate, l.month, decimalAmount(l.amountCents, 'USD'), 'USD', l.bankName ?? '', l.accountName ?? '', l.last4 ?? '', '', ''].map(csvCell).join(','))
  }
  const total = lines.reduce((s, l) => s + l.amountCents, 0)
  out.push(['TOTAL', `Total USD`, '', decimalAmount(total, 'USD'), 'USD', '', '', '', '', ''].map(csvCell).join(','))
  return `${out.join('\r\n')}\r\n`
}

/** What a month's payout would hold, and who was left out and why. Draft only: nothing is approved. */
export async function draftPayout(
  i: { month: string },
  actor: Actor,
  db: PrismaClient = defaultDb,
): Promise<{ ok: true; batchId: string; totalCents: number; items: number; leftOut: { affiliate: string; why: string }[]; acts: AffiliateAct[] } | Refused> {
  if (!actor.staff) return { ok: false, says: NEEDS_STAFF }
  return db.$transaction(async (tx) => {
    if (await tx.affiliatePayoutBatch.findFirst({ where: { month: i.month, status: { in: ['DRAFT', 'APPROVED'] } }, select: { id: true } })) {
      return { ok: false as const, says: `A payout for ${i.month} is already waiting to be approved or issued.` }
    }
    const statements = await tx.affiliateStatement.findMany({ where: { month: i.month } })
    const leftOut: { affiliate: string; why: string }[] = []
    const picked: { statementId: string; affiliateId: string; name: string; amountCents: number; bank: string | null; account: string | null; last4: string | null }[] = []
    for (const s of statements) {
      const a = await tx.affiliate.findUniqueOrThrow({ where: { id: s.affiliateId } })
      if (s.netCents <= 0) { leftOut.push({ affiliate: a.name, why: s.netCents < 0 ? 'The month is negative; it carries into the next statement.' : 'Nothing is owed.' }); continue }
      if (await tx.affiliatePayoutItem.findUnique({ where: { statementId: s.id }, select: { id: true } })) { leftOut.push({ affiliate: a.name, why: 'This statement is already in a payout.' }); continue }
      const newer = await tx.affiliateStatement.findFirst({ where: { affiliateId: a.id, month: { gt: i.month } }, select: { id: true } })
      if (newer) { leftOut.push({ affiliate: a.name, why: 'A later statement has taken this one over.' }); continue }
      if (a.status !== 'ACTIVE') { leftOut.push({ affiliate: a.name, why: 'The affiliate is not active.' }); continue }
      if (!a.payoutBankName || !a.payoutAccountName || !a.payoutSealed || !a.payoutLast4) { leftOut.push({ affiliate: a.name, why: 'No payout details are on file.' }); continue }
      picked.push({ statementId: s.id, affiliateId: a.id, name: a.name, amountCents: s.netCents, bank: a.payoutBankName, account: a.payoutAccountName, last4: a.payoutLast4 })
    }
    if (picked.length === 0) return { ok: false as const, says: `Nobody is owed a payout for ${i.month}.${leftOut.length ? ' ' + leftOut.map((l) => `${l.affiliate}: ${l.why}`).join(' ') : ''}` }
    const totalCents = picked.reduce((s, p) => s + p.amountCents, 0)
    const batch = await tx.affiliatePayoutBatch.create({ data: { month: i.month, totalCents, createdByPersonId: actor.personId } })
    for (const p of picked) {
      const id = randomBytes(12).toString('hex')
      await tx.affiliatePayoutItem.create({ data: { id, batchId: batch.id, affiliateId: p.affiliateId, statementId: p.statementId, amountCents: p.amountCents, bankName: p.bank, accountName: p.account, last4: p.last4, reference: payoutReference(id) } })
    }
    return { ok: true as const, batchId: batch.id, totalCents, items: picked.length, leftOut, acts: await meterActs(tx, [{ action: 'PAYOUT_DRAFTED', recordType: 'AffiliatePayoutBatch', recordId: batch.id, summary: `A payout for ${i.month} was drafted: ${picked.length} affiliates, ${totalCents} cents. Nothing is paid.`, personId: actor.personId, heldAs: 'Etyme staff' }]) }
  })
}

/** The one act a second check may be made for to approve a payout. The subject is the batch's id. */
export const AFFILIATE_PAYOUT_ACT = 'affiliate.payout'
/** A check older than this when the approval is pressed is not fresh, though it was spent in time. */
export const PAYOUT_CHECK_FRESH_MINUTES = 5

/**
 * The approval: a verified Owner (the gate's verdict, passed in) and a
 * fresh second check made by this person for this act and this batch,
 * spent once (`spendCheck` in lib/identity/second-check). The check is
 * read again from the security log, never believed from the caller: it
 * must be a passed check by the approver, for this act and this batch,
 * recorded as spent, made in the last few minutes, and not already the
 * check of another batch. Approving moves no money.
 */
export async function approvePayout(
  i: { batchId: string; gate: OwnerGate; check: SpentCheck | null },
  approver: Actor,
  now: Date = new Date(),
  db: PrismaClient = defaultDb,
): Promise<{ ok: true; acts: AffiliateAct[] } | Refused> {
  if (!i.gate.ok) return { ok: false, says: i.gate.says }
  const check = i.check
  if (!check?.passedId) return { ok: false, says: 'Approving a payout needs a fresh second check. Do the check, then approve.' }
  if ((check.act as string) !== AFFILIATE_PAYOUT_ACT) return { ok: false, says: 'That second check was made for something else. Do the check for this payout, then approve.' }
  if (check.subjectId !== i.batchId) return { ok: false, says: 'That second check was made for another payout. Do the check for this payout, then approve.' }
  const passed = await db.securityEvent.findUnique({ where: { id: check.passedId }, select: { event: true, actorPersonId: true, targetKind: true, targetId: true, at: true } })
  if (!passed || passed.event !== 'SECOND_CHECK_PASSED') return { ok: false, says: 'There is no passed second check behind that. Do the check, then approve.' }
  if (passed.actorPersonId !== approver.personId) return { ok: false, says: 'That second check was not made by you. Do the check, then approve.' }
  if (passed.targetKind !== AFFILIATE_PAYOUT_ACT || passed.targetId !== i.batchId) return { ok: false, says: 'That second check was made for something else. Do the check for this payout, then approve.' }
  if (now.getTime() - passed.at.getTime() > PAYOUT_CHECK_FRESH_MINUTES * 60_000) return { ok: false, says: `That second check is more than ${PAYOUT_CHECK_FRESH_MINUTES} minutes old. Do the check again, then approve.` }
  const spent = await db.securityEvent.findUnique({ where: { id: `used_${check.passedId}` }, select: { event: true, targetKind: true, targetId: true } })
  if (!spent || spent.event !== 'SECOND_CHECK_USED' || spent.targetKind !== AFFILIATE_PAYOUT_ACT || spent.targetId !== i.batchId) return { ok: false, says: 'That second check was never spent on this payout. Do the check, then approve.' }
  return db.$transaction(async (tx) => {
    const b = await tx.affiliatePayoutBatch.findUnique({ where: { id: i.batchId } })
    if (!b) return { ok: false as const, says: 'There is no such payout.' }
    if (b.status !== 'DRAFT') return { ok: false as const, says: 'This payout was already approved or issued.' }
    if (await tx.affiliatePayoutBatch.findFirst({ where: { secondCheckEventId: check.passedId }, select: { id: true } })) {
      return { ok: false as const, says: 'That second check already approved a payout. One check approves one payout; do the check again.' }
    }
    await tx.affiliatePayoutBatch.update({ where: { id: b.id }, data: { status: 'APPROVED', approvedByPersonId: approver.personId, secondCheckEventId: check.passedId } })
    return { ok: true as const, acts: await meterActs(tx, [{ action: 'PAYOUT_APPROVED', recordType: 'AffiliatePayoutBatch', recordId: b.id, summary: `The ${b.month} payout was approved after a fresh second check. Etyme pays nothing; it leaves as a file.`, personId: approver.personId, heldAs: 'Owner' }]) }
  })
}

/** Issue the file of an approved payout. The only thing a payout ever produces. */
export async function issuePayoutFile(
  batchId: string,
  actor: Actor,
  now: Date = new Date(),
  db: PrismaClient = defaultDb,
): Promise<{ ok: true; csv: string; filename: string; fileHash: string; acts: AffiliateAct[] } | Refused> {
  if (!actor.staff) return { ok: false, says: NEEDS_STAFF }
  return db.$transaction(async (tx) => {
    const b = await tx.affiliatePayoutBatch.findUnique({ where: { id: batchId } })
    if (!b) return { ok: false as const, says: 'There is no such payout.' }
    if (b.status !== 'APPROVED' || !b.approvedByPersonId || !b.secondCheckEventId) return { ok: false as const, says: 'A payout leaves as a file only after a verified Owner approved it with a fresh second check.' }
    const items = await tx.affiliatePayoutItem.findMany({ where: { batchId }, orderBy: { createdAt: 'asc' } })
    const names = new Map((await tx.affiliate.findMany({ where: { id: { in: items.map((x) => x.affiliateId) } }, select: { id: true, name: true } })).map((a) => [a.id, a.name]))
    const csv = payoutFileOf(items.map((x) => ({ reference: x.reference, affiliate: names.get(x.affiliateId) ?? '', month: b.month, amountCents: x.amountCents, bankName: x.bankName, accountName: x.accountName, last4: x.last4 })))
    const fileHash = createHash('sha256').update(csv).digest('hex')
    await tx.affiliatePayoutBatch.update({ where: { id: b.id }, data: { status: 'FILE_ISSUED', fileHash, fileIssuedAt: now } })
    return { ok: true as const, csv, filename: `affiliate-payout-${b.month}-USD-${b.id.slice(-6)}.csv`, fileHash, acts: await meterActs(tx, [{ action: 'PAYOUT_FILE_ISSUED', recordType: 'AffiliatePayoutBatch', recordId: b.id, summary: `The ${b.month} payout file was issued. Nothing was paid by Etyme.`, personId: actor.personId, heldAs: 'Etyme staff' }]) }
  })
}

/** The confirmation that came back from the client's own bank: the day it was paid and its reference. */
export async function confirmPayout(
  i: { batchId: string; paidOn: Date; payerReference: string },
  actor: Actor,
  now: Date = new Date(),
  db: PrismaClient = defaultDb,
): Promise<{ ok: true; acts: AffiliateAct[] } | Refused> {
  if (!actor.staff) return { ok: false, says: NEEDS_STAFF }
  if (i.paidOn.getTime() > now.getTime()) return { ok: false, says: 'A paid date that has not happened yet is not recorded.' }
  if (!i.payerReference.trim()) return { ok: false, says: 'Confirming a payout needs the bank’s reference.' }
  return db.$transaction(async (tx) => {
    const b = await tx.affiliatePayoutBatch.findUnique({ where: { id: i.batchId } })
    if (!b || b.status !== 'FILE_ISSUED') return { ok: false as const, says: 'Only a payout whose file was issued can be confirmed.' }
    await tx.affiliatePayoutItem.updateMany({ where: { batchId: b.id }, data: { paidOn: i.paidOn, payerReference: i.payerReference.trim() } })
    await tx.affiliatePayoutBatch.update({ where: { id: b.id }, data: { status: 'CONFIRMED' } })
    return { ok: true as const, acts: await meterActs(tx, [{ action: 'PAYOUT_CONFIRMED', recordType: 'AffiliatePayoutBatch', recordId: b.id, summary: `The ${b.month} payout was confirmed paid by the bank’s own record.`, personId: actor.personId, heldAs: 'Etyme staff' }]) }
  })
}
