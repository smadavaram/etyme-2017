import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { onSiteOf, headcount, suppliersOnSite, needsReportingRates, spendFigures, type FigureRung } from '@/app/api/program/figures'
import { chainTop } from '@/lib/chain-top'

const topRungs = (rows: FigureRung[]) => { const contracts = chainTop(rows); return { contracts, onSite: onSiteOf(contracts) } }
import { SAMPLE_RATE_TABLE } from '@/lib/money/reporting-currency'

/**
 * Ask Etyme's greeting says four of the program page's figures: who is on
 * site, through how many suppliers, what a month costs, in which currency.
 * It read the whole page to get them, 75 queries for Northbend's owner
 * (2026-11-02). The summary reader reads the same program behind the same
 * walls with the page's own arithmetic, in one to three.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const code = (p: string) => read(p).split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')
const NOW = new Date('2026-11-02T12:00:00Z')
const rung = (over: Partial<FigureRung>): FigureRung => ({
  id: 'r', personId: 'p', companyId: 'brightmoor', clientCompanyId: 'northbend',
  state: 'IN_PROGRESS', billRate: 10_000, billCurrency: 'USD', ...over,
})

describe('the program’s headline figures are worked out once, for the page and the greeting alike', () => {
  it('a person bought through a chain is counted once, at the rung the client pays', () => {
    const rows = [
      rung({ id: 'top', personId: 'ravi', companyId: 'brightmoor', clientCompanyId: 'northbend', billRate: 13_000 }),
      rung({ id: 'below', personId: 'ravi', companyId: 'tapin', clientCompanyId: 'brightmoor', billRate: 10_000 }),
    ]
    const { contracts, onSite } = topRungs(rows)
    expect(contracts.map((c) => c.id)).toEqual(['top'])
    expect(headcount(contracts, onSite).activeContractors).toBe(1)
    expect(suppliersOnSite(onSite)).toEqual(['brightmoor'])
  })

  it('on site means working now: somebody signed and not started is a contractor, not on site', () => {
    const rows = [rung({ id: 'a', personId: 'a' }), rung({ id: 'b', personId: 'b', state: 'DRAFT' })]
    const { contracts, onSite } = topRungs(rows)
    expect(headcount(contracts, onSite)).toEqual({ activeContractors: 1, contractors: 2, notStarted: 1 })
  })

  it('suppliers are counted by firm, however many people each supplies', () => {
    const { onSite } = topRungs([rung({ id: 'a', personId: 'a' }), rung({ id: 'b', personId: 'b' }), rung({ id: 'c', personId: 'c', companyId: 'veritan' })])
    expect(suppliersOnSite(onSite).sort()).toEqual(['brightmoor', 'veritan'])
  })

  it('a month in one currency is each rate at 160 hours, and somebody with no rate is named apart, never a zero', () => {
    const { onSite } = topRungs([rung({ id: 'a', personId: 'a', billRate: 10_000 }), rung({ id: 'b', personId: 'b', billRate: 0 })])
    const f = spendFigures(onSite, null, NOW)
    expect(f.monthlySpend).toBe(1_600_000)
    expect(f.monthlySpendCurrency).toBe('USD')
    expect(f.monthlySpendSays).toMatch(/1 person has no rate and is not in it$/)
    expect(needsReportingRates(onSite)).toBe(false)
  })

  it('a month billed in two currencies is one figure only through the company’s rates, and never rupees added to dollars', () => {
    const { onSite } = topRungs([rung({ id: 'a', personId: 'a' }), rung({ id: 'b', personId: 'b', billCurrency: 'INR', billRate: 400_000 })])
    expect(needsReportingRates(onSite)).toBe(true)
    const none = spendFigures(onSite, null, NOW)
    expect(none.monthlySpend).toBeNull()
    expect(none.monthlySpendCurrency).toBeNull()
    expect(none.monthlySpendByCurrency.map((l) => l.currency).sort()).toEqual(['INR', 'USD'])
    const sample = spendFigures(onSite, SAMPLE_RATE_TABLE, NOW)
    expect(sample.monthlySpendCurrency).toBe(SAMPLE_RATE_TABLE.reportingCurrency)
    expect(typeof sample.monthlySpend).toBe('number')
  })

  it('the program page and the summary reader both call the one arithmetic, so a figure in the greeting is the page’s figure', () => {
    const view = code('src/app/api/program/view.ts')
    const summary = code('src/app/api/program/summary.ts')
    for (const [name, src] of [['view', view], ['summary', summary]] as const) {
      // The paying rung, resolved in the reader's own file before any rate is read.
      expect(src, name).toContain('const contracts = chainTop(everyRung)')
      expect(src, name).toContain("from '@/lib/chain-top'")
      expect(src, name).toContain('const onSite = onSiteOf(contracts)')
      expect(src, name).toContain("needsReportingRates(onSite) ? await reportingRatesFor(")
      expect(src, name).toContain('spendFigures(onSite, rates, now)')
      expect(src, name).toContain('headcount(contracts, onSite)')
      // Behind the same walls: the client or the seat, a seat's units, a region's reach, the account walls.
      expect(src, name).toMatch(/endClientFilter\((clientCompany|client)\.id\), wall\.where, unitWall, reachWall/)
    }
    expect(view).not.toContain('spendInReporting(')
  })

  it('the summary names nobody, prices no person and works out no start paperwork', () => {
    const summary = code('src/app/api/program/summary.ts')
    expect(summary).not.toMatch(/person:\s*\{\s*select/)
    expect(summary).not.toContain('startPaperwork')
    expect(summary).not.toContain('logBulkAccess')
    expect(summary).toMatch(/select: \{\s*id: true, personId: true, companyId: true, clientCompanyId: true,\s*state: true, billRate: true, billCurrency: true,\s*\}/)
  })
})
