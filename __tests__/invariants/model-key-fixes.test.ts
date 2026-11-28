import { describe, it, expect, vi, beforeEach } from 'vitest'

const recorded: any[] = []
const checks: any[] = []
const logs: any[] = []
const engineCalls: any[] = []
let switchOn: Record<string, boolean> = {}
let agentRows: any[] = []

vi.mock('@/lib/db', () => ({
  prisma: {
    check: { createMany: async ({ data }: any) => { checks.push(...data) } },
    requirement: {
      findMany: async () => [
        { id: 'r1', title: 'Java', companyId: 'coA', _count: { matches: 0 } },
        { id: 'r2', title: 'Data', companyId: 'coB', _count: { matches: 0 } },
      ],
    },
    agentRun: {
      // Honors the filters the route asks with, so a skill row is counted only if the route lets it in.
      count: async ({ where }: any) => agentRows.filter((r) =>
        where.recordId.in.includes(r.recordId) && r.agent === where.agent && r.verdict === where.verdict && r.model !== null
        && (!('skillKey' in where) || r.skillKey === where.skillKey)).length,
    },
    automationLog: { create: async ({ data }: any) => { logs.push(data) } },
  },
}))
vi.mock('@/lib/agent-run', () => ({ record: async (r: any) => { recorded.push(r); return 'run1' } }))
vi.mock('@/lib/model-boundary', () => ({
  modelSetUpHere: (env: any = process.env) => gatewayHealth(env).configured,
  modelOnFor: async (id: string) => switchOn[id] === true,
}))
vi.mock('@/lib/match-engine', () => ({
  runMatchEngine: async (id: string, opts: any) => { engineCalls.push({ id, opts }); return { matches: [{ x: 1 }], basis: '' } },
}))
vi.mock('@/lib/cron-auth', () => ({ cronAuthorized: () => true }))
vi.mock('@/lib/alerts', () => ({ reportError: () => {} }))

import { gatewayHealth } from '@/lib/model-gateway/health'
import { runLoop, modelHeldSays } from '@/lib/loop'
import { costMicrosFromPrice, priceFromRegister } from '@/lib/model-gateway/register'
import { modelHealth } from '@/lib/model-health'
import { GET } from '@/app/api/cron/proactive-match/route'
import fs from 'node:fs'

beforeEach(() => {
  recorded.length = 0; checks.length = 0; logs.length = 0; engineCalls.length = 0
  switchOn = {}
  agentRows = []
  process.env.ETYME_MODEL_REGISTER = JSON.stringify([{ id: 'test-model', label: 'Test model', adapter: 'sdk', tier: 'LOW', classes: ['NON_SENSITIVE', 'TENANT_BUSINESS'], region: 'US', dpaSignedOn: '2026-11-01', keyEnv: 'TEST_MODEL_KEY' }])
  process.env.TEST_MODEL_KEY = 'x'
})

const modelStep = (ran: { n: number }) => ({
  code: 'SKILLS_EVIDENCED', checker: 'MODEL' as const,
  run: () => { ran.n++; return null },
})

describe('a model check that did not run is recorded as unverified, never as a pass', () => {
  it('with no key the check is unverified, says why, and the model step is never called', async () => {
    delete process.env.TEST_MODEL_KEY
    const ran = { n: 0 }
    const out = await runLoop({ name: 'submission.check', recordType: 'SUBMISSION', steps: [modelStep(ran)] }, {}, { companyId: 'coA', recordId: 's1', attempt: 1 })
    expect(ran.n).toBe(0)
    expect(out.unverified).toHaveLength(1)
    expect(out.unverified[0].reason).toContain('No model key')
    expect(recorded[0].verdict).toBe('ERROR')
    expect(recorded[0].failReason).toMatch(/^unverified: /)
  })
  it("with the company's switch off the check is unverified and says the switch is off", async () => {
    const ran = { n: 0 }
    const out = await runLoop({ name: 'submission.check', recordType: 'SUBMISSION', steps: [modelStep(ran)] }, {}, { companyId: 'coA', recordId: 's1', attempt: 1 })
    expect(ran.n).toBe(0)
    expect(out.unverified[0].reason).toContain('switch is off')
    expect(out.passed).toHaveLength(0)
  })
  it('with the key and the switch on the model step runs as before', async () => {
    switchOn = { coA: true }
    const ran = { n: 0 }
    await runLoop({ name: 'submission.check', recordType: 'SUBMISSION', steps: [modelStep(ran)] }, {}, { companyId: 'coA', recordId: 's1', attempt: 1 })
    expect(ran.n).toBe(1)
  })
  it('the sentence for a held check is empty only when both the key and the switch allow it', () => {
    expect(modelHeldSays(true, true)).toBeNull()
    expect(modelHeldSays(false, true)).not.toBeNull()
    expect(modelHeldSays(true, false)).not.toBeNull()
  })
  it('the health sentence for a keyless deployment says it is recorded as unverified, which is now true', () => {
    expect(modelHealth({}).says).toContain('recorded as unverified')
  })
})

describe('what each model costs', () => {
  const REG = { ETYME_MODEL_REGISTER: JSON.stringify([{ id: 'm-read', adapter: 'sdk', tier: 'LOW', classes: ['TENANT_BUSINESS'], region: 'US', dpaSignedOn: '2026-11-01', keyEnv: 'K', price: { in: 2, out: 10, cacheRead: 0.1 } }]) }
  it('costs a million input tokens at the price the register gives the model, and no price is written in code', () => {
    expect(costMicrosFromPrice(priceFromRegister('m-read', REG), { input_tokens: 1_000_000 })).toBe(2_000_000)
  })
  it('gives an unknown model id no price, with no fallback figure', () => {
    expect(priceFromRegister('some-model-shipped-last-tuesday', REG)).toBeNull()
    expect(costMicrosFromPrice(priceFromRegister('some-model-shipped-last-tuesday', REG), { input_tokens: 1000 })).toBeNull()
  })
})

describe('the nightly proactive match asks each company before any model call', () => {
  const run = async () => (await GET(new Request('http://x/api/cron/proactive-match') as any)).json()

  it('matches by rules alone for a company whose model switch is off', async () => {
    switchOn = { coA: true, coB: false }
    await run()
    expect(engineCalls.find((c) => c.id === 'r1').opts.rulesOnly).toBeUndefined()
    expect(engineCalls.find((c) => c.id === 'r2').opts.rulesOnly).toBe(true)
  })
  it('matches by rules alone everywhere when no model key is set', async () => {
    delete process.env.TEST_MODEL_KEY
    switchOn = { coA: true, coB: true }
    await run()
    expect(engineCalls.every((c) => c.opts.rulesOnly === true)).toBe(true)
  })
  it('the model count is unchanged when skill rows exist for the same job', async () => {
    switchOn = { coA: true, coB: true }
    const scored = { agent: 'match.score', verdict: 'PASS', model: 'claude-haiku-5-5', skillKey: null }
    agentRows = [{ ...scored, recordId: 'r2' }]
    await run()
    expect(logs.find((l) => l.companyId === 'coA').payload.decidedBy).toBe('RULE')
    expect(logs.find((l) => l.companyId === 'coB').payload.decidedBy).toBe('MODEL')
    logs.length = 0
    agentRows = [{ ...scored, recordId: 'r2' }, { ...scored, recordId: 'r1', skillKey: 'match.rank' }]
    await run()
    expect(logs.find((l) => l.companyId === 'coA').payload.decidedBy).toBe('RULE')
    expect(logs.find((l) => l.companyId === 'coB').payload.decidedBy).toBe('MODEL')
  })
  it('writes one automation log row under each company it acted for, not only the first', async () => {
    switchOn = { coA: true }
    await run()
    expect(logs.map((l) => l.companyId).sort()).toEqual(['coA', 'coB'])
    expect(logs.find((l) => l.companyId === 'coB').reason).toContain('model was not asked')
  })
})

describe('the readiness page and the mail agree on the lasting address', () => {
  it('reads the lasting address from the same function mail uses', () => {
    const src = fs.readFileSync('src/lib/readiness-facts.ts', 'utf8')
    expect(src).toContain('lastingAddress: fixedAppUrl() !== null')
  })
})
