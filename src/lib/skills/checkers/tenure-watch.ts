/**
 * The answer key for `tenure.watch` (record 123, plan C3 and C9).
 *
 * The run is about one person at the client. This reads the tenure again
 * from the one ledger every door reads (`tenureWarnings`: her days at the
 * client across every supplier, each day once, against the client's own
 * limit and warning days) and checks she is at a warning day or past her
 * limit and still on site. Then one card may be open for the placement she
 * is on, owed by the Program Manager seat the owner reader names today.
 * A client with no limit has nobody to warn, so a run for a person where no
 * limit is set fails.
 */
import type { PrismaClient } from '@prisma/client'
import { tenureWarnings, TENURE_RECORD } from '@/lib/agents/compliance-watch'
import { unknownBecause, type CheckerResult, type SkillChecker } from '../checker'
import { cardsAt, judgeCards, ownerFor } from './cards'

export const tenureWatch: SkillChecker<PrismaClient> = async (companyId, _key, window, refs, read): Promise<CheckerResult> => {
  const ref = refs[0]
  if (!ref) return unknownBecause('The run names no person, so there is nothing to re-read.')
  const evidence = `Person ${ref.recordId}`
  const warnings = await tenureWarnings(companyId, window.to)
  const mine = warnings.find((t) => t.personId === ref.recordId)
  if (!mine) return { verdict: 'FAIL', reason: 'The record shows no limit set by this client, or the person is not at a warning day or past it and on site, so no card was owed.', evidence, unitsFound: 0 }
  const cards = await cardsAt(read, companyId, { recordType: TENURE_RECORD, recordId: mine.placementId })
  const out = judgeCards(cards, await ownerFor(read, companyId, ['Program Manager'], window.to), `${mine.person}’s limit of ${mine.capMonths} months`, evidence)
  return { ...out, evidence: `${evidence}: ${mine.daysLeft < 0 ? `${-mine.daysLeft} days past the limit` : `${mine.daysLeft} days to the limit`}` }
}
