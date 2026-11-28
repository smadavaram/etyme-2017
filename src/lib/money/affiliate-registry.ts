/**
 * The affiliate registry, attribution at activation, and the affiliate's
 * own narrow view (record 129).
 *
 * An affiliate only refers. Attribution is written once, at activation, on
 * a ledger the database will not let anyone change; a correction is a new
 * row with a reason. A tenant with no affiliate belongs to the house. An
 * affiliate never earns on a tenant it owns or holds a seat at.
 *
 * Nothing here reads a sell line, a buy line, a margin or a placement.
 * The acts a writer returns are the rows the metering ledger takes once
 * Etyme's own record has a company to hold them (see AffiliateAct).
 */
import type { Prisma, PrismaClient } from '@prisma/client'
import { prisma as defaultDb } from '@/lib/db'
import { bankAccountToWrite } from '@/lib/sensitive'
import { selfReferral, monthFromActivation } from './affiliate-commission'
import { meterActs } from './affiliate-metering'

type Db = PrismaClient | Prisma.TransactionClient

export { AFFILIATE_AGENT_KEY } from './affiliate-metering'

/**
 * One thing the affiliate engine did, as the sentence the ledger holds.
 * The metering ledger (RecordAction) needs a company and Etyme has no
 * company row of its own, so an act that belongs to a referred tenant is
 * written on that tenant's ledger (`tenantCompanyId`); an act with no
 * tenant (registry, statement, payout) is returned unwritten, with the
 * reason, until the platform record is ruled on. `metered` says which.
 */
export interface AffiliateAct {
  action: string
  recordType: string
  recordId: string
  summary: string
  personId: string
  /** The referred tenant the act is about, where there is one. */
  tenantCompanyId?: string | null
  /** The role she held, as text: Etyme staff, or Owner. */
  heldAs?: string
  /** Set by the writer once the metering ledger was tried. */
  metered?: boolean
  /** Why the row was not written, in a sentence. */
  unmeteredWhy?: string
}

/** Who is acting. The route proves `staff` (callerIsStaff); this file never guesses it. */
export interface Actor { personId: string; staff: boolean }

export type Refused = { ok: false; says: string }
const NEEDS_STAFF = 'Only Etyme staff keep the affiliate registry and its ledger.'
const NEEDS_REASON = 'Say why, in a few words. The reason is kept on the ledger.'

export const reasonOk = (r: unknown): r is string => typeof r === 'string' && r.trim().length >= 3

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
function codeFor(name: string): string {
  const stem = name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 8) || 'ref'
  let tail = ''
  for (let i = 0; i < 5; i++) tail += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  return `${stem}-${tail}`
}

export async function createAffiliate(
  i: { kind: 'PERSON' | 'COMPANY'; name: string; contactEmail: string; ownCompanyId?: string | null; accountPersonId?: string | null },
  actor: Actor,
  db: PrismaClient = defaultDb,
): Promise<{ ok: true; affiliateId: string; code: string; acts: AffiliateAct[] } | Refused> {
  if (!actor.staff) return { ok: false, says: NEEDS_STAFF }
  const name = i.name.trim()
  const email = i.contactEmail.trim().toLowerCase()
  if (!name) return { ok: false, says: 'An affiliate needs a name.' }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, says: 'An affiliate needs an email address to be reached at.' }
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = codeFor(name)
    if (await db.affiliate.findUnique({ where: { code }, select: { id: true } })) continue
    const row = await db.affiliate.create({
      data: { kind: i.kind, name, contactEmail: email, code, ownCompanyId: i.ownCompanyId ?? null, accountPersonId: i.accountPersonId ?? null, createdByPersonId: actor.personId },
    })
    return { ok: true, affiliateId: row.id, code, acts: await meterActs(db, [{ action: 'REGISTERED', recordType: 'Affiliate', recordId: row.id, summary: `${name} was registered as an affiliate.`, personId: actor.personId, heldAs: 'Etyme staff' }]) }
  }
  return { ok: false, says: 'A referral code could not be made just now. Try again.' }
}

/**
 * Payout details: the bank, the account name and four digits stay in the
 * clear; the account number is sealed (lib/sensitive) and never returned.
 */
export async function setPayoutDetails(
  affiliateId: string,
  i: { bankName: string; accountName: string; accountNumber: string },
  actor: Actor,
  env: Record<string, string | undefined> = process.env,
  db: PrismaClient = defaultDb,
): Promise<{ ok: true; last4: string | null; acts: AffiliateAct[] } | Refused> {
  if (!actor.staff) return { ok: false, says: NEEDS_STAFF }
  const bank = i.bankName.trim()
  const account = i.accountName.trim()
  if (!bank || !account || !i.accountNumber.trim()) return { ok: false, says: 'Payout details need the bank, the account name and the account number.' }
  const sealed = bankAccountToWrite(i.accountNumber, env)
  if (!sealed.ok) return { ok: false, says: sealed.says }
  const row = await db.affiliate.findUnique({ where: { id: affiliateId }, select: { id: true } })
  if (!row) return { ok: false, says: 'There is no such affiliate.' }
  await db.affiliate.update({
    where: { id: affiliateId },
    data: { payoutBankName: bank, payoutAccountName: account, payoutLast4: sealed.data.last4, payoutSealed: sealed.data.sealed },
  })
  return { ok: true, last4: sealed.data.last4, acts: await meterActs(db, [{ action: 'PAYOUT_DETAILS_SET', recordType: 'Affiliate', recordId: affiliateId, summary: `Payout details were set (${bank}, ending ${sealed.data.last4}).`, personId: actor.personId, heldAs: 'Etyme staff' }]) }
}

/** Who a tenant belongs to now: the latest correction, else the attribution. Null is the house. */
export async function effectiveAffiliate(tenantCompanyId: string, db: Db = defaultDb): Promise<{ attributionId: string; affiliateId: string | null; activatedAt: Date } | null> {
  const attribution = await db.affiliateAttribution.findUnique({ where: { tenantCompanyId } })
  if (!attribution) return null
  const latest = await db.affiliateAttributionCorrection.findFirst({ where: { tenantCompanyId }, orderBy: { createdAt: 'desc' } })
  return { attributionId: attribution.id, affiliateId: latest ? latest.toAffiliateId : attribution.affiliateId, activatedAt: attribution.activatedAt }
}

async function seatsOf(personId: string | null, db: Db): Promise<string[]> {
  if (!personId) return []
  const rows = await db.context.findMany({ where: { personId, companyId: { not: null } }, select: { companyId: true } })
  return rows.map((r) => r.companyId as string)
}

/** Why an affiliate may not be given a tenant, or null where it may. */
async function whyNotThisAffiliate(affiliateId: string, tenantCompanyId: string, db: Db): Promise<string | null> {
  const a = await db.affiliate.findUnique({ where: { id: affiliateId } })
  if (!a) return 'That referral code is not on the registry, so the tenant is the house’s.'
  if (a.status !== 'ACTIVE') return `${a.name} is not an active affiliate, so the tenant is the house’s.`
  if (selfReferral({ affiliateOwnCompanyId: a.ownCompanyId, affiliateSeatCompanyIds: await seatsOf(a.accountPersonId, db), tenantCompanyId })) {
    return `${a.name} owns or holds a seat at this tenant, and an affiliate never earns on its own tenant, so it is the house’s.`
  }
  return null
}

/**
 * Activate a tenant and write who referred it, once, in one transaction.
 * Nothing wrote `Company.activatedAt` before this. A tenant already
 * attributed is left exactly as it was.
 */
export async function activateTenant(
  i: { tenantCompanyId: string; code?: string | null; source?: 'CODE' | 'LINK' | 'STAFF'; activatedAt?: Date },
  actor: Actor,
  db: PrismaClient = defaultDb,
): Promise<{ ok: true; attributionId: string; affiliateId: string | null; alreadyWritten: boolean; note: string | null; acts: AffiliateAct[] } | Refused> {
  if (!actor.staff) return { ok: false, says: NEEDS_STAFF }
  return db.$transaction(async (tx) => {
    const company = await tx.company.findUnique({ where: { id: i.tenantCompanyId }, select: { id: true, name: true, activatedAt: true } })
    if (!company) return { ok: false as const, says: 'There is no such tenant.' }
    const existing = await tx.affiliateAttribution.findUnique({ where: { tenantCompanyId: i.tenantCompanyId } })
    if (existing) return { ok: true as const, attributionId: existing.id, affiliateId: (await effectiveAffiliate(i.tenantCompanyId, tx))?.affiliateId ?? null, alreadyWritten: true, note: 'Attribution was written at activation and stays as it was.', acts: [] }

    const activatedAt = company.activatedAt ?? i.activatedAt ?? new Date()
    if (!company.activatedAt) await tx.company.update({ where: { id: company.id }, data: { activatedAt } })

    let affiliateId: string | null = null
    let note: string | null = null
    const code = i.code?.trim().toLowerCase()
    if (code) {
      const a = await tx.affiliate.findUnique({ where: { code }, select: { id: true } })
      const why = a ? await whyNotThisAffiliate(a.id, company.id, tx) : 'That referral code is not on the registry, so the tenant is the house’s.'
      if (why) note = why
      else affiliateId = a!.id
    }
    const row = await tx.affiliateAttribution.create({
      data: { tenantCompanyId: company.id, affiliateId, source: affiliateId ? (i.source ?? 'CODE') : 'HOUSE', activatedAt, recordedByPersonId: actor.personId },
    })
    return {
      ok: true as const, attributionId: row.id, affiliateId, alreadyWritten: false, note,
      acts: await meterActs(tx, [{ action: 'ATTRIBUTED', recordType: 'AffiliateAttribution', recordId: row.id, summary: affiliateId ? `${company.name} was attributed to an affiliate at activation.` : `${company.name} was activated and belongs to the house.`, personId: actor.personId, heldAs: 'Etyme staff', tenantCompanyId: company.id }]),
    }
  })
}

/** A correction is a new row with a reason and never an edit. It moves commission from the day it is written; entries already made stay. */
export async function correctAttribution(
  i: { tenantCompanyId: string; toAffiliateId: string | null; reason: string },
  actor: Actor,
  db: PrismaClient = defaultDb,
): Promise<{ ok: true; correctionId: string; acts: AffiliateAct[] } | Refused> {
  if (!actor.staff) return { ok: false, says: NEEDS_STAFF }
  if (!reasonOk(i.reason)) return { ok: false, says: NEEDS_REASON }
  return db.$transaction(async (tx) => {
    const now = await effectiveAffiliate(i.tenantCompanyId, tx)
    if (!now) return { ok: false as const, says: 'This tenant has no attribution yet. It is written when the tenant is activated.' }
    if (now.affiliateId === i.toAffiliateId) return { ok: false as const, says: 'The tenant already belongs there.' }
    if (i.toAffiliateId) {
      const why = await whyNotThisAffiliate(i.toAffiliateId, i.tenantCompanyId, tx)
      if (why) return { ok: false as const, says: why }
    }
    const row = await tx.affiliateAttributionCorrection.create({
      data: { attributionId: now.attributionId, tenantCompanyId: i.tenantCompanyId, fromAffiliateId: now.affiliateId, toAffiliateId: i.toAffiliateId, reason: i.reason.trim(), correctedByPersonId: actor.personId },
    })
    return { ok: true as const, correctionId: row.id, acts: await meterActs(tx, [{ action: 'ATTRIBUTION_CORRECTED', recordType: 'AffiliateAttribution', recordId: now.attributionId, summary: `Attribution was corrected: ${i.reason.trim()}`, personId: actor.personId, heldAs: 'Etyme staff', tenantCompanyId: i.tenantCompanyId }]) }
  })
}

export interface OwnAffiliateView {
  affiliate: { id: string; name: string; code: string; status: string; payoutBank: string | null; payoutAccountName: string | null; payoutLast4: string | null }
  referrals: { tenantName: string; activatedAt: Date; monthFromActivation: number | null; earnedCents: number }[]
  statements: { month: string; earnedCents: number; clawedBackCents: number; carriedInCents: number; netCents: number }[]
  totalEarnedCents: number
}

/**
 * What an affiliate may read: its own referrals, earnings and statements.
 * Never another affiliate's, never a tenant's contractors, rates or margin,
 * never a placement. The account number is not here, only its last four.
 */
export async function readOwnAffiliate(personId: string, now: Date = new Date(), db: Db = defaultDb): Promise<OwnAffiliateView | null> {
  const a = await db.affiliate.findFirst({ where: { accountPersonId: personId } })
  if (!a) return null
  const entries = await db.affiliateCommissionEntry.findMany({ where: { affiliateId: a.id } })
  const tenantIds = [...new Set(entries.map((e) => e.tenantCompanyId))]
  const attributed = await db.affiliateAttribution.findMany({ where: { OR: [{ affiliateId: a.id }, { tenantCompanyId: { in: tenantIds } }] } })
  const referrals: OwnAffiliateView['referrals'] = []
  for (const att of attributed) {
    const eff = await effectiveAffiliate(att.tenantCompanyId, db)
    const mine = eff?.affiliateId === a.id
    const earned = entries.filter((e) => e.tenantCompanyId === att.tenantCompanyId).reduce((s, e) => s + e.commissionCents, 0)
    if (!mine && earned === 0 && !entries.some((e) => e.tenantCompanyId === att.tenantCompanyId)) continue
    const c = await db.company.findUnique({ where: { id: att.tenantCompanyId }, select: { name: true } })
    referrals.push({ tenantName: c?.name ?? 'A tenant', activatedAt: att.activatedAt, monthFromActivation: monthFromActivation(att.activatedAt, now), earnedCents: earned })
  }
  const statements = await db.affiliateStatement.findMany({ where: { affiliateId: a.id }, orderBy: { month: 'asc' } })
  return {
    affiliate: { id: a.id, name: a.name, code: a.code, status: a.status, payoutBank: a.payoutBankName, payoutAccountName: a.payoutAccountName, payoutLast4: a.payoutLast4 },
    referrals,
    statements: statements.map((s) => ({ month: s.month, earnedCents: s.earnedCents, clawedBackCents: s.clawedBackCents, carriedInCents: s.carriedInCents, netCents: s.netCents })),
    totalEarnedCents: entries.reduce((s, e) => s + e.commissionCents, 0),
  }
}
