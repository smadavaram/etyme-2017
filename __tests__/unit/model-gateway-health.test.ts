import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ prisma: {} }))

import { gatewayHealth } from '@/lib/model-gateway/health'
import { modelHealth } from '@/lib/model-health'
import { assess, type ReadinessFacts } from '@/lib/readiness'
import { costMicrosOf } from '@/lib/agent-run'

const entry = (o: Record<string, unknown> = {}) => ({
  id: 'm-low', label: 'Low model', adapter: 'sdk', tier: 'LOW', classes: ['NON_SENSITIVE', 'TENANT_BUSINESS'],
  region: 'US', dpaSignedOn: '2026-11-01', keyEnv: 'KEY_LOW', ...o,
})
const reg = (...e: unknown[]) => ({ ETYME_MODEL_REGISTER: JSON.stringify(e) })

describe('the gateway reports its own state without calling a provider', () => {
  it('with nothing registered it says Not configured and names the setting', () => {
    const h = gatewayHealth({})
    expect(h.configured).toBe(false)
    expect(h.says).toMatch(/^Not configured\. No model is registered \(ETYME_MODEL_REGISTER\)/)
  })
  it('a registered model with no key is Not configured and names the key it waits on', () => {
    const h = gatewayHealth(reg(entry()))
    expect(h.configured).toBe(false)
    expect(h.says).toContain('KEY_LOW')
  })
  it('a keyed model is ready and the line says how many may answer tenant business data on each tier', () => {
    const h = gatewayHealth({ ...reg(entry(), entry({ id: 'm-hi', tier: 'HIGH', keyEnv: 'KEY_HI' })), KEY_LOW: 'x', KEY_HI: 'y' })
    expect(h.configured).toBe(true)
    expect(h.tenantReady).toEqual({ LOW: 1, HIGH: 1 })
    expect(h.says).toContain('2 models ready: 1 low-tier and 1 high-tier for tenant business data.')
  })
  it('a keyed model that may not be sent tenant data says the low-tier steps read Not configured', () => {
    const h = gatewayHealth({ ...reg(entry({ classes: ['NON_SENSITIVE'] })), KEY_LOW: 'x' })
    expect(h.configured).toBe(true)
    expect(h.says).toContain('No low-tier model may be sent tenant business data')
  })
  it('a registry entry that was left out is named in the line', () => {
    const h = gatewayHealth({ ...reg(entry(), entry({ id: 'eu', region: 'DE' })), KEY_LOW: 'x' })
    expect(h.problems).toHaveLength(1)
    expect(h.says).toContain('(eu)')
  })
  it('the key itself never appears in what health says', () => {
    const h = gatewayHealth({ ...reg(entry()), KEY_LOW: 'sk-very-secret' })
    expect(JSON.stringify(h)).not.toContain('sk-very-secret')
  })
  it('model health carries the gateway so /api/health and /ready read the same answer', () => {
    expect(modelHealth({ ...reg(entry()), KEY_LOW: 'x' }).gateway.configured).toBe(true)
  })
})

describe('/ready reads the gateway and never counts it against ready', () => {
  const facts = (gateway?: { configured: boolean; says: string }) => ({
    env: { database: true, nextauthSecret: true, cronSecret: true, microsoft: false, google: false, emailLink: false, emailSender: false, anthropic: false },
    gateway,
    db: { reachable: true, schemaCurrent: true, ms: 10 },
    realCompanies: 0, realSignIns: 0, imports: { total: 0, committed: 0 }, email: { sent: 0, unsent: 0 },
    teams: { workflowsChannels: 0, retiredChannels: 0, postedByWorkflows: 0 },
    cron: { tracked: true, lastRunAt: null, lastBroke: 0 }, watch: { staffConfigured: false, alertsSent: 0, incidentsToday: 0 },
    demo: { seeded: false, current: false }, privacyContact: false, inbound: { secretSet: false, signedDeliveries: null },
  }) as unknown as ReadinessFacts
  const edge = (f: ReadinessFacts) => assess(f, new Date('2026-11-27T12:00:00Z')).edges.find((e) => e.key === 'model')!
  it('a gateway with no model reads Not configured, optional, with the fix, and not missing', () => {
    const e = edge(facts({ configured: false, says: 'Not configured. No model is registered.' }))
    expect(e).toMatchObject({ state: 'OFF', required: false })
    expect(e.says).toMatch(/^Not configured/)
  })
  it('a gateway with a keyed model reads On with the gateway’s own sentence', () => {
    expect(edge(facts({ configured: true, says: '1 model ready.' }))).toMatchObject({ state: 'SET', required: false, says: 'On. 1 model ready.' })
  })
})

describe('the cost of a call is the register’s price or nothing', () => {
  it('a model with a registered price costs its tokens at that price, rounded up', () => {
    const was = process.env.ETYME_MODEL_REGISTER
    process.env.ETYME_MODEL_REGISTER = JSON.stringify([entry({ id: 'priced', price: { in: 1, out: 3 } })])
    try { expect(costMicrosOf('priced', { input_tokens: 10, output_tokens: 5 })).toBe(25) } finally {
      if (was === undefined) delete process.env.ETYME_MODEL_REGISTER; else process.env.ETYME_MODEL_REGISTER = was
    }
  })
  it('a model nobody priced costs null, never a guessed figure', () => {
    expect(costMicrosOf('some-model-nobody-priced', { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBeNull()
  })
})
