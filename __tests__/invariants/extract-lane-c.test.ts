import { describe, it, expect, vi } from 'vitest'
import { entityByKey } from '@/lib/importable'
import { extractWithModel, withoutLaneC, modelAvailable } from '@/lib/extract'
import type { ModelDeps } from '@/lib/model-gateway/call'

vi.mock('@/lib/db', () => ({ prisma: {} }))

// The model ids come from the environment register (record 125); a deployment sets it, so this test does.
vi.hoisted(() => {
  process.env.ETYME_MODEL_REGISTER = JSON.stringify([{ id: 'test-model-read', adapter: 'sdk', tier: 'LOW', classes: ['TENANT_BUSINESS'], region: 'US', dpaSignedOn: '2026-11-01', keyEnv: 'TEST_MODEL_KEY' }])
  process.env.TEST_MODEL_KEY = 'x'
})


/**
 * Record 96, Lane C: social security numbers, dates of birth and bank
 * details reach no model. They are cut by rule before any call, and the
 * call says which model answered and what it used.
 */

const COST_CENTERS = entityByKey('COST_CENTERS')!

const WHO = { companyId: 'co1', personId: 'p1' }
const QUOTED = '{"records":[{"fields":[{"field":"code","value":"A","confidence":1,"foundIn":"Code","concern":null}]}],"unread":[]}'

/** The gateway's own dependencies, with a fake model that answers and a switch that is on. */
function fakeClient(answer = QUOTED, over: Partial<ModelDeps> = {}) {
  const create = vi.fn(async (_m: any, req: any) => ({ text: answer, usage: { input_tokens: 120, output_tokens: 30 } }))
  const runs: any[] = []
  const gateway: ModelDeps = {
    adapters: { sdk: { call: create as any } },
    modelOn: async () => true,
    recordRun: (async (r: any) => { runs.push(r); return 'run1' }) as any,
    logPrompt: (async () => ({ ok: true, id: 'mp', withheld: false })) as any,
    ...over,
  }
  return { create, runs, client: { ...WHO, gateway } }
}

describe('what leaves for a sheet import never holds a social security number, a date of birth or a bank detail', () => {
  it('a sheet row holding a social security number has it removed before any call', async () => {
    const { create, client } = fakeClient()
    await extractWithModel(COST_CENTERS, 'Name,SSN,Rate\nAda Reyes,123-45-6789,98', 5, client)
    const sent = JSON.stringify(create.mock.calls[0][1])
    expect(sent).not.toContain('123-45-6789')
    expect(sent).toContain('removed: social security number')
  })

  it('a social security number in prose is removed wherever it stands', () => {
    const r = withoutLaneC('Her SSN: 123456789 and also 987-65-4321 are on the form.')
    expect(r.text).not.toMatch(/123456789|987-65-4321/)
    expect(r.removed).toEqual(['SOCIAL_SECURITY'])
  })

  it('a date of birth under a heading is removed whatever format it is written in', () => {
    const r = withoutLaneC('Name,Date of Birth,Email\nAda,March 3 1988,a@x.example\nBo,03/04/1990,b@x.example')
    expect(r.text).not.toMatch(/1988|1990/)
    expect(r.removed).toContain('DATE_OF_BIRTH')
  })

  it('a date of birth in prose is removed but an ordinary start date is kept', () => {
    const r = withoutLaneC('DOB: 14 July 1985. Start date: 2026-12-01.')
    expect(r.text).not.toContain('1985')
    expect(r.text).toContain('2026-12-01')
  })

  it('bank account and routing numbers are removed, in a table and in prose', () => {
    const t = withoutLaneC('Name,Routing Number,Bank Account Number\nAda,021000021,00123456789')
    expect(t.text).not.toMatch(/021000021|00123456789/)
    const p = withoutLaneC('Pay to routing 021000021, account number 00123456789 please. IBAN GB82 WEST 1234 5698 7654 32')
    expect(p.text).not.toMatch(/021000021|00123456789|GB82/)
    expect(p.removed).toEqual(['BANK_DETAILS'])
  })

  it('a client\'s general ledger account column is a code, not a bank account, and is kept', () => {
    const r = withoutLaneC('Code,GL Account\nMFG-100,6100')
    expect(r.text).toContain('6100')
    expect(r.removed).toEqual([])
  })

  it('ordinary text with none of it comes back unchanged', () => {
    const text = 'Code,Name\nMFG-100,Packaging line'
    expect(withoutLaneC(text)).toEqual({ text, removed: [] })
  })

  it('the note says what was removed, so the person is never left wondering', async () => {
    const { client } = fakeClient()
    const r = await extractWithModel(COST_CENTERS, 'SSN: 123-45-6789', 5, client)
    expect(r?.note).toMatch(/social security numbers was removed before reading and never sent/)
    expect(r?.removed).toEqual(['SOCIAL_SECURITY'])
  })
})

describe('a sheet import says which model answered and what it used', () => {
  it('the result carries the model id and the tokens the call used', async () => {
    const { client } = fakeClient()
    const r = await extractWithModel(COST_CENTERS, 'Code\nA', 5, client)
    expect(r?.model).toBeTruthy()
    expect(r?.usage).toEqual({ input_tokens: 120, output_tokens: 30 })
  })

  it('with no model registered, nothing is called and the caller falls back', async () => {
    const { create, client } = fakeClient(QUOTED, { env: {} })
    expect(await extractWithModel(COST_CENTERS, 'Code\nA', 5, client)).toBeNull()
    expect(create).not.toHaveBeenCalled()
    expect(modelAvailable({})).toBe(false)
  })

  it('a model registered for tenant data and keyed makes the reader available', () => {
    expect(modelAvailable()).toBe(true)
  })

  it('with the company\'s switch off, nothing is called and the caller falls back', async () => {
    const { create, client } = fakeClient(QUOTED, { modelOn: async () => false })
    expect(await extractWithModel(COST_CENTERS, 'Code\nA', 5, client)).toBeNull()
    expect(create).not.toHaveBeenCalled()
  })

  it('with nobody named to ask for, nothing is called and the caller falls back', async () => {
    const { create, client } = fakeClient()
    expect(await extractWithModel(COST_CENTERS, 'Code\nA', 5, { gateway: client.gateway })).toBeNull()
    expect(create).not.toHaveBeenCalled()
  })
})

describe('a sheet import goes through the gateway as the document-reading skill', () => {
  it('the ledger row names the skill and the model that answered', async () => {
    const { runs, client } = fakeClient()
    await extractWithModel(COST_CENTERS, 'Code\nA', 5, client)
    expect(runs[0]).toMatchObject({ companyId: 'co1', skillKey: 'document.read', model: 'test-model-read', verdict: 'PASS' })
  })

  it('a paper of a kind that reaches no model is refused before it is sent, and says so', async () => {
    const { create, client } = fakeClient()
    const r = await extractWithModel(COST_CENTERS, 'Code\nA', 5, { ...client, documentType: 'W9' })
    expect(create).not.toHaveBeenCalled()
    expect(r?.records).toEqual([])
    expect(r?.note).toMatch(/Nothing was written/)
  })

  it('an answer whose values carry no quote from the page is not accepted and a person is told to look', async () => {
    const { client } = fakeClient('{"records":[],"unread":[]}')
    const r = await extractWithModel(COST_CENTERS, 'Code\nA', 5, client)
    expect(r?.records).toEqual([])
    expect(r?.note).toMatch(/A person needs to look at this/)
  })

  it('a model that does not answer leaves the person told it did not read, and nothing written', async () => {
    const { client } = fakeClient(QUOTED, { adapters: { sdk: { call: async () => { throw new Error('down') } } } })
    const r = await extractWithModel(COST_CENTERS, 'Code\nA', 5, client)
    expect(r?.records).toEqual([])
    expect(r?.note).toMatch(/did not read this/)
  })
})
