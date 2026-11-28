/**
 * A subscription receipt: the invoice a tenant actually paid, and what it
 * earns an affiliate (records 127 and 129). No payment, no commission.
 *
 * Marked paid by Etyme staff or the tenant's own Owner, with a reason; the
 * same transaction sets `Company.paidThrough` (nothing wrote it before) and
 * accrues the commission. A refund or chargeback is a reversal row and a
 * clawback row, never an edit. Dollars only: another currency is refused
 * rather than added to a dollar ledger.
 *
 * Nothing here reads a sell line, a buy line, a margin or a placement.
 */
import type { PrismaClient } from '@prisma/client'
import { prisma as defaultDb } from '@/lib/db'
import { accrualOf, clawbackOf, statementMonthOf } from './affiliate-commission'
import { effectiveAffiliate, reasonOk, type Actor, type AffiliateAct, type Refused } from './affiliate-registry'

export interface ReceiptActor extends Actor {
  /** True where the caller is an Owner of the tenant being marked. The route proves it. */
  ownerOfTenant?: boolean
}

const WHO = 'Only Etyme staff or the tenant’s own Owner mark a subscription paid.'
const whole = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0

export async function markSubscriptionPaid(
  i: { tenantCompanyId: string; periodStart: Date; periodEnd: Date; contractorCents: number; platformFeeCents: number; currency?: string; paidAt: Date; reference?: string | null; reason: string },
  actor: ReceiptActor,
  now: Date = new Date(),
  db: PrismaClient = defaultDb,
): Promise<{ ok: true; receiptId: string; commissionCents: number | null; commissionNote: string | null; acts: AffiliateAct[] } | Refused> {
  if (!actor.staff && !actor.ownerOfTenant) return { ok: false, says: WHO }
  if (!reasonOk(i.reason)) return { ok: false, says: 'Say why, in a few words: how you know it was paid. The reason is kept on the ledger.' }
  const currency = (i.currency ?? 'USD').toUpperCase()
  if (currency !== 'USD') return { ok: false, says: `A subscription is recorded in dollars. ${currency} is not added to a dollar ledger.` }
  if (!whole(i.contractorCents) || !whole(i.platformFeeCents)) return { ok: false, says: 'A subscription receipt is whole cents and never negative.' }
  if (!(i.periodEnd.getTime() > i.periodStart.getTime())) return { ok: false, says: 'The period must end after it starts.' }
  if (i.paidAt.getTime() > now.getTime()) return { ok: false, says: 'A paid date that has not happened yet is not recorded.' }

  return db.$transaction(async (tx) => {
    const company = await tx.company.findUnique({ where: { id: i.tenantCompanyId }, select: { id: true, name: true, activatedAt: true, billingExempt: true, paidThrough: true } })
    if (!company) return { ok: false as const, says: 'There is no such tenant.' }
    if (company.billingExempt) return { ok: false as const, says: `${company.name} is not billed, so no subscription is recorded for it.` }
    if (!company.activatedAt) return { ok: false as const, says: `${company.name} has not been activated yet. Activate it first; the 60 days and the referral both start there.` }
    if (await tx.subscriptionReceipt.findUnique({ where: { tenantCompanyId_periodStart: { tenantCompanyId: company.id, periodStart: i.periodStart } }, select: { id: true } })) {
      return { ok: false as const, says: 'A receipt for this period is already recorded. A mistake is a reversal, never a second receipt.' }
    }
    const receipt = await tx.subscriptionReceipt.create({
      data: { tenantCompanyId: company.id, periodStart: i.periodStart, periodEnd: i.periodEnd, contractorCents: i.contractorCents, platformFeeCents: i.platformFeeCents, currency, paidAt: i.paidAt, reference: i.reference?.trim() || null, reason: i.reason.trim(), markedByPersonId: actor.personId },
    })
    if (!company.paidThrough || company.paidThrough.getTime() < i.periodEnd.getTime()) {
      await tx.company.update({ where: { id: company.id }, data: { paidThrough: i.periodEnd } })
    }
    const acts: AffiliateAct[] = [{ action: 'SUBSCRIPTION_PAID', recordType: 'SubscriptionReceipt', recordId: receipt.id, summary: `${company.name}’s subscription was recorded as paid: ${i.reason.trim()}`, personId: actor.personId }]

    const eff = await effectiveAffiliate(company.id, tx)
    if (!eff || !eff.affiliateId) return { ok: true as const, receiptId: receipt.id, commissionCents: null, commissionNote: 'The tenant belongs to the house; no commission.', acts }
    const a = accrualOf({ activatedAt: eff.activatedAt, periodStart: i.periodStart, contractorCents: i.contractorCents, platformFeeCents: i.platformFeeCents })
    if (!a.ok) return { ok: true as const, receiptId: receipt.id, commissionCents: null, commissionNote: a.says, acts }
    await tx.affiliateCommissionEntry.create({
      data: { affiliateId: eff.affiliateId, attributionId: eff.attributionId, tenantCompanyId: company.id, kind: 'EARNED', sourceKey: `receipt:${receipt.id}`, receiptId: receipt.id, basisCents: a.basisCents, rateBp: a.rateBp, commissionCents: a.commissionCents, monthFromActivation: a.monthFromActivation, statementMonth: statementMonthOf(now) },
    })
    acts.push({ action: 'COMMISSION_ACCRUED', recordType: 'AffiliateCommissionEntry', recordId: `receipt:${receipt.id}`, summary: `Commission of ${a.commissionCents} cents accrued at ${a.rateBp / 100}% of ${a.basisCents} cents (month ${a.monthFromActivation}).`, personId: actor.personId })
    return { ok: true as const, receiptId: receipt.id, commissionCents: a.commissionCents, commissionNote: null, acts }
  })
}

/** A refund or chargeback. Staff only: money coming back is never the tenant's to write. */
export async function markReversal(
  i: { receiptId: string; kind: 'REFUND' | 'CHARGEBACK'; contractorCents: number; platformFeeCents: number; reason: string; reversedAt: Date },
  actor: Actor,
  now: Date = new Date(),
  db: PrismaClient = defaultDb,
): Promise<{ ok: true; reversalId: string; clawbackCents: number; acts: AffiliateAct[] } | Refused> {
  if (!actor.staff) return { ok: false, says: 'Only Etyme staff record a refund or chargeback.' }
  if (!reasonOk(i.reason)) return { ok: false, says: 'Say why, in a few words. The reason is kept on the ledger.' }
  if (!whole(i.contractorCents) || !whole(i.platformFeeCents) || i.contractorCents + i.platformFeeCents === 0) return { ok: false, says: 'A reversal is whole cents and more than nothing.' }
  if (i.reversedAt.getTime() > now.getTime()) return { ok: false, says: 'A date that has not happened yet is not recorded.' }

  return db.$transaction(async (tx) => {
    const receipt = await tx.subscriptionReceipt.findUnique({ where: { id: i.receiptId } })
    if (!receipt) return { ok: false as const, says: 'There is no such receipt.' }
    const before = await tx.subscriptionReceiptReversal.findMany({ where: { receiptId: receipt.id } })
    const prevContractor = before.reduce((s, r) => s + r.contractorCents, 0)
    const prevFee = before.reduce((s, r) => s + r.platformFeeCents, 0)
    if (prevContractor + i.contractorCents > receipt.contractorCents || prevFee + i.platformFeeCents > receipt.platformFeeCents) {
      return { ok: false as const, says: 'A reversal cannot be larger than what the receipt held, less what was already reversed.' }
    }
    const reversal = await tx.subscriptionReceiptReversal.create({
      data: { receiptId: receipt.id, tenantCompanyId: receipt.tenantCompanyId, kind: i.kind, contractorCents: i.contractorCents, platformFeeCents: i.platformFeeCents, reason: i.reason.trim(), reversedAt: i.reversedAt, markedByPersonId: actor.personId },
    })
    const acts: AffiliateAct[] = [{ action: 'SUBSCRIPTION_REVERSED', recordType: 'SubscriptionReceiptReversal', recordId: reversal.id, summary: `A ${i.kind.toLowerCase()} was recorded against a subscription receipt: ${i.reason.trim()}`, personId: actor.personId }]

    const earned = await tx.affiliateCommissionEntry.findUnique({ where: { sourceKey: `receipt:${receipt.id}` } })
    if (!earned) return { ok: true as const, reversalId: reversal.id, clawbackCents: 0, acts }
    const clawedBefore = (await tx.affiliateCommissionEntry.findMany({ where: { receiptId: receipt.id, kind: 'CLAWBACK' } })).reduce((s, e) => s - e.commissionCents, 0)
    const c = clawbackOf({
      earnedCents: earned.commissionCents, receiptBasisCents: earned.basisCents,
      reversedBasisBeforeCents: prevContractor + prevFee, clawedBeforeCents: clawedBefore,
      reversalBasisCents: i.contractorCents + i.platformFeeCents,
    })
    if (!c.ok) throw new Error(c.says)
    await tx.affiliateCommissionEntry.create({
      data: { affiliateId: earned.affiliateId, attributionId: earned.attributionId, tenantCompanyId: earned.tenantCompanyId, kind: 'CLAWBACK', sourceKey: `reversal:${reversal.id}`, receiptId: receipt.id, reversalId: reversal.id, basisCents: -(i.contractorCents + i.platformFeeCents), rateBp: earned.rateBp, commissionCents: -c.clawbackCents, monthFromActivation: earned.monthFromActivation, statementMonth: statementMonthOf(now) },
    })
    acts.push({ action: 'COMMISSION_CLAWED_BACK', recordType: 'AffiliateCommissionEntry', recordId: `reversal:${reversal.id}`, summary: `Commission of ${c.clawbackCents} cents was clawed back.`, personId: actor.personId })
    return { ok: true as const, reversalId: reversal.id, clawbackCents: c.clawbackCents, acts }
  })
}
