import { describe, it, expect, beforeAll } from 'vitest'
import type { NextRequest } from 'next/server'
import { freshWorld, prisma, as, req } from './harness'
import { GET as byRegion } from '@/app/api/program/regions/route'
import { GET as program } from '@/app/api/program/route'
import { GET as decisions } from '@/app/api/decisions/route'
import { regionsView } from '@/app/api/program/regions/read'
import { getCallerContext } from '@/lib/api-context'
import { corvaneSeatEmail, corvaneContractors, CORVANE_PLANTS, CORVANE_REGIONS, CORVANE_COUNTRIES, CORVANE_RECEIPTS, billRateMinor } from '@/lib/seed-corvane'

/**
 * The program by region on the seeded Corvane Packaging (founder,
 * 2026-10-27, the region map). Every expected figure below is read off
 * the seed's own plan (`CORVANE_PLANTS`, `corvaneContractors`) or counted
 * by hand from it, never from the drawing.
 */

const DOMAIN = 'demo.etyme.local'
const seat = (desk: string) => corvaneSeatEmail(desk, DOMAIN)
const ops = seat('operations')
const cfo = seat('cfo')
const valeria = seat('region-latam')
const marcus = seat('hiring-dayton')

async function read(who: string, query = '') {
  as(who)
  const res = await byRegion(req('GET', `/api/program/regions${query}`) as NextRequest)
  return { status: res.status, body: await res.json() }
}

const plantsIn = (key: string) => CORVANE_PLANTS.filter((p) => p.region === key)
const sum = (ps: readonly { [k: string]: any }[], k: string) => ps.reduce((n, p) => n + p[k], 0)
const { onSite } = corvaneContractors()

beforeAll(async () => {
  await freshWorld()
}, 600_000)

describe('the head of operations and the CFO read one row per region', () => {
  it('there are six regions, and the United States has 6 plants and 59 contractors on site', async () => {
    const { status, body } = await read(ops)
    expect(status).toBe(200)
    expect(body.data.level).toBe('PROGRAM')
    expect(body.data.regions.map((r: any) => r.label).sort()).toEqual(CORVANE_REGIONS.map((r) => r.label).sort())
    const us = body.data.regions.find((r: any) => r.label === 'United States')
    expect(us.plants).toBe(6)
    expect(us.contractors).toBe(59)
    expect(us.leads).toEqual(['Dana Whitcombe'])
  })

  it('Latin America has 6 plants, 68 contractors and the open jobs, weeks to sign and hiring managers its plants were seeded with', async () => {
    const { body } = await read(ops)
    const latam = body.data.regions.find((r: any) => r.label === 'Latin America')
    const ps = plantsIn('latam')
    expect(latam.plants).toBe(6)
    expect(latam.contractors).toBe(68)
    expect(latam.contractors).toBe(sum(ps, 'contractors'))
    expect(latam.openJobs).toBe(sum(ps, 'openJobs'))
    expect(latam.weeksToSign).toBe(sum(ps, 'weeksToSign'))
    expect(latam.hiringManagers).toBe(6)
  })

  it('the CFO’s rollup totals equal the sum of its regions, and the seed’s own counts', async () => {
    const { status, body } = await read(cfo)
    expect(status).toBe(200)
    const { total, regions } = body.data
    for (const k of ['plants', 'hiringManagers', 'contractors', 'openJobs', 'weeksToSign']) {
      expect(total[k], k).toBe(sum(regions, k))
    }
    expect(total.papers.onHold).toBe(sum(regions.map((r: any) => r.papers), 'onHold'))
    expect(total.receipts).toEqual({
      paid: sum(regions.map((r: any) => r.receipts), 'paid'),
      ready: sum(regions.map((r: any) => r.receipts), 'ready'),
      held: sum(regions.map((r: any) => r.receipts), 'held'),
    })
    expect(total.plants).toBe(31)
    expect(total.contractors).toBe(sum(CORVANE_PLANTS, 'contractors'))
    expect(total.weeksToSign).toBe(sum(CORVANE_PLANTS, 'weeksToSign'))
    expect(total.openJobs).toBe(sum(CORVANE_PLANTS, 'openJobs'))
  })

  it('the first line names the held receipt at Dayton, the start on hold at Dayton and the weeks waiting', async () => {
    const { body } = await read(cfo)
    const says: string = body.data.greeting.says
    expect(says.startsWith('Three things need you: ')).toBe(true)
    expect(says).toMatch(/invoice receipt for .+ at Dayton is held, 41\.5 hours billed, 40 hours signed/)
    expect(says).toMatch(/start at Dayton waits on an I-9/)
    expect(says).toContain(`${sum(CORVANE_PLANTS, 'weeksToSign')} weeks wait to be signed at ${CORVANE_PLANTS.filter((p) => p.weeksToSign > 0).length} plants`)
  })

  it('the Dayton receipt is held, every other seeded receipt is ready to pay, and none is paid yet', async () => {
    const { body } = await read(cfo)
    const clean = CORVANE_RECEIPTS.filter((r) => !r.held).length
    expect(body.data.total.receipts).toEqual({ paid: 0, ready: clean, held: 1 })
    const us = body.data.regions.find((r: any) => r.label === 'United States')
    expect(us.receipts).toEqual({ paid: 0, ready: 1, held: 1 })
    for (const r of body.data.regions.filter((x: any) => x.label !== 'United States')) {
      expect(r.receipts, r.label).toEqual({ paid: 0, ready: 1, held: 0 })
    }
  })

  it('the Dayton start is on hold for papers, and no other region has a start on hold', async () => {
    const { body } = await read(cfo)
    for (const r of body.data.regions) expect(r.papers.onHold, r.label).toBe(r.label === 'United States' ? 1 : 0)
  })

  it('the nearest time limit in the United States is Fresno’s, the seeded 18 days', async () => {
    const { body } = await read(ops)
    const us = body.data.regions.find((r: any) => r.label === 'United States')
    const fresno = onSite.find((c) => c.plant.key === 'fresno' && c.nearest)!
    expect(us.nearestLimit).toEqual({ days: 18, personName: fresno.name, plant: 'Fresno, California' })
  })

  it('spend is a month in each plant’s own currency, never added across currencies, and rolled into one by money’s rates with the sentence beside it', async () => {
    const { body } = await read(cfo)
    const us = body.data.regions.find((r: any) => r.label === 'United States')
    expect(us.spend).toEqual([{ currency: 'USD', minor: 59 * billRateMinor('US') * 160 }])
    const latam = body.data.regions.find((r: any) => r.label === 'Latin America')
    expect(latam.spend.map((s: any) => s.currency)).toEqual(['BRL', 'COP', 'MXN'])
    expect(latam.spend.find((s: any) => s.currency === 'MXN').minor).toBe(28 * billRateMinor('MX') * 160)
    expect(body.data.total.spend).toHaveLength(Object.keys(CORVANE_COUNTRIES).length)
    expect(body.data.currenciesSays).toBe('in 8 currencies')
    expect(typeof body.data.oneCurrency.says).toBe('string')
    if (body.data.total.spendOneCurrency) expect(body.data.oneCurrency.says).toMatch(/sample|rates you set/i)
    else expect(body.data.oneCurrency.says).toMatch(/no rate/i)
  })

  it('a region opens on its hiring managers, each with the plant, contractors, open jobs, weeks to sign and nearest time limit as seeded', async () => {
    const { body } = await read(ops, '?region=Latin%20America')
    expect(body.data.level).toBe('REGION')
    const rows = body.data.region.managers
    expect(rows).toHaveLength(6)
    for (const p of plantsIn('latam')) {
      const row = rows.find((r: any) => r.plant === p.plant)
      expect(row, p.plant).toBeTruthy()
      expect({ manager: row.manager, contractors: row.contractors, openJobs: row.openJobs, weeksToSign: row.weeksToSign, days: row.nearestLimit.days })
        .toEqual({ manager: p.manager, contractors: p.contractors, openJobs: p.openJobs, weeksToSign: p.weeksToSign, days: p.nearestLimitDays })
      expect(row.spend).toEqual([{ currency: CORVANE_COUNTRIES[p.cc].currency, minor: p.contractors * billRateMinor(p.cc) * 160 }])
    }
  })

  it('how each country runs shows only regulatory’s confirmed lines, and nothing for India', async () => {
    const india = await read(ops, '?region=India')
    expect(india.body.data.region.countries).toEqual([])
    const ni = await read(ops, '?region=Northern%20Ireland')
    expect(ni.body.data.region.countries.map((c: any) => c.country)).toEqual(['GB-NIR'])
    const latam = await read(ops, '?region=Latin%20America')
    for (const c of latam.body.data.region.countries) {
      for (const p of c.papers) expect(p.confirmed, `${c.country} ${p.key}`).toBe(true)
      if (c.pay) expect(c.pay.confirmed).toBe(true)
      if (c.rule) expect(c.rule.confirmed).toBe(true)
    }
  })

  it('a hiring manager’s row opens their contractors: Marcus Hollins has 14 on site at Dayton', async () => {
    const m = await prisma.person.findFirstOrThrow({ where: { primaryEmail: marcus } })
    const { status, body } = await read(ops, `?region=United%20States&manager=${m.id}`)
    expect(status).toBe(200)
    expect(body.data.level).toBe('MANAGER')
    expect(body.data.manager.plants).toEqual(['Dayton, Ohio'])
    expect(body.data.manager.contractors).toHaveLength(14)
    expect(body.data.manager.contractors.filter((c: any) => c.weeksToSign > 0)).toHaveLength(3)
    expect(body.data.manager.contractors[0].daysLeft).toBe(41)
  })

  it('every person read on By region is logged', async () => {
    const before = await prisma.accessLog.count({ where: { reason: { contains: 'Program by region at Corvane Packaging' } } })
    await read(ops)
    await new Promise((r) => setTimeout(r, 300))
    const after = await prisma.accessLog.count({ where: { reason: { contains: 'Program by region at Corvane Packaging' } } })
    expect(after - before).toBeGreaterThanOrEqual(sum(CORVANE_PLANTS, 'contractors'))
  })
})

describe('a regional manager reads one region', () => {
  it('Valeria Montes opens on Latin America, and sees nothing from the United States', async () => {
    const { status, body } = await read(valeria)
    expect(status).toBe(200)
    expect(body.data.reader).toEqual({ reach: 'REGION', label: 'Latin America' })
    expect(body.data.level).toBe('REGION')
    expect(body.data.regions.map((r: any) => r.label)).toEqual(['Latin America'])
    expect(body.data.total.contractors).toBe(68)
    expect(body.data.region.managers.map((m: any) => m.plant)).not.toContain('Dayton, Ohio')
    const said = JSON.stringify(body.data)
    for (const p of plantsIn('us')) {
      expect(said, p.plant).not.toContain(p.plant)
      expect(said, p.manager).not.toContain(p.manager)
    }
    for (const c of onSite.filter((c) => c.plant.region === 'us')) expect(said, c.name).not.toContain(c.name)
    expect(body.data.total.receipts).toEqual({ paid: 0, ready: 1, held: 0 })
  })

  it('Valeria Montes is refused the United States in a sentence, and Marcus Hollins’ list', async () => {
    const us = await read(valeria, '?region=United%20States')
    expect(us.status).toBe(403)
    expect(us.body.error.message).toBe('Your seat reads Latin America only, so United States is not on your page.')
    const m = await prisma.person.findFirstOrThrow({ where: { primaryEmail: marcus } })
    const list = await read(valeria, `?manager=${m.id}`)
    expect(list.status).toBe(404)
  })

  it('Valeria Montes’ Today opens, and holds her region’s contractors and nobody from the United States', async () => {
    as(valeria)
    const res = await program(req('GET', '/api/program') as NextRequest)
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.reach).toEqual({ kind: 'REGION', label: 'Latin America' })
    expect(data.summary.activeContractors).toBe(68)
    expect(data.summary.openRoles).toBe(sum(plantsIn('latam'), 'openJobs'))
    expect(data.approvalQueue).toHaveLength(sum(plantsIn('latam'), 'weeksToSign'))
    const usNames = new Set(onSite.filter((c) => c.plant.region === 'us').map((c) => c.name))
    expect(data.contractors.filter((c: any) => usNames.has(c.person.name))).toEqual([])
  })
})

describe('a hiring manager’s first screen is their plant', () => {
  it('Marcus Hollins’ Today holds Dayton’s 14 contractors, and nobody else’s', async () => {
    as(marcus)
    const res = await program(req('GET', '/api/program') as NextRequest)
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.reach).toEqual({ kind: 'SITE', label: 'Dayton, Ohio' })
    expect(data.summary.activeContractors).toBe(14)
    expect(data.summary.openRoles).toBe(2)
    expect(data.approvalQueue).toHaveLength(3)
    expect(data.summary.monthlySpend).toBe(14 * billRateMinor('US') * 160)
    expect(data.summary.monthlySpendCurrency).toBe('USD')
  })

  it('Marcus Hollins’ queue names Dayton’s three weeks and no other plant’s', async () => {
    as(marcus)
    const res = await decisions(req('GET', '/api/decisions') as NextRequest)
    expect(res.status).toBe(200)
    const body = await res.json()
    const weeks = body.data.decisions.filter((d: any) => d.type === 'TIMESHEET_APPROVAL')
    expect(weeks).toHaveLength(3)
    const dayton = new Set(onSite.filter((c) => c.plant.key === 'dayton').map((c) => c.name))
    for (const w of weeks) expect([...dayton].some((n) => w.title.includes(n)), w.title).toBe(true)
  })

  it('a hiring manager reads By region narrowed to their plant, and counts no invoice receipts they do not read', async () => {
    const { status, body } = await read(marcus)
    expect(status).toBe(200)
    expect(body.data.reader).toEqual({ reach: 'SITE', label: 'Dayton, Ohio' })
    expect(body.data.total.plants).toBe(1)
    expect(body.data.total.contractors).toBe(14)
    expect(body.data.total.receipts).toBeNull()
    expect(body.data.receiptsSays).toMatch(/AP clerk/)
  })

  it('the head of operations’ Today does not add eight currencies into one sum of minor units', async () => {
    as(ops)
    const res = await program(req('GET', '/api/program') as NextRequest)
    const { data } = await res.json()
    expect(data.reach).toBeNull()
    expect(data.summary.monthlySpendByCurrency).toHaveLength(8)
    if (data.summary.monthlySpend !== null) expect(data.summary.monthlySpendCurrency).toBe('USD')
    expect(data.summary.monthlySpendSays).toMatch(/sample|rate/i)
  })
})

describe('the owed mark asks for the count alone', () => {
  async function both(who: string) {
    as(who)
    const { caller } = await getCallerContext(req('GET', '/api/program/regions') as NextRequest, { narrowsToRegion: true })
    const full = await regionsView(caller!, { requestedClientId: null, region: null, manager: null })
    const count = await regionsView(caller!, { requestedClientId: null, countOnly: true })
    return { caller: caller!, full: full.data!, count: count.data! }
  }

  it('the count equals the first line’s number for the CFO, Valeria Montes and Marcus Hollins', async () => {
    for (const who of [cfo, valeria, marcus]) {
      const { full, count } = await both(who)
      expect(count.total, who).toBe(full.greeting.total)
    }
    expect((await both(cfo)).count.total).toBe(3)
  })

  it('the count reads no name and writes no access log row', async () => {
    as(cfo)
    const { caller } = await getCallerContext(req('GET', '/api/program/regions') as NextRequest, { narrowsToRegion: true })
    await new Promise((r) => setTimeout(r, 300))
    const before = await prisma.accessLog.count({ where: { actorPersonId: caller!.person.id } })
    const count = await regionsView(caller!, { requestedClientId: null, countOnly: true })
    await new Promise((r) => setTimeout(r, 300))
    expect(Object.keys(count.data!)).toEqual(['total'])
    expect(await prisma.accessLog.count({ where: { actorPersonId: caller!.person.id } })).toBe(before)
  })

  it('the first line’s things come as data: the held Dayton receipt with its supplier, the Dayton start with its person', async () => {
    const { body } = await read(cfo)
    const held = body.data.greeting.held
    expect(held.map((i: any) => i.kind)).toEqual(['receipt', 'start', 'weeks'])
    expect(held[0]).toMatchObject({ kind: 'receipt', count: 1, plant: 'Dayton' })
    expect(held[0].supplier).toBeTruthy()
    expect(held[1]).toMatchObject({ kind: 'start', count: 1, plant: 'Dayton' })
    expect(held[1].person).toBeTruthy()
    expect(held[2]).toMatchObject({ kind: 'weeks', count: sum(CORVANE_PLANTS, 'weeksToSign') })
  })
})
