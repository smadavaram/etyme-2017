import { describe, it, expect } from 'vitest'
import {
  cells, regionRows, managerRows, contractorRows, greeting, sumFigures, spendOf, countryCodeFor, waitingOn,
  NO_REGION, NO_MANAGER, type Facts, type Site, type OnSite,
} from '@/app/api/program/regions/rollup'

/**
 * The program by region, as arithmetic (founder, 2026-10-27, the region
 * map). The figures on the seeded world are checked by hand in
 * __integration__/program-by-region.test.ts; these are the rules.
 */

const site = (id: string, name: string, region: string | null, country = 'US', state: string | null = null): Site =>
  ({ id, name, city: name.split(',')[0], state, country, region })

const marcus = { id: 'p-marcus', name: 'Marcus Hollins' }
const ana = { id: 'p-ana', name: 'Ana Lucía Garza' }

const person = (n: number, over: Partial<OnSite> = {}): OnSite => ({
  contractId: `c${n}`, personId: `w${n}`, personName: `Worker ${n}`, manager: marcus, siteId: 'dayton',
  rateMinor: 2800, currency: 'USD', supplier: 'Ridgeline Staffing', job: 'Line operator', monthsHere: 3, daysLeft: 200,
  ...over,
})

function world(): Facts {
  return {
    sites: [
      site('dayton', 'Dayton, Ohio', 'United States'),
      site('fresno', 'Fresno, California', 'United States'),
      site('monterrey', 'Monterrey, Mexico', 'Latin America', 'MX'),
      site('belfast', 'Belfast', 'Northern Ireland', 'GB', 'Northern Ireland'),
    ],
    leads: new Map([['Latin America', ['Valeria Montes']]]),
    onSite: [
      person(1), person(2, { daysLeft: 41 }),
      person(3, { siteId: 'monterrey', manager: ana, currency: 'MXN', rateMinor: 9500, daysLeft: 52 }),
      person(4, { siteId: 'monterrey', manager: ana, currency: 'MXN', rateMinor: 9500 }),
      person(5, { siteId: 'monterrey', manager: ana, currency: 'MXN', rateMinor: null }),
    ],
    held: [{ contractId: 'c9', personId: 'w9', personName: 'Tanya Ruiz', manager: marcus, siteId: 'dayton', waitingOn: 'an I-9 (proof of right to work)' }],
    open: [
      { id: 'j1', title: 'Line operator', manager: marcus, siteId: 'dayton', region: 'United States' },
      { id: 'j2', title: 'Packing lead', manager: ana, siteId: 'monterrey', region: 'Latin America' },
      { id: 'j3', title: 'Forklift driver', manager: { id: null, name: '' }, siteId: null, region: null },
    ],
    weeks: [
      { id: 't1', personId: 'w1', personName: 'Worker 1', manager: marcus, siteId: 'dayton' },
      { id: 't2', personId: 'w2', personName: 'Worker 2', manager: marcus, siteId: 'dayton' },
      { id: 't3', personId: 'w3', personName: 'Worker 3', manager: ana, siteId: 'monterrey' },
    ],
    asked: [{ personId: 'w3', manager: ana, siteId: 'monterrey' }],
    receipts: [
      { id: 'i1', number: 'RS-1', supplier: 'Ridgeline Staffing', personName: 'Worker 1', manager: marcus, siteId: 'dayton', state: 'HELD', heldSays: '41.5 hours billed, 40 hours signed' },
      { id: 'i2', number: 'RS-2', supplier: 'Ridgeline Staffing', personName: 'Worker 2', manager: marcus, siteId: 'dayton', state: 'READY', heldSays: null },
      { id: 'i3', number: 'GT-1', supplier: 'Grupo Talenta Norte', personName: 'Worker 3', manager: ana, siteId: 'monterrey', state: 'PAID', heldSays: null },
    ],
  }
}

describe('the program by region adds up', () => {
  it('the program’s total is the sum of its regions, figure by figure', () => {
    const f = world()
    const regions = regionRows(f)
    const total = sumFigures(regions, true)
    expect(total.contractors).toBe(5)
    expect(total.plants).toBe(4)
    expect(total.openJobs).toBe(3)
    expect(total.weeksToSign).toBe(3)
    expect(total.papers).toEqual({ asked: 1, onHold: 1 })
    expect(total.receipts).toEqual({ paid: 1, ready: 1, held: 1 })
    for (const k of ['contractors', 'plants', 'openJobs', 'weeksToSign', 'hiringManagers'] as const) {
      expect(total[k], k).toBe(regions.reduce((n, r) => n + r[k], 0))
    }
  })

  it('a region’s row is the sum of its hiring managers’ rows', () => {
    const f = world()
    const us = regionRows(f).find((r) => r.label === 'United States')!
    const rows = managerRows(f, 'United States')
    expect(us.contractors).toBe(rows.reduce((n, r) => n + r.contractors, 0))
    expect(us.plants).toBe(2)
    expect(us.hiringManagers).toBe(1)
  })

  it('a plant with nobody on it is still counted among its region’s plants, and is not a manager’s row', () => {
    const f = world()
    expect(regionRows(f).find((r) => r.label === 'United States')!.plants).toBe(2)
    expect(managerRows(f, 'United States').map((r) => r.plant)).toEqual(['Dayton, Ohio'])
  })

  it('a job charged to no site and no region is counted under “No region set”, never dropped', () => {
    const rows = regionRows(world())
    const none = rows.find((r) => r.label === NO_REGION)!
    expect(none.openJobs).toBe(1)
    expect(rows[rows.length - 1].label).toBe(NO_REGION)
    expect(managerRows(world(), NO_REGION)[0].manager).toBe(NO_MANAGER)
  })

  it('the nearest time limit is the fewest days left of anybody counted, with their name', () => {
    const f = world()
    expect(regionRows(f).find((r) => r.label === 'United States')!.nearestLimit).toEqual({ days: 41, personName: 'Worker 2', plant: 'Dayton, Ohio' })
    expect(sumFigures(regionRows(f), true).nearestLimit!.days).toBe(41)
  })

  it('the regional managers seated on a region are named on its row', () => {
    expect(regionRows(world()).find((r) => r.label === 'Latin America')!.leads).toEqual(['Valeria Montes'])
  })
})

describe('spend is never added across currencies', () => {
  it('a month is kept per currency, in each currency’s own minor units', () => {
    const total = sumFigures(regionRows(world()), true)
    expect(total.spend).toEqual([
      { currency: 'MXN', minor: 9500 * 160 * 2 },
      { currency: 'USD', minor: 2800 * 160 * 2 },
    ])
    expect(total.spendOneCurrency).toBeNull()
  })

  it('somebody whose rung carries no rate is counted apart, never as a zero', () => {
    expect(spendOf([{ rateMinor: null, currency: 'MXN' }, { rateMinor: 100, currency: 'MXN' }])).toEqual({
      spend: [{ currency: 'MXN', minor: 16000 }], unpriced: 1,
    })
    expect(sumFigures(regionRows(world()), true).unpriced).toBe(1)
  })
})

describe('invoice receipts are counted only for a desk that reads them', () => {
  it('a reader with no such desk gets no figure, not a zero', () => {
    const f = { ...world(), receipts: null }
    expect(sumFigures(regionRows(f), false).receipts).toBeNull()
    expect(greeting(f).says).not.toContain('invoice receipt')
  })
})

describe('the first line names, not counts', () => {
  it('names the held receipt by supplier, person and plant, the start on hold, and the weeks waiting', () => {
    expect(greeting(world()).says).toBe(
      'Three things need you: Ridgeline Staffing’s invoice receipt for Worker 1 at Dayton is held, 41.5 hours billed, 40 hours signed; ' +
      'Tanya Ruiz’s start at Dayton waits on an I-9 (proof of right to work); 3 weeks wait to be signed at 2 plants.'
    )
  })

  it('several held receipts are said once, with their plants', () => {
    const f = world()
    f.receipts = [f.receipts![0], { ...f.receipts![0], id: 'i4', siteId: 'monterrey' }]
    expect(greeting(f).items[0]).toBe('two invoice receipts are held, at Dayton and Monterrey')
  })

  it('a desk with nothing waiting reads “Nothing needs you today.”', () => {
    expect(greeting({ ...world(), held: [], weeks: [], receipts: [] }).says).toBe('Nothing needs you today.')
  })

  it('a held start says what it waits on, from the start’s own sentence, or “papers”', () => {
    expect(waitingOn('Cannot start without an I-9 (proof of right to work). Get it on file, then activate.')).toBe('an I-9 (proof of right to work)')
    expect(waitingOn('RN 154-882, WI expired.')).toBe('papers')
    expect(waitingOn(null)).toBe('papers')
  })
})

describe('a hiring manager’s list', () => {
  it('holds their contractors, nearest the time limit first, with the weeks waiting on each', () => {
    const rows = contractorRows(world(), 'p-marcus')
    expect(rows.map((r) => [r.name, r.daysLeft, r.weeksToSign])).toEqual([['Worker 2', 41, 1], ['Worker 1', 200, 1]])
  })
})

describe('how each country runs', () => {
  it('a site in Northern Ireland reads the Northern Ireland rules, not Great Britain’s', () => {
    expect(countryCodeFor({ country: 'GB', state: 'Northern Ireland' })).toBe('GB-NIR')
    expect(countryCodeFor({ country: 'GB', state: 'England' })).toBe('GB')
    expect(countryCodeFor({ country: 'in', state: 'Gujarat' })).toBe('IN')
  })
})

describe('every cell is placed once', () => {
  it('a line at a site the reader cannot see is counted under no site, never under another plant', () => {
    const f = world()
    f.onSite.push(person(7, { siteId: 'secret-site' }))
    const c = cells(f).find((x) => x.siteId === null && x.contractors > 0)!
    expect(c.plant).toBe('No site named')
    expect(c.region).toBe(NO_REGION)
  })
})
