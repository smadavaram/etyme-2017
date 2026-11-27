import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({
  company: { findUnique: vi.fn() }, role: { findUnique: vi.fn() },
  tenantModelRoute: { upsert: vi.fn(), findMany: vi.fn() },
}))
const sec = vi.hoisted(() => ({ events: [] as any[], spend: vi.fn() }))
vi.mock('@/lib/db', () => ({ prisma: db }))
vi.mock('@/lib/api-context', () => ({
  getCallerContext: async () => ({ caller: { company: { id: 'co1' }, context: { roleId: 'r1' }, person: { id: 'p1', name: 'Dana Ortiz' }, isService: false, readOnly: false } }),
  realPersonId: () => 'p1',
}))
vi.mock('@/lib/identity/second-check', () => ({ spendCheck: sec.spend }))
vi.mock('@/lib/identity/security-ledger', () => ({ recordSecurityEvent: async (e: any) => { sec.events.push(e); return true } }))

import { POST } from '@/app/api/settings/model-routes/route'
import { callModel, type ModelAdapter } from '@/lib/model-gateway/call'
import { cleanRoute, mayBringOwnModel, routeAsModel, TENANT_KEYS_READY_ENV, type RouteRow } from '@/lib/model-gateway/tenant-routes'
import { meterBasis } from '@/lib/skills/meter'
import type { RegisteredModel } from '@/lib/model-gateway/register'

const good = { tier: 'LOW', label: 'Our model', adapter: 'fake', modelId: 'own-1', region: 'us', dpaSignedOn: '2026-11-01', keyRef: 'ETYME_TM_OURS_LOW' }
const post = (b: unknown) => POST(new Request('http://x/api/settings/model-routes', { method: 'POST', body: JSON.stringify(b) }) as any)

beforeEach(() => {
  sec.events.length = 0
  Object.values(db.company).forEach((f) => f.mockReset()); Object.values(db.role).forEach((f) => f.mockReset()); Object.values(db.tenantModelRoute).forEach((f) => f.mockReset())
  sec.spend.mockReset(); sec.spend.mockResolvedValue({ ok: true, check: {} })
  db.role.findUnique.mockResolvedValue({ name: 'Owner' })
  db.tenantModelRoute.upsert.mockResolvedValue({ id: 'route1' })
  process.env[TENANT_KEYS_READY_ENV] = 'yes'
})

describe('a company’s own model is an Enterprise feature', () => {
  it('a Starter company is refused its own model in a sentence naming its edition', async () => {
    db.company.findUnique.mockResolvedValue({ edition: 'STARTER' })
    const r = await post({ ...good, proof: 'p' })
    expect(r.status).toBe(403)
    expect((await r.json()).error.message).toBe('Bringing your own model is part of the Enterprise edition. This company is on the Starter edition.')
    expect(db.tenantModelRoute.upsert).not.toHaveBeenCalled()
    expect(sec.events[0].event).toBe('MODEL_ROUTE_REFUSED')
  })
  it('a seat that is not the Owner is refused even on Enterprise', () => {
    expect(mayBringOwnModel({ edition: 'ENTERPRISE', isOwner: false })).toMatchObject({ ok: false, status: 403 })
  })
  it('an Enterprise Owner without a fresh second check is asked for one and nothing is stored', async () => {
    db.company.findUnique.mockResolvedValue({ edition: 'ENTERPRISE' })
    const r = await post(good)
    expect(r.status).toBe(403)
    expect((await r.json()).error.code).toBe('SECOND_CHECK')
    expect(db.tenantModelRoute.upsert).not.toHaveBeenCalled()
  })
  it('an Enterprise Owner’s route is stored with a key reference and no key value anywhere in what is written or logged', async () => {
    db.company.findUnique.mockResolvedValue({ edition: 'ENTERPRISE' })
    const r = await post({ ...good, proof: 'p', apiKey: 'sk-live-should-never-be-kept' })
    expect(r.status).toBe(200)
    const written = JSON.stringify(db.tenantModelRoute.upsert.mock.calls[0][0])
    expect(written).toContain('ETYME_TM_OURS_LOW')
    expect(written).not.toContain('sk-live')
    expect(JSON.stringify(sec.events)).not.toContain('sk-live')
    expect(sec.events.at(-1).event).toBe('MODEL_ROUTE_SET')
  })
  it('a key pasted where the reference goes is refused and never stored', async () => {
    expect(cleanRoute({ ...good, keyRef: 'sk-ant-1234567890' })).toMatchObject({ ok: false, status: 422 })
    expect(cleanRoute({ ...good, keyRef: 'PATH' })).toMatchObject({ ok: false })
  })
  it('until the secret store can take a key the Owner reads that keys can be added once it is set up, and nothing is stored', async () => {
    delete process.env[TENANT_KEYS_READY_ENV]
    db.company.findUnique.mockResolvedValue({ edition: 'ENTERPRISE' })
    const r = await post({ ...good, proof: 'p' })
    expect(r.status).toBe(409)
    expect((await r.json()).error.message).toBe('Your keys can be added once the secret store is set up.')
    expect(db.tenantModelRoute.upsert).not.toHaveBeenCalled()
  })
})

const own: RouteRow = { tier: 'LOW', label: 'Own', adapter: 'fake', modelId: 'own-1', region: 'US', dpaSignedOn: '2026-11-01', keyRef: 'ETYME_TM_OURS_LOW', allowPlatformFallback: false, enabled: true }
const platform: RegisteredModel = { id: 'plat-1', label: 'Platform', adapter: 'fake', tier: 'LOW', classes: ['NON_SENSITIVE', 'TENANT_BUSINESS'], region: 'US', dpaSignedOn: '2026-11-01', keyEnv: 'PK' }
const env = { PK: 'x', ETYME_TM_OURS_LOW: 'y' }
const req = { companyId: 'co1', personId: 'p1', skillKey: 'ask.answer', purpose: 'ASK_ETYME', prompt: 'Who is free?', record: { recordType: 'SUBMISSION' as const, recordId: 's1' } }
function run(adapter: ModelAdapter, rows: RouteRow[], extra: Partial<Parameters<typeof callModel>[1]> = {}) {
  const runs: any[] = []
  const deps = {
    env, models: [platform], adapters: { fake: adapter }, timeoutMs: 50, modelOn: async () => true,
    tenantRoutes: async () => ({ rows, models: rows.map(routeAsModel).filter((m): m is RegisteredModel => !!m) }),
    recordRun: (async (r: any) => { runs.push(r); return `run${runs.length}` }) as any,
    logPrompt: (async () => ({ ok: true, id: 'mp', withheld: false })) as any, ...extra,
  }
  return { deps, runs }
}

describe('a company’s own route follows the same rules as the platform’s', () => {
  it('a failed own route falls back to the platform route only where the company allowed it, and both attempts are rows', async () => {
    const adapter: ModelAdapter = { call: async (m) => { if (m.id === 'own-1') throw new Error('provider down'); return { text: 'ok', usage: { input_tokens: 10, output_tokens: 5 } } } }
    const w = run(adapter, [{ ...own, allowPlatformFallback: true }])
    const r = await callModel(req, w.deps)
    expect(r.ok && r.model).toBe('plat-1')
    expect(w.runs.map((x) => [x.model, x.verdict, x.byTenantModel, x.fallbackFrom])).toEqual([['own-1', 'ERROR', true, null], ['plat-1', 'PASS', false, 'own-1']])
    expect(w.runs[0].failReason).toContain('provider down')
    expect(w.runs[1].failReason).toContain('after own-1 failed')
  })
  it('a failed own route is never sent on to the platform when the company did not allow it', async () => {
    const adapter: ModelAdapter = { call: async (m) => { if (m.id === 'own-1') throw new Error('down'); return { text: 'ok', usage: null } } }
    const w = run(adapter, [own])
    const r = await callModel(req, w.deps)
    expect(r.ok).toBe(false)
    expect(w.runs).toHaveLength(1)
    expect(w.runs[0].model).toBe('own-1')
  })
  it('tenant business data is refused on an own route outside the US with no opt-in, and the platform route does not take its place', async () => {
    let asked = 0
    const w = run({ call: async () => { asked++; return { text: 'ok', usage: null } } }, [{ ...own, region: 'DE' }])
    const r = await callModel(req, w.deps)
    expect(r.ok).toBe(false)
    expect(asked).toBe(0)
  })
  it('tenant business data is refused on an own route with no data processing agreement', async () => {
    let asked = 0
    const w = run({ call: async () => { asked++; return { text: 'ok', usage: null } } }, [{ ...own, dpaSignedOn: null }])
    expect((await callModel(req, w.deps)).ok).toBe(false)
    expect(asked).toBe(0)
  })
  it('Lane C text is refused before any route is tried, own or platform', async () => {
    let asked = 0
    const w = run({ call: async () => { asked++; return { text: 'ok', usage: null } } }, [{ ...own, allowPlatformFallback: true }])
    const r = await callModel({ ...req, prompt: 'Her social security number is 123-45-6789' }, w.deps)
    expect(r).toMatchObject({ ok: false, status: 'LANE_C' })
    expect(asked).toBe(0)
  })
  it('a company with no route of its own is answered by the platform route as before', async () => {
    const w = run({ call: async () => ({ text: 'ok', usage: null }) }, [])
    const r = await callModel(req, w.deps)
    expect(r.ok && r.model).toBe('plat-1')
  })
})

describe('usage on a company’s own model is metered platform-only', () => {
  it('calls on the own model count as platform-only and the rest are metered with the model', () => {
    expect(meterBasis({ calls: 10, ownModel: 4 })).toEqual({ platformOnly: 4, withModel: 6 })
  })
})
