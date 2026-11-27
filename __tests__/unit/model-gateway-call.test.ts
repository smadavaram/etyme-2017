import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ prisma: {} }))

import { callModel, type ModelAdapter, type ModelRequest } from '@/lib/model-gateway/call'
import type { RegisteredModel } from '@/lib/model-gateway/register'
import { sdkAdapter } from '@/lib/model-gateway/adapters/sdk'

const mk = (o: Partial<RegisteredModel> = {}): RegisteredModel => ({
  id: 'low-a', label: 'Low A', adapter: 'fake', tier: 'LOW', classes: ['NON_SENSITIVE', 'TENANT_BUSINESS'],
  region: 'US', dpaSignedOn: '2026-11-01', keyEnv: 'K', ...o,
})
const env = { K: 'secret-value' }
// skills.evidence: a tenant-business model skill on the low tier that may escalate.
const base: ModelRequest = {
  companyId: 'co1', personId: 'p1', skillKey: 'skills.evidence', purpose: 'SKILL_EVIDENCE',
  prompt: 'Quote support for Java from the CV of Ada Reyes.', vocab: { people: ['Ada Reyes'] },
  record: { recordType: 'SUBMISSION', recordId: 's1' },
}
function world(adapter: ModelAdapter, models: RegisteredModel[], extra: { on?: boolean } = {}) {
  const runs: any[] = [], prompts: any[] = []
  const deps = {
    env, models, adapters: { fake: adapter }, timeoutMs: 50,
    modelOn: async () => extra.on ?? true,
    recordRun: (async (r: any) => { runs.push(r); return `run${runs.length}` }) as any,
    logPrompt: (async (p: any) => { prompts.push(p); return { ok: true, id: 'mp', withheld: false } }) as any,
  }
  return { deps, runs, prompts }
}
const answer = (text = 'ok', usage: any = { input_tokens: 1000, output_tokens: 100 }): ModelAdapter => ({ call: async () => ({ text, usage }) })

describe('the gateway is the one door for a model call', () => {
  it('a name in the prompt is masked before it leaves and put back in the answer', async () => {
    const seen: string[] = []
    const w = world({ call: async (_m, r) => { seen.push(r.prompt); return { text: 'PERSON_1 knows Java', usage: null } } }, [mk()])
    const r = await callModel(base, w.deps)
    expect(seen[0]).not.toContain('Ada Reyes')
    expect(seen[0]).toContain('PERSON_1')
    expect(r.ok && r.text).toBe('Ada Reyes knows Java')
  })
  it('the masked prompt and answer are logged with the model that answered, never the real name', async () => {
    const w = world(answer('PERSON_1 knows Java'), [mk()])
    await callModel(base, w.deps)
    expect(w.prompts).toHaveLength(1)
    expect(w.prompts[0]).toMatchObject({ model: 'low-a', provider: 'Low A', purpose: 'SKILL_EVIDENCE', companyId: 'co1', personId: 'p1' })
    expect(w.prompts[0].maskedPrompt).not.toContain('Ada Reyes')
    expect(w.prompts[0].realValues).toContain('Ada Reyes')
  })
  it('when the first model fails the next admitted model in the same tier answers and the fallback is recorded', async () => {
    const calls: string[] = []
    const w = world({ call: async (m) => { calls.push(m.id); if (m.id === 'low-a') throw new Error('down'); return { text: 'fine', usage: null } } },
      [mk(), mk({ id: 'low-b', label: 'Low B' })])
    const r = await callModel(base, w.deps)
    expect(calls).toEqual(['low-a', 'low-b'])
    expect(r.ok && r.model).toBe('low-b')
    expect(r.ok && r.fallbackFrom).toBe('low-a')
    expect(w.runs.map((x) => [x.model, x.verdict, x.fallbackFrom])).toEqual([['low-a', 'ERROR', null], ['low-b', 'PASS', 'low-a']])
  })
  it('a model that never answers is timed out and the next one is tried', async () => {
    const w = world({ call: async (m) => (m.id === 'low-a' ? new Promise(() => undefined) : { text: 'fine', usage: null }) },
      [mk(), mk({ id: 'low-b' })])
    const r = await callModel(base, w.deps)
    expect(r.ok && r.model).toBe('low-b')
    expect(w.runs[0].failReason).toMatch(/No answer within/)
  })
  it('fallback never reaches a model outside the US when the data is tenant business data', async () => {
    const calls: string[] = []
    const w = world({ call: async (m) => { calls.push(m.id); throw new Error('down') } },
      [mk(), mk({ id: 'eu', region: 'DE' })])
    // The register parse leaves a non-US tenant model out; a hand-built one is still refused at admission.
    const r = await callModel(base, w.deps)
    expect(calls).toEqual(['low-a'])
    expect(r).toMatchObject({ ok: false, status: 'FAILED' })
  })
  it('every model failing says so in a sentence and passes nothing on silently', async () => {
    const w = world({ call: async () => { throw new Error('down') } }, [mk(), mk({ id: 'low-b' })])
    const r = await callModel(base, w.deps)
    expect(r).toMatchObject({ ok: false, status: 'FAILED' })
    expect(w.runs).toHaveLength(2)
    expect(w.prompts).toHaveLength(0)
  })
  it('a model with no price set records its cost as not set, never a guessed price', async () => {
    const w = world(answer(), [mk()])
    const r = await callModel(base, w.deps)
    expect(r.ok && r.costMicros).toBeNull()
    expect(w.runs[0].failReason).toBe('Price not set.')
  })
  it('a model with a registered price reports its own cost in millionths of a dollar', async () => {
    const w = world(answer(), [mk({ price: { in: 2, out: 10 } })])
    const r = await callModel(base, w.deps)
    expect(r.ok && r.costMicros).toBe(1000 * 2 + 100 * 10)
  })
  it('with no model available the gateway says Not configured, throws nothing and records it', async () => {
    const w = world(answer(), [])
    const r = await callModel(base, w.deps)
    expect(r).toMatchObject({ ok: false, status: 'NOT_CONFIGURED' })
    expect(w.runs[0].failReason).toMatch(/Not configured/)
  })
  it('a model whose key is missing is Not configured, and nothing falls through to a model it was not entered for', async () => {
    const w = world(answer(), [mk({ keyEnv: 'MISSING_KEY' }), mk({ id: 'high', tier: 'HIGH' })])
    expect(await callModel(base, w.deps)).toMatchObject({ ok: false, status: 'NOT_CONFIGURED' })
  })
  it('a text with a social security number is refused before sending and the refusal is recorded', async () => {
    const adapter = { call: vi.fn(async () => ({ text: 'x', usage: null })) }
    const w = world(adapter, [mk()])
    const r = await callModel({ ...base, prompt: 'Her SSN is 123-45-6789' }, w.deps)
    expect(r).toMatchObject({ ok: false, status: 'LANE_C' })
    expect(adapter.call).not.toHaveBeenCalled()
    expect(w.runs[0]).toMatchObject({ verdict: 'ERROR', skillKey: 'skills.evidence' })
    expect(w.runs[0].failReason).toMatch(/^Lane C · not sent/)
  })
  it('a W-4 is never sent to any model, by its type, whatever its text holds', async () => {
    const adapter = { call: vi.fn(async () => ({ text: 'x', usage: null })) }
    const w = world(adapter, [mk()])
    const r = await callModel({ ...base, skillKey: 'document.read', documentType: 'W4', prompt: 'harmless words' }, w.deps)
    expect(r).toMatchObject({ ok: false, status: 'LANE_C' })
    expect(adapter.call).not.toHaveBeenCalled()
  })
  it('a company with the model off is sent nothing', async () => {
    const adapter = { call: vi.fn(async () => ({ text: 'x', usage: null })) }
    const w = world(adapter, [mk()], { on: false })
    expect(await callModel(base, w.deps)).toMatchObject({ ok: false, status: 'OFF' })
    expect(adapter.call).not.toHaveBeenCalled()
  })
  it('a rules skill and an unregistered skill may not call a model', async () => {
    const w = world(answer(), [mk()])
    expect(await callModel({ ...base, skillKey: 'payroll.draft' }, w.deps)).toMatchObject({ ok: false, status: 'REFUSED' })
    expect(await callModel({ ...base, skillKey: 'no.such.skill' }, w.deps)).toMatchObject({ ok: false, status: 'REFUSED' })
  })
  it("a tenant's own model is recorded as the tenant's own", async () => {
    const w = world(answer(), [mk({ byTenant: true })])
    await callModel(base, w.deps)
    expect(w.runs[0].byTenantModel).toBe(true)
  })
})

describe('the SDK adapter', () => {
  it('sends the masked text as one user message with the key the entry names and joins the text blocks', async () => {
    const create = vi.fn(async () => ({ content: [{ type: 'text', text: 'a' }, { type: 'tool_use' }, { type: 'text', text: 'b' }], usage: { input_tokens: 3, output_tokens: 4 } }))
    const make = vi.fn(async (_k: string) => ({ messages: { create } }))
    const out = await sdkAdapter(make).call(mk(), { prompt: 'hello', system: 'be brief', maxTokens: 50 }, env)
    expect(make).toHaveBeenCalledWith('secret-value')
    expect(create).toHaveBeenCalledWith({ model: 'low-a', max_tokens: 50, system: 'be brief', messages: [{ role: 'user', content: 'hello' }] })
    expect(out).toEqual({ text: 'ab', usage: { input_tokens: 3, output_tokens: 4 } })
  })
  it('a model whose key is not set is refused in a sentence rather than called', async () => {
    await expect(sdkAdapter(async () => { throw new Error('should not be made') }).call(mk(), { prompt: 'x', maxTokens: 1 }, {})).rejects.toThrow(/no key/)
  })
})
