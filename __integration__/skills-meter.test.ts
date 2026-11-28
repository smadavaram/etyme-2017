/** The meter over the real database: one company's skill runs in a window, and nobody else's. */
import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, resetDatabase } from './harness'
import { readMeter } from '@/lib/skills/meter'

const tag = `mt${Date.now()}`
const w: Record<string, any> = {}
const at = (d: string) => new Date(`2026-11-${d}T12:00:00Z`)
const run = (companyId: string, over: Record<string, unknown>) => prisma.agentRun.create({
  data: { companyId, agent: 'x', recordType: 'COMPANY', recordId: 'r', verdict: 'PASS', ms: 1, ...over } as any,
})

beforeAll(async () => {
  await resetDatabase()
  w.a = await prisma.company.create({ data: { name: `Meter A ${tag}`, slug: `meter-a-${tag}`, kind: 'VENDOR' } })
  w.b = await prisma.company.create({ data: { name: `Meter B ${tag}`, slug: `meter-b-${tag}`, kind: 'VENDOR' } })
  const a = { skillKey: 'census.classify', agentKey: 'census-keeper', tier: 'RULES', costMicros: 0 }
  await run(w.a.id, { ...a, at: at('10') })
  await run(w.a.id, { ...a, at: at('11') })
  await run(w.a.id, { skillKey: 'bio.write', agentKey: 'consultant-portfolio', tier: 'LOW', byTenantModel: true, fallbackFrom: 'm1', costMicros: 4000, at: at('11') })
  await run(w.a.id, { skillKey: 'bio.write', agentKey: 'consultant-portfolio', tier: 'HIGH', escalatedFrom: 'LOW', at: at('12') })
  await run(w.a.id, { ...a, at: at('20') })
  await run(w.a.id, { agent: 'match.score', at: at('11') })
  await run(w.b.id, { ...a, at: at('11') })
})

describe('the meter over the database', () => {
  it('counts one company’s skill runs in the window by skill, agent and tier', async () => {
    const m = await readMeter(w.a.id, at('09'), at('13'))
    expect(m.bySkill.map((l) => [l.key, l.calls, l.rules, l.low, l.high, l.fallback, l.escalated, l.ownModel])).toEqual([
      ['bio.write', 2, 0, 1, 1, 1, 1, 1],
      ['census.classify', 2, 2, 0, 0, 0, 0, 0],
    ])
    expect(m.byAgent.map((l) => [l.key, l.calls])).toEqual([['census-keeper', 2], ['consultant-portfolio', 2]])
  })

  it('a run outside the window is not counted, and the end of the window is not in it', async () => {
    expect((await readMeter(w.a.id, at('09'), at('11'))).total.calls).toBe(1)
    expect((await readMeter(w.a.id, at('19'), at('21'))).total.calls).toBe(1)
  })

  it('a run that ran no skill is not on the meter', async () => {
    expect((await readMeter(w.a.id, at('01'), at('28'))).total.calls).toBe(5)
  })

  it('one company never reads another company’s runs', async () => {
    expect((await readMeter(w.b.id, at('01'), at('28'))).total.calls).toBe(1)
  })

  it('the meter carries no cost even where a run row holds one', async () => {
    expect(JSON.stringify(await readMeter(w.a.id, at('01'), at('28')))).not.toMatch(/cost|price|charge|micros/i)
  })
})
