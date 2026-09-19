import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { day } from '@/lib/seed-days'
import { PATCH as setStanding } from '@/app/api/counterparties/route'
import { GET as suppliers } from '@/app/api/suppliers/route'
import { POST as addUnit } from '@/app/api/program/units/route'
import { GET as coldOpenings } from '@/app/api/cron/cold-openings/route'

/**
 * Northbend Athletic puts Pinnacle on probation and Brightmoor on the preferred list;
 * the suppliers page shows both. Northbend Athletic adds a practice under Technology.
 * A seat Pinnacle has not advertised in eight weeks goes cold overnight.
 */

const D = '@demo.etyme.local'
const NIKE_OFFICE = `world-nike${D}`
const PINNACLE = `world-pinnacle${D}`
const co: Record<string, string> = {}

describe('standing, units and cold seats', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()
    for (const slug of ['world-nike', 'world-pinnacle', 'world-brightmoor']) {
      co[slug] = (await prisma.company.findUniqueOrThrow({ where: { slug }, select: { id: true } })).id
    }
  }, 240_000)

  it('Northbend Athletic rates Pinnacle on probation and Brightmoor preferred, and the suppliers page says so', async () => {
    as(NIKE_OFFICE)
    for (const [slug, tier] of [['world-pinnacle', 'PROBATION'], ['world-brightmoor', 'PREFERRED']]) {
      const r = await json(await setStanding(req('PATCH', '/api/counterparties', { otherCompanyId: co[slug], relationship: 'SUPPLIER', tier })))
      expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    }
    const list = await json(await suppliers(req('GET', '/api/suppliers')))
    const rows = list.body.data.suppliers ?? list.body.data.rows ?? []
    const byId = Object.fromEntries(rows.map((s: any) => [s.companyId, s.tier]))
    expect(byId[co['world-pinnacle']]).toBe('PROBATION')
    expect(byId[co['world-brightmoor']]).toBe('PREFERRED')
  })

  it('a word not on the list is refused in a sentence', async () => {
    as(NIKE_OFFICE)
    const r = await json(await setStanding(req('PATCH', '/api/counterparties', { otherCompanyId: co['world-pinnacle'], relationship: 'SUPPLIER', tier: 'GOLD' })))
    expect(r.status).toBe(422)
    expect(r.body.error.message).toContain('not "GOLD"')
  })

  it('Northbend Athletic adds a Data practice under Technology; adding it twice hands back the first', async () => {
    as(NIKE_OFFICE)
    const tech = await prisma.orgUnit.findFirstOrThrow({ where: { companyId: co['world-nike'], name: 'Technology' }, select: { id: true } })
    const r = await json(await addUnit(req('POST', '/api/program/units', { name: 'Data practice', kind: 'PRACTICE', parentId: tech.id })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const unit = await prisma.orgUnit.findUniqueOrThrow({ where: { id: r.body.data.id } })
    expect([unit.kind, unit.parentId]).toEqual(['PRACTICE', tech.id])
    const again = await json(await addUnit(req('POST', '/api/program/units', { name: 'Data practice', kind: 'PRACTICE', parentId: tech.id })))
    expect(again.body.data).toMatchObject({ id: r.body.data.id, existing: true })
  })

  it('a kind the schema does not name is refused', async () => {
    as(NIKE_OFFICE)
    const r = await json(await addUnit(req('POST', '/api/program/units', { name: 'Guild', kind: 'GUILD' })))
    expect(r.status).toBe(422)
  })

  it('a seat nobody has advertised in eight weeks goes cold overnight; one seen last week stays live', async () => {
    const old = await prisma.opening.create({ data: { companyId: co['world-pinnacle'], title: 'SAP MM lead', skills: ['SAP MM'], lastSeen: day(-56), firstSeen: day(-90) } })
    const fresh = await prisma.opening.create({ data: { companyId: co['world-pinnacle'], title: 'Kinaxis planner', skills: ['Kinaxis'], lastSeen: day(-7), firstSeen: day(-20) } })
    process.env.CRON_SECRET = 'cold-test'
    const r = await json(await coldOpenings(req('GET', '/api/cron/cold-openings', undefined, { authorization: 'Bearer cold-test' })))
    expect(r.body?.error, JSON.stringify(r.body)).toBeUndefined()
    expect((await prisma.opening.findUniqueOrThrow({ where: { id: old.id } })).status).toBe('COLD')
    expect((await prisma.opening.findUniqueOrThrow({ where: { id: fresh.id } })).status).toBe('LIVE')
    const log = await prisma.automationLog.findFirst({ where: { companyId: co['world-pinnacle'], action: 'OPENINGS_COLD' } })
    expect(log?.summary).toContain('SAP MM lead (last seen 56 days ago)')
    as(PINNACLE)
  })
})
