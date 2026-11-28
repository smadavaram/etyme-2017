import { describe, it, expect } from 'vitest'
import {
  mapReach, mapChips, readMapAsk, answeredByMap, outOfReach, mapNeeds, mapOwed, mapWeeks, mapLimit,
  mapHeld, mapHeldReceipts, mapSpend, mapCountries, mapHelp, REGION_CHIPS, PROGRAM_CHIPS, PLANT_LIMIT_CHIP, NEAR_DAYS,
  seatLine, siteLine, mapI9, programLine, startSentence, receiptPhrase, heldPhrase, heldBySite, largestHeld,
  type Place,
} from '@/app/api/conversations/twin/regions'
import { readAsk, VOICE_BANNED, seatSays, queueCards, PAY_OPENS_THE_RECEIPT, RECEIPT_PAY, type QueueItem, type WaitingItem } from '@/app/api/conversations/twin/ask'
import { openThread } from '@/app/dashboard/conversations/open-thread'
import type { RegionsData } from '@/app/api/program/regions/read'
import { heldOverSays, type Figures, type ManagerRow, type RegionRow, type GreetingItem } from '@/app/api/program/regions/rollup'
import { billRateMinor } from '@/lib/seed-corvane/plan'
import { format, fromMinor } from '@/lib/money'

/**
 * Ask Etyme over the program by region (founder, 2026-10-27, the region
 * map). The figures below are shaped like By region's own read; the
 * integration file reads them off the seeded Corvane Packaging. Its money
 * is the seed's specialist rates at 160 hours a month, read from the plan.
 */

const US_HOUR = billRateMinor('US')
const NI_HOUR = billRateMinor('NI')
const month = (people: number, hourMinor: number) => people * 160 * hourMinor
const US_MONTH = month(59, US_HOUR)
const NI_MONTH = month(28, NI_HOUR)
/** Money as By region's cells say it: "$1,132,800". */
const said$ = (minor: number, currency: string) => format(fromMinor(minor, currency), { compact: true })
/** What 1.5 hours past the signed 40 bill at the US rate: the held receipt's money over. */
const OVER_ONE = Math.round(1.5 * US_HOUR)

const fig = (over: Partial<Figures> = {}): Figures => ({
  plants: 0, hiringManagers: 0, contractors: 0, openJobs: 0, weeksToSign: 0,
  papers: { asked: 0, onHold: 0 }, receipts: { paid: 0, ready: 0, held: 0 },
  nearestLimit: null, spend: [], spendOneCurrency: null, unpriced: 0, ...over,
})
const manager = (plant: string, region: string, over: Partial<ManagerRow> = {}): ManagerRow => ({
  ...fig({ plants: 1, hiringManagers: 1 }), managerId: `m-${plant}`, manager: `Manager of ${plant}`, siteId: `s-${plant}`, plant, region, currency: null, ...over,
})
const region = (label: string, over: Partial<RegionRow> = {}): RegionRow => ({ ...fig(), label, leads: [], ...over })

function data(over: Partial<RegionsData> = {}): RegionsData {
  return {
    client: { id: 'c', name: 'Corvane Packaging' },
    reader: { reach: 'PROGRAM', label: null },
    level: 'PROGRAM',
    greeting: { total: 0, says: 'Nothing needs you today.', items: [] },
    regions: [], total: fig(), region: null, manager: null,
    receiptsSays: null, limitSays: null,
    spendSays: 'estimate from current rates, 160 hours a month, not signed time',
    currenciesSays: '', oneCurrency: { reportingCurrency: 'USD', says: 'Converted at sample rates, not market rates.', sampleRates: true },
    ...over,
  }
}

const latam = (): RegionsData => {
  const managers = [
    manager('Monterrey, Mexico', 'Latin America', { contractors: 18, weeksToSign: 4, nearestLimit: { days: 52, personName: 'Ana', plant: 'Monterrey, Mexico' } }),
    manager('Campinas, Brazil', 'Latin America', { contractors: 15, weeksToSign: 2, nearestLimit: { days: 22, personName: 'Bia', plant: 'Campinas, Brazil' } }),
    manager('Joinville, Brazil', 'Latin America', { contractors: 8, weeksToSign: 0, nearestLimit: { days: 95, personName: 'Caio', plant: 'Joinville, Brazil' } }),
  ]
  const total = fig({ plants: 3, contractors: 41, weeksToSign: 6, receipts: { paid: 0, ready: 1, held: 0 }, nearestLimit: { days: 22, personName: 'Bia', plant: 'Campinas, Brazil' } })
  return data({
    reader: { reach: 'REGION', label: 'Latin America' }, level: 'REGION',
    greeting: {
      total: 1, says: 'One thing needs you: 6 weeks wait to be signed at 2 sites.', items: ['6 weeks wait to be signed at 2 sites'],
      held: [{ kind: 'weeks', count: 6, plant: '2 sites', plants: ['Monterrey', 'Campinas'], person: null, supplier: null, says: '6 weeks wait to be signed at 2 sites' }],
    },
    regions: [region('Latin America', total)], total,
    region: { label: 'Latin America', leads: ['Valeria Montes'], figures: total, managers, countries: [] },
  })
}

const cfo = (): RegionsData => {
  const us = region('United States', { plants: 6, contractors: 59, weeksToSign: 11, receipts: { paid: 0, ready: 1, held: 1 }, spend: [{ currency: 'USD', minor: US_MONTH }], nearestLimit: { days: 18, personName: 'Dale', plant: 'Fresno, California' } })
  const ni = region('Northern Ireland', { plants: 4, contractors: 28, weeksToSign: 3, receipts: { paid: 0, ready: 1, held: 0 }, spend: [{ currency: 'GBP', minor: NI_MONTH }], nearestLimit: { days: 14, personName: 'Orla', plant: 'Belfast' } })
  const total = fig({
    plants: 10, contractors: 87, weeksToSign: 14, receipts: { paid: 0, ready: 2, held: 1 },
    spend: [{ currency: 'GBP', minor: NI_MONTH }, { currency: 'USD', minor: US_MONTH }], nearestLimit: { days: 14, personName: 'Orla', plant: 'Belfast' },
  })
  return data({
    greeting: {
      total: 3,
      says: 'Three things need you: Hollow Creek Staffing’s invoice receipt for Ray Penn at Dayton is held, 41.5 hours billed, 40 hours signed; Tom Ash’s start at Dayton waits on an I-9 (proof of right to work); 14 weeks wait to be signed at 9 sites.',
      items: [
        'Hollow Creek Staffing’s invoice receipt for Ray Penn at Dayton is held, 41.5 hours billed, 40 hours signed',
        'Tom Ash’s start at Dayton waits on an I-9 (proof of right to work)',
        '14 weeks wait to be signed at 9 sites',
      ],
      held: [
        { kind: 'receipt', count: 1, plant: 'Dayton', plants: ['Dayton'], person: 'Ray Penn', supplier: 'Hollow Creek Staffing', says: 'Hollow Creek Staffing’s invoice receipt for Ray Penn at Dayton is held, 41.5 hours billed, 40 hours signed' },
        { kind: 'start', count: 1, plant: 'Dayton', plants: ['Dayton'], person: 'Tom Ash', supplier: null, says: 'Tom Ash’s start at Dayton waits on an I-9 (proof of right to work)' },
        { kind: 'weeks', count: 14, plant: '9 sites', plants: ['Dayton', 'Fresno', 'Joliet', 'El Paso', 'Belfast', 'Newry', 'Craigavon', 'Antrim', 'Lisburn'], person: null, supplier: null, says: '14 weeks wait to be signed at 9 sites' },
      ],
    },
    regions: [us, ni], total, currenciesSays: 'in 2 currencies',
  })
}

const places: Place[] = [
  { name: 'Dayton, Ohio', city: 'Dayton', region: 'United States' },
  { name: 'Fresno, California', city: 'Fresno', region: 'United States' },
  { name: 'Monterrey, Mexico', city: 'Monterrey', region: 'Latin America' },
  { name: 'Medellín, Colombia', city: 'Medellín', region: 'Latin America' },
  { name: 'Belfast', city: 'Belfast', region: 'Northern Ireland' },
]

const said = (a: unknown) => JSON.stringify(a)

describe('who reads Ask Etyme by region', () => {
  const base = { companyKind: 'CLIENT', region: null, plant: null, onUnit: false, regions: 6 }

  it('a seat on a region reads the map, and its chips are the four a regional manager asks', () => {
    expect(mapReach({ ...base, region: 'Latin America', onUnit: true, permissions: ['invoices.read'] })).toBe('REGION')
    expect(mapChips('REGION')).toEqual([
      'Which sites have weeks waiting?', 'Who is near the time limit in my region?', 'Which invoice receipts are held?', 'How does each country here run?',
    ])
    expect(REGION_CHIPS).toHaveLength(4)
  })

  it('a seat over the whole of a program in two or more regions that pays nothing reads the map, and its chips are the CFO’s three', () => {
    expect(mapReach({ ...base, permissions: ['utilization.read', 'invoices.read'] })).toBe('PROGRAM')
    expect(mapChips('PROGRAM')).toEqual(['What did we spend this month, by region?', 'What is held and why?', 'Who is past the time limit?'])
    expect(PROGRAM_CHIPS).toHaveLength(3)
  })

  it('a seat that pays invoice receipts, a client in one region, and a supplier keep their own queue', () => {
    expect(mapReach({ ...base, permissions: ['utilization.read', 'payments.record'] })).toBeNull()
    expect(mapReach({ ...base, regions: 1, permissions: ['utilization.read'] })).toBeNull()
    expect(mapReach({ ...base, regions: 0, permissions: ['utilization.read'] })).toBeNull()
    expect(mapReach({ ...base, companyKind: 'VENDOR', region: 'Latin America', permissions: ['utilization.read'] })).toBeNull()
    expect(mapReach({ ...base, permissions: ['invoices.read'] })).toBeNull()
  })

  it('a seat on a plant keeps its own queue, and asks about the time limit at its plant', () => {
    expect(mapReach({ ...base, plant: 'Dayton, Ohio', onUnit: true, permissions: ['timesheets.approve'] })).toBe('SITE')
    const own = ['What needs me today?', 'Who applied for my jobs?', 'Which timesheets are waiting?']
    expect(mapChips('SITE', own)).toEqual([...own, PLANT_LIMIT_CHIP])
    expect(mapChips('SITE', [...own, 'Who is near the time limit?', 'Extra'])).toHaveLength(4)
  })

  it('a seat on some other unit, over a program in several regions, keeps its own queue', () => {
    expect(mapReach({ ...base, onUnit: true, permissions: ['utilization.read'] })).toBeNull()
  })
})

describe('what a map seat asks', () => {
  it('reads each chip as its own question', () => {
    expect(readMapAsk('Which sites have weeks waiting?')).toBe('PLANT_WEEKS')
    expect(readMapAsk('Who is near the time limit in my region?')).toBe('LIMIT')
    expect(readMapAsk('Who is past the time limit?')).toBe('PAST')
    expect(readMapAsk('Which invoice receipts are held?')).toBe('HELD_RECEIPTS')
    expect(readMapAsk('What is held and why?')).toBe('HELD')
    expect(readMapAsk('What did we spend this month, by region?')).toBe('SPEND')
    expect(readMapAsk('How does each country here run?')).toBe('COUNTRIES')
    expect(readMapAsk('What needs me today?')).toBe('NEEDS')
    expect(readMapAsk(PLANT_LIMIT_CHIP)).toBe('LIMIT')
  })

  it('a program seat’s spend by supplier and a plant seat’s own weeks still go where they always went', () => {
    expect(answeredByMap('PROGRAM', readMapAsk('What did we spend by supplier this month?'), 'What did we spend by supplier this month?')).toBe(false)
    expect(answeredByMap('PROGRAM', readMapAsk('What did we spend this month, by region?'), 'What did we spend this month, by region?')).toBe(true)
    expect(answeredByMap('SITE', readMapAsk('Which timesheets are waiting?'), 'Which timesheets are waiting?')).toBe(false)
    expect(answeredByMap('SITE', readMapAsk(PLANT_LIMIT_CHIP), PLANT_LIMIT_CHIP)).toBe(true)
    expect(answeredByMap('REGION', readMapAsk('Approve the week'), 'Approve the week')).toBe(true)
  })
})

describe('a region seat reads its region only', () => {
  const valeria = { reach: 'REGION' as const, label: 'Latin America', places }
  const marcus = { reach: 'SITE' as const, label: 'Dayton, Ohio', places }

  it('a region seat naming another region or another region’s plant is refused in one sentence naming its own region', () => {
    expect(outOfReach('Which weeks wait in the United States?', valeria)).toBe('Your seat reads Latin America only, so United States is not on your page.')
    expect(outOfReach('Who is near the time limit at Dayton?', valeria)).toBe('Your seat reads Latin America only, so Dayton, Ohio is not on your page.')
    expect(outOfReach('How is belfast doing?', valeria)).toBe('Your seat reads Latin America only, so Belfast is not on your page.')
  })

  it('a region seat naming its own plants, with or without accents, is answered', () => {
    expect(outOfReach('Which weeks wait at Medellin?', valeria)).toBeNull()
    expect(outOfReach('Who is near the time limit in Monterrey?', valeria)).toBeNull()
    expect(outOfReach('Which sites have weeks waiting?', valeria)).toBeNull()
  })

  it('a plant seat naming another plant is refused naming its own plant', () => {
    expect(outOfReach('Who is near the time limit at Fresno?', marcus)).toBe('Your seat reads Dayton, Ohio only, so Fresno, California is not on your page.')
    expect(outOfReach('Who is near the time limit at my site?', marcus)).toBeNull()
  })

  it('a question the map does not answer is told what it can ask, and never goes to the model', () => {
    const a = mapHelp(valeria)
    expect(a.kind).toBe('TEXT')
    expect((a as { says: string }).says).toBe('I read Latin America only. Ask which sites have weeks waiting, who is near the time limit, which invoice receipts are held, or how each country here runs.')
    expect(said(a)).not.toMatch(/model/i)
  })
})

describe('the answers are By region’s own read', () => {
  it('the CFO’s greeting names the held receipt with the money over the signed hours, the start waiting on an I-9 and the weeks, then the nearest time limit by name, uncounted; the mark is By region’s count', () => {
    const d = cfo()
    d.total.heldOver = [{ currency: 'USD', minor: OVER_ONE }]
    const a = mapNeeds(d, 'PROGRAM', true, undefined, { line: 'FINANCE' }) as Extract<ReturnType<typeof mapNeeds>, { kind: 'NEEDS' }>
    expect(a.kind).toBe('NEEDS')
    expect(a.greeting).toBe(true)
    expect(heldOverSays(d.total.heldOver)).toBe('$180')
    expect(a.says).toBe(
      `Three things need you: Hollow Creek Staffing’s invoice receipt for Ray Penn at Dayton is held, ${heldOverSays(d.total.heldOver)} over the signed hours (41.5 hours billed, 40 hours signed); ` +
      'Tom Ash’s start at Dayton waits on an I-9 (proof of right to work); 14 weeks wait to be signed at 9 sites. Orla in Belfast reaches the time limit in 14 days.')
    expect(a.items).toEqual([])
    expect(mapOwed(d, 'PROGRAM', 'FINANCE')).toBe(d.greeting.total)
    expect(a.links?.[0].href).toBe('/dashboard/program?view=regions')
  })

  it('the CFO’s line names nobody against the time limit when the nearest is past the twin’s 90 days, and the count does not move', () => {
    const d = cfo()
    d.total.nearestLimit = { days: 120, personName: 'Orla', plant: 'Belfast' }
    expect(seatLine(d, 'PROGRAM', { line: 'FINANCE' }).total).toBe(3)
    expect(seatLine(d, 'PROGRAM', { line: 'FINANCE' }).says).not.toContain('Orla')
  })

  it('the head of operations is greeted with the weeks first and who is within 30 days of the time limit, never the CFO’s line', () => {
    const d = cfo()
    const ops = seatLine(d, 'PROGRAM', { line: 'OPERATIONS' })
    expect(ops.says).toBe('Three things need you: 14 weeks wait to be signed at 9 sites; Hollow Creek Staffing’s invoice receipt for Ray Penn at Dayton is held, 41.5 hours billed, 40 hours signed; Tom Ash’s start at Dayton waits on an I-9 (proof of right to work). 2 regions have somebody within 30 days of the time limit, the nearest Orla in Belfast, in 14 days.')
    expect(ops.says).not.toBe(seatLine(d, 'PROGRAM', { line: 'FINANCE' }).says)
    expect(mapOwed(d, 'PROGRAM', 'OPERATIONS')).toBe(d.greeting.total)
  })

  it('a seat that runs the program’s jobs reads the operations line, and a seat that reads its money and runs no job reads the CFO’s', () => {
    expect(programLine(['utilization.read', 'requirements.read', 'requirements.write', 'invoices.read'])).toBe('OPERATIONS')
    expect(programLine(['utilization.read', 'requirements.read', 'invoices.read'])).toBe('FINANCE')
  })

  it('a regional manager’s greeting names the hiring manager at the plant nearest the time limit and counts the rest of the weeks, then names the person nearest the limit, uncounted', () => {
    const d = latam()
    d.region!.managers[1] = { ...d.region!.managers[1], manager: 'Fernanda Albuquerque', weeksToSign: 2, nearestLimit: { days: 22, personName: 'Juliana Lima', plant: 'Campinas, Brazil' } }
    d.total.nearestLimit = { days: 22, personName: 'Juliana Lima', plant: 'Campinas, Brazil' }
    const line = seatLine(d, 'REGION')
    expect(line.says).toBe('One thing needs you: Fernanda Albuquerque has 2 weeks to sign in Campinas, and 4 more weeks wait at 1 site. Juliana Lima in Campinas reaches the time limit in 22 days.')
    expect(mapOwed(d, 'REGION')).toBe(d.greeting.total)
    expect((mapNeeds(d, 'REGION', true) as { says: string }).says).toBe(line.says)
  })

  it('a regional manager whose nearest plant has no weeks hears the manager with the most weeks', () => {
    const d = latam()
    d.region!.managers[1] = { ...d.region!.managers[1], weeksToSign: 0 }
    d.greeting.held![0] = { ...d.greeting.held![0], count: 4 }
    expect(seatLine(d, 'REGION').says).toBe('One thing needs you: Manager of Monterrey, Mexico has 4 weeks to sign in Monterrey. Bia in Campinas reaches the time limit in 22 days.')
  })

  it('a hiring manager’s greeting carries By region’s count, says the start on hold as the start’s own sentence, and names whose weeks wait', () => {
    const d = data({
      reader: { reach: 'SITE', label: 'Dayton, Ohio' },
      greeting: {
        total: 2, says: 'Two things need you: Maria Lee’s start at Dayton waits on an I-9 (proof of right to work); 3 weeks wait to be signed at Dayton.', items: [],
        held: [
          { kind: 'start', count: 1, plant: 'Dayton', plants: ['Dayton'], person: 'Maria Lee', supplier: null, says: 'Maria Lee’s start at Dayton waits on an I-9 (proof of right to work)' },
          { kind: 'weeks', count: 3, plant: 'Dayton', plants: ['Dayton'], person: null, supplier: null, says: '3 weeks wait to be signed at Dayton' },
        ],
      },
    })
    const weeks: QueueItem[] = ['Tyler Brooks', 'Keisha Monroe', 'Brandon Lee'].map((n, i) => ({ type: 'TIMESHEET_APPROVAL', title: `Approve timesheet — ${n}`, whose: n, entityId: `t${i}` }))
    const line = siteLine(d, { total: 3, items: weeks })
    expect(line.says).toBe('Two things need you: Maria Lee cannot start without an I-9; Tyler Brooks, Keisha Monroe and Brandon Lee have weeks waiting for you. Get the I-9 on file, then start.')
    expect(line.total).toBe(d.greeting.total)
    expect(siteLine(d, null).says).toContain('3 weeks wait for you to sign')
  })

  it('who is missing an I-9 at a plant is answered from the start on hold By region shows it', () => {
    const d = data({
      reader: { reach: 'SITE', label: 'Dayton, Ohio' },
      greeting: { total: 1, says: '', items: [], held: [{ kind: 'start', count: 1, plant: 'Dayton', plants: ['Dayton'], person: 'Maria Lee', supplier: null, says: 'Maria Lee’s start at Dayton waits on an I-9 (proof of right to work)' }] },
    })
    expect((mapI9(d) as { says: string }).says).toBe('Maria Lee cannot start without an I-9. Get it on file, then start. Checked just now.')
    expect((mapI9(latam()) as { says: string }).says).toBe('Nobody about to start at Latin America is held for an I-9. Checked just now.')
    expect(readMapAsk('Who is missing an I-9?')).toBe('I9')
    expect(answeredByMap('SITE', 'I9', 'Who is missing an I-9?')).toBe(true)
    expect(answeredByMap('PROGRAM', 'I9', 'Who is missing an I-9?')).toBe(false)
  })

  it('a start waiting on papers other than an I-9 says to open the start, never a form it does not wait on', () => {
    const item: Pick<GreetingItem, 'says' | 'person'> = { person: 'Maria Lee', says: 'Maria Lee’s start at Dayton waits on papers' }
    expect(startSentence(item)).toBe('Maria Lee cannot start until the papers are on file. Open the start to see which.')
  })

  it('a held receipt with no money worked out keeps By region’s phrase word for word', () => {
    const item = { says: 'Hollow Creek Staffing’s invoice receipt for Ray Penn at Dayton is held, 41.5 hours billed, 40 hours signed' }
    expect(receiptPhrase(item, null)).toBe(item.says)
  })

  it('one held receipt is said with the money over the signed hours in the answers too, word for word as the greeting says it', () => {
    const d = cfo()
    d.total.heldOver = [{ currency: 'USD', minor: OVER_ONE }]
    const phrase = `Hollow Creek Staffing’s invoice receipt for Ray Penn at Dayton is held, ${said$(OVER_ONE, 'USD')} over the signed hours (41.5 hours billed, 40 hours signed)`
    expect((mapHeld(d) as { says: string }).says).toBe(`${phrase}. Tom Ash’s start at Dayton waits on an I-9 (proof of right to work).`)
    expect((mapHeldReceipts(d) as { says: string }).says).toBe(`${phrase}. Two others are ready to pay.`)
    expect(seatLine(d, 'PROGRAM', { line: 'FINANCE' }).says).toContain(phrase)
  })

  it('a region seat’s greeting opens By region on its region', () => {
    const a = mapNeeds(latam(), 'REGION', true) as { links: { href: string }[]; more: { says: string }[] }
    expect(a.links[0].href).toBe('/dashboard/program?view=regions&region=Latin+America')
    expect(a.more[0].says).toContain('I read Latin America only')
  })

  it('which sites have weeks waiting names each site, its hiring manager, contractors and weeks', () => {
    const a = mapWeeks(latam()) as { kind: string; says: string; table: { head: string[]; rows: { cells: string[] }[] } }
    expect(a.kind).toBe('LIST')
    expect(a.says).toBe('Latin America: 3 sites, 41 contractors on site. 6 weeks wait to be signed at 2 sites.')
    expect(a.table.head).toEqual(['Site', 'Hiring manager', 'Contractors', 'Weeks waiting'])
    expect(a.table.rows.map((r) => r.cells)).toEqual([
      ['Monterrey, Mexico', 'Manager of Monterrey, Mexico', '18', '4'],
      ['Campinas, Brazil', 'Manager of Campinas, Brazil', '15', '2'],
    ])
  })

  it('a program seat reads weeks waiting by region', () => {
    const a = mapWeeks(cfo()) as { says: string; table: { rows: { cells: string[] }[] } }
    expect(a.says).toBe('14 weeks wait to be signed across 2 regions. Open a region on By region for its sites.')
    expect(a.table.rows.map((r) => r.cells[0])).toEqual(['United States', 'Northern Ireland'])
  })

  it(`near the time limit lists the nearest person at each site within ${NEAR_DAYS} days, nearest first, and says it is the nearest at each site`, () => {
    const a = mapLimit(latam(), 'NEAR') as { says: string; table: { rows: { cells: string[] }[] } }
    expect(a.table.rows.map((r) => r.cells.slice(0, 2))).toEqual([['Campinas, Brazil', 'Bia'], ['Monterrey, Mexico', 'Ana']])
    expect(a.says).toContain('Bia at Campinas, Brazil is nearest, in 22 days')
    expect(a.says).toContain('the nearest person at each site')
  })

  it('a plant seat reads every one of its own contractors against the time limit', () => {
    const people = [
      { contractId: 'a', personId: 'p1', name: 'Ann', job: null, supplier: 'S', rateMinor: 1, currency: 'USD', monthsHere: 16, daysLeft: 41, weeksToSign: 0, papersAsked: 0 },
      { contractId: 'b', personId: 'p2', name: 'Bo', job: null, supplier: 'S', rateMinor: 1, currency: 'USD', monthsHere: 2, daysLeft: 400, weeksToSign: 0, papersAsked: 0 },
    ]
    const a = mapLimit(data({ reader: { reach: 'SITE', label: 'Dayton, Ohio' } }), 'NEAR', people) as { says: string; table: { rows: { cells: string[] }[] } }
    expect(a.says).toBe('One of your 2 contractors at Dayton, Ohio is within 90 days of the time limit. Ann is nearest, in 41 days. Counted across every supplier.')
    expect(a.table.rows).toHaveLength(1)
  })

  it('nobody past the time limit is said plainly, with the nearest named', () => {
    const a = mapLimit(cfo(), 'PAST') as { says: string; table?: unknown }
    expect(a.says).toBe('Nobody at Corvane Packaging is past the time limit. The nearest is Orla at Belfast, in 14 days. Counted across every supplier.')
    expect(a.table).toBeUndefined()
  })

  it('somebody past the time limit is said as past, never as near', () => {
    const d = cfo()
    d.regions[0].nearestLimit = { days: -5, personName: 'Dale', plant: 'Fresno, California' }
    const a = mapLimit(d, 'PAST') as { says: string }
    expect(a.says).toContain('Dale at Fresno, California is nearest, 5 days past it')
  })

  it('a client with no time limit is told so, never counted against one', () => {
    const a = mapLimit(data({ limitSays: 'Corvane Packaging has set no time limit, so nobody is counted against one.' }), 'NEAR') as { says: string }
    expect(a.says).toBe('Corvane Packaging has set no time limit, so nobody is counted against one.')
  })

  it('what is held says the held receipt and the held start in By region’s own words', () => {
    const a = mapHeld(cfo()) as { says: string }
    expect(a.says).toBe('Hollow Creek Staffing’s invoice receipt for Ray Penn at Dayton is held, 41.5 hours billed, 40 hours signed. Tom Ash’s start at Dayton waits on an I-9 (proof of right to work).')
  })

  it('nothing held says so', () => {
    expect((mapHeld(latam()) as { says: string }).says).toBe('Nothing is held at Latin America: no invoice receipt and no start.')
  })

  it('which invoice receipts are held names the held one and counts the rest ready to pay', () => {
    expect((mapHeldReceipts(cfo()) as { says: string }).says).toBe('Hollow Creek Staffing’s invoice receipt for Ray Penn at Dayton is held, 41.5 hours billed, 40 hours signed. Two others are ready to pay.')
    expect((mapHeldReceipts(latam()) as { says: string }).says).toBe('No invoice receipt is held in Latin America. One is ready to pay.')
  })

  it('a seat that does not read invoice receipts is told who does, never a zero', () => {
    const d = data({ total: fig({ receipts: null }), receiptsSays: 'Invoice receipts are read by the AP clerk and finance, so they are not counted on your page.' })
    expect((mapHeldReceipts(d) as { says: string }).says).toMatch(/AP clerk/)
  })

  it('spend by region is per currency, said as an estimate from current rates, with a total row equal to the sum of regions', () => {
    const d = cfo()
    const a = mapSpend(d) as { says: string; table: { head: string[]; rows: { cells: string[] }[] } }
    expect(a.says).toContain('It is an estimate from current rates, 160 hours a month, not signed time.')
    expect(a.says).toContain('in 2 currencies')
    const rows = a.table.rows
    expect(rows.at(-1)!.cells[0]).toBe('All regions')
    expect(Number(rows.at(-1)!.cells[1])).toBe(rows.slice(0, -1).reduce((n, r) => n + Number(r.cells[1]), 0))
    expect(rows[0].cells[2]).toBe(said$(US_MONTH, 'USD'))
    expect(rows[0].cells[2]).toBe('$1,132,800')
    expect(rows.at(-1)!.cells[2]).toBe(`${said$(NI_MONTH, 'GBP')} · ${said$(US_MONTH, 'USD')}`)
    expect(a.table.head).toEqual(['Region', 'Contractors', 'Spend this month'])
  })

  it('spend in one currency is shown only where money rolled every currency up, with its sentence', () => {
    const d = cfo()
    const one = US_MONTH + NI_MONTH
    d.total.spendOneCurrency = { currency: 'USD', minor: one }
    d.regions[0].spendOneCurrency = { currency: 'USD', minor: US_MONTH }
    const a = mapSpend(d) as { says: string; table: { head: string[] } }
    expect(a.table.head.at(-1)).toBe('In USD')
    expect(a.says).toContain(`In USD, about ${said$(one, 'USD')}. Converted at sample rates, not market rates.`)
  })

  it('how each country runs shows only confirmed lines, and says so when there are none', () => {
    expect((mapCountries(latam()) as { says: string }).says).toBe('Nothing about how Latin America runs is confirmed against its source yet, so nothing is shown.')
    const d = latam()
    d.region!.countries = [{ country: 'BE', name: 'Belgium', papers: [{ label: 'Dimona declaration' } as never], pay: null, rule: null }]
    const a = mapCountries(d) as { table: { rows: { cells: string[] }[] } }
    expect(a.table.rows[0].cells).toEqual(['Belgium', 'Dimona declaration', 'Not confirmed', 'Not confirmed'])
  })

  it('no answer says program office, desk or an apology', () => {
    const all = [mapNeeds(cfo(), 'PROGRAM', true), mapNeeds(latam(), 'REGION', true), mapWeeks(latam()), mapLimit(latam(), 'NEAR'), mapHeld(cfo()), mapSpend(cfo()), mapCountries(latam()), mapHelp({ label: 'Latin America' })]
    for (const a of all) {
      const text = said(a)
      expect(text).not.toMatch(/program office|\bdesk\b/i)
      for (const banned of VOICE_BANNED) expect(text, String(banned)).not.toMatch(banned)
    }
  })

  it('every role is said as the person it names: “You are the head of operations”, never “You are in head of operations”', () => {
    expect(seatSays({ role: 'Head of Operations', company: 'Corvane Packaging', sample: true })).toBe('You are the head of operations at Corvane Packaging, a sample company.')
    expect(seatSays({ role: 'Chief Financial Officer', company: 'Corvane Packaging', sample: true })).toBe('You are the chief financial officer at Corvane Packaging, a sample company.')
    expect(seatSays({ role: 'Regional Manager', company: 'Corvane Packaging', sample: false })).toBe('You are the regional manager at Corvane Packaging.')
    expect(seatSays({ role: 'Finance', company: 'Brightmoor', sample: false })).toBe('You are in finance at Brightmoor.')
  })

  it('the map’s questions are not mistaken for anything the queue acts on', () => {
    for (const q of [...REGION_CHIPS, ...PROGRAM_CHIPS]) expect(readAsk(q).kind, q).not.toBe('DECIDE')
  })
})

describe('several invoice receipts held at once', () => {
  // Dayton holds three receipts over by 1.5 hours each, Fresno one over by
  // 1 hour, Joliet one by 2 and El Paso one by 1.5: six, at the US rate.
  const over = (hours: number) => [{ currency: 'USD', minor: Math.round(hours * US_HOUR) }]
  const usRows = () => [
    manager('Dayton, Ohio', 'United States', { receipts: { paid: 0, ready: 0, held: 3 }, heldOver: over(4.5) }),
    manager('Fresno, California', 'United States', { receipts: { paid: 0, ready: 1, held: 1 }, heldOver: over(1) }),
    manager('Joliet, Illinois', 'United States', { receipts: { paid: 0, ready: 0, held: 1 }, heldOver: over(2) }),
    manager('El Paso, Texas', 'United States', { receipts: { paid: 0, ready: 0, held: 1 }, heldOver: over(1.5) }),
  ]
  const ALL = Math.round(9 * US_HOUR)
  const six = (): RegionsData => {
    const d = cfo()
    const item: GreetingItem = { kind: 'receipt', count: 6, plant: 'Dayton, Fresno and 2 more sites', plants: ['Dayton', 'Fresno', 'Joliet', 'El Paso'], person: null, supplier: null, says: 'six invoice receipts are held, at Dayton, Fresno and 2 more sites' }
    d.greeting.held = [item, ...d.greeting.held!.slice(1)]
    d.greeting.items = d.greeting.held.map((i) => i.says)
    d.total.receipts = { paid: 0, ready: 2, held: 6 }
    d.total.heldOver = [{ currency: 'USD', minor: ALL }]
    return d
  }

  it('the CFO’s greeting says how many invoice receipts are held, where, the money over the signed hours, and how much of it the site holding the most bills', () => {
    const d = six()
    const sites = { sites: heldBySite(usRows()), inOne: null }
    const line = seatLine(d, 'PROGRAM', { line: 'FINANCE', sites })
    expect(said$(ALL, 'USD')).toBe('$1,080')
    expect(line.says).toBe(
      `Three things need you: six invoice receipts are held at Dayton, Fresno and 2 more sites, ${said$(ALL, 'USD')} over the signed hours, ${said$(Math.round(4.5 * US_HOUR), 'USD')} of it at Dayton; ` +
      'Tom Ash’s start at Dayton waits on an I-9 (proof of right to work); 14 weeks wait to be signed at 9 sites. Orla in Belfast reaches the time limit in 14 days.')
    expect(line.total).toBe(d.greeting.total)
    expect((mapNeeds(d, 'PROGRAM', true, undefined, { line: 'FINANCE', sites }) as { says: string }).says).toBe(line.says)
  })

  it('without the sites read, several held receipts are said with their count and money, and no site is named the largest', () => {
    const says = seatLine(six(), 'PROGRAM', { line: 'FINANCE' }).says
    expect(says).toContain(`six invoice receipts are held at Dayton, Fresno and 2 more sites, ${said$(ALL, 'USD')} over the signed hours; `)
    expect(says).not.toContain('of it at')
  })

  it('a site with two hiring managers is one site: its held receipts and money are added before the largest is chosen', () => {
    const rows = [...usRows(), manager('Fresno, California', 'United States', { managerId: 'm-fresno-2', receipts: { paid: 0, ready: 0, held: 2 }, heldOver: over(4) })]
    const sites = heldBySite(rows)
    expect(sites.map((s) => [s.plant, s.held, s.over[0].minor])).toEqual([
      ['Fresno, California', 3, Math.round(5 * US_HOUR)],
      ['Dayton, Ohio', 3, Math.round(4.5 * US_HOUR)],
      ['Joliet, Illinois', 1, Math.round(2 * US_HOUR)],
      ['El Paso, Texas', 1, Math.round(1.5 * US_HOUR)],
    ])
    expect(largestHeld(sites)!.plant).toBe('Fresno, California')
  })

  const BELFAST = Math.round(1.5 * NI_HOUR)
  const twoCurrencies = () => {
    const d = six()
    d.total.heldOver = [{ currency: 'GBP', minor: BELFAST }, { currency: 'USD', minor: ALL }]
    const belfast = manager('Belfast', 'Northern Ireland', { receipts: { paid: 0, ready: 0, held: 1 }, heldOver: [{ currency: 'GBP', minor: BELFAST }] })
    return { d, sites: heldBySite([...usRows(), belfast]) }
  }

  it('held receipts in two currencies with a rate missing are said in each currency’s own money, and no site is named the largest, because a missing rate is never guessed', () => {
    const { d, sites } = twoCurrencies()
    expect(largestHeld(sites)).toBeNull()
    const says = seatLine(d, 'PROGRAM', { line: 'FINANCE', sites: { sites, inOne: null } }).says
    expect(says).toContain(`, ${said$(BELFAST, 'GBP')} and ${said$(ALL, 'USD')} over the signed hours; `)
    expect(says).not.toMatch(/of it at|the most at/)
  })

  it('held receipts in two currencies with every rate are said as one figure with the rates named, and the site holding the most in its own money', () => {
    const { d, sites } = twoCurrencies()
    // Money's rollup put each site in dollars; Belfast's pounds are worth less than Dayton's dollars.
    for (const s of sites) s.inReporting = { currency: 'USD', minor: s.over[0].currency === 'GBP' ? Math.round(s.over[0].minor * 1.27) : s.over[0].minor }
    const inOne = { total: { currency: 'USD', minor: ALL + Math.round(BELFAST * 1.27) }, sample: true }
    expect(largestHeld(sites)!.plant).toBe('Dayton, Ohio')
    const says = seatLine(d, 'PROGRAM', { line: 'FINANCE', sites: { sites, inOne } }).says
    expect(says).toContain(`six invoice receipts are held at Dayton, Fresno and 2 more sites, about ${said$(inOne.total.minor, 'USD')} over the signed hours at sample rates, the most at Dayton (${said$(Math.round(4.5 * US_HOUR), 'USD')}); `)
    expect(seatLine(d, 'PROGRAM', { line: 'FINANCE', sites: { sites, inOne: { ...inOne, sample: false } } }).says).toContain(' over the signed hours at the rates you set, the most at Dayton')
  })

  it('two sites holding the same money name neither as the largest, because the most would be a guess between them', () => {
    const tie = [
      manager('Dayton, Ohio', 'United States', { receipts: { paid: 0, ready: 0, held: 1 }, heldOver: over(2) }),
      manager('Joliet, Illinois', 'United States', { receipts: { paid: 0, ready: 0, held: 1 }, heldOver: over(2) }),
    ]
    expect(largestHeld(heldBySite(tie))).toBeNull()
  })

  it('several held receipts at one site name the site once and say the money over, never “of it” at the same site', () => {
    const item = { count: 3, says: 'Three invoice receipts are held, at Dayton' }
    const sites = { sites: heldBySite([usRows()[0]]), inOne: null }
    expect(heldPhrase(item, over(4.5), sites)).toBe(`Three invoice receipts are held at Dayton, ${said$(Math.round(4.5 * US_HOUR), 'USD')} over the signed hours`)
  })

  it('what is held and why, and which invoice receipts are held, say the count, the money over and the largest site, with each site a row beside the chat, the largest first', () => {
    const d = six()
    const sites = { sites: heldBySite(usRows()), inOne: null }
    const phrase = `Six invoice receipts are held at Dayton, Fresno and 2 more sites, ${said$(ALL, 'USD')} over the signed hours, ${said$(Math.round(4.5 * US_HOUR), 'USD')} of it at Dayton`
    expect((mapHeld(d, sites) as { says: string }).says).toBe(`${phrase}. Tom Ash’s start at Dayton waits on an I-9 (proof of right to work).`)
    const a = mapHeldReceipts(d, sites) as { kind: string; says: string; table: { head: string[]; rows: { cells: string[] }[] } }
    expect(a.kind).toBe('LIST')
    expect(a.says).toBe(`${phrase}. Two others are ready to pay.`)
    expect(a.table.head).toEqual(['Site', 'Held', 'Over the signed hours'])
    expect(a.table.rows.map((r) => r.cells)).toEqual([
      ['Dayton, Ohio', '3', said$(Math.round(4.5 * US_HOUR), 'USD')],
      ['Joliet, Illinois', '1', said$(Math.round(2 * US_HOUR), 'USD')],
      ['El Paso, Texas', '1', said$(Math.round(1.5 * US_HOUR), 'USD')],
      ['Fresno, California', '1', said$(Math.round(1 * US_HOUR), 'USD')],
    ])
  })

  it('a regional manager’s greeting finds the site holding the most from her own region’s read, with nothing more read', () => {
    const d = six()
    d.reader = { reach: 'REGION', label: 'United States' }
    d.level = 'REGION'
    d.region = { label: 'United States', leads: [], figures: d.total, managers: usRows(), countries: [] }
    expect(seatLine(d, 'REGION').says).toContain(`, ${said$(Math.round(4.5 * US_HOUR), 'USD')} of it at Dayton`)
  })
})

describe('an invoice receipt to pay is a card with a way to pay it', () => {
  const row: QueueItem = {
    type: 'INVOICE_RECEIPT_TO_PAY', title: 'Pay invoice receipt — Pinnacle Resourcing', whose: 'Pinnacle Resourcing',
    subtitle: 'Invoice PR-2026-0441 · $6,000 · due Nov 3', entityId: 'inv1', actionUrl: '/dashboard/invoices/inv1',
  }

  it('a receipt to pay that no Pay card of Etyme’s carries has a Pay button to the receipt’s own page, never a dangling “waits for you to pay it”', () => {
    const [card] = queueCards({ total: 1, items: [row] })
    expect(card.act).toBeNull()
    expect(card.open).toBe('Pay')
    expect(card.href).toBe('/dashboard/invoices/inv1')
    expect(card.fact.endsWith(PAY_OPENS_THE_RECEIPT)).toBe(true)
  })

  it('a receipt row whose twin question is a pay act is drawn once, as the Pay card with its bank reference box, not beside it', () => {
    const pay: WaitingItem = {
      n: 1, approvalId: 'ap1', entryId: 'e1', says: 'Pay it', title: 'PR-2026-0441', ruleCited: '', rationale: '', href: '/dashboard/invoices/inv1',
      action: RECEIPT_PAY, entity: { type: 'Invoice', id: 'inv1' }, pay: { supplier: 'Pinnacle Resourcing', number: 'PR-2026-0441' },
    }
    expect(queueCards({ total: 1, items: [{ ...row, twinApprovalId: 'ap1' }] }, [pay])).toEqual([])
  })
})

describe('a link to a thread opens it, or says why not', () => {
  it('a link to a thread the seat may not open shows the route’s own refusal, never “Select a conversation”', async () => {
    const says = 'That conversation is about a site outside Latin America, and your seat reads Latin America only. Open By region on Today for Latin America.'
    const got = await openThread('t1', async () => new Response(JSON.stringify({ error: { code: 'OUT_OF_REGION', message: says } }), { status: 403 }))
    expect(got).toEqual({ ok: false, says })
  })

  it('a link to a thread the seat may open returns the thread', async () => {
    const got = await openThread('t1', async () => new Response(JSON.stringify({ data: { thread: { id: 't1', title: 'Hi' } } }), { status: 200 }))
    expect(got).toEqual({ ok: true, thread: { id: 't1', title: 'Hi' } })
  })
})
