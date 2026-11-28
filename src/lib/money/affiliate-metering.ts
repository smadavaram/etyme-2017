/**
 * Metering for the affiliate engine (record 129, 135).
 *
 * Every act the engine does is one RecordAction row under the agent key
 * `affiliate`, which is what the plugin usage count reads. The table needs
 * a company, and Etyme has no company row of its own, so an act is written
 * on the referred tenant's ledger where it has one. A registry, statement
 * or payout act belongs to no tenant: it is returned unwritten, with the
 * reason, and waits for a ruling on the platform record. Nothing is
 * invented to hold it.
 *
 * What goes on a tenant's ledger is a tenant's to read, so the sentence
 * written there names no affiliate and no amount of commission. The full
 * sentence stays on the act the writer returns.
 *
 * A row that cannot be written never undoes the act it measures: the
 * act stands, and says it was not metered.
 */
import type { Prisma, PrismaClient } from '@prisma/client'
import { LedgerRefusal, writeRecordAction } from '@/lib/record-ledger'
import type { AffiliateAct } from './affiliate-registry'

/** The agent key the metering ledger counts these acts under. */
export const AFFILIATE_AGENT_KEY = 'affiliate'

type Tx = Prisma.TransactionClient | PrismaClient

export const NO_PLATFORM_RECORD = 'Etyme has no company record of its own to hold this row yet, so it is not metered. It waits for a ruling on the platform record.'

/** What a tenant may read about an act: the kind of act, never who or how much. Pure. */
export function tenantSentence(a: Pick<AffiliateAct, 'action'>): string {
  const words: Record<string, string> = {
    ATTRIBUTED: 'This company’s activation was recorded for the referral program.',
    ATTRIBUTION_CORRECTED: 'This company’s referral record was corrected.',
    SUBSCRIPTION_PAID: 'This company’s subscription was recorded as paid.',
    SUBSCRIPTION_REVERSED: 'A refund or chargeback was recorded against this company’s subscription.',
    COMMISSION_ACCRUED: 'A referral commission was accrued on this payment.',
    COMMISSION_CLAWED_BACK: 'A referral commission was reversed on this refund.',
    COMMISSION_NOT_EARNED: 'No referral commission was earned on this payment.',
  }
  return words[a.action] ?? 'A referral act was recorded.'
}

/** Write each act's row where there is a tenant to hold it; say, on every act, whether it was written. */
export async function meterActs(tx: Tx, acts: AffiliateAct[]): Promise<AffiliateAct[]> {
  const out: AffiliateAct[] = []
  for (const a of acts) {
    if (!a.tenantCompanyId) { out.push({ ...a, metered: false, unmeteredWhy: NO_PLATFORM_RECORD }); continue }
    // A row for a person who is not on record would break the transaction, so ask first.
    if (!(await tx.person.findUnique({ where: { id: a.personId }, select: { id: true } }))) {
      out.push({ ...a, metered: false, unmeteredWhy: 'The person who did this is not on record, so the row was not written.' }); continue
    }
    try {
      await writeRecordAction(tx, {
        companyId: a.tenantCompanyId, recordType: a.recordType, recordId: a.recordId, action: a.action,
        summary: tenantSentence(a), personId: a.personId, heldAs: a.heldAs ?? 'Etyme staff', agentKey: AFFILIATE_AGENT_KEY,
      })
      out.push({ ...a, metered: true })
    } catch (e) {
      if (!(e instanceof LedgerRefusal)) throw e
      out.push({ ...a, metered: false, unmeteredWhy: e.message })
    }
  }
  return out
}
