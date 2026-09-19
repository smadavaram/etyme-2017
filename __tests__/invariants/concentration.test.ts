/**
 * One client, one supplier, one person.
 *
 * The two failures these tests exist to prevent, in order of how badly
 * each one misleads:
 *
 *   A firm with two clients being told it has a dangerous seventy per
 *   cent concentration. It has a small book, and every firm's first
 *   client is a hundred per cent of the revenue.
 *
 *   A firm with two thirds of its revenue from one client seeing a
 *   percentage and no name against it. A figure nobody owns does not get
 *   acted on.
 */

import { describe, it, expect } from 'vitest'
import {
  concentration,
  concentrationReport,
  clientExposures,
  THRESHOLDS,
  ENOUGH_TO_CONCENTRATE,
  type BilledRow,
  type Exposure,
} from '@/lib/concentration'

const money = (rows: [string, number][]): Exposure[] =>
  rows.map(([name, amount], i) => ({ id: `e${i}`, name, amountMinor: amount, currency: 'USD' }))

describe('Too small to concentrate is a different answer from safe', () => {

  it('two clients is a small book, not a concentration, and no share is reported', () => {
    const c = concentration({
      dimension: 'CLIENT',
      unit: 'MONEY',
      exposures: money([['Talvern Medical', 700_000_00], ['Northbend Athletic', 300_000_00]]),
    })
    expect(c.topSharePct).toBeNull()
    expect(c.says).toContain('small book')
    expect(c.counted).toBe(2)
    expect(c.unknowns[0]).toContain(`Below ${ENOUGH_TO_CONCENTRATE.CLIENT}`)
  })

  it('five people splitting the billing evenly is not a concentration', () => {
    const c = concentration({
      dimension: 'PERSON',
      unit: 'MONEY',
      exposures: money([
        ['Ana', 20_000_00], ['Ben', 20_000_00], ['Cara', 20_000_00],
        ['Dev', 20_000_00], ['Eli', 20_000_00],
      ]),
    })
    expect(c.topSharePct).toBe(20)
    expect(c.breach).toBeNull()
  })

  it('nothing billed at all reports no share rather than a zero', () => {
    const c = concentration({ dimension: 'CLIENT', unit: 'MONEY', exposures: [] })
    expect(c.topSharePct).toBeNull()
    expect(c.says).toContain('no share to take')
    expect(c.says).toContain('zero here would read as safety')
  })

  it('a zero exposure is dropped rather than counted as a party', () => {
    const c = concentration({
      dimension: 'CLIENT',
      unit: 'MONEY',
      exposures: money([
        ['Talvern Medical', 50_000_00], ['Northbend Athletic', 30_000_00],
        ['Baxter', 20_000_00], ['Dormant Co', 0],
      ]),
    })
    expect(c.counted).toBe(3)
    expect(c.ignored).toBe(1)
    expect(c.topSharePct).toBe(50)
    expect(c.unknowns.join(' ')).toContain('nothing on them')
  })

  it('a share cannot be totaled across two currencies, so none is shown', () => {
    const c = concentration({
      dimension: 'CLIENT',
      unit: 'MONEY',
      exposures: [
        { id: '1', name: 'Talvern Medical', amountMinor: 500_000_00, currency: 'USD' },
        { id: '2', name: 'Siemens Healthineers', amountMinor: 300_000_00, currency: 'EUR' },
        { id: '3', name: 'Northbend Athletic', amountMinor: 200_000_00, currency: 'USD' },
      ],
    })
    expect(c.topSharePct).toBeNull()
    expect(c.says).toContain('neither')
  })
})

describe('The share that decides whether one phone call closes the firm', () => {

  it('one client above forty per cent of revenue owns the firm’s fate and is named', () => {
    const c = concentration({
      dimension: 'CLIENT',
      unit: 'MONEY',
      exposures: money([
        ['Talvern Medical', 500_000_00], ['Northbend Athletic', 200_000_00],
        ['Baxter', 200_000_00], ['Kaiser', 100_000_00],
      ]),
    })
    expect(c.topSharePct).toBe(50)
    expect(c.topName).toBe('Talvern Medical')
    expect(c.breach?.severity).toBe('WARN')
    expect(c.breach?.atOrAbovePct).toBe(40)
    expect(c.breach?.meaning).toContain('owns the firm')
  })

  it('a client at a quarter of revenue is a note rather than a warning', () => {
    const c = concentration({
      dimension: 'CLIENT',
      unit: 'MONEY',
      exposures: money([
        ['Talvern Medical', 300_000_00], ['Northbend Athletic', 250_000_00],
        ['Baxter', 250_000_00], ['Kaiser', 200_000_00],
      ]),
    })
    expect(c.topSharePct).toBe(30)
    expect(c.breach?.severity).toBe('NOTE')
  })

  it('half the supply through one vendor makes their bad quarter our delivery failure', () => {
    const c = concentration({
      dimension: 'SUPPLIER',
      unit: 'MONEY',
      exposures: money([
        ['Meridian Clinical', 550_000_00], ['Cadence Labs', 200_000_00],
        ['Northwind', 150_000_00], ['Oakline', 100_000_00],
      ]),
    })
    expect(c.topSharePct).toBe(55)
    expect(c.breach?.severity).toBe('WARN')
    expect(c.breach?.meaning).toContain('delivery failure')
  })

  it('one person carrying a third of the billing is a warning', () => {
    const c = concentration({
      dimension: 'PERSON',
      unit: 'MONEY',
      exposures: money([
        ['Ana Suárez', 40_000_00], ['Ben Okafor', 20_000_00], ['Cara Lin', 20_000_00],
        ['Dev Patel', 10_000_00], ['Eli Ross', 10_000_00],
      ]),
    })
    expect(c.topSharePct).toBe(40)
    expect(c.breach?.severity).toBe('WARN')
    expect(c.breach?.meaning).toContain('revenue event')
  })

  it('the top three are reported beside the top one', () => {
    const c = concentration({
      dimension: 'CLIENT',
      unit: 'MONEY',
      exposures: money([
        ['Talvern Medical', 400_000_00], ['Northbend Athletic', 300_000_00],
        ['Baxter', 200_000_00], ['Kaiser', 100_000_00],
      ]),
    })
    expect(c.topThreeSharePct).toBe(90)
    expect(c.says).toContain('largest three together are 90%')
  })

  it('concentration measured on people supplied says so rather than implying money', () => {
    const c = concentration({
      dimension: 'SUPPLIER',
      unit: 'PEOPLE',
      exposures: [
        { id: '1', name: 'Meridian Clinical', amountMinor: 12 },
        { id: '2', name: 'Cadence Labs', amountMinor: 4 },
        { id: '3', name: 'Northwind', amountMinor: 4 },
      ],
    })
    expect(c.unit).toBe('PEOPLE')
    expect(c.currency).toBeNull()
    expect(c.says).toContain('people supplied')
    expect(c.topSharePct).toBe(60)
  })
})

describe('A breach with nobody against it does not get acted on', () => {

  it('every breach names the role that has to act on it', () => {
    const c = concentration({
      dimension: 'CLIENT',
      unit: 'MONEY',
      exposures: money([
        ['Talvern Medical', 500_000_00], ['Northbend Athletic', 200_000_00],
        ['Baxter', 200_000_00], ['Kaiser', 100_000_00],
      ]),
    })
    expect(c.breach?.ownerRole).toBe('Controller')
    expect(c.breach?.ownerName).toBeNull()
    expect(c.breach?.says).toContain('Nobody is named')
  })

  it('a named owner is carried onto the breach instead of the bare role', () => {
    const c = concentration({
      dimension: 'CLIENT',
      unit: 'MONEY',
      exposures: money([
        ['Talvern Medical', 500_000_00], ['Northbend Athletic', 200_000_00],
        ['Baxter', 200_000_00], ['Kaiser', 100_000_00],
      ]),
      owners: { CLIENT: { name: 'Dana Whitfield', role: 'Managing Director' } },
    })
    expect(c.breach?.ownerName).toBe('Dana Whitfield')
    expect(c.breach?.says).toContain('Dana Whitfield')
  })

  it('thresholds carry their meaning in plain English, not just a number', () => {
    expect(THRESHOLDS.length).toBeGreaterThan(0)
    for (const t of THRESHOLDS) {
      expect(t.meaning.length, `${t.dimension} ${t.atOrAbovePct}`).toBeGreaterThan(60)
      expect(t.owner.length, `${t.dimension} ${t.atOrAbovePct}`).toBeGreaterThan(0)
    }
  })
})

describe('The three dimensions together, worst first', () => {

  it('the report puts the worst dimension first and says which it is', () => {
    const client = concentration({
      dimension: 'CLIENT',
      unit: 'MONEY',
      exposures: money([
        ['Talvern Medical', 500_000_00], ['Northbend Athletic', 200_000_00],
        ['Baxter', 200_000_00], ['Kaiser', 100_000_00],
      ]),
    })
    const supplier = concentration({
      dimension: 'SUPPLIER',
      unit: 'MONEY',
      exposures: money([
        ['Meridian Clinical', 320_000_00], ['Cadence Labs', 340_000_00],
        ['Northwind', 340_000_00],
      ]),
    })
    const person = concentration({ dimension: 'PERSON', unit: 'MONEY', exposures: [] })

    const report = concentrationReport([person, supplier, client])
    expect(report.worst?.dimension).toBe('CLIENT')
    expect(report.parts[0].dimension).toBe('CLIENT')
    expect(report.warnings).toBe(1)
    expect(report.notes).toBe(1)
    expect(report.silent).toBe(1)
    expect(report.blocks).toBe(false)
    expect(report.says).toContain('Talvern Medical')
  })

  it('a book too small to measure anywhere says that, rather than showing three clean ticks', () => {
    const report = concentrationReport([
      concentration({ dimension: 'CLIENT', unit: 'MONEY', exposures: [] }),
      concentration({ dimension: 'SUPPLIER', unit: 'MONEY', exposures: [] }),
      concentration({ dimension: 'PERSON', unit: 'MONEY', exposures: [] }),
    ])
    expect(report.worst).toBeNull()
    expect(report.says).toContain('small book rather than a safe one')
  })
})

/**
 * Whose invoice it is, when there is no agreement.
 *
 * `Engagement.msaId` went optional on 2026-09-18. Before these tests the
 * client share of a book was rolled up through the agreement alone, and
 * a relation filter on a null relation matches nothing — so an invoice
 * sold on a purchase order with no agreement behind it was not a smaller
 * share, it was no share at all. The figure on the screen stayed
 * perfectly plausible while the book underneath it shrank.
 *
 * The other half of the same failure is the tempting fix: attributing
 * the invoice to whichever client happened to be loaded first, so the
 * total comes out right and one named firm is accused of somebody
 * else's revenue.
 */
describe('An invoice with no agreement behind it still belongs to somebody', () => {

  const billed = (row: Partial<BilledRow>): BilledRow => ({
    amountMinor: 100_000_00,
    currency: 'USD',
    ...row,
  })

  const agreement = (clientId: string, name: string) => ({
    vendorId: 'us',
    clientId,
    client: { id: clientId, name },
  })

  const order = (clientId: string, name: string) => ({
    issuedById: clientId,
    issuedToId: 'us',
    issuedBy: { id: clientId, name },
    issuedTo: { id: 'us', name: 'Auralis Software' },
  })

  const line = (clientId: string, name: string) => ({
    companyId: 'us',
    clientCompanyId: clientId,
    clientCompany: { id: clientId, name },
  })

  it('an invoice billed under an agreement counts toward the client who signed it', () => {
    const out = clientExposures([billed({ agreement: agreement('c1', 'Northbend Athletic') })])
    expect(out.exposures).toHaveLength(1)
    expect(out.exposures[0]).toMatchObject({ id: 'c1', name: 'Northbend Athletic', amountMinor: 100_000_00 })
    expect(out.unattributed).toBe(0)
  })

  it('an invoice sold on an order with no agreement behind it still counts toward its client', () => {
    const out = clientExposures([billed({ order: order('c2', 'Cavanaugh Glassworks') })])
    expect(out.exposures).toHaveLength(1)
    expect(out.exposures[0]).toMatchObject({ id: 'c2', name: 'Cavanaugh Glassworks' })
    expect(out.unattributed).toBe(0)
    expect(out.says).toBeNull()
  })

  it('an invoice with neither an agreement nor an order is attributed from the lines billed on it', () => {
    const out = clientExposures([billed({ lines: [line('c3', 'Talvern Medical')] })])
    expect(out.exposures[0]).toMatchObject({ id: 'c3', name: 'Talvern Medical' })
    expect(out.unattributed).toBe(0)
  })

  it('one client reached through three different documents is one row, not three', () => {
    const out = clientExposures([
      billed({ agreement: agreement('c1', 'Northbend Athletic'), amountMinor: 10_000_00 }),
      billed({ order: order('c1', 'Northbend Athletic'), amountMinor: 20_000_00 }),
      billed({ lines: [line('c1', 'Northbend Athletic')], amountMinor: 30_000_00 }),
    ])
    expect(out.exposures).toHaveLength(1)
    expect(out.exposures[0].amountMinor).toBe(60_000_00)
  })

  it('an invoice nobody can attribute is left out and counted, never added to the first client loaded', () => {
    const out = clientExposures([
      billed({ agreement: agreement('c1', 'Northbend Athletic'), amountMinor: 40_000_00 }),
      billed({ amountMinor: 900_000_00 }),
    ])
    expect(out.exposures).toHaveLength(1)
    expect(out.exposures[0].amountMinor).toBe(40_000_00)
    expect(out.unattributed).toBe(1)
    expect(out.unattributedMinor).toBe(900_000_00)
  })

  it('the sentence about what was dropped says what is missing and what was done with it', () => {
    const out = clientExposures([billed({ amountMinor: 12_345_00 })])
    expect(out.says).toContain('1 invoice')
    expect(out.says).toContain('$12,345')
    expect(out.says).toContain('no agreement, no order and no line')
    expect(out.says).toContain('left out of the shares above')
  })

  it('nothing dropped says nothing at all, rather than a reassuring note about zero', () => {
    const out = clientExposures([billed({ agreement: agreement('c1', 'Northbend Athletic') })])
    expect(out.says).toBeNull()
    expect(out.unattributedMinor).toBeNull()
  })

  it('two currencies in the unattributed gap are reported as a count with no total', () => {
    const out = clientExposures([
      billed({ amountMinor: 10_000_00, currency: 'USD' }),
      billed({ amountMinor: 20_000_00, currency: 'EUR' }),
    ])
    expect(out.unattributed).toBe(2)
    expect(out.unattributedMinor).toBeNull()
    expect(out.says).toContain('2 invoices')
    expect(out.says).not.toContain('in all')
  })

  it('one client billed in two currencies is kept apart rather than added into one total', () => {
    const out = clientExposures([
      billed({ agreement: agreement('c1', 'Northbend Athletic'), amountMinor: 10_000_00, currency: 'USD' }),
      billed({ agreement: agreement('c1', 'Northbend Athletic'), amountMinor: 20_000_00, currency: 'EUR' }),
    ])
    expect(out.exposures).toHaveLength(2)
    expect(out.exposures.map((e) => e.currency).sort()).toEqual(['EUR', 'USD'])
    const shape = concentration({ dimension: 'CLIENT', unit: 'MONEY', exposures: out.exposures })
    expect(shape.totalMinor).toBeNull()
    expect(shape.says).toContain('cannot be added across them')
  })

  it('a name loaded on one invoice is kept when another for the same client carries none', () => {
    const out = clientExposures([
      billed({ order: { issuedById: 'c4', issuedToId: 'us' }, amountMinor: 5_000_00 }),
      billed({ agreement: agreement('c4', 'Veritan Talent'), amountMinor: 5_000_00 }),
    ])
    expect(out.exposures).toHaveLength(1)
    expect(out.exposures[0].name).toBe('Veritan Talent')
  })

  it('an invoice whose lines name two different customers is attributed to neither', () => {
    const out = clientExposures([
      billed({ lines: [line('c1', 'Northbend Athletic'), line('c2', 'Cavanaugh Glassworks')] }),
    ])
    expect(out.exposures).toHaveLength(0)
    expect(out.unattributed).toBe(1)
  })

  it('a book attributed through orders alone still reads as a concentration', () => {
    const out = clientExposures([
      billed({ order: order('c1', 'Northbend Athletic'), amountMinor: 700_000_00 }),
      billed({ order: order('c2', 'Cavanaugh Glassworks'), amountMinor: 200_000_00 }),
      billed({ order: order('c3', 'Talvern Medical'), amountMinor: 100_000_00 }),
    ])
    const shape = concentration({ dimension: 'CLIENT', unit: 'MONEY', exposures: out.exposures })
    expect(shape.topName).toBe('Northbend Athletic')
    expect(shape.topSharePct).toBe(70)
    expect(shape.breach?.severity).toBe('WARN')
  })
})
