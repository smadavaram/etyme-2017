/**
 * The answer key for `card.open` (record 123, plan C3 and C9).
 *
 * The run says which kind of card it opened and the record the card is
 * about (the card's own first link). This finds the cards for that link as
 * the agents' one door does, and checks: at least one was opened, no more
 * than one is open, and the open one is owed by the seat the owner reader
 * names today for that kind (a Contract Manager, HR, the signatory named on
 * the line else the Owner). Where the kind carries a rule of its own, it is
 * re-derived too: a notice judged late or too early really is, and a file
 * tracked for an access file really is not yet approved.
 */
import type { PrismaClient } from '@prisma/client'
import { dayStart, noticeTiming } from '@/lib/agents/checklist-rules'
import { unknownBecause, type CheckerResult, type SkillChecker } from '../checker'
import { cardsAt, judgeCards, ownerFor, signatoryOrOwner } from './cards'

interface Kind {
  /** The record type of the card's own first link. */
  link: string
  /** The roles that owe it, or 'SIGNATORY' for the person named on the line. */
  roles: readonly string[] | 'SIGNATORY'
  what: string
}

export const CARD_KINDS: Record<string, Kind> = {
  PlacementRecord: { link: 'PlacementRecord', roles: ['Contract Manager', 'Account Manager'], what: 'the placement record to read' },
  OnboardingPack: { link: 'OnboardingPack', roles: ['HR'], what: 'the pack ready to confirm' },
  PackIncomplete: { link: 'SellContract', roles: ['HR'], what: 'the papers missing before day one' },
  SignatureCard: { link: 'ChecklistItem', roles: 'SIGNATORY', what: 'the signature a petition paper needs' },
  NoticeTiming: { link: 'NoticePosting', roles: ['HR', 'Compliance Officer'], what: 'the notice dated off its filing day' },
  AccessFile: { link: 'PublicAccessFile', roles: ['HR'], what: 'the public access file to approve' },
}

export const cardOpen: SkillChecker<PrismaClient> = async (companyId, _key, window, refs, read): Promise<CheckerResult> => {
  const ref = refs[0]
  const kind = ref ? CARD_KINDS[ref.recordType] : undefined
  if (!ref || !kind) return unknownBecause('The run does not name a kind of card this check knows, so there is nothing to look for.')
  const evidence = `${ref.recordType} ${ref.recordId}`
  const baseId = ref.recordId.split(':')[0]

  if (ref.recordType === 'NoticeTiming') {
    const n = await read.noticePosting.findFirst({ where: { id: baseId, companyId } })
    const t = n ? noticeTiming(n.postedOn, n.measuredFromOn) : null
    if (!n) return { verdict: 'FAIL', reason: 'The notice the card is about is not on this firm’s record.', evidence, unitsFound: 0 }
    if (t === null || t === 'ON_TIME') return { verdict: 'FAIL', reason: 'The notice reads on time against its filing day, so no card was owed.', evidence, unitsFound: 0 }
  }

  if (ref.recordType === 'AccessFile') {
    const file = await read.publicAccessFile.findFirst({ where: { id: baseId, companyId } })
    if (!file) return { verdict: 'FAIL', reason: 'The public access file the card is about is not on this firm’s record.', evidence, unitsFound: 0 }
    if (ref.recordId.endsWith(':overdue') && dayStart(window.to).getTime() <= file.readyBy.getTime()) {
      return { verdict: 'FAIL', reason: `The file is due ${file.readyBy.toISOString().slice(0, 10)}, so it was not overdue when its second card opened.`, evidence, unitsFound: 0 }
    }
  }

  let expected: string | null
  if (kind.roles === 'SIGNATORY') {
    const item = await read.checklistItem.findFirst({ where: { id: ref.recordId, companyId }, select: { signatoryPersonId: true } })
    if (!item) return { verdict: 'FAIL', reason: 'The paper the card is about is not on this firm’s record.', evidence, unitsFound: 0 }
    expected = await signatoryOrOwner(read, companyId, item.signatoryPersonId, window.to)
  } else {
    expected = await ownerFor(read, companyId, kind.roles, window.to)
  }
  const cards = await cardsAt(read, companyId, { recordType: kind.link, recordId: ref.recordId })
  return judgeCards(cards, expected, kind.what, evidence)
}
