import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { askModel, FAILED_SAYS } from '@/app/api/conversations/twin/model-reply'
import type { ModelResult, ModelDeps, ModelRequest } from '@/lib/model-gateway/call'
import { NOT_CONFIGURED_SAYS } from '@/lib/model-gateway/call'

const REGISTER = JSON.stringify([{ id: 'model-a', label: 'Provider A', adapter: 'sdk', tier: 'LOW', classes: ['TENANT_BUSINESS'], region: 'US', dpaSignedOn: '2026-11-01', keyEnv: 'KEY_A' }])
const ENV = { ETYME_MODEL_REGISTER: REGISTER, KEY_A: 'x' }
const ARGS = { companyId: 'c1', personId: 'p1', system: 'S', question: 'Q', context: 'C', env: ENV }

const ok = (over: Partial<Extract<ModelResult, { ok: true }>> = {}): ModelResult => ({
  ok: true, text: 'An answer.', model: 'model-a', tier: 'LOW', usage: { input_tokens: 10, output_tokens: 5 }, costMicros: null,
  fallbackFrom: null, escalatedFrom: null, runId: 'r1', promptLogged: true, ...over,
})

describe("Ask Etyme's model reader goes through the one model gateway", () => {
  it('the conversation reader imports no model provider and reads no provider key', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/conversations/twin/read.ts'), 'utf8')
    expect(src).not.toMatch(/@anthropic-ai\/sdk/)
    expect(src).not.toMatch(/ANTHROPIC_API_KEY/)
    expect(src).not.toMatch(/provider: 'anthropic'/)
    expect(src).toMatch(/askModel\(/)
  })

  it('an answer comes back with the model that wrote it and the name the register gives its provider', async () => {
    const call = vi.fn(async () => ok())
    const r = await askModel({ ...ARGS, call })
    expect(r).toMatchObject({ text: 'An answer.', model: 'model-a', provider: 'Provider A', tokensIn: 10, tokensOut: 5, cut: false })
  })

  it('the question goes as the ask.answer skill, from the signed-in person, as tenant business data', async () => {
    const call = vi.fn(async (_r: ModelRequest, _d?: ModelDeps) => ok())
    await askModel({ ...ARGS, call })
    expect(call.mock.calls[0][0]).toMatchObject({ skillKey: 'ask.answer', companyId: 'c1', personId: 'p1', system: 'S', record: { recordType: 'TWIN_LEDGER', recordId: 'c1' } })
    expect(call.mock.calls[0][0].prompt).toBe('Ledger lines:\nC\n\nQuestion: Q')
  })

  it("the gateway does not write a second prompt log, because Ask Etyme writes its own with the replaced mark", async () => {
    const call = vi.fn(async (_r: ModelRequest, _d?: ModelDeps) => ok())
    await askModel({ ...ARGS, call })
    const deps = call.mock.calls[0][1]!
    expect(await deps.logPrompt!({} as any)).toEqual({ ok: true, id: 'ask-etyme-logs-it', withheld: false })
  })

  it('an answer that used up its length is marked cut, so only whole sentences are shown', async () => {
    const r = await askModel({ ...ARGS, call: async () => ok({ usage: { input_tokens: 10, output_tokens: 700 } }) })
    expect(r).toMatchObject({ cut: true })
  })

  it('a model that was asked and failed says so, and says the reply is from the rules', async () => {
    const r = await askModel({ ...ARGS, call: async () => ({ ok: false, status: 'FAILED', says: 'Every model for this step failed (timeout).' }) })
    expect(r).toEqual({ missed: 'The model did not answer; this reply is from the rules.' })
    expect(FAILED_SAYS).toBe('The model did not answer; this reply is from the rules.')
  })

  it('a model call that throws is said, never turned into silence', async () => {
    const r = await askModel({ ...ARGS, call: async () => { throw new Error('socket hang up') } })
    expect(r).toEqual({ missed: FAILED_SAYS })
  })

  it('a model that is not set up says Not configured and nothing was sent', async () => {
    const r = await askModel({ ...ARGS, call: async () => ({ ok: false, status: 'NOT_CONFIGURED', says: NOT_CONFIGURED_SAYS }) })
    expect(r).toEqual({ missed: NOT_CONFIGURED_SAYS })
    expect(NOT_CONFIGURED_SAYS).toMatch(/^Not configured/)
  })

  it('an answer that failed its check twice is said as no answer, never shown', async () => {
    const r = await askModel({ ...ARGS, call: async () => ({ ok: false, status: 'KEY_FAILED', says: 'x A person needs to look at this.' }) })
    expect(r).toEqual({ missed: FAILED_SAYS })
  })

  it('a refusal by the company switch or Lane C is said in the gateway’s own words', async () => {
    const off = await askModel({ ...ARGS, call: async () => ({ ok: false, status: 'OFF', says: 'The model is not on for this company, so nothing was sent.' }) })
    expect(off).toEqual({ missed: 'The model is not on for this company, so nothing was sent.' })
  })
})
