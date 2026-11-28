/**
 * When a firm counts as active, and so who referred it (Pax, 2026-11-28).
 *
 * A firm is active when its trial clock starts: when it begins running its
 * own business on the record, the same own-business test the pricing uses
 * (lib/money/own-business: a line it supplies, or a bill it issued). That
 * moment sets `Company.activatedAt` and writes attribution, once, from the
 * referral code the firm arrived with. Before it, nothing is written. A
 * firm that only uses another firm's record is never activated, and never
 * earns anybody a commission. Commission still accrues only on a paid
 * receipt (affiliate-receipts); activation pays nothing.
 *
 * The code is kept on the company at sign-up (`rememberReferral`) because
 * the clock may start weeks later. Nothing reads it after attribution.
 */
import type { Prisma, PrismaClient } from '@prisma/client'
import { prisma as defaultDb } from '@/lib/db'
import { firmRunsOwnBusiness } from '@/lib/money/own-business'
import { writeActivation, type AffiliateAct } from './affiliate-registry'

type Db = PrismaClient | Prisma.TransactionClient

export type ClockStart =
  | { started: true; attributionId: string; affiliateId: string | null; note: string | null; acts: AffiliateAct[] }
  | { started: false; already: boolean; says: string }

/**
 * Keep the code a firm arrived with, until its clock starts. The first
 * code stays. Once attribution is written nothing may change it: a mistake
 * is a correction row, never an edit.
 */
export async function rememberReferral(
  companyId: string,
  code: string | null | undefined,
  db: Db = defaultDb,
): Promise<{ ok: true; kept: boolean } | { ok: false; says: string }> {
  const clean = (code ?? '').trim().toLowerCase()
  if (!clean) return { ok: true, kept: false }
  const company = await db.company.findUnique({ where: { id: companyId }, select: { referredByCode: true, activatedAt: true } })
  if (!company) return { ok: false, says: 'There is no such company.' }
  if (company.activatedAt) return { ok: false, says: 'This firm’s clock has started, so who referred it is already written. A mistake is corrected by Etyme staff with a reason.' }
  if (company.referredByCode) return { ok: true, kept: false }
  await db.company.update({ where: { id: companyId }, data: { referredByCode: clean } })
  return { ok: true, kept: true }
}

/**
 * Start the clock if the firm is running its own business, and say so. Safe
 * to call on every bill and every placement: a firm already attributed is
 * left exactly as it was, and a firm not yet running its own business is
 * left alone. Never throws for an expected case, so it can run inside the
 * transaction of the act that started the business.
 */
export async function startTrialClockIfRunning(
  i: { companyId: string; byPersonId?: string | null; heldAs?: string; now?: Date },
  db: Db = defaultDb,
): Promise<ClockStart> {
  const company = await db.company.findUnique({ where: { id: i.companyId }, select: { id: true, name: true, billingExempt: true, referredByCode: true } })
  if (!company) return { started: false, already: false, says: 'There is no such company.' }
  if (company.billingExempt) return { started: false, already: false, says: `${company.name} is not billed, so it has no trial clock.` }
  if (await db.affiliateAttribution.findUnique({ where: { tenantCompanyId: company.id }, select: { id: true } })) {
    return { started: false, already: true, says: 'The clock started earlier and attribution was written then.' }
  }
  if (!(await firmRunsOwnBusiness(company.id, db))) {
    return { started: false, already: false, says: `${company.name} has nothing of its own running and has issued no bill, so its 60 days have not started.` }
  }
  const byPersonId = i.byPersonId ?? (await db.context.findFirst({ where: { companyId: company.id }, orderBy: { grantedAt: 'asc' }, select: { personId: true } }))?.personId
  if (!byPersonId) return { started: false, already: false, says: `${company.name} has nobody seated to record the start against.` }
  const r = await writeActivation(db, {
    tenantCompanyId: company.id, code: company.referredByCode, source: 'CODE',
    activatedAt: i.now ?? new Date(), byPersonId, heldAs: i.heldAs ?? 'Own business started',
  })
  if (!r.ok) return { started: false, already: false, says: r.says }
  if (r.alreadyWritten) return { started: false, already: true, says: r.note ?? 'Attribution was written earlier.' }
  return { started: true, attributionId: r.attributionId, affiliateId: r.affiliateId, note: r.note, acts: r.acts }
}
