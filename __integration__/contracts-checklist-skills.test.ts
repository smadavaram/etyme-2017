/**
 * The contracts checklist on skills (record 123, plan step 8), on the
 * database through the real runner and the real grader.
 * `golden-contracts-checklist.test.ts` proves the rows are unchanged; this
 * proves the plan, the skill runs and what each checker finds.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, resetDatabase } from './harness'
import { buildGoldenWorld, switchAgent, GOLDEN_MONDAY, GOLDEN_TUESDAY, type GoldenWorld } from './golden-world'
import { addContractsWorld } from './golden-world-extras'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { contractsChecklistStep, CONTRACTS_CHECKLIST_AGENT, CONTRACTS_CHECKLIST_RULES } from '@/lib/agents/contracts-checklist'
import { planOf } from '@/lib/agents/plans'
import { gradeSkillRun } from '@/lib/skills/grade'

process.env.NEXTAUTH_SECRET ||= 'test-secret-for-golden'
process.env.NEXTAUTH_URL = 'https://etyme.example'
for (const k of ['RESEND_API_KEY', 'SENDGRID_API_KEY', 'NOTIFY_FROM_EMAIL']) delete process.env[k]
const KEY = CONTRACTS_CHECKLIST_AGENT
let w: GoldenWorld
let x: Awaited<ReturnType<typeof addContractsWorld>>
const runsOf = (skillKey: string, recordType?: string) => prisma.agentRun.findMany({ where: { companyId: w.firm.id, skillKey, ...(recordType ? { recordType } : {}) }, orderBy: [{ at: 'asc' }, { id: 'asc' }] })
const ungrade = (runId: string) => prisma.check.deleteMany({ where: { runId } })

beforeAll(async () => {
  await resetDatabase()
  w = await buildGoldenWorld()
  x = await addContractsWorld(w)
  await switchAgent(w, KEY, 'ON')
  registerAgent(KEY, { ruleVersion: CONTRACTS_CHECKLIST_RULES, step: contractsChecklistStep })
  await runAgent(KEY, w.firm.id, GOLDEN_MONDAY)
  await runAgent(KEY, w.firm.id, GOLDEN_TUESDAY)
  unregisterAgent(KEY)
}, 600_000)

describe('the contracts checklist as skills', () => {
  it('the plan is the listing of terms, the flagging of a drift and the opening of a card, and the listing is the line shown for the agent', () => {
    expect(planOf(KEY)).toMatchObject({ skills: ['checklist.list', 'drift.flag', 'card.open'], outputSkill: 'checklist.list' })
  })

  it('one listing run is written for each term listed, one flag run for a drift each day it is looked at, and one card run for each card kind looked at, all rules tier at no cost', async () => {
    const all = await prisma.agentRun.findMany({ where: { companyId: w.firm.id, agentKey: KEY } })
    const by = (k: string) => all.filter((r) => r.skillKey === k).length
    const listed = await prisma.recordAction.count({ where: { companyId: w.firm.id, agentKey: KEY, action: 'CHECKLIST_LISTED' } })
    expect(by('checklist.list')).toBe(listed)
    expect(by('drift.flag')).toBe(2)
    expect(by('card.open')).toBe(4)
    expect(all.every((r) => r.tier === 'RULES' && r.costMicros === 0 && r.verdict === 'PASS')).toBe(true)
  })

  it('every listing, flag and card run on the seeded world passes its checker, counting one unit each', async () => {
    const runs = [...(await runsOf('checklist.list')), ...(await runsOf('drift.flag')), ...(await runsOf('card.open'))]
    for (const r of runs) expect(await gradeSkillRun(r.id), `${r.skillKey} ${r.recordType} ${r.recordId}`).toMatchObject({ graded: true, verdict: 'PASS', unitsDone: 1 })
  })

  it('a term whose placement was changed after it was listed fails, saying what the list and the placement each read', async () => {
    const run = (await runsOf('checklist.list')).find((r) => r.recordId === `${x.line.id}:Bill rate`)!
    await ungrade(run.id)
    await prisma.sellContract.update({ where: { id: x.line.id }, data: { billRate: 9900 } })
    const out = await gradeSkillRun(run.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL', unitsDone: 0 })
    expect(out.graded && out.reason).toMatch(/“Bill rate” reads \$90\.00 an hour on the list and \$99\.00 an hour on the placement/)
    await prisma.sellContract.update({ where: { id: x.line.id }, data: { billRate: 9000 } })
  })

  it('a flagged drift whose card is owed by the wrong seat fails, saying the owner reader does not name it', async () => {
    const run = (await runsOf('drift.flag'))[0]
    await ungrade(run.id)
    const item = await prisma.checklistItem.findFirstOrThrow({ where: { companyId: w.firm.id, ownerId: x.line.id, label: 'Payment terms' } })
    const card = (await prisma.decisionItem.findMany({ where: { companyId: w.firm.id } })).find((d) => JSON.stringify(d.proofLinks).includes(item.id))!
    await prisma.decisionItem.update({ where: { id: card.id }, data: { ownerPersonId: x.hr.id } })
    const out = await gradeSkillRun(run.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL', unitsDone: 0 })
    expect(out.graded && out.reason).toMatch(/owed by a seat the owner reader does not name/)
    await prisma.decisionItem.update({ where: { id: card.id }, data: { ownerPersonId: x.cm.id } })
  })

  it('a flagged drift that was put right since is not graded and never counted as passed', async () => {
    const run = (await runsOf('drift.flag'))[1]
    await ungrade(run.id)
    await prisma.sellContract.update({ where: { id: x.line.id }, data: { paymentTerms: 30 } })
    const out = await gradeSkillRun(run.id)
    expect(out).toMatchObject({ graded: true, verdict: 'UNKNOWN', unitsDone: null })
    expect(out.graded && out.reason).toMatch(/no longer reads as a drift/)
  })

  it('a placement card run fails when no card is on the record for the placement', async () => {
    const run = (await runsOf('card.open', 'PlacementRecord'))[0]
    await ungrade(run.id)
    await prisma.decisionItem.deleteMany({ where: { companyId: w.firm.id, proofLinks: { array_contains: [{ recordType: 'PlacementRecord', recordId: run.recordId }] } } })
    const out = await gradeSkillRun(run.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL', unitsDone: 0 })
    expect(out.graded && out.reason).toMatch(/No card is on the record/)
  })
})
