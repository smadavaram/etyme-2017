/**
 * The live figures on the suppliers' and integrators' doors, read off the
 * seeded world in Postgres.
 *
 * The walk of 2026-11-22 read an invoice of $4,480 beside "$118 an hour"
 * on the sub-vendors' page. Both were the seed's: the invoice bills
 * another person's line, at $112. The unit suite hands the map an invoice
 * it made up, so nothing read the seeded invoice against the words drawn
 * beside it. This file does.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, freshWorld } from './harness'
import { doorFacts } from '@/lib/public-site/door-map-facts'
import { tecwynMap, tellisfordMap } from '@/lib/public-site/door-maps'
import { BILLS_FROM_BELOW } from '@/lib/public-site/door-map-seed'

beforeAll(async () => { await freshWorld() }, 600_000)

const dollars = (cents: number) => `$${(cents / 100).toLocaleString('en-US')}`

describe('an invoice on a public door says what the seeded record says', () => {
  it('the invoice on the sub-vendors’ page says whose hours it bills and at what rate, and the hours times that rate are its total', async () => {
    const facts = await doorFacts('suppliers', undefined, 30_000)
    const r = facts.receipt!
    expect(r, 'the seeded invoice was read').toBeTruthy()
    // The record itself: the invoice, its line, the one person on it and her rate.
    const bill = await prisma.vendorBill.findFirstOrThrow({
      where: { number: BILLS_FROM_BELOW.tecwyn.number },
      select: { totalCents: true, buyContract: { select: { candidates: { select: { payRate: true, person: { select: { name: true } } } } } } },
    })
    const line = bill.buyContract!.candidates
    expect(line).toHaveLength(1)
    expect(r.totalMinor).toBe(bill.totalCents)
    expect(r.billsFor).toEqual({ person: line[0].person.name, hours: bill.totalCents / line[0].payRate, rateMinor: line[0].payRate })
    expect(r.billsFor!.hours * r.billsFor!.rateMinor).toBe(r.totalMinor)

    const owner = tecwynMap(facts).views.find((v) => v.key === 'owner')!
    const stat = owner.stats.find((s) => s.label === 'Your invoice')!
    expect(stat.value).toBe(dollars(bill.totalCents))
    expect(stat.sub).toContain(`${line[0].person.name}, ${r.billsFor!.hours} hours at ${dollars(line[0].payRate)}`)
    expect(owner.headline).toContain(`It bills ${line[0].person.name} for ${r.billsFor!.hours} hours at ${dollars(line[0].payRate)}.`)
    // Every dollar figure in the invoice's own words is the invoice's: its total and its rate, and no other line's.
    const said = `${stat.value} ${stat.sub}`.match(/\$\d+(?:,\d{3})*/g)
    expect(said).toEqual([dollars(bill.totalCents), dollars(line[0].payRate)])
  })

  it('the invoice receipt on the integrators’ page says the same of the invoice from its bench supplier', async () => {
    const facts = await doorFacts('integrators', undefined, 30_000)
    const r = facts.receipt!
    expect(r, 'the seeded invoice was read').toBeTruthy()
    expect(r.billsFor).not.toBeNull()
    expect(r.billsFor!.hours * r.billsFor!.rateMinor).toBe(r.totalMinor)
    const stat = tellisfordMap(facts).views.flatMap((v) => v.stats).find((s) => s.label === 'Invoice receipt')!
    expect(stat.sub).toContain(`${r.billsFor!.person}, ${r.billsFor!.hours} hours at ${dollars(r.billsFor!.rateMinor)}`)
  })
})
