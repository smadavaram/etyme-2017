/**
 * The weekly summary on skills (record 123, plan step 8), on the database
 * through the real runner and the real grader. The golden snapshot
 * (`golden-weekly-summary.test.ts`) proves the rows are unchanged; this
 * proves the skill run, its plan and its checker.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, resetDatabase } from './harness'
import { buildGoldenWorld, switchAgent, GOLDEN_MONDAY, type GoldenWorld } from './golden-world'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { weeklySummaryAgent, WEEKLY_SUMMARY_AGENT } from '@/lib/agents/weekly-summary'
import { planOf } from '@/lib/agents/plans'
import { gradeSkillRun } from '@/lib/skills/grade'

let w: GoldenWorld
let runId = ''
const checks = () => prisma.check.findMany({ where: { runId } })

beforeAll(async () => {
  await resetDatabase()
  w = await buildGoldenWorld()
  await switchAgent(w, WEEKLY_SUMMARY_AGENT, 'DRAFT_ONLY')
  registerAgent(WEEKLY_SUMMARY_AGENT, weeklySummaryAgent)
  await runAgent(WEEKLY_SUMMARY_AGENT, w.firm.id, GOLDEN_MONDAY)
  unregisterAgent(WEEKLY_SUMMARY_AGENT)
  runId = (await prisma.agentRun.findFirstOrThrow({ where: { companyId: w.firm.id, skillKey: 'weekly.summary' } })).id
}, 600_000)

describe('the weekly summary as a skill', () => {
  it('the agent’s plan is one skill, the weekly summary line, and it is the line shown for the agent', () => {
    expect(planOf(WEEKLY_SUMMARY_AGENT)).toMatchObject({ skills: ['weekly.summary'], outputSkill: 'weekly.summary' })
  })

  it('a Monday run writes one rules-tier skill run at no cost, naming what it planned and nothing graded yet', async () => {
    const rows = await prisma.agentRun.findMany({ where: { companyId: w.firm.id, skillKey: 'weekly.summary' } })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ agentKey: WEEKLY_SUMMARY_AGENT, tier: 'RULES', verdict: 'PASS', unitsPlanned: 1, unitsDone: null, costMicros: 0 })
    expect(rows[0].recordId).toBe(`${w.firm.id}:2026-11-23`)
  })

  it('the checker re-reads the week from the record and passes a line whose seven figures all agree', async () => {
    const out = await gradeSkillRun(runId)
    expect(out).toMatchObject({ graded: true, verdict: 'PASS', unitsDone: 1 })
    expect((await checks()).map((c) => c.verdict)).toEqual(['PASS'])
  })

  it('when the record moves after the line was written the checker fails it and names the figure that is wrong', async () => {
    await prisma.check.deleteMany({ where: { runId } })
    await prisma.timesheet.updateMany({ where: { sellContract: { companyId: w.firm.id }, status: 'SUBMITTED' }, data: { employerAcceptedAt: new Date('2026-11-23T10:00:00Z') } })
    const out = await gradeSkillRun(runId)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL', unitsDone: 0 })
    expect(out.graded && out.reason).toMatch(/hours accepted: the line says 36, the record says 60/)
    expect(out.graded && out.reason).toMatch(/hours waiting: the line says 24, the record says 0/)
  })

  it('a run with no weekly line on the ledger in its window fails, saying the line is missing', async () => {
    await prisma.check.deleteMany({ where: { runId } })
    await prisma.agentRun.update({ where: { id: runId }, data: { at: new Date('2020-01-01T00:00:00Z') } })
    const out = await gradeSkillRun(runId)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL', unitsDone: 0 })
    expect(out.graded && out.reason).toMatch(/no weekly summary line is on the ledger/)
  })
})
