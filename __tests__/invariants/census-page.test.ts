import { describe, it, expect } from 'vitest'
import {
  contractorsToday,
  spendThisQuarter,
  rateSpread,
  longestOnSite,
  quarterBounds,
  renderCensusPage,
  type Placement,
} from '@/lib/census-page'
import { daysOnSite } from '@/lib/tenure-days'

/**
 * The one page, and the four numbers on it.
 *
 * Every sentence here is about a number a CFO would act on. The rule
 * underneath all of them: refuse rather than fabricate. Where the
 * client's file does not support a figure, the figure is blank and the
 * page says why — because a plausible wrong number on a finance desk is
 * worse than a blank, and nobody audits good news.
 */

const NOW = new Date('2026-09-20T00:00:00Z')
const d = (iso: string) => new Date(`${iso}T00:00:00Z`)

let seq = 0
function placement(p: Partial<Placement> = {}): Placement {
  seq++
  return {
    id: `c${seq}`,
    personId: `p${seq}`,
    personName: `C-${1000 + seq}`,
    companyId: 'veritan',
    clientCompanyId: 'sandbox',
    supplier: 'Veritan Talent',
    role: 'Validation Engineer',
    rateMinor: 9000,
    currency: 'USD',
    hoursPerWeek: 40,
    startDate: d('2026-01-05'),
    endDate: d('2026-12-31'),
    state: 'IN_PROGRESS',
    ...p,
  }
}

describe('Contractors on your sites today', () => {

  it('counts the people who are on site now, and says which supplier each came through', () => {
    const out = contractorsToday([
      placement({ companyId: 'veritan', supplier: 'Veritan Talent' }),
      placement({ companyId: 'veritan', supplier: 'Veritan Talent' }),
      placement({ companyId: 'auralis', supplier: 'Auralis Software' }),
      placement({ state: 'ENDED' }),
    ])
    expect(out.total).toBe(3)
    expect(out.bySupplier).toEqual([
      { companyId: 'veritan', name: 'Veritan Talent', contractors: 2 },
      { companyId: 'auralis', name: 'Auralis Software', contractors: 1 },
    ])
  })

  it('a person bought through two firms in a chain is one contractor, not one per firm', () => {
    // The prime bills the client; the bench vendor bills the prime. Two
    // rungs, one person, one desk they stand at.
    const rungs: Placement[] = [
      placement({ id: 'top', personId: 'same', companyId: 'prime', supplier: 'Auralis Software', clientCompanyId: 'sandbox' }),
      placement({ id: 'below', personId: 'same', companyId: 'bench', supplier: 'Veritan Talent', clientCompanyId: 'prime' }),
    ]
    const out = contractorsToday(rungs)
    expect(out.total).toBe(1)
    expect(out.bySupplier.map((s) => s.name)).toEqual(['Auralis Software'])
  })

  it('somebody who has not started yet is not on site today', () => {
    expect(contractorsToday([placement({ state: 'DRAFT', startDate: d('2026-12-01') })]).total).toBe(0)
  })
})

describe('Spend this quarter', () => {

  it('prices the quarter at the rate and the hours a week the client sent, in minor units', () => {
    const out = spendThisQuarter([
      placement({ rateMinor: 10_000, hoursPerWeek: 40, startDate: d('2026-01-05'), endDate: d('2026-12-31') }),
    ], NOW)

    const { from, to } = quarterBounds(NOW)
    const days = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1
    expect(out.totalMinor).toBe(Math.round(10_000 * 40 * (days / 7)))
    expect(out.currency).toBe('USD')
    expect(out.why).toBeNull()
  })

  it('a quarter is blank when one placement in it has no rate, and says how many rows and why', () => {
    const out = spendThisQuarter([
      placement({ rateMinor: 10_000 }),
      placement({ rateMinor: null }),
    ], NOW)

    expect(out.totalMinor).toBeNull()
    expect(out.priced).toBe(1)
    expect(out.of).toBe(2)
    expect(out.why).toContain('1 of 2 placements')
    expect(out.why).toContain('no rate or no hours')
  })

  it('a placement with no hours a week blanks the quarter too, because nothing here assumes forty', () => {
    const out = spendThisQuarter([placement({ hoursPerWeek: null })], NOW)
    expect(out.totalMinor).toBeNull()
    expect(out.bySupplier[0].minor).toBeNull()
    expect(out.bySupplier[0].why).toContain('no hours a week')
  })

  it('a supplier whose placements are all priced still shows their own figure beside the blank total', () => {
    const out = spendThisQuarter([
      placement({ companyId: 'veritan', supplier: 'Veritan Talent' }),
      placement({ companyId: 'auralis', supplier: 'Auralis Software', rateMinor: null }),
    ], NOW)

    expect(out.totalMinor).toBeNull()
    expect(out.bySupplier.find((s) => s.name === 'Veritan Talent')!.minor).toBeGreaterThan(0)
    expect(out.bySupplier.find((s) => s.name === 'Auralis Software')!.minor).toBeNull()
  })

  it('each supplier carries their share of the total, and nobody has a share of a total that does not exist', () => {
    const out = spendThisQuarter([
      placement({ companyId: 'veritan', supplier: 'Veritan Talent', rateMinor: 10_000 }),
      placement({ companyId: 'auralis', supplier: 'Auralis Software', rateMinor: 30_000 }),
    ], NOW)

    expect(out.totalMinor).not.toBeNull()
    const shares = out.bySupplier.map((s) => s.shareBps)
    expect(shares).toEqual([7500, 2500])

    const blanked = spendThisQuarter([placement({ rateMinor: null })], NOW)
    expect(blanked.bySupplier.every((s) => s.shareBps === null)).toBe(true)
  })

  it('rupees and dollars are never added, so a book priced in two currencies has no total', () => {
    const out = spendThisQuarter([
      placement({ currency: 'USD', rateMinor: 10_000 }),
      placement({ companyId: 'other', supplier: 'Another firm', currency: 'INR', rateMinor: 400_000 }),
    ], NOW)
    expect(out.totalMinor).toBeNull()
    expect(out.why).toContain('more than one currency')
  })

  it('a placement that ended before the quarter began is not in the quarter at all', () => {
    const out = spendThisQuarter([
      placement({ startDate: d('2024-01-01'), endDate: d('2024-06-30'), state: 'ENDED' }),
    ], NOW)
    expect(out.of).toBe(0)
    expect(out.totalMinor).toBe(0)
  })

  it('a placement with no end date is priced only to today, never into next year', () => {
    const open = spendThisQuarter([placement({ endDate: null })], NOW)
    const closed = spendThisQuarter([placement({ endDate: d('2026-12-31') })], NOW)
    expect(open.totalMinor).toBe(closed.totalMinor)
  })
})

describe('Same skill, different price', () => {

  it('two suppliers for one role show the lowest, the highest and the gap', () => {
    const out = rateSpread([
      placement({ role: 'Validation Engineer', companyId: 'veritan', supplier: 'Veritan Talent', rateMinor: 8_500 }),
      placement({ role: 'Validation Engineer', companyId: 'auralis', supplier: 'Auralis Software', rateMinor: 11_200 }),
    ], NOW)

    expect(out.roles).toHaveLength(1)
    expect(out.roles[0]).toMatchObject({
      role: 'Validation Engineer',
      lowMinor: 8_500,
      highMinor: 11_200,
      gapMinor: 2_700,
      lowSupplier: 'Veritan Talent',
      highSupplier: 'Auralis Software',
      suppliers: 2,
    })
  })

  it('a role one supplier fills shows no spread and says so', () => {
    const out = rateSpread([
      placement({ role: 'Nurse', companyId: 'veritan', supplier: 'Veritan Talent', rateMinor: 8_500 }),
      placement({ role: 'Nurse', companyId: 'veritan', supplier: 'Veritan Talent', rateMinor: 9_500 }),
    ], NOW)

    expect(out.roles).toEqual([])
    expect(out.oneSupplierOnly).toHaveLength(1)
    expect(out.oneSupplierOnly[0]).toContain('only Veritan Talent fills it')
  })

  it('a second supplier who sent no rate cannot be compared, and the page says which firm that was', () => {
    const out = rateSpread([
      placement({ role: 'Nurse', companyId: 'veritan', supplier: 'Veritan Talent', rateMinor: 8_500 }),
      placement({ role: 'Nurse', companyId: 'auralis', supplier: 'Auralis Software', rateMinor: null }),
    ], NOW)

    expect(out.roles).toEqual([])
    expect(out.oneSupplierOnly[0]).toContain('Auralis Software')
    expect(out.oneSupplierOnly[0]).toContain('nothing to compare')
  })

  it('where a third supplier sent no rate, the gap that is shown is marked as the smallest it could be', () => {
    const out = rateSpread([
      placement({ role: 'Nurse', companyId: 'veritan', supplier: 'Veritan Talent', rateMinor: 8_500 }),
      placement({ role: 'Nurse', companyId: 'auralis', supplier: 'Auralis Software', rateMinor: 11_000 }),
      placement({ role: 'Nurse', companyId: 'maren', supplier: 'Maren MSP', rateMinor: null }),
    ], NOW)

    expect(out.roles[0].caveat).toContain('Maren MSP')
    expect(out.roles[0].caveat).toContain('can only be wider')
  })

  it('one role priced in two currencies is never compared, and the refusal says why', () => {
    const out = rateSpread([
      placement({ role: 'Nurse', companyId: 'veritan', supplier: 'Veritan Talent', rateMinor: 8_500, currency: 'USD' }),
      placement({ role: 'Nurse', companyId: 'other', supplier: 'Another firm', rateMinor: 700_000, currency: 'INR' }),
    ], NOW)

    expect(out.roles).toEqual([])
    expect(out.refused[0].why).toContain('converts one currency')
  })

  it('a placement with no role named is not compared with anybody, because there is no skill to match on', () => {
    const out = rateSpread([
      placement({ role: null, companyId: 'veritan', supplier: 'Veritan Talent' }),
      placement({ role: null, companyId: 'auralis', supplier: 'Auralis Software' }),
    ], NOW)
    expect(out.roles).toEqual([])
    expect(out.oneSupplierOnly).toEqual([])
  })
})

describe('Longest on your sites', () => {

  it('the tenure count uses the union of periods, not their sum', () => {
    // Two suppliers, the same person, the same overlapping year. Summed
    // it is two years of exposure; it is one.
    const overlapping: Placement[] = [
      placement({ personId: 'same', personName: 'C-7', companyId: 'veritan', supplier: 'Veritan Talent', startDate: d('2025-01-01'), endDate: d('2025-12-31'), state: 'ENDED' }),
      placement({ personId: 'same', personName: 'C-7', companyId: 'auralis', supplier: 'Auralis Software', startDate: d('2025-03-01'), endDate: d('2025-12-31'), state: 'ENDED' }),
    ]
    const out = longestOnSite(overlapping, NOW, null)

    expect(out.top).toHaveLength(1)
    expect(out.top[0].days).toBe(daysOnSite(overlapping, NOW))
    expect(out.top[0].days).toBeLessThan(400)
    expect(out.top[0].suppliers).toEqual(['Auralis Software', 'Veritan Talent'])
  })

  it('a person is counted for days served, never for days a contract has booked ahead', () => {
    const out = longestOnSite([
      placement({ personId: 'one', startDate: d('2026-09-01'), endDate: d('2027-09-01') }),
    ], NOW, null)
    expect(out.top[0].days).toBeLessThan(30)
  })

  it('the five longest are named by their own reference number and never by a person', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      placement({ personId: `p${i}`, personName: `C-${100 + i}`, startDate: d('2020-01-01'), endDate: d('2026-01-01'), state: 'ENDED' })
    )
    const out = longestOnSite(many, NOW, null)
    expect(out.top).toHaveLength(5)
    for (const p of out.top) expect(p.reference).toMatch(/^C-\d+$/)
  })

  it('how many are past twelve months and past eighteen counts everybody, not only the five shown', () => {
    const out = longestOnSite([
      ...Array.from({ length: 7 }, (_, i) => placement({ personId: `long${i}`, startDate: d('2024-01-01'), endDate: null })),
      placement({ personId: 'short', startDate: d('2026-09-01'), endDate: null }),
    ], NOW, null)

    expect(out.top).toHaveLength(5)
    expect(out.past12).toBe(7)
    expect(out.past18).toBe(7)
  })

  it('where the client has set no tenure limit, nobody is reported past one', () => {
    const out = longestOnSite([placement({ startDate: d('2020-01-01'), endDate: null })], NOW, null)
    expect(out.capMonths).toBeNull()
    expect(out.pastCap).toBeNull()
  })

  it('where the client has set a limit, the page says how many are past it', () => {
    const out = longestOnSite([
      placement({ personId: 'a', startDate: d('2020-01-01'), endDate: null }),
      placement({ personId: 'b', startDate: d('2026-08-01'), endDate: null }),
    ], NOW, 18)
    expect(out.pastCap).toBe(1)
  })
})

describe('The one page says everything it computed, and everything it could not', () => {

  const numbers = {
    contractorsToday: contractorsToday([
      placement({ companyId: 'veritan', supplier: 'Veritan Talent' }),
      placement({ companyId: 'auralis', supplier: 'Auralis Software', rateMinor: 12_000 }),
    ]),
    spendThisQuarter: spendThisQuarter([
      placement({ companyId: 'veritan', supplier: 'Veritan Talent' }),
      placement({ companyId: 'auralis', supplier: 'Auralis Software', rateMinor: 12_000 }),
    ], NOW),
    rateSpread: rateSpread([
      placement({ role: 'Validation Engineer', companyId: 'veritan', supplier: 'Veritan Talent', rateMinor: 8_500 }),
      placement({ role: 'Validation Engineer', companyId: 'auralis', supplier: 'Auralis Software', rateMinor: 11_200 }),
    ], NOW),
    longestOnSite: longestOnSite([placement({ startDate: d('2024-01-01'), endDate: null })], NOW, null),
  }

  const subject = {
    companyName: 'Northbend Athletic',
    contactName: 'Dana Whitlock',
    deleteBy: d('2026-10-20'),
    staff: 'census@etyme.invalid',
    sandboxSlug: 'census-abc',
  }

  it('the page is addressed to the contact by name, at their own company', () => {
    const html = renderCensusPage({ subject, numbers, gaps: [], now: NOW })
    expect(html).toContain('Dana Whitlock')
    expect(html).toContain('Northbend Athletic')
  })

  it('every row’s gaps are on the page, and a clean file says so out loud', () => {
    const clean = renderCensusPage({ subject, numbers, gaps: [], now: NOW })
    expect(clean).toContain('Every row was complete')

    const messy = renderCensusPage({
      subject, numbers, now: NOW,
      gaps: [
        { line: 4, reference: 'C-14', kind: 'NO_END_DATE', stopsTheRow: false, says: 'Line 4 has no end date (C-14).' },
        { line: 9, reference: 'C-19', kind: 'NO_RATE', stopsTheRow: false, says: 'Line 9 has no bill rate (C-19).' },
      ],
    })
    expect(messy).toContain('Line 4 has no end date (C-14).')
    expect(messy).toContain('Line 9 has no bill rate (C-19).')
    expect(messy).not.toContain('Every row was complete')
  })

  it('the six sections are on the sheet, in the order the brief sets them', () => {
    const html = renderCensusPage({ subject, numbers, gaps: [], now: NOW })
    const order = [
      'Contractors on your sites today',
      'Spend this quarter',
      'Same skill, different price',
      'Longest on your sites',
      'What we could not see',
      'How this was computed',
    ]
    const at = order.map((t) => html.indexOf(t))
    expect(at.every((i) => i > -1)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })

  it('the page says the day the data is deleted, from the one column everything else reads', () => {
    const html = renderCensusPage({ subject, numbers, gaps: [], now: NOW })
    expect(html).toContain('October 20, 2026')
    expect(html).toContain('unless you start a program')
  })

  it('the page says the spend is the client’s own hours and not a 160-hour assumption', () => {
    const html = renderCensusPage({ subject, numbers, gaps: [], now: NOW })
    expect(html).toContain('At the hours a week you sent')
    expect(html).toContain('not a 160-hour assumption')
  })

  it('a blank number reads as "Not stated" and never as a zero', () => {
    const blanked = {
      ...numbers,
      spendThisQuarter: spendThisQuarter([placement({ rateMinor: null })], NOW),
    }
    const html = renderCensusPage({ subject, numbers: blanked, gaps: [], now: NOW })
    expect(html).toContain('Not stated')
    expect(html).not.toContain('<div class="hero">$0.00</div>')
  })

  it('the page carries no chart, because eight suppliers of one contractor each is a list', () => {
    const html = renderCensusPage({ subject, numbers, gaps: [], now: NOW })
    expect(html).not.toMatch(/<svg|<canvas|recharts|chart/i)
  })

  it('the page prints on one sheet, in the brand’s own colors and with tabular figures', () => {
    const html = renderCensusPage({ subject, numbers, gaps: [], now: NOW })
    expect(html).toContain('@media print')
    expect(html).toContain('@page { size: letter')
    expect(html).toContain('tabular-nums')
    expect(html).toContain('#2B47E5')
    expect(html).toContain('Iowan Old Style')
  })

  it('a client name with an ampersand in it lands on the page as text and never as markup', () => {
    const html = renderCensusPage({
      subject: { ...subject, companyName: 'Marsh & Coe <Holdings>' }, numbers, gaps: [], now: NOW,
    })
    expect(html).toContain('Marsh &amp; Coe &lt;Holdings&gt;')
    expect(html).not.toContain('<Holdings>')
  })
})
