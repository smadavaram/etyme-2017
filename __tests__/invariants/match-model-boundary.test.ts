import { describe, it, expect, vi } from 'vitest'
import {
  matchModelGate,
  scoreWithClaude,
  type MatchModelDeps,
  type RequirementData,
  type CandidateData,
} from '@/lib/match-engine'

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
    usage: { input_tokens: 900, output_tokens: 200 },
  }))
  const logPrompt = vi.fn(async (..._a: any[]) => ({ ok: true }))
  const record = vi.fn(async (..._a: any[]) => 'run')
  const asked: string[] = []
  const d: MatchModelDeps = {
    modelOn: async (id) => { asked.push(id); return on[id] === true },
    keySet: () => true,
    call,
    logPrompt,
    actorFor: async () => 'person1',
    record,
    ...over,
  }
  return { d, call, logPrompt, record, asked }
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
    const sent = JSON.stringify(t.call.mock.calls[0])
    expect(sent).not.toMatch(/Ada Reyes|Bo Tanaka/)
  })

  it('no rate floor and no budget range is in what is sent, only a token', async () => {
    const t = deps({ A: true })
    await scoreWithClaude(REQ, [cand(0)], 5, 1, { deps: t.d })
    const sent = JSON.stringify(t.call.mock.calls[0])
    expect(sent).not.toMatch(/\$78|78\.00|\$60|\$90/)
    expect(sent).toContain('RATE_1')
  })

  it('the model\'s answer has its rate tokens put back before anyone reads it', async () => {
    const t = deps({ A: true })
    const [m] = await scoreWithClaude(REQ, [cand(0)], 5, 1, { deps: t.d })
    expect(m.factors[0].detail).not.toContain('RATE_1')
    expect(m.factors[0].detail).toMatch(/\$78/)
  })

  it('the prompt and the answer are logged for the company that ran it, as a matching prompt', async () => {
    const t = deps({ A: true })
    await scoreWithClaude(REQ, [cand(0)], 5, 1, { deps: t.d, viewerCompanyId: 'A' })
    const logged = t.logPrompt.mock.calls[0][0] as any
    expect(logged.companyId).toBe('A')
    expect(logged.purpose).toBe('MATCH')
    expect(logged.personId).toBe('person1')
    expect(logged.tokensIn).toBe(900)
    expect(logged.maskedPrompt).not.toMatch(/Ada Reyes/)
  })

  it('the ledger row for a model call names the model and its usage', async () => {
    const t = deps({ A: true })
    await scoreWithClaude(REQ, [cand(0)], 5, 1, { deps: t.d })
    const row = t.record.mock.calls[0][0] as any
    expect(row.agent).toBe('match.score')
    expect(row.model).toBeTruthy()
    expect(row.usage).toEqual({ input_tokens: 900, output_tokens: 200 })
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
