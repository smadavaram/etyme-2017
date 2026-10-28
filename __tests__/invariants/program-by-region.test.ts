import { describe, it, expect } from 'vitest'
import {
  cells, regionRows, managerRows, contractorRows, greeting, greetingTotal, sumFigures, spendOf, countryCodeFor, waitingOn,
  receiptsCell, receiptsCard, papersCell, papersCard, spendCell, spendNote, shortPaper,
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
      { id: 'i1', number: 'RS-1', supplier: 'Ridgeline Staffing', personName: 'Worker 1', manager: marcus, siteId: 'dayton', state: 'HELD', heldSays: '41.5 hours billed, 40 hours signed', overMinor: 4200, currency: 'USD' },
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
      'Tanya Ruiz’s start at Dayton waits on an I-9 (proof of right to work); 3 weeks wait to be signed at 2 sites.'
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

describe('the first line’s things are data too', () => {
  it('each thing named carries its kind, plant, person and supplier, so nobody reads them out of the sentence', () => {
    expect(greeting(world()).held).toEqual([
      { kind: 'receipt', count: 1, plant: 'Dayton', plants: ['Dayton'], person: 'Worker 1', supplier: 'Ridgeline Staffing',
        says: 'Ridgeline Staffing’s invoice receipt for Worker 1 at Dayton is held, 41.5 hours billed, 40 hours signed' },
      { kind: 'start', count: 1, plant: 'Dayton', plants: ['Dayton'], person: 'Tanya Ruiz', supplier: null,
        says: 'Tanya Ruiz’s start at Dayton waits on an I-9 (proof of right to work)' },
      { kind: 'weeks', count: 3, plant: '2 sites', plants: ['Dayton', 'Monterrey'], person: null, supplier: null,
        says: '3 weeks wait to be signed at 2 sites' },
    ])
  })

  it('the sentence is made of the items’ own phrases, in the same order', () => {
    const g = greeting(world())
    expect(g.items).toEqual(g.held!.map((i) => i.says))
    expect(g.total).toBe(g.held!.length)
  })

  it('several held receipts are one item with every plant and no single person', () => {
    const f = world()
    f.receipts = [f.receipts![0], { ...f.receipts![0], id: 'i4', siteId: 'monterrey' }]
    expect(greeting(f).held![0]).toMatchObject({ kind: 'receipt', count: 2, plants: ['Dayton', 'Monterrey'], person: null, supplier: null })
  })
})

describe('the owed count without the names', () => {
  it('the count is the number the first line says, from whether a receipt is held, a start is on hold and a week waits', () => {
    const f = world()
    const g = greeting(f)
    expect(greetingTotal({ heldReceipts: 1, heldStarts: 1, weeks: f.weeks.length })).toBe(g.total)
    expect(greetingTotal({ heldReceipts: 2, heldStarts: 0, weeks: 5 })).toBe(2)
    expect(greetingTotal({ heldReceipts: 0, heldStarts: 0, weeks: 0 })).toBe(0)
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

describe('By region reads the way the home page’s map reads', () => {
  const noPaid = () => {
    const f = world()
    f.receipts = f.receipts!.map((r) => (r.state === 'PAID' ? { ...r, state: 'READY' as const } : r))
    return f
  }

  it('a region with a held receipt and a clean one reads “1 held · 1 to pay”, and a clean region “1 to pay”, never “0 paid”', () => {
    const rows = regionRows(noPaid())
    expect(receiptsCell(rows.find((r) => r.label === 'United States')!.receipts)).toBe('1 held · 1 to pay')
    expect(receiptsCell(rows.find((r) => r.label === 'Latin America')!.receipts)).toBe('1 to pay')
    for (const r of rows) expect(receiptsCell(r.receipts) ?? '').not.toMatch(/\b0 paid\b/)
  })

  it('“paid” is said only where a payment is recorded', () => {
    expect(receiptsCell({ paid: 2, ready: 0, held: 0 })).toBe('2 paid')
    expect(receiptsCell({ paid: 0, ready: 0, held: 0 })).toBe('none')
    expect(receiptsCell(null)).toBeNull()
  })

  it('the invoice receipts card leads on what is held and by how much, with how many clear the check under it', () => {
    const total = sumFigures(regionRows(noPaid()), true)
    expect(receiptsCard(total)).toEqual({ value: '1 held · $42', sub: '2 of 3 clear the check', attention: true })
  })

  it('with nothing held the card says how many clear the check, and is not in the attention color', () => {
    expect(receiptsCard({ receipts: { paid: 0, ready: 6, held: 0 }, heldOver: [] })).toEqual({ value: '6 of 6', sub: 'clear the check', attention: false })
    expect(receiptsCard({ receipts: { paid: 0, ready: 0, held: 0 }, heldOver: [] })!.attention).toBe(false)
  })

  it('the starts card names the paper a start waits on: “1 start waiting on an I-9”', () => {
    const f = world()
    f.asked = []
    expect(papersCard(sumFigures(regionRows(f), true))).toEqual({ value: '1', sub: '1 start waiting on an I-9', attention: true })
  })

  it('a region with no start on hold and nothing asked reads “none blocking”, never “0 asked”', () => {
    expect(papersCell({ onHold: 0, asked: 0 })).toBe('none blocking')
    expect(papersCell({ onHold: 1, asked: 3 })).toBe('1 start on hold')
    expect(papersCard({ papers: { onHold: 0, asked: 0 }, holdsOn: [] }).sub).toBe('none blocking')
  })

  it('a held start’s paper is said short: “an I-9 (proof of right to work)” is “an I-9”', () => {
    expect(shortPaper('an I-9 (proof of right to work)')).toBe('an I-9')
    expect(shortPaper('papers')).toBe('papers')
  })

  it('a row’s spend shows the one figure in the reporting currency, with the region’s own money under it', () => {
    expect(spendCell({ spend: [{ currency: 'INR', minor: 651_840_000 }], spendOneCurrency: { currency: 'USD', minor: 7_822_080 } }))
      .toEqual({ main: '$78,220.80', under: '₹6,518,400' })
    expect(spendCell({ spend: [{ currency: 'USD', minor: 26_432_000 }], spendOneCurrency: { currency: 'USD', minor: 26_432_000 } }))
      .toEqual({ main: '$264,320', under: null })
  })

  it('where no one figure can be made, a row shows its own money and never a sum across currencies', () => {
    expect(spendCell({ spend: [{ currency: 'INR', minor: 100 }, { currency: 'XYZ', minor: 5 }], spendOneCurrency: null }).main).toBe('in 2 currencies')
  })

  it('the note under the page says what is converted and at which rates, in one sentence', () => {
    const said = spendNote({ estimate: 'estimate from current rates, 160 hours a month, not signed time', into: 'USD', converted: true, sample: true, sampleWritten: 'October 1, 2026', missing: [] })
    expect(said).toBe('Spend this month is an estimate from current rates, 160 hours a month, not signed time; each site’s own money is converted to USD at sample rates written October 1, 2026, not market rates, and shown under it.')
    expect(said).not.toMatch(/nothing is converted/)
    expect(spendNote({ estimate: 'estimate', into: 'USD', converted: false, sample: false, sampleWritten: null, missing: [] })).toBe('Spend this month is an estimate.')
    expect(spendNote({ estimate: 'estimate', into: 'USD', converted: false, sample: false, sampleWritten: null, missing: ['XYZ'] }))
      .toMatch(/not converted, because there is no rate to USD for XYZ\.$/)
  })

  it('the region where the client’s primary site is comes first, whatever its size', () => {
    const f = world()
    f.sites = f.sites.map((s) => (s.id === 'dayton' ? { ...s, primary: true } : s))
    f.onSite.push(...[11, 12, 13].map((i) => person(i, { siteId: 'monterrey', manager: ana, currency: 'MXN' })))
    const labels = regionRows(f).map((r) => r.label)
    expect(labels[0]).toBe('United States')
    expect(labels[labels.length - 1]).toBe(NO_REGION)
  })
})
