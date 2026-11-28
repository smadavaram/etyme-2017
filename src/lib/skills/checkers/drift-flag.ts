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
import { driftOf, driftWords } from '@/lib/money/payment-match'
import { invoicesRaisedBy } from '@/lib/money/invoice-parties'
import { RECEIVABLES_ROLES } from '@/lib/money/agent-owners'
import { unknownBecause, type CheckerResult, type SkillChecker } from '../checker'
import { cardsAt, judgeCards, ownerFor } from './cards'

/**
 * A bill's line whose rate is above its contract line's: re-read the line
 * and its contract (and whether the contract has approved amendments) with
 * the rules' own reader, and find the one card with those very words, owed
 * by the receivables seat the owner reader names, else the Owner. A line
 * that no longer reads as a drift is not graded.
 */
const billDrift: SkillChecker<PrismaClient> = async (companyId, _key, window, refs, read): Promise<CheckerResult> => {
  const id = refs[0].recordId
  const evidence = `InvoiceLine ${id}`
  const l = await read.invoiceLine.findFirst({
    where: { id, invoice: { ...invoicesRaisedBy(companyId) } },
    select: { rateCents: true, person: { select: { name: true } }, invoice: { select: { number: true, currency: true } }, sellContract: { select: { id: true, billRate: true, billCurrency: true } } },
  })
  if (!l || !l.sellContract) return { verdict: 'FAIL', reason: 'The bill line the run flagged is not on a bill this firm raised, or has no contract line behind it.', evidence, unitsFound: 0 }
  const amended = (await read.rateHistory.count({ where: { contractType: 'SELL', contractId: l.sellContract.id, approvalState: 'APPROVED' } })) > 0
  const d = driftOf({ lineRateCents: l.rateCents, lineCurrency: l.invoice.currency, contractRateCents: l.sellContract.billRate, contractCurrency: l.sellContract.billCurrency, hasAmendments: amended })
  if (!d) return unknownBecause('The bill line no longer reads as a drift from its contract line, so the flag cannot be re-read.')
  const words = driftWords(l.invoice, l.person?.name ?? 'the consultant', d)
  const said = await read.recordAction.count({ where: { companyId, recordType: 'InvoiceLine', recordId: id, action: 'RATE_DRIFT_FLAGGED' } })
  if (said === 0) return { verdict: 'FAIL', reason: 'The line differs from its contract and no line on the ledger says it was flagged.', evidence, unitsFound: 0 }
  const cards = await cardsAt(read, companyId, { recordType: 'InvoiceLine', recordId: id }, words.question)
  return judgeCards(cards, await ownerFor(read, companyId, RECEIVABLES_ROLES, window.to), 'the bill line whose rate differs from its contract', evidence)
}

export const driftFlag: SkillChecker<PrismaClient> = async (companyId, key, window, refs, read): Promise<CheckerResult> => {
  const ref = refs[0]
  if (!ref) return unknownBecause('The run names no item, so there is nothing to re-read.')
  if (ref.recordType === 'InvoiceLine') return billDrift(companyId, key, window, refs, read)
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
