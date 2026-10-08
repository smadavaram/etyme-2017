import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { benchPageClosed, benchClosedSays, mayBrowseBench } from '@/lib/bench-filter'
import { addWeeks, hoursOnRecord, EMPTY_TALLY, NO_WEEKS_SAYS } from '@/app/api/alumni/hours-on-record'

/**
 * Sign-up walk, round seven (docs/results/2026-10-08-signup-round-7.md),
 * supply's parts: 14 (Past contractors printed HOURS 0 for people with no
 * week on record) and its share of 6 (the Bench page drew its heading and
 * its own prose above a refusal).
 */

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')

/** What ships: comments quote the old words on purpose. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

describe('14 · Past contractors never prints a zero for hours nobody recorded', () => {
  it('somebody with no approved week on record here has no hours figure, not zero hours', () => {
    expect(hoursOnRecord(addWeeks(EMPTY_TALLY, []))).toBeNull()
  })

  it('twenty-four months on site with no week filed here still reads as no figure, because months are not hours', () => {
    // Kwame Mensah: 741 days at the client, not one week filed through Etyme.
    const kwame = addWeeks(addWeeks(EMPTY_TALLY, []), [])
    expect(hoursOnRecord(kwame)).toBeNull()
  })

  it('a week with no hours figure on it is not counted as a week of zero hours', () => {
    expect(hoursOnRecord(addWeeks(EMPTY_TALLY, [{ totalHours: null }, { totalHours: undefined }]))).toBeNull()
  })

  it('a person whose approved weeks are on record reads their hours, summed across every contract and rounded to whole hours', () => {
    const first = addWeeks(EMPTY_TALLY, [{ totalHours: 40 }, { totalHours: '37.5' }])
    const both = addWeeks(first, [{ totalHours: 42.25 }])
    expect(both.weeks).toBe(3)
    expect(hoursOnRecord(both)).toBe(120)
  })

  it('a filed week of zero hours is a real zero and is shown as one', () => {
    expect(hoursOnRecord(addWeeks(EMPTY_TALLY, [{ totalHours: 0 }]))).toBe(0)
  })

  it('the route answers null for hours where there is no week, rather than rounding an empty sum to 0', () => {
    const route = code(read('src/app/api/alumni/route.ts'))
    expect(route).toContain('totalHours: hoursOnRecord(data.hours),')
    expect(route).not.toContain('Math.round(data.totalHours)')
    expect(route).not.toMatch(/t\.totalHours \? Number\(t\.totalHours\) : 0/)
  })

  it('the Hours column draws a dash and says "no weeks on record here" where there is no figure, and never calls toLocaleString on nothing', () => {
    const page = code(read('src/app/dashboard/alumni/page.tsx'))
    expect(NO_WEEKS_SAYS).toBe('no weeks on record here')
    expect(page).toContain('totalHours: number | null')
    const col = page.slice(page.indexOf("key: 'totalHours'"), page.indexOf("key: 'extensions'"))
    expect(col).toContain('row.totalHours == null ? (')
    expect(col).toContain('—')
    expect(col).toContain('{NO_WEEKS_SAYS}')
    expect(col.indexOf('row.totalHours == null')).toBeLessThan(col.indexOf('toLocaleString'))
  })
})

describe('6 · the Bench page is its refusal alone, with no heading or prose above it', () => {
  const client = { ok: true } as const

  it('a supplier seat with no bench desk and no bench profit reads the one sentence naming its firm, and nothing else', () => {
    // Sam, a desk-less Member at Brightmoor Staffing.
    expect(benchPageClosed({ loading: false, company: { name: 'Brightmoor Staffing' }, client, readsBench: false, readsProfit: false }))
      .toBe(benchClosedSays('Brightmoor Staffing'))
  })

  it('a worker at an integrator who may not open the bench reads the same one sentence, not "People you employ"', () => {
    // Karthik Menon at Teleworld Solutions.
    const says = benchPageClosed({ loading: false, company: { name: 'Teleworld Solutions' }, client, readsBench: false, readsProfit: false })
    expect(says).toBe(benchClosedSays('Teleworld Solutions'))
    expect(says).not.toContain('People you employ')
  })

  it('a client seat reads the client sentence alone', () => {
    const refused = mayBrowseBench({ companyKind: 'CLIENT', scope: 'company', opensJobRequests: false, companyName: 'Northbend Athletic' })
    expect(refused.ok).toBe(false)
    if (refused.ok) return
    expect(benchPageClosed({ loading: false, company: { name: 'Northbend Athletic' }, client: refused, readsBench: true, readsProfit: false }))
      .toBe(refused.says)
  })

  it('somebody signed in at no company reads the no-company sentence before anything about a client or a desk', () => {
    expect(benchPageClosed({ loading: false, company: null, client, readsBench: false, readsProfit: false }))
      .toBe(benchClosedSays(null))
  })

  it('a desk that reads the bench, or only bench profit, is let in', () => {
    expect(benchPageClosed({ loading: false, company: { name: 'Pellwright' }, client, readsBench: true, readsProfit: false })).toBeNull()
    expect(benchPageClosed({ loading: false, company: { name: 'Pellwright' }, client, readsBench: false, readsProfit: true })).toBeNull()
  })

  it('nobody is refused while the session is still loading', () => {
    expect(benchPageClosed({ loading: true, company: null, client, readsBench: false, readsProfit: false })).toBeNull()
  })

  it('the page returns the sentence before it draws the Bench heading or any description', () => {
    const page = code(read('src/app/dashboard/bench/page.tsx'))
    const gate = page.indexOf('if (closed) {')
    expect(gate).toBeGreaterThan(-1)
    expect(page.slice(gate, gate + 140)).toContain('{closed}</p>')
    expect(gate).toBeLessThan(page.indexOf('Bench\n          </h1>'))
    expect(gate).toBeLessThan(page.indexOf('People who granted you a listing'))
    expect(gate).toBeLessThan(page.indexOf('People you employ, and what each of them is on'))
  })
})
