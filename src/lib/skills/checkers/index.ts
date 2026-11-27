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

export const CHECKERS: Record<string, SkillChecker<any>> = {
  'weekly.summary': weeklySummaryChecker,
  'census.classify': censusClassifyChecker,
  'chase.propose': chasePropose,
  'chase.send': chaseSend,
}
