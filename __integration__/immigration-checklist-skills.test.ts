/**
 * The immigration checklist on skills (record 123, plan step 8), on the
 * database through the real runner and the real grader.
 * `golden-immigration-checklist.test.ts` proves the rows are unchanged; this
 * proves the plan, the skill runs and what each checker finds.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, resetDatabase } from './harness'
import { buildGoldenWorld, switchAgent, GOLDEN_MONDAY, GOLDEN_TUESDAY, type GoldenWorld } from './golden-world'
import { addImmigrationWorld } from './golden-world-extras'
import { runAgent, registerAgent, unregisterAgent } from '@/lib/agents/runner'
import { immigrationChecklistStep, IMMIGRATION_CHECKLIST_AGENT, IMMIGRATION_CHECKLIST_RULES } from '@/lib/agents/immigration-checklist'
import { planOf } from '@/lib/agents/plans'
import { gradeSkillRun } from '@/lib/skills/grade'

process.env.NEXTAUTH_SECRET ||= 'test-secret-for-golden'
process.env.NEXTAUTH_URL = 'https://etyme.example'
for (const k of ['RESEND_API_KEY', 'SENDGRID_API_KEY', 'NOTIFY_FROM_EMAIL']) delete process.env[k]
const KEY = IMMIGRATION_CHECKLIST_AGENT
let w: GoldenWorld
let x: Awaited<ReturnType<typeof addImmigrationWorld>>
const runsOf = (skillKey: string) => prisma.agentRun.findMany({ where: { companyId: w.firm.id, skillKey }, orderBy: [{ at: 'asc' }, { id: 'asc' }] })
const ungrade = (runId: string) => prisma.check.deleteMany({ where: { runId } })

beforeAll(async () => {
  await resetDatabase()
  w = await buildGoldenWorld()
  x = await addImmigrationWorld(w)
  await switchAgent(w, KEY, 'ON')
  registerAgent(KEY, { ruleVersion: IMMIGRATION_CHECKLIST_RULES, step: immigrationChecklistStep })
  await runAgent(KEY, w.firm.id, GOLDEN_MONDAY)
  await prisma.checklistItem.updateMany({ where: { ownerId: x.petition.id }, data: { state: 'MET', decidedById: w.owner.id } })
  await runAgent(KEY, w.firm.id, GOLDEN_TUESDAY)
  unregisterAgent(KEY)
}, 600_000)

describe('the immigration checklist as skills', () => {
  it('the plan is the listing of a petition’s papers and the opening of a signature card, and the listing is the line shown for the agent', () => {
    expect(planOf(KEY)).toMatchObject({ skills: ['checklist.list', 'card.open'], outputSkill: 'checklist.list' })
  })

  it('one listing run covers the three papers a petition lacked, and one card run is written for each signature line looked at, all rules tier at no cost', async () => {
    const all = await prisma.agentRun.findMany({ where: { companyId: w.firm.id, agentKey: KEY } })
    expect(all.filter((r) => r.skillKey === 'checklist.list')).toMatchObject([{ recordId: x.petition.id, unitsPlanned: 3 }])
    expect(all.filter((r) => r.skillKey === 'card.open')).toHaveLength(3)
    expect(all.every((r) => r.tier === 'RULES' && r.costMicros === 0 && r.verdict === 'PASS')).toBe(true)
  })

  it('the listing passes when every paper on the petition’s list is its own line and no paper was marked on hand by the agent', async () => {
    const [run] = await runsOf('checklist.list')
    expect(await gradeSkillRun(run.id)).toMatchObject({ graded: true, verdict: 'PASS', unitsDone: 4 })
  })

  it('each signature card passes when one card is on the record, owed by the signatory named on the line where she works here, else the Owner', async () => {
    for (const r of await runsOf('card.open')) expect(await gradeSkillRun(r.id), r.recordId).toMatchObject({ graded: true, verdict: 'PASS', unitsDone: 1 })
  })

  it('a card for the petition form that is owed to the Owner and not to the HR seat named on it fails', async () => {
    const form = await prisma.checklistItem.findFirstOrThrow({ where: { ownerId: x.petition.id, label: 'Petition form' } })
    const formRun = (await runsOf('card.open')).find((r) => r.recordId === form.id)!
    await ungrade(formRun.id)
    const card = (await prisma.decisionItem.findMany({ where: { companyId: w.firm.id } })).find((d) => JSON.stringify(d.proofLinks).includes(form.id))!
    await prisma.decisionItem.update({ where: { id: card.id }, data: { ownerPersonId: w.owner.id } })
    const out = await gradeSkillRun(formRun.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL', unitsDone: 0 })
    expect(out.graded && out.reason).toMatch(/owed by a seat the owner reader does not name/)
  })

  it('a petition paper marked on hand with no person recorded fails, naming the paper', async () => {
    const [run] = await runsOf('checklist.list')
    await ungrade(run.id)
    await prisma.checklistItem.updateMany({ where: { ownerId: x.petition.id, label: 'Approval notice copy' }, data: { decidedById: null } })
    const out = await gradeSkillRun(run.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL', unitsDone: 3 })
    expect(out.graded && out.reason).toMatch(/Approval notice copy reads on hand and no person recorded it/)
  })

  it('a petition missing a paper from its list fails, naming it', async () => {
    const [run] = await runsOf('checklist.list')
    await ungrade(run.id)
    await prisma.checklistItem.deleteMany({ where: { ownerId: x.petition.id, label: 'Representation form' } })
    const out = await gradeSkillRun(run.id)
    expect(out).toMatchObject({ graded: true, verdict: 'FAIL' })
    expect(out.graded && out.reason).toMatch(/missing Representation form/)
  })
})
