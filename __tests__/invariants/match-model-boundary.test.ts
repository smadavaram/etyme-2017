import { describe, it, expect, vi } from 'vitest'
import {
  matchModelGate,
  matchDepsWith,
  scoreWithClaude,
  type MatchModelDeps,
  type RequirementData,
  type CandidateData,
} from '@/lib/match-engine'
import type { ModelDeps } from '@/lib/model-gateway/call'

vi.mock('@/lib/db', () => ({ prisma: {} }))

// The model ids come from the environment register (record 125); a deployment sets it, so this test does.
vi.hoisted(() => {
  process.env.ETYME_MODEL_REGISTER = JSON.stringify([{ id: 'test-model-match', adapter: 'sdk', tier: 'LOW', classes: ['TENANT_BUSINESS'], region: 'US', dpaSignedOn: '2026-11-01', keyEnv: 'TEST_MODEL_KEY' }])
  process.env.TEST_MODEL_KEY = 'x'
})


/**
 * Matching goes through the company's model switch: off by default, masked
 * before it leaves, logged, allowance respected (record 96). A nightly job
 * runs across every tenant, so the switch is asked for each company's run.
 */

const REQ: RequirementData = {
  id: 'req1', title: 'Validation engineer', skills: ['GAMP 5', 'CSV'], location: 'Boston',
  billMin: 60, billMax: 90, months: 6, startDate: new Date('2026-12-01'), companyId: 'A',
  company: { kind: 'CLIENT', homeCurrency: 'USD' },
}

const cand = (n: number, over: Partial<CandidateData> = {}): CandidateData => ({
  consultantId: `c${n}`, personId: `p${n}`, personName: ['Ada Reyes', 'Bo Tanaka'][n] ?? `Person Number${n}`,
  headline: null, skills: ['GAMP 5'], location: 'Boston', workAuth: null, rateFloor: 7800 + n,
  availableFrom: new Date('2026-11-01'), listingCompanyId: 'F', listingTier: 'OWN',
  listingRateMin: null, listingRateMax: null, confirmedAt: null, ...over,
})

function deps(on: Record<string, boolean>, over: Partial<MatchModelDeps> = {}) {
  const call = vi.fn(async (..._a: any[]) => ({
    text: '[{"idx":0,"score":88,"confidence":"HIGH","factors":[{"label":"Rate Fit","value":100,"weight":0.15,"detail":"RATE_1 is within range"}],"basis":"Skills line up","unknowns":null}]',
    model: 'test-model-match',
  }))
  const record = vi.fn(async (..._a: any[]) => 'run')
  const asked: string[] = []
  const d: MatchModelDeps = {
    modelOn: async (id) => { asked.push(id); return on[id] === true },
    keySet: () => true,
    call,
    actorFor: async () => 'person1',
    record,
    ...over,
  }
  return { d, call, record, asked }
}

describe('matching for a company whose switch is off', () => {
  it('matching for a company whose switch is off never calls the model', async () => {
    const t = deps({ A: false })
    const r = await scoreWithClaude(REQ, [cand(0)], 5, 1, { deps: t.d })
    expect(t.call).not.toHaveBeenCalled()
    expect(r).toHaveLength(1)
  })

  it('the basis of a rules-only score says rules were used and why', async () => {
    const t = deps({ A: false })
    const [m] = await scoreWithClaude(REQ, [cand(0)], 5, 1, { deps: t.d })
    expect(m.basis).toMatch(/^Deterministic scoring/)
    expect(m.basis).toMatch(/rules only: the company has not turned the model on/)
  })

  it('every rules-only score still carries factors, basis, confidence and unknowns', async () => {
    const t = deps({ A: false })
    const [m] = await scoreWithClaude(REQ, [cand(0)], 5, 1, { deps: t.d })
    expect(m.factors.length).toBeGreaterThan(0)
    expect(m.basis).toBeTruthy()
    expect(['HIGH', 'MODERATE', 'LOW']).toContain(m.confidence)
    expect('unknowns' in m).toBe(true)
  })

  it('a run on rules is written to the ledger as rules, never as a model call', async () => {
    const t = deps({ A: false })
    await scoreWithClaude(REQ, [cand(0)], 5, 1, { deps: t.d })
    const row = t.record.mock.calls[0][0] as any
    expect(row.agent).toBe('match.score.deterministic')
    expect(row.model).toBeUndefined()
  })
})

describe('matching with no key on the deployment', () => {
  it('with the switch on and no key, nothing is called and the rules score', async () => {
    const t = deps({ A: true }, { keySet: () => false })
    const [m] = await scoreWithClaude(REQ, [cand(0)], 5, 1, { deps: t.d })
    expect(t.call).not.toHaveBeenCalled()
    expect(m.basis).toMatch(/model is not set up/)
  })
})

describe('a nightly job across every tenant', () => {
  it('a job for company A never calls the model while only company B has its switch on', async () => {
    const t = deps({ A: false, B: true })
    await scoreWithClaude(REQ, [cand(0)], 5, 1, { deps: t.d, viewerCompanyId: 'A' })
    expect(t.call).not.toHaveBeenCalled()
  })

  it('a supplier matching a client\'s job needs both firms\' switches, since both firms\' data is in the prompt', async () => {
    const supplierOnly = deps({ A: false, S: true })
    await scoreWithClaude(REQ, [cand(0)], 5, 1, { deps: supplierOnly.d, viewerCompanyId: 'S' })
    expect(supplierOnly.call).not.toHaveBeenCalled()
    const both = deps({ A: true, S: true })
    await scoreWithClaude(REQ, [cand(0)], 5, 1, { deps: both.d, viewerCompanyId: 'S' })
    expect(both.call).toHaveBeenCalledTimes(1)
  })

  it('the gate can be asked per company before a job runs, and names why it said no', async () => {
    const t = deps({ A: true, B: false })
    expect((await matchModelGate(['A'], t.d)).may).toBe(true)
    const no = await matchModelGate(['B'], t.d)
    expect(no.may).toBe(false)
    expect(no.says).toMatch(/turned the model on|allowance/)
  })

  it('a company whose allowance is used is held by the same gate as one whose switch is off', async () => {
    // modelOnFor folds the allowance into the switch; a false answer is a false answer.
    const t = deps({ A: false })
    expect((await matchModelGate(['A'], t.d)).may).toBe(false)
  })
})

describe('what leaves when the switch is on', () => {
  it('no candidate name is in what is sent', async () => {
    const t = deps({ A: true })
    await scoreWithClaude(REQ, [cand(0), cand(1)], 5, 2, { deps: t.d })
    const { rules, candidates } = t.call.mock.calls[0][0] as any
    expect(`${rules}${candidates}`).not.toMatch(/Ada Reyes|Bo Tanaka/)
  })

  it('no rate floor and no budget range is in what is sent, only a token', async () => {
    const t = deps({ A: true })
    await scoreWithClaude(REQ, [cand(0)], 5, 1, { deps: t.d })
    const { rules, candidates } = t.call.mock.calls[0][0] as any
    const sent = `${rules}${candidates}`
    expect(sent).not.toMatch(/\$78|78\.00|\$60|\$90/)
    expect(sent).toContain('RATE_1')
  })

  it('the model\'s answer has its rate tokens put back before anyone reads it', async () => {
    const t = deps({ A: true })
    const [m] = await scoreWithClaude(REQ, [cand(0)], 5, 1, { deps: t.d })
    expect(m.factors[0].detail).not.toContain('RATE_1')
    expect(m.factors[0].detail).toMatch(/\$78/)
  })

  it('the ledger row for a model call names the model, and carries no usage because the gateway row holds it', async () => {
    const t = deps({ A: true })
    await scoreWithClaude(REQ, [cand(0)], 5, 1, { deps: t.d })
    const row = t.record.mock.calls[0][0] as any
    expect(row.agent).toBe('match.score')
    expect(row.model).toBe('test-model-match')
    expect(row.usage).toBeUndefined()
  })

  it('with no person at the company to carry the prompt log, nothing is sent', async () => {
    const t = deps({ A: true }, { actorFor: async () => null })
    const [m] = await scoreWithClaude(REQ, [cand(0)], 5, 1, { deps: t.d })
    expect(t.call).not.toHaveBeenCalled()
    expect(m.basis).toMatch(/nothing was sent/)
  })

  it('a model call that fails falls back to rules and says so in the basis', async () => {
    const t = deps({ A: true }, { call: async () => { throw new Error('overloaded') } })
    const [m] = await scoreWithClaude(REQ, [cand(0)], 5, 1, { deps: t.d })
    expect(m.basis).toMatch(/rules only: the model call failed/)
    expect((t.record.mock.calls[0][0] as any).verdict).toBe('ERROR')
  })
})

describe('matching asks the gateway as the match-ranking skill', () => {
  function world(over: Partial<ModelDeps> = {}) {
    const sent: any[] = [], logged: any[] = [], runs: any[] = []
    const gateway: ModelDeps = {
      adapters: { sdk: { call: (async (_m: any, r: any) => { sent.push(r); return { text: '[{"idx":0,"score":88,"confidence":"HIGH","factors":[{"label":"Rate Fit","value":100,"weight":0.15,"detail":"RATE_1 is within range"}],"basis":"Skills line up","unknowns":null}]', usage: { input_tokens: 900, output_tokens: 200 } } }) as any } },
      modelOn: async () => true,
      recordRun: (async (r: any) => { runs.push(r); return 'run1' }) as any,
      logPrompt: (async (p: any) => { logged.push(p); return { ok: true, id: 'mp', withheld: false } }) as any,
      ...over,
    }
    return { sent, logged, runs, d: { ...matchDepsWith(gateway), modelOn: async () => true, actorFor: async () => 'person1', record: vi.fn(async () => 'run') } as MatchModelDeps }
  }

  it('the prompt log is written by the gateway for the company that ran it, as a matching prompt, with no name in it', async () => {
    const w = world()
    await scoreWithClaude(REQ, [cand(0)], 5, 1, { deps: w.d, viewerCompanyId: 'A' })
    expect(w.logged[0]).toMatchObject({ companyId: 'A', personId: 'person1', purpose: 'MATCH', tokensIn: 900 })
    expect(w.logged[0].maskedPrompt).not.toMatch(/Ada Reyes/)
  })

  it('the gateway ledger row names the skill, the model and its usage', async () => {
    const w = world()
    await scoreWithClaude(REQ, [cand(0)], 5, 1, { deps: w.d })
    expect(w.runs[0]).toMatchObject({ skillKey: 'match.rank', model: 'test-model-match', verdict: 'PASS', usage: { input_tokens: 900, output_tokens: 200 } })
  })

  it('an answer that leaves out what is unknown fails its check and the rules score, said in the basis', async () => {
    const w = world({ adapters: { sdk: { call: (async () => ({ text: '[{"idx":0,"score":88,"confidence":"HIGH","factors":[{"label":"Skill Match","value":90,"weight":0.45}],"basis":"x"}]', usage: null })) as any } } })
    const [m] = await scoreWithClaude(REQ, [cand(0)], 5, 1, { deps: w.d })
    expect(m.basis).toMatch(/rules only: the model call failed/)
  })

  it('with no model registered the gate says it is not set up and nothing is sent', async () => {
    const w = world({ env: {}, models: [] })
    const [m] = await scoreWithClaude(REQ, [cand(0)], 5, 1, { deps: w.d })
    expect(w.sent).toHaveLength(0)
    expect(m.basis).toMatch(/model is not set up/)
  })
})
