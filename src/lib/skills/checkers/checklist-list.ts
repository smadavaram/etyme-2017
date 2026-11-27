/**
 * The answer key for `checklist.list` (record 123, plan C3 and C9).
 *
 * The run is about one term on one placement (`<lineId>:<label>`). This
 * reads the placement again, works out the terms its record supports with
 * the rules' own reader (`wantedOf`), and compares the item on the record:
 * the term must be one the record supports (nothing is listed for a paper
 * that is not there), its actual value must equal the one just read, and its
 * state must be the one the rules give agreed against actual. A term a
 * person waived with a reason is left alone, and that is the right answer.
 * Closing the loop on what the agent changed before is not read: only what
 * stands now.
 */
import type { PrismaClient } from '@prisma/client'
import { LINE_SELECT, LINE_RECORD, wantedOf } from '@/lib/agents/contracts-checklist'
import { judgeContractItem } from '@/lib/agents/checklist-rules'
import { unknownBecause, type CheckerResult, type SkillChecker } from '../checker'

export const checklistList: SkillChecker<PrismaClient> = async (companyId, _key, _window, refs, read): Promise<CheckerResult> => {
  const id = refs[0]?.recordId ?? ''
  const at = id.indexOf(':')
  if (at < 1) return unknownBecause('The run does not say which placement and term it listed, so there is nothing to re-read.')
  const lineId = id.slice(0, at); const label = id.slice(at + 1)
  const evidence = `${LINE_RECORD} ${lineId}: ${label}`
  const line = await read.sellContract.findFirst({ where: { id: lineId, companyId }, select: LINE_SELECT })
  if (!line) return { verdict: 'FAIL', reason: 'The placement the run listed is not on this firm’s record.', evidence, unitsFound: 0 }
  const item = await read.checklistItem.findFirst({ where: { companyId, ownerType: LINE_RECORD, ownerId: lineId, kind: 'CONTRACT_TERM', label } })
  if (!item) return { verdict: 'FAIL', reason: `No line “${label}” is on the placement’s checklist.`, evidence, unitsFound: 0 }
  const wanted = wantedOf(line).find((x) => x.label === label)
  if (!wanted) return { verdict: 'FAIL', reason: `“${label}” is listed and the placement’s record supports no such term.`, evidence, unitsFound: 0 }
  if (item.state === 'WAIVED_WITH_REASON') return { verdict: 'PASS', reason: 'A person waived this term with a reason, and the agent left it alone.', evidence, unitsFound: 1 }
  if (item.actualValue !== wanted.actual) return { verdict: 'FAIL', reason: `“${label}” reads ${item.actualValue ?? 'nothing'} on the list and ${wanted.actual ?? 'nothing'} on the placement.`, evidence, unitsFound: 0 }
  const state = judgeContractItem(label, item.agreedValue, wanted.actual)
  if (item.state !== state) return { verdict: 'FAIL', reason: `“${label}” is marked ${item.state} and the rules read ${state} for the agreed and actual values on it.`, evidence, unitsFound: 0 }
  return { verdict: 'PASS', reason: 'The term is one the record supports, its actual value is the placement’s, and its state is the one the rules give.', evidence, unitsFound: 1 }
}
