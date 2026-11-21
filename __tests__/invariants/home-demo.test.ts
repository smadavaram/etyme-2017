/**
 * The home page's Ask Etyme panel and CFO view draw one sample company,
 * Corvane Packaging, and every figure in them is worked out from the
 * seed, never typed. The approved design of 2026-11-18 showed figures of
 * its own (62 contractors, $612,480); a figure no seed holds is not on
 * the page.
 */
import { describe, it, expect } from 'vitest'
import { homeSample } from '@/lib/public-site/home-sample'
import { corvaneContractors, CORVANE_RECEIPTS } from '@/lib/seed-corvane'
import { corvaneDemoFacts } from '@/lib/seed-corvane/plan'
import { spendInDollars, daysToLimit } from '@/lib/public-site/corvane-map'
import { format, fromMinor } from '@/lib/money'

const S = homeSample()
const { onSite, onHold } = corvaneContractors()
const f = corvaneDemoFacts()
const usd = (m: number) => format(fromMinor(m, 'USD'), { compact: true })
const q = (k: string) => S.questions.find((x) => x.key === k)!

describe('The Ask Etyme sample on the home page is the seed’s', () => {
  it('has four questions: what is paid, who is nearest the limit, which invoices are held, whose start is on hold', () => {
    expect(S.questions.map((x) => x.key)).toEqual(['pay', 'limit', 'held', 'start'])
    expect(S.company).toBe('Corvane Packaging')
  })

  it('says the contractors and suppliers of the seeded company and what they cost a month at the sample rates', () => {
    expect(S.context).toContain(`${onSite.length} contractors through ${f.suppliers === 0 ? 0 : new Set(onSite.map((c) => c.supplier)).size} suppliers`)
    expect(S.context).toContain(usd(spendInDollars(onSite)!))
  })

  it('the spend by supplier adds up to the month’s total, and names five suppliers with the rest on one line', () => {
    const pay = q('pay')
    expect(pay.total![2]).toBe(usd(spendInDollars(onSite)!))
    expect(pay.total![1]).toBe(String(onSite.length))
    expect(pay.rows.reduce((n, r) => n + Number(r[1]), 0)).toBe(onSite.length)
    expect(pay.rows.length).toBeLessThanOrEqual(6)
    expect(pay.rows.at(-1)![0]).toMatch(/^\d+ other suppliers$/)
  })

  it('the contractor nearest the time limit is the seed’s, in days, and the next two follow in order', () => {
    const nearest = [...onSite].sort((a, b) => daysToLimit(a) - daysToLimit(b)).slice(0, 3)
    expect(q('limit').rows.map((r) => r[0])).toEqual(nearest.map((c) => c.name))
    expect(q('limit').lead).toBe(nearest[0].name)
    expect(q('limit').rest).toContain(`${daysToLimit(nearest[0])} day`)
  })

  it('the held invoices are the seed’s held receipts, one row each', () => {
    const held = CORVANE_RECEIPTS.filter((r) => r.held)
    expect(q('held').rows).toHaveLength(held.length)
    expect(q('held').head[1]).toBe('Hours billed of signed')
    expect(q('held').lead).toBe(`${held.length} supplier invoices`)
  })

  it('the start on hold is the seeded contractor waiting on an I-9', () => {
    expect(q('start').rows).toEqual([[onHold.name, onHold.plant.city, 'I-9']])
  })

  it('the CFO view’s four tiles are contractors, suppliers, sites and the month’s spend', () => {
    expect(S.cfo.tiles).toHaveLength(4)
    expect(S.cfo.tiles[0]).toEqual({ b: String(onSite.length), s: 'contractors' })
  })
})
