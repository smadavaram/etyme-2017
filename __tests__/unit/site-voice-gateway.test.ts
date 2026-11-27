import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@/lib/db', () => ({ prisma: {} }))

import { writeWithModel, modelAvailable, type SiteFacts } from '@/lib/site-voice'
import type { ModelDeps } from '@/lib/model-gateway/call'

const REGISTER = JSON.stringify([{ id: 'model-a', label: 'Provider A', adapter: 'sdk', tier: 'LOW', classes: ['TENANT_BUSINESS'], region: 'US', dpaSignedOn: '2026-11-01', keyEnv: 'KEY_A' }])
const ENV = { ETYME_MODEL_REGISTER: REGISTER, KEY_A: 'x' }

const facts: SiteFacts = {
  name: 'Brightmoor Staffing', kind: 'VENDOR', posture: 'PRIME', skills: ['Java', 'Kubernetes'], locations: ['Portland, OR'],
  placements: 41, activeNow: 12, clients: 3, openPositions: 2, comingFree: 4, trainingCourses: 1,
}
const GOOD = '{"tagline":"Java and Kubernetes engineers in Portland.","intro":"Twelve people on site today.","headings":{"comingFree":"Free soon"}}'

function door(text: string | (() => never), over: Partial<ModelDeps> = {}) {
  const call = vi.fn(async (_m: any, _r: any) => {
    if (typeof text === 'function') text()
    return { text: text as string, usage: { input_tokens: 120, output_tokens: 60 } }
  })
  const runs: any[] = [], logged: any[] = []
  const gateway: ModelDeps = {
    env: ENV,
    adapters: { sdk: { call: call as any } },
    modelOn: async () => true,
    recordRun: (async (r: any) => { runs.push(r); return 'run1' }) as any,
    logPrompt: (async (p: any) => { logged.push(p); return { ok: true, id: 'mp', withheld: false } }) as any,
    ...over,
  }
  return { call, runs, logged, door: { companyId: 'co1', personId: 'p1', gateway } }
}

describe("a firm's public page is written through the one model gateway", () => {
  it('the page writer imports no model provider, reads no provider key and reads no model id', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/site-voice.ts'), 'utf8')
    expect(src).not.toMatch(/@anthropic-ai\/sdk/)
    expect(src).not.toMatch(/ANTHROPIC_API_KEY/)
    expect(src).not.toMatch(/\bmodelFor\(/)
  })

  it('an answer that keeps the house words is used and the page says it was written by the model', async () => {
    const d = door(GOOD)
    const v = await writeWithModel(facts, d.door)
    expect(v).toMatchObject({ writtenBy: 'MODEL', tagline: 'Java and Kubernetes engineers in Portland.' })
    expect(v!.headings.comingFree).toBe('Free soon')
  })

  it('the draft goes as the storefront wording skill, for the firm and the person who asked, as tenant business data', async () => {
    const d = door(GOOD)
    await writeWithModel(facts, d.door)
    expect(d.runs[0]).toMatchObject({ companyId: 'co1', skillKey: 'site.voice', model: 'model-a', verdict: 'PASS' })
    expect(d.logged[0]).toMatchObject({ companyId: 'co1', personId: 'p1', purpose: 'SITE_PAGE', model: 'model-a', provider: 'Provider A' })
  })

  it('what is sent is the firm\'s public facts, and no person and no rate', async () => {
    const d = door(GOOD)
    await writeWithModel(facts, d.door)
    const sent = d.call.mock.calls[0][1].prompt as string
    expect(sent).toContain('Placements to date: 41')
    expect(sent).not.toMatch(/rate|salary|@/i)
  })

  it('with no model registered for tenant data, nothing is sent and the page is written by rule', async () => {
    const d = door(GOOD, { env: {} })
    expect(await writeWithModel(facts, d.door)).toBeNull()
    expect(d.call).not.toHaveBeenCalled()
  })

  it('a firm whose switch is off never has its facts sent', async () => {
    const d = door(GOOD, { modelOn: async () => false })
    expect(await writeWithModel(facts, d.door)).toBeNull()
    expect(d.call).not.toHaveBeenCalled()
  })

  it('a model that does not answer leaves the page to the rules', async () => {
    const d = door(GOOD, { adapters: { sdk: { call: async () => { throw new Error('down') } } } })
    expect(await writeWithModel(facts, d.door)).toBeNull()
  })

  it('an answer that says the firm trains people, or spells a word the British way, is never used', async () => {
    expect(await writeWithModel(facts, door('{"tagline":"We train Java engineers.","intro":"Twelve on site."}').door)).toBeNull()
    expect(await writeWithModel(facts, door('{"tagline":"Java engineers.","intro":"An organisation in Portland."}').door)).toBeNull()
  })

  it('with no company asking, nothing can be sent', async () => {
    expect(await writeWithModel(facts)).toBeNull()
  })

  it('the writer is available only where a model is registered for tenant data and keyed', () => {
    expect(modelAvailable(ENV)).toBe(true)
    expect(modelAvailable({})).toBe(false)
    expect(modelAvailable({ ETYME_MODEL_REGISTER: REGISTER })).toBe(false)
  })
})
