import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { billChoiceLabel } from '@/lib/money/bill-choice'

/**
 * The second screen walk, 2026-11-03: the Bills page's "Generate bill"
 * picker named jobs, so two placements on one job read as one choice. A
 * choice now reads the way the trade says which bill it means: the
 * person, the week or the weeks waiting, and the customer.
 */
describe('the bill picker names the person and the week, not the job', () => {
  it('one signed week reads as the person, the week and the customer', () => {
    expect(billChoiceLabel({
      people: ['Helena Marsh'], weeks: [{ start: '2026-10-04', end: '2026-10-10' }],
      clientName: 'Northbend Athletic', title: 'HCM integration lead',
    })).toBe('Helena Marsh · Oct 4 – Oct 10, 2026 · Northbend Athletic')
  })

  it('several signed weeks read as how many and the span they cover', () => {
    expect(billChoiceLabel({
      people: ['Helena Marsh'],
      weeks: [{ start: '2026-10-11', end: '2026-10-17' }, { start: '2026-10-04', end: '2026-10-10' }, { start: '2026-10-18', end: '2026-10-24' }],
      clientName: 'Northbend Athletic', title: 'HCM integration lead',
    })).toBe('Helena Marsh · 3 signed weeks, Oct 4 – Oct 24, 2026 · Northbend Athletic')
  })

  it('a choice with several people names them, and one with no signed week says so rather than inventing a period', () => {
    expect(billChoiceLabel({ people: ['Omar Haddad', 'Dmitri Volkov'], weeks: [], clientName: 'Northbend Athletic', title: 'Data engineers' }))
      .toBe('Dmitri Volkov and Omar Haddad · no signed week waiting · Northbend Athletic')
    expect(billChoiceLabel({ people: ['A', 'B', 'C'], weeks: [], clientName: null, title: 'T' })).toBe('A and 2 others · no signed week waiting')
  })

  it('the job’s name is said only where no person is on the line', () => {
    expect(billChoiceLabel({ people: [], weeks: [], clientName: 'Northbend Athletic', title: 'HCM integration lead' }))
      .toBe('HCM integration lead · no signed week waiting · Northbend Athletic')
  })

  it('the picker draws the label the route gives, and the route reads only this firm’s own lines and weeks not yet on its own live bill', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/dashboard/invoices/page.tsx'), 'utf8')
    expect(page).toContain('{eng.label ?? ')
    const route = readFileSync(join(process.cwd(), 'src/app/api/invoices/generate/route.ts'), 'utf8')
    expect(route).toMatch(/const own = e\.sellContracts\.filter\(\(l\) => l\.companyId === caller\.company!\.id\)/)
    expect(route).toContain("invoiceLines: { none: { sellContract: { companyId: caller.company!.id }, invoice: { status: { notIn: ['CANCELLED', 'VOID'] } } } }")
  })
})
