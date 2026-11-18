import { describe, it, expect, vi } from 'vitest'
import { entityByKey } from '@/lib/importable'
import { extractWithModel, withoutLaneC } from '@/lib/extract'

/**
 * Record 96, Lane C: social security numbers, dates of birth and bank
 * details reach no model. They are cut by rule before any call, and the
 * call says which model answered and what it used.
 */

const COST_CENTERS = entityByKey('COST_CENTERS')!

function fakeClient(answer = '{"records":[],"unread":[]}') {
  const create = vi.fn(async (..._a: any[]) => ({
    content: [{ type: 'text', text: answer }],
    usage: { input_tokens: 120, output_tokens: 30 },
  }))
  return { create, client: { messages: { create } } }
}

describe('what leaves for a sheet import never holds a social security number, a date of birth or a bank detail', () => {
  it('a sheet row holding a social security number has it removed before any call', async () => {
    const { create, client } = fakeClient()
    await extractWithModel(COST_CENTERS, 'Name,SSN,Rate\nAda Reyes,123-45-6789,98', 5, { client })
    const sent = JSON.stringify(create.mock.calls[0])
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
    const { client } = fakeClient('{"records":[{"fields":[]}],"unread":[]}')
    const r = await extractWithModel(COST_CENTERS, 'SSN: 123-45-6789', 5, { client })
    expect(r?.note).toMatch(/social security numbers was removed before reading and never sent/)
    expect(r?.removed).toEqual(['SOCIAL_SECURITY'])
  })
})

describe('a sheet import says which model answered and what it used', () => {
  it('the result carries the model id and the tokens the call used', async () => {
    const { client } = fakeClient()
    const r = await extractWithModel(COST_CENTERS, 'Code\nA', 5, { client })
    expect(r?.model).toBeTruthy()
    expect(r?.usage).toEqual({ input_tokens: 120, output_tokens: 30 })
  })

  it('with no key and no client, nothing is called and the caller falls back', async () => {
    const was = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    try {
      expect(await extractWithModel(COST_CENTERS, 'Code\nA')).toBeNull()
    } finally {
      if (was !== undefined) process.env.ANTHROPIC_API_KEY = was
    }
  })
})
