import { describe, it, expect } from 'vitest'
import { admits, candidatesFor, parseRegister, priceFromRegister, usWithDpa, type RegisteredModel } from '@/lib/model-gateway/register'

const m = (o: Partial<RegisteredModel> = {}): RegisteredModel => ({
  id: 'm-1', label: 'Model one', adapter: 'sdk', tier: 'LOW', classes: ['NON_SENSITIVE', 'TENANT_BUSINESS'],
  region: 'US', dpaSignedOn: '2026-11-01', keyEnv: 'K1', ...o,
})
const env = { K1: 'x', K2: 'y' }

describe('the model register admits a model for one data class at a time', () => {
  it('a model hosted outside the US is refused tenant business data', () => {
    const r = admits(m({ region: 'DE' }), 'TENANT_BUSINESS')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toMatch(/outside the US/)
  })
  it('a US model without a signed data processing agreement is refused tenant business data', () => {
    const r = admits(m({ dpaSignedOn: null }), 'TENANT_BUSINESS')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toMatch(/data processing agreement/)
  })
  it('a US model under a signed agreement is admitted tenant business data', () => {
    expect(admits(m(), 'TENANT_BUSINESS').ok).toBe(true)
    expect(usWithDpa(m())).toBe(true)
  })
  it('a model hosted anywhere is admitted non-sensitive text when it is entered for it', () => {
    expect(admits(m({ region: 'DE', dpaSignedOn: null, classes: ['NON_SENSITIVE'] }), 'NON_SENSITIVE').ok).toBe(true)
  })
  it('a model entered for non-sensitive text only is not sent tenant business data', () => {
    expect(admits(m({ classes: ['NON_SENSITIVE'] }), 'TENANT_BUSINESS').ok).toBe(false)
  })
  it('no model is admitted for Lane C data', () => {
    expect(admits(m(), 'LANE_C').ok).toBe(false)
  })
  it("a tenant's own model gets tenant business data only in the US with a signed agreement or the tenant's recorded opt-in", () => {
    const own = m({ byTenant: true, region: 'DE', dpaSignedOn: null })
    expect(admits(own, 'TENANT_BUSINESS').ok).toBe(false)
    expect(admits(own, 'TENANT_BUSINESS', { tenantOptIn: true }).ok).toBe(true)
    expect(admits(m({ byTenant: true }), 'TENANT_BUSINESS').ok).toBe(true)
  })
  it("the tenant's opt-in never admits a model that is not the tenant's own", () => {
    expect(admits(m({ region: 'DE' }), 'TENANT_BUSINESS', { tenantOptIn: true }).ok).toBe(false)
  })
})

describe('the register is read from one environment setting', () => {
  const entry = { id: 'a', adapter: 'sdk', tier: 'LOW', classes: ['TENANT_BUSINESS'], region: 'us', dpaSignedOn: '2026-11-01', keyEnv: 'K1' }
  it('an entry for tenant business data without the US and the agreement is left out and named', () => {
    const p = parseRegister(JSON.stringify([entry, { ...entry, id: 'b', region: 'FR' }, { ...entry, id: 'c', dpaSignedOn: null }]))
    expect(p.models.map((x) => x.id)).toEqual(['a'])
    expect(p.problems).toHaveLength(2)
    expect(p.problems[0]).toMatch(/\(b\).*not hosted in the US/)
  })
  it('a malformed entry is named and never registered', () => {
    const p = parseRegister(JSON.stringify([{ id: 'x' }, { ...entry, tier: 'MID' }, { ...entry, classes: ['LANE_C'] }]))
    expect(p.models).toEqual([])
    expect(p.problems).toHaveLength(3)
  })
  it('an unset or broken setting registers nothing and says why', () => {
    expect(parseRegister(undefined)).toEqual({ models: [], problems: [] })
    expect(parseRegister('{oops').problems[0]).toMatch(/not valid JSON/)
    expect(parseRegister('{}').problems[0]).toMatch(/must be a list/)
  })
  it('a model with no price set has no price, never a guessed one', () => {
    const e = { ETYME_MODEL_REGISTER: JSON.stringify([entry, { ...entry, id: 'p', price: { in: 1, out: 2 } }]) }
    expect(priceFromRegister('a', e)).toBeNull()
    expect(priceFromRegister('p', e)).toEqual({ in: 1, out: 2 })
    expect(priceFromRegister('unlisted', e)).toBeNull()
  })
})

describe('the candidates for a tier are only models admitted for the data and keyed', () => {
  const list = [m({ id: 'one' }), m({ id: 'eu', region: 'DE', classes: ['NON_SENSITIVE', 'TENANT_BUSINESS'] }), m({ id: 'two', keyEnv: 'K2' }), m({ id: 'nokey', keyEnv: 'MISSING' }), m({ id: 'hi', tier: 'HIGH', keyEnv: 'K2' })]
  it('fallback order is register order within the tier, and a model outside the US is never among tenant candidates', () => {
    expect(candidatesFor('LOW', 'TENANT_BUSINESS', env, { models: list }).map((x) => x.id)).toEqual(['one', 'two'])
  })
  it('a model with no key is not a candidate', () => {
    expect(candidatesFor('LOW', 'NON_SENSITIVE', env, { models: list }).map((x) => x.id)).not.toContain('nokey')
  })
  it('no admitted model leaves no candidate, and never falls through to the other tier or another class', () => {
    expect(candidatesFor('LOW', 'TENANT_BUSINESS', {}, { models: list })).toEqual([])
    expect(candidatesFor('LOW', 'LANE_C', env, { models: list })).toEqual([])
  })
  it('the high tier is read on its own', () => {
    expect(candidatesFor('HIGH', 'TENANT_BUSINESS', env, { models: list }).map((x) => x.id)).toEqual(['hi'])
  })
})
