/**
 * The answer key for `notice.clock` (record 123, plan C3 and C9).
 *
 * The run is about one posted notice. This reads the firm's days off and
 * holidays, counts the posting period again from the day it went up, and
 * checks the period is over as of the run. Then the ledger must hold the
 * NOTICE_PERIOD_ENDED line for the notice, and one card may be open for it,
 * owed by the HR seat the owner reader names today. A notice whose period
 * has not ended fails: nobody was owed a card yet.
 */
import type { PrismaClient } from '@prisma/client'
import { dayAround } from '@/lib/decision-queue'
import { daysOffFor } from '@/lib/days-off'
import { loadCompanyHolidays } from '@/lib/holidays'
import { dayStart, noticeEndsOn, noticePeriodOver } from '@/lib/agents/checklist-rules'
import { NOTICE_RECORD } from '@/lib/agents/compliance-watch'
import { unknownBecause, type CheckerResult, type SkillChecker } from '../checker'
import { cardsAt, judgeCards, ownerFor } from './cards'

export const noticeClock: SkillChecker<PrismaClient> = async (companyId, _key, window, refs, read): Promise<CheckerResult> => {
  const ref = refs[0]
  if (!ref) return unknownBecause('The run names no notice, so there is nothing to re-read.')
  const evidence = `${NOTICE_RECORD} ${ref.recordId}`
  const n = await read.noticePosting.findFirst({ where: { id: ref.recordId, companyId } })
  if (!n) return { verdict: 'FAIL', reason: 'The notice the run is about is not on this firm’s record.', evidence, unitsFound: 0 }
  const year = dayStart(window.to).getUTCFullYear()
  const endsOn = noticeEndsOn(n.postedOn, await daysOffFor(companyId), await loadCompanyHolidays(companyId, year - 1, year + 1))
  if (!noticePeriodOver(endsOn, dayAround(window.to).from)) {
    return { verdict: 'FAIL', reason: `The posting period runs to ${endsOn.toISOString().slice(0, 10)} on the firm’s calendar, so it had not ended.`, evidence, unitsFound: 0 }
  }
  const said = await read.recordAction.count({ where: { companyId, recordType: NOTICE_RECORD, recordId: n.id, action: 'NOTICE_PERIOD_ENDED' } })
  if (said === 0) return { verdict: 'FAIL', reason: 'The period ended and no line on the ledger says so.', evidence, unitsFound: 0 }
  const cards = await cardsAt(read, companyId, { recordType: NOTICE_RECORD, recordId: n.id })
  return judgeCards(cards, await ownerFor(read, companyId, ['HR'], window.to), 'the notice whose period ended', evidence)
}
