import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { POST as runMatches } from '@/app/api/requirements/[id]/matches/route'
import { stampModelRun } from '@/lib/checks/skill-evidence'

/**
 * Skills will write AgentRun rows of their own (records 123, 125). The
 * match screen's "scored by a model or by arithmetic" and the evidence
 * stamp read the same table, so their counts must not move when skill rows
 * sit beside the scoring rows.
 */
const TELLISFORD_OWNER = 'world-tellisford@demo.etyme.local'
let jobId = ''
let companyId = ''

const runOnce = async () => {
  as(TELLISFORD_OWNER)
  const r = json(await runMatches(req('POST', `/api/requirements/${jobId}/matches`, {}), { params: Promise.resolve({ id: jobId }) }))
  expect((await r).status).toBe(200)
  const row = await prisma.automationLog.findFirstOrThrow({
    where: { action: 'MATCH_RUN', companyId }, orderBy: { at: 'desc' },
  })
  return (row.payload as any).decidedBy as string
}

describe('skill rows in the agent ledger leave the match screens unchanged', () => {
  beforeAll(async () => {
    await freshWorld()
    const job = await prisma.requirement.findFirstOrThrow({
      where: { status: 'OPEN', title: 'DO-178C verification engineer', company: { slug: 'world-corveldt' } },
      select: { id: true },
    })
    jobId = job.id
    companyId = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-tellisford' }, select: { id: true } })).id
  }, 300_000)

  it('a match run reads the same answer with and without a skill row that names a model', async () => {
    const without = await runOnce()
    await prisma.agentRun.create({
      data: {
        companyId, agent: 'match.score', recordType: 'REQUIREMENT', recordId: jobId,
        verdict: 'PASS', model: 'seeded-skill-model', ms: 1, skillKey: 'match.rank',
        agentKey: 'match', tier: 'LOW', at: new Date(Date.now() + 60_000),
      },
    })
    const withSkill = await runOnce()
    expect(withSkill).toBe(without)
    expect(withSkill).toBe('RULE')
  }, 120_000)

  it('stamping a scoring pass with its model never touches a skill row for the same record', async () => {
    const base = { companyId, agent: 'cv.evidence', recordType: 'SUBMISSION', recordId: 'sub-x', verdict: 'PASS', ms: 1 }
    const pass = await prisma.agentRun.create({ data: { ...base, attempt: 1 } })
    const skill = await prisma.agentRun.create({ data: { ...base, attempt: 1, skillKey: 'cv.read', agentKey: 'x', tier: 'LOW' } })
    await stampModelRun({ companyId, agent: 'cv.evidence', recordId: 'sub-x', attempt: 1, read: { model: 'm1', usage: { input_tokens: 5, output_tokens: 2 } } as any })
    expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: pass.id } })).model).toBe('m1')
    expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: skill.id } })).model).toBeNull()
  })
})
