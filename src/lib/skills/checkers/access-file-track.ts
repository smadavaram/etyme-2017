/**
 * The answer key for `access-file.track` (record 123, plan C3 and C9).
 *
 * The run is about one petition with a filing day. This checks the petition
 * is filed, that exactly one public access file tracks it, that the day it
 * is due is the one the rules give again from the filing day and the firm’s
 * own calendar, and that the ledger says it started tracking it. Approving
 * and publishing are never the agent’s, so an access file approved by no
 * person is the only kind the agent starts.
 */
import type { PrismaClient } from '@prisma/client'
import { daysOffFor } from '@/lib/days-off'
import { loadCompanyHolidays } from '@/lib/holidays'
import { accessFileReadyBy, dayStart } from '@/lib/agents/checklist-rules'
import { ACCESS_FILE_RECORD } from '@/lib/agents/compliance-watch'
import { unknownBecause, type CheckerResult, type SkillChecker } from '../checker'

export const accessFileTrack: SkillChecker<PrismaClient> = async (companyId, _key, window, refs, read): Promise<CheckerResult> => {
  const ref = refs[0]
  if (!ref) return unknownBecause('The run names no petition, so there is nothing to re-read.')
  const evidence = `Petition ${ref.recordId}`
  const p = await read.petition.findFirst({ where: { id: ref.recordId, companyId }, include: { accessFiles: true } })
  if (!p) return { verdict: 'FAIL', reason: 'The petition the run is about is not on this firm’s record.', evidence, unitsFound: 0 }
  if (!p.filedOn) return { verdict: 'FAIL', reason: 'The petition has no filing day, so no public access file was due.', evidence, unitsFound: 0 }
  if (p.accessFiles.length !== 1) return { verdict: 'FAIL', reason: `${p.accessFiles.length} public access files track the petition, and there should be one.`, evidence, unitsFound: 0 }
  const file = p.accessFiles[0]
  const year = dayStart(window.to).getUTCFullYear()
  const due = accessFileReadyBy(p.filedOn, await daysOffFor(companyId), await loadCompanyHolidays(companyId, year - 1, year + 1))
  if (file.readyBy.getTime() !== due.getTime()) {
    return { verdict: 'FAIL', reason: `The file is due ${file.readyBy.toISOString().slice(0, 10)} and the rules give ${due.toISOString().slice(0, 10)} from the filing day.`, evidence, unitsFound: 0 }
  }
  const said = await read.recordAction.count({ where: { companyId, recordType: ACCESS_FILE_RECORD, recordId: file.id, action: 'ACCESS_FILE_TRACKED' } })
  if (said === 0) return { verdict: 'FAIL', reason: 'The file is tracked and no line on the ledger says the agent started it.', evidence, unitsFound: 0 }
  return { verdict: 'PASS', reason: 'One public access file tracks the petition, due the day the rules give from its filing day.', evidence, unitsFound: 1 }
}
