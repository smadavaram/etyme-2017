/**
 * The simulation's signer reads a week's flag the way the Timesheets list
 * shows it, before pressing anything.
 *
 * The founder-scale run (reports/simulation-20261101180424.md, 2026-11-01):
 * at the generated firms the sign-weeks station judged a week flagged from
 * its own copy of the job's hours, and was refused 731 times "45h claimed
 * on a 40h-a-week job. Say why this week is right before you sign it" and
 * 188 times "a week like this is signed in Etyme … so it cannot be
 * approved by email". The rules were right; the actor had not learned
 * them. A person reads the warning on the row.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = readFileSync(join(process.cwd(), 'scripts/simulate/stages/money/sign-weeks.ts'), 'utf8')

describe('the signer reads the week’s flag off the row, as the approve route asks it', () => {
  it('the flag is the approve route’s own weekFlag, over the week’s own contract: the job’s hours, the last day and a mark made when it was filed', () => {
    expect(src).toMatch(/import \{ weekFlag \} from '@\/lib\/timesheet-flag'/)
    const read = src.slice(src.indexOf('async function readTheFlags'), src.indexOf('export default defineStage'))
    expect(read).toMatch(/hoursPerWeek: t\.sellContract\.requirement\?\.hoursPerWeek \?\? null/)
    expect(read).toMatch(/contractEnd: t\.sellContract\.endDate/)
    expect(read).toMatch(/anomalyScore: t\.anomalyScore/)
    // Read only, through the station's read-only connection.
    expect(read).toMatch(/ctx\.read\.timesheet\.findMany/)
  })

  it('every week’s flag is read before anybody presses anything', () => {
    expect(src.indexOf('await readTheFlags(ctx, weeks)')).toBeGreaterThan(0)
    expect(src.indexOf('await readTheFlags(ctx, weeks)')).toBeLessThan(src.indexOf('/api/timesheets/${first.id}/approve'))
  })

  it('a flagged week, or one over the overtime line, is never sent to be approved by email', () => {
    expect(src).toMatch(/\.filter\(\(w\) => !held\.has\(w\.id\) && \['PLAIN', 'WEEKEND'\]\.includes\(weekExtra\(w\)\.variant\) && !weekExtra\(w\)\.flagged && !overLine\.has\(w\.id\)\)/)
  })

  it('a flagged week is signed with the reason it is right, and a refusal for want of one is the station’s fault, said in the report', () => {
    expect(src).toMatch(/if \(x\.flagged\) \{\s*body\.note = FLAG_REASON/)
    expect(src).toMatch(/missedFlags\+\+/)
    expect(src).toMatch(/a station fault\./)
  })
})
