/**
 * The answer key for `drift.flag` (record 123, plan C3 and C9).
 *
 * The run is about one checklist item that read as a drift. This reads the
 * item and its placement again: the item must still be a drift, with the
 * actual value the placement shows now differing from the agreed value the
 * rules judge it against. A drift that has since been put right is not
 * graded (the flag can no longer be re-read), and is never counted as
 * passed. Then exactly one card may be open for the item, owed by the
 * Contract Manager seat the owner reader names today.
 */
import type { PrismaClient } from '@prisma/client'
import { LINE_SELECT, LINE_RECORD, ITEM_RECORD, wantedOf } from '@/lib/agents/contracts-checklist'
import { judgeContractItem } from '@/lib/agents/checklist-rules'
import { unknownBecause, type CheckerResult, type SkillChecker } from '../checker'
import { cardsAt, judgeCards, ownerFor } from './cards'

export const driftFlag: SkillChecker<PrismaClient> = async (companyId, _key, window, refs, read): Promise<CheckerResult> => {
  const ref = refs[0]
  if (!ref) return unknownBecause('The run names no item, so there is nothing to re-read.')
  const evidence = `${ITEM_RECORD} ${ref.recordId}`
  const item = await read.checklistItem.findFirst({ where: { id: ref.recordId, companyId } })
  if (!item) return { verdict: 'FAIL', reason: 'The item the run flagged is not on this firm’s record.', evidence, unitsFound: 0 }
  const line = item.ownerType === LINE_RECORD ? await read.sellContract.findFirst({ where: { id: item.ownerId, companyId }, select: LINE_SELECT }) : null
  if (!line) return { verdict: 'FAIL', reason: 'The placement the flagged item belongs to is not on this firm’s record.', evidence, unitsFound: 0 }
  const wanted = wantedOf(line).find((x) => x.label === item.label)
  const judged = wanted ? judgeContractItem(item.label, item.agreedValue, wanted.actual) : null
  if (judged !== 'DRIFT') return unknownBecause(`“${item.label}” no longer reads as a drift (${item.state}), so the flag cannot be re-read.`)
  const cards = await cardsAt(read, companyId, { recordType: ITEM_RECORD, recordId: item.id })
  return judgeCards(cards, await ownerFor(read, companyId, ['Contract Manager'], window.to), `the drift in “${item.label}”`, evidence)
}
