/**
 * Every skill's checker, by the name its registry row gives (`answerKey.checker`).
 * Each migration adds the checkers
 * for its skills in its own commit. A file in this folder only reads: it
 * imports no database client, no ledger writer, no `ctx.act`
 * (`__tests__/invariants/skill-checkers-read-only.test.ts`).
 */
import type { SkillChecker } from '../checker'
import { weeklySummaryChecker } from './weekly-summary'
import { censusClassifyChecker } from './census-classify'
import { chasePropose } from './chase-propose'
import { chaseSend } from './chase-send'
import { chaseClose } from './chase-close'
import { checklistList } from './checklist-list'
import { driftFlag } from './drift-flag'
import { cardOpen } from './card-open'
import { tenureWatch } from './tenure-watch'
import { noticeClock } from './notice-clock'
import { accessFileTrack } from './access-file-track'
import { confirmationMatch } from './confirmation-match'
import { dualAuthBlock } from './dual-auth-block'

export const CHECKERS: Record<string, SkillChecker<any>> = {
  'weekly.summary': weeklySummaryChecker,
  'census.classify': censusClassifyChecker,
  'chase.propose': chasePropose,
  'chase.send': chaseSend,
  'chase.close': chaseClose,
  'checklist.list': checklistList,
  'drift.flag': driftFlag,
  'card.open': cardOpen,
  'tenure.watch': tenureWatch,
  'notice.clock': noticeClock,
  'access-file.track': accessFileTrack,
  'confirmation.match': confirmationMatch,
  'dual-auth.block': dualAuthBlock,
}
