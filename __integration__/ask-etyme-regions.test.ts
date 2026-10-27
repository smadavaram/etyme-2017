import { describe, it, expect, beforeAll } from 'vitest'
import type { NextRequest } from 'next/server'
import { freshWorld, as, req, json } from './harness'
import { GET as greet, POST as ask } from '@/app/api/conversations/twin/route'
import { GET as byRegion } from '@/app/api/program/regions/route'
import { corvaneSeatEmail, corvaneContractors, CORVANE_PLANTS } from '@/lib/seed-corvane'
import { REGION_CHIPS, PROGRAM_CHIPS, PLANT_LIMIT_CHIP } from '@/app/api/conversations/twin/regions'

/**
 * Ask Etyme for the seats that read Corvane Packaging by region (founder,
 * 2026-10-27, the region map): the regional manager, the hiring manager on
 * a plant, the head of operations and the CFO. Every name and figure is
 * read off the seed's own plan (`CORVANE_PLANTS`, `corvaneContractors`)
 * or off By region's own answer for the same seat, never typed in.
 */

const DOMAIN = 'demo.etyme.local'
const seat = (desk: string) => corvaneSeatEmail(desk, DOMAIN)
const VALERIA = seat('region-latam')
const MARCUS = seat('hiring-dayton')
const CFO = seat('cfo')
const OPS = seat('operations')
const AP = seat('ap')

const { onSite } = corvaneContractors()
const latam = CORVANE_PLANTS.filter((p) => p.region === 'latam')
const us = CORVANE_PLANTS.filter((p) => p.region === 'us')
const sum = (ps: readonly { [k: string]: any }[], k: string) => ps.reduce((n, p) => n + p[k], 0)

const asked = async (who: string, text: string) => {
  as(who)
  return json(await ask(req('POST', '/api/conversations/twin', { text }) as NextRequest))
}
const greeting = async (who: string, query = '') => {
  as(who)
  return json(await greet(req('GET', `/api/conversations/twin${query}`) as NextRequest))
}
const page = async (who: string) => {
  as(who)
  return json(await byRegion(req('GET', '/api/program/regions') as NextRequest))
}

/** Nothing from the United States: no US plant, hiring manager or contractor. */
function noUnitedStates(said: string) {
  for (const p of us) {
    expect(said, p.plant).not.toContain(p.plant)
    expect(said, p.manager).not.toContain(p.manager)
  }
  for (const c of onSite.filter((c) => c.plant.region === 'us')) expect(said, c.name).not.toContain(c.name)
}

beforeAll(async () => {
  await freshWorld()
}, 600_000)

describe('Valeria Montes asks Ask Etyme about Latin America', () => {
  it('her greeting is By region’s first line, word for word, and the mark carries its number', async () => {
    const g = await greeting(VALERIA)
    expect(g.status, JSON.stringify(g.body)).toBe(200)
    const p = await page(VALERIA)
    expect(g.body.data.answer.kind).toBe('NEEDS')
    expect(g.body.data.answer.says).toBe(p.body.data.greeting.says)
    const mark = await greeting(VALERIA, '?only=owed')
    expect(mark.status).toBe(200)
    expect(mark.body.data.total).toBe(p.body.data.greeting.total)
    expect(g.body.data.chips).toEqual([...REGION_CHIPS])
    noUnitedStates(JSON.stringify(g.body.data.answer))
  })

  it('which plants have weeks waiting: Latin America’s 6 plants and 68 contractors, and the weeks the seed filed at each', async () => {
    const r = await asked(VALERIA, 'Which plants have weeks waiting?')
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const a = r.body.data.answer
    const withWeeks = latam.filter((p) => p.weeksToSign > 0)
    expect(a.says).toBe(`Latin America: 6 plants, 68 contractors on site. ${sum(latam, 'weeksToSign')} weeks wait to be signed at ${withWeeks.length} plants.`)
    expect(sum(latam, 'contractors')).toBe(68)
    const rows = a.table.rows.map((row: any) => row.cells)
    expect(rows.map((c: string[]) => c[0]).sort()).toEqual(withWeeks.map((p) => p.plant).sort())
    for (const p of withWeeks) {
      const row = rows.find((c: string[]) => c[0] === p.plant)
      expect(row, p.plant).toEqual([p.plant, p.manager, String(p.contractors), String(p.weeksToSign)])
    }
    noUnitedStates(JSON.stringify(a))
  })

  it('who is near the time limit in her region: the nearest person at each Latin American plant within 90 days, Campinas first', async () => {
    const r = await asked(VALERIA, 'Who is near the time limit in my region?')
    const a = r.body.data.answer
    const near = latam.filter((p) => p.nearestLimitDays <= 90).sort((x, y) => x.nearestLimitDays - y.nearestLimitDays)
    expect(a.table.rows.map((row: any) => row.cells[0])).toEqual(near.map((p) => p.plant))
    const campinas = onSite.find((c) => c.plant.key === 'campinas' && c.nearest)!
    expect(a.table.rows[0].cells).toEqual(['Campinas, Brazil', campinas.name, 'Campinas, Brazil', 'in 22 days'])
    noUnitedStates(JSON.stringify(a))
  })

  it('which invoice receipts are held: none in Latin America, and its one clean receipt is ready to pay', async () => {
    const r = await asked(VALERIA, 'Which invoice receipts are held?')
    expect(r.body.data.answer.says).toBe('No invoice receipt is held in Latin America. One is ready to pay.')
  })

  it('how each country here runs shows only Latin American countries, and only confirmed lines', async () => {
    const r = await asked(VALERIA, 'How does each country here run?')
    const a = r.body.data.answer
    const p = await page(VALERIA)
    const shown = p.body.data.region.countries.map((c: any) => c.name)
    if (a.kind === 'LIST') expect(a.table.rows.map((row: any) => row.cells[0])).toEqual(shown)
    else expect(shown).toEqual([])
    for (const name of shown) expect(['Mexico', 'Brazil', 'Colombia']).toContain(name)
  })

  it('asking about the United States or Dayton is refused in one sentence naming Latin America', async () => {
    const r = await asked(VALERIA, 'Which weeks wait in the United States?')
    expect(r.status).toBe(200)
    expect(r.body.data.answer.says).toBe('Your seat reads Latin America only, so United States is not on your page.')
    const d = await asked(VALERIA, 'Who is near the time limit at Dayton?')
    expect(d.body.data.answer.says).toBe('Your seat reads Latin America only, so Dayton, Ohio is not on your page.')
  })

  it('a question the map does not answer is told what she may ask, and never reaches the model', async () => {
    const r = await asked(VALERIA, 'Write me a poem about suppliers')
    expect(r.body.data.answer.kind).toBe('TEXT')
    expect(r.body.data.answer.says).toMatch(/^I read Latin America only\./)
  })
})

describe('Marcus Hollins asks about Dayton', () => {
  it('his greeting keeps his own queue, and his chips ask about the time limit at his plant', async () => {
    const g = await greeting(MARCUS)
    expect(g.status, JSON.stringify(g.body)).toBe(200)
    expect(g.body.data.answer.kind).toBe('NEEDS')
    expect(g.body.data.chips).toContain(PLANT_LIMIT_CHIP)
    expect(g.body.data.chips.length).toBeLessThanOrEqual(4)
  })

  it('which plants have weeks waiting: Dayton’s 14 contractors and 3 weeks, and no other plant', async () => {
    const r = await asked(MARCUS, 'Which plants have weeks waiting?')
    const a = r.body.data.answer
    expect(a.says).toBe('Dayton, Ohio: 14 contractors on site. 3 weeks wait to be signed.')
    expect(a.table.rows.map((row: any) => row.cells)).toEqual([['Dayton, Ohio', 'Marcus Hollins', '14', '3']])
  })

  it('who is near the time limit at his plant: his own 14 contractors, the nearest 41 days off', async () => {
    const r = await asked(MARCUS, PLANT_LIMIT_CHIP)
    const a = r.body.data.answer
    const nearest = onSite.find((c) => c.plant.key === 'dayton' && c.nearest)!
    expect(a.says).toMatch(/ of your 14 contractors at Dayton, Ohio (is|are) within 90 days of the time limit\. /)
    expect(a.says).toContain(`${nearest.name} is nearest, in 41 days.`)
    const dayton = new Set(onSite.filter((c) => c.plant.key === 'dayton').map((c) => c.name))
    for (const row of a.table.rows) expect(dayton.has(row.cells[0]), row.cells[0]).toBe(true)
  })

  it('asking about Fresno is refused in one sentence naming Dayton', async () => {
    const r = await asked(MARCUS, 'Who is near the time limit at Fresno?')
    expect(r.body.data.answer.says).toBe('Your seat reads Dayton, Ohio only, so Fresno, California is not on your page.')
  })
})

describe('the CFO and the head of operations read the rollup', () => {
  it('the CFO’s greeting is the rollup’s first line, naming the receipt held at Dayton, and the mark is its three', async () => {
    const g = await greeting(CFO)
    expect(g.status, JSON.stringify(g.body)).toBe(200)
    const p = await page(CFO)
    const says: string = g.body.data.answer.says
    expect(says).toBe(p.body.data.greeting.says)
    expect(says.startsWith('Three things need you: ')).toBe(true)
    expect(says).toMatch(/invoice receipt for .+ at Dayton is held, 41\.5 hours billed, 40 hours signed/)
    const mark = await greeting(CFO, '?only=owed')
    expect(mark.body.data.total).toBe(3)
    expect(g.body.data.chips).toEqual([...PROGRAM_CHIPS])
  })

  it('the head of operations is greeted with the same rollup line By region gives her', async () => {
    const g = await greeting(OPS)
    const p = await page(OPS)
    expect(g.body.data.answer.says).toBe(p.body.data.greeting.says)
    expect((await greeting(OPS, '?only=owed')).body.data.total).toBe(p.body.data.greeting.total)
  })

  it('the AP clerk, who pays invoice receipts, keeps her own queue', async () => {
    const g = await greeting(AP)
    expect(g.status).toBe(200)
    expect(g.body.data.chips).not.toEqual([...PROGRAM_CHIPS])
  })

  it('what did we spend this month, by region: one row per region, and the total equals the sum of the regions and the seed', async () => {
    const r = await asked(CFO, 'What did we spend this month, by region?')
    const a = r.body.data.answer
    expect(a.kind).toBe('LIST')
    expect(a.says).toContain('It is an estimate from current rates, 160 hours a month, not signed time.')
    const rows = a.table.rows.map((row: any) => row.cells)
    const total = rows.at(-1)
    expect(total[0]).toBe('All regions')
    const regions = rows.slice(0, -1)
    expect(regions).toHaveLength(6)
    expect(Number(total[1])).toBe(regions.reduce((n: number, c: string[]) => n + Number(c[1]), 0))
    expect(Number(total[1])).toBe(sum(CORVANE_PLANTS, 'contractors'))
    expect(regions.find((c: string[]) => c[0] === 'Latin America')[1]).toBe('68')
  })

  it('what is held and why: the Dayton receipt held for 41.5 hours against 40, and the Dayton start waiting on an I-9', async () => {
    const r = await asked(CFO, 'What is held and why?')
    const says: string = r.body.data.answer.says
    expect(says).toMatch(/invoice receipt for .+ at Dayton is held, 41\.5 hours billed, 40 hours signed\./)
    expect(says).toMatch(/start at Dayton waits on an I-9/)
  })

  it('who is past the time limit: nobody, and the nearest is Belfast’s, 14 days off', async () => {
    const r = await asked(CFO, 'Who is past the time limit?')
    const belfast = onSite.find((c) => c.plant.key === 'belfast' && c.nearest)!
    expect(r.body.data.answer.says).toBe(`Nobody at Corvane Packaging is past the time limit. The nearest is ${belfast.name} at Belfast, in 14 days. Counted across every supplier.`)
  })

  it('the CFO’s spend by supplier still goes to the supplier answer, not the map', async () => {
    const r = await asked(CFO, 'What did we spend by supplier this month?')
    expect(r.status).toBe(200)
    expect(r.body.data.answer.table?.caption ?? '').not.toBe('Spend this month, by region')
  })
})
