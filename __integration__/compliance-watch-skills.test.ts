/**
 * The compliance watch on skills (record 123, plan step 8), on the database
 * through the real runner and the real grader.
 * `golden-compliance-watch.test.ts` proves the rows are unchanged; this
 * proves the plan, the skill runs and what each checker finds.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, resetDatabase } from './harness'
import { buildGoldenWorld, switchAgent, GOLDEN_MONDAY, GOLDEN_TUESDAY, type GoldenWorld } from './golden-world'
import { addComplianceWorld } from './golden-world-extras'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { complianceWatchStep, COMPLIANCE_WATCH_AGENT, COMPLIANCE_WATCH_RULES } from '@/lib/agents/compliance-watch'
import { planOf } from '@/lib/agents/plans'
import { gradeSkillRun } from '@/lib/skills/grade'

process.env.NEXTAUTH_SECRET ||= 'test-secret-for-golden'
process.env.NEXTAUTH_URL = 'https://etyme.example'
for (const k of ['RESEND_API_KEY', 'SENDGRID_API_KEY', 'NOTIFY_FROM_EMAIL']) delete process.env[k]
const KEY = COMPLIANCE_WATCH_AGENT
let w: GoldenWorld
let x: Awaited<ReturnType<typeof addComplianceWorld>>
const runsOf = (skillKey: string, recordType?: string) => prisma.agentRun.findMany({ where: { companyId: w.firm.id, skillKey, ...(recordType ? { recordType } : {}) }, orderBy: [{ at: 'asc' }, { id: 'asc' }] })
const ungrade = (runId: string) => prisma.check.deleteMany({ where: { runId } })

beforeAll(async () => {
  await resetDatabase()
  w = await buildGoldenWorld()
  x = await addComplianceWorld(w)
  await switchAgent(w, KEY, 'ON')
  registerAgent(KEY, { ruleVersion: COMPLIANCE_WATCH_RULES, step: complianceWatchStep })
  await runAgent(KEY, w.firm.id, GOLDEN_MONDAY)
  await runAgent(KEY, w.firm.id, GOLDEN_TUESDAY)
  unregisterAgent(KEY)
}, 600_000)

describe('the compliance watch as skills', () => {
  it('the plan is the tenure watch, the notice clock, the tracking of an access file and the opening of a card, and the tenure watch is the line shown for the agent', () => {
    expect(planOf(KEY)).toMatchObject({ skills: ['tenure.watch', 'notice.clock', 'access-file.track', 'card.open'], outputSkill: 'tenure.watch' })
  })

  it('two days of work write a tenure run each day, a notice run for each notice at its end, one access file run, and a card run for each timing and access file card looked at, all rules tier at no cost', async () => {
    const all = await prisma.agentRun.findMany({ where: { companyId: w.firm.id, agentKey: KEY } })
    const by = (k: string) => all.filter((r) => r.skillKey === k).length
    expect([by('tenure.watch'), by('notice.clock'), by('access-file.track'), by('card.open')]).toEqual([2, 3, 1, 4])
    expect(all.every((r) => r.tier === 'RULES' && r.costMicros === 0 && r.verdict === 'PASS')).toBe(true)
  })

  it('every tenure, notice, access file and card run on the seeded world passes its checker, counting one unit each', async () => {
    const runs = [...(await runsOf('tenure.watch')), ...(await runsOf('notice.clock')), ...(await runsOf('access-file.track')), ...(await runsOf('card.open'))]
    for (const r of runs) expect(await gradeSkillRun(r.id), `${r.skillKey} ${r.recordType} ${r.recordId}`).toMatchObject({ graded: true, verdict: 'PASS', unitsDone: 1 })
  })

  it('a tenure run fails when the client’s limit is switched off, saying no card was owed', async () => {
    const run = (await runsOf('tenure.watch'))[0]
    await ungrade(run.id)
    await prisma.governanceRule.updateMany({ data: { isActive: false } })
    const out = await gradeSkillRun(run.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL', unitsDone: 0 })
    expect(out.graded && out.reason).toMatch(/no limit set by this client, or the person is not at a warning day/)
    await prisma.governanceRule.updateMany({ data: { isActive: true } })
  })

  it('a notice run fails when its posting period had not ended on the firm’s calendar, naming the day it ends', async () => {
    const run = (await runsOf('notice.clock')).find((r) => r.recordId === x.old.id)!
    await ungrade(run.id)
    await prisma.noticePosting.update({ where: { id: x.old.id }, data: { postedOn: new Date('2099-01-05T00:00:00Z') } })
    const out = await gradeSkillRun(run.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL', unitsDone: 0 })
    expect(out.graded && out.reason).toMatch(/runs to 2099-01-\d\d on the firm’s calendar, so it had not ended/)
  })

  it('an access file tracked for the wrong day fails, naming the day it holds and the day the rules give', async () => {
    const [run] = await runsOf('access-file.track')
    await ungrade(run.id)
    await prisma.publicAccessFile.updateMany({ where: { petitionId: x.petition.id }, data: { readyBy: new Date('2026-12-30T00:00:00Z') } })
    const out = await gradeSkillRun(run.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL', unitsDone: 0 })
    expect(out.graded && out.reason).toMatch(/The file is due 2026-12-30 and the rules give 2026-11-23 from the filing day/)
  })

  it('a card for a notice dated off its filing day fails when the notice reads on time against that day', async () => {
    const run = (await runsOf('card.open', 'NoticeTiming'))[0]
    await ungrade(run.id)
    await prisma.noticePosting.update({ where: { id: x.late.id }, data: { measuredFromOn: x.late.postedOn } })
    const out = await gradeSkillRun(run.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL', unitsDone: 0 })
    expect(out.graded && out.reason).toMatch(/reads on time against its filing day/)
  })
})
