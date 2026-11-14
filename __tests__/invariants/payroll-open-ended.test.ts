import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { periodStatusFromRuns, notAcceptedSays, payFileHref } from '@/lib/money/payroll-rows'

/**
 * The payroll walk of 2026-11-14, on a placement with no end date and so
 * no pay dates. The routes are walked in __integration__/payroll-open-ended-line.
 */

const days = [
  { key: 'bc|p|ts1|2026-09-07', hours: 8 },
  { key: 'bc|p|ts1|2026-09-08', hours: 8 },
]

describe('a pay period with no pay day of its own reads what the runs recorded', () => {
  it('a period nobody has paid reads pending, never processed', () => {
    expect(periodStatusFromRuns({ days, paid: new Map(), workedOut: false })).toBe('PENDING')
  })

  it('a period a calculation worked out and nobody paid reads calculated, ready to be marked paid', () => {
    expect(periodStatusFromRuns({ days, paid: new Map(), workedOut: true })).toBe('CALCULATED')
  })

  it('a period whose every accepted hour a run paid reads processed', () => {
    const paid = new Map(days.map((d) => [d.key, d.hours]))
    expect(periodStatusFromRuns({ days, paid, workedOut: true })).toBe('PROCESSED')
  })

  it('a period paid for one day and not the next is not read as paid', () => {
    const paid = new Map([[days[0].key, 8]])
    expect(periodStatusFromRuns({ days, paid, workedOut: false })).toBe('PENDING')
  })

  it('a period with no hours to pay is never read as paid', () => {
    expect(periodStatusFromRuns({ days: [], paid: new Map(), workedOut: false })).toBe('PENDING')
  })

  it('the payroll route no longer falls through to processed where no pay day says so', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/payroll/route.ts'), 'utf8')
    expect(route).toContain('periodStatusFromRuns(')
    expect(route).not.toMatch(/\} else \{\s*payStatus = 'PROCESSED'\s*\}/)
  })
})

describe('a week filed and not accepted is named on the payroll row', () => {
  it('names the person, the week, the hours and the client who has to approve it', () => {
    expect(notAcceptedSays({
      personName: 'Nadia Okonjo', week: 'Sep 20 – Sep 26, 2026', hours: 46,
      clientApproved: false, clientName: 'Harbor Lane Mills', employerName: 'Brightmoor Staffing',
    })).toBe("Nadia Okonjo's week of Sep 20 – Sep 26, 2026, 46 hours, is not in this pay until Harbor Lane Mills approves it and Brightmoor Staffing accepts it.")
  })

  it('once the client approved it, names only the employer who has to accept it', () => {
    expect(notAcceptedSays({
      personName: 'Nadia Okonjo', week: 'Sep 20 – Sep 26, 2026', hours: 46,
      clientApproved: true, clientName: 'Harbor Lane Mills', employerName: 'Brightmoor Staffing',
    })).toBe("Nadia Okonjo's week of Sep 20 – Sep 26, 2026, 46 hours, is not in this pay until Brightmoor Staffing accepts it.")
  })
})

describe('the payroll page gives a pay file that reads like the screen', () => {
  const page = readFileSync(join(process.cwd(), 'src/app/dashboard/payroll/page.tsx'), 'utf8')

  it('the pay file for a month asks for that month’s first and last day, in the generic layout, as a file', () => {
    expect(payFileHref('2026-09')).toBe('/api/payroll/export?provider=GENERIC&format=csv&from=2026-09-01&to=2026-09-30')
    expect(payFileHref('2028-02')).toBe('/api/payroll/export?provider=GENERIC&format=csv&from=2028-02-01&to=2028-02-29')
  })

  it('the view of every period downloads the pay file for the export’s own last thirty days', () => {
    expect(payFileHref('')).toBe('/api/payroll/export?provider=GENERIC&format=csv')
  })

  it('the page has a "Download pay file" button for the period shown', () => {
    expect(page).toContain('href={payFileHref(selectedPeriod)}')
    expect(page).toContain('Download pay file')
  })

  it('every payroll column gives the table export a value, so the file names the person and says dollars, not cents', () => {
    const start = page.indexOf('const columns: Column<PayItem>[] = [')
    const end = page.indexOf('// ── Search filter')
    const block = page.slice(start, end)
    const keys = [...block.matchAll(/^\s{4,6}key: '([a-zA-Z]+)',/gm)].map((m) => m[1])
    expect(keys).toEqual(['person', 'contractType', 'client', 'payRate', 'hours', 'grossPay', 'carry', 'agreed', 'payStatus', 'nextPay'])
    const parts = block.split(/^\s{4,6}key: '/m).slice(1)
    for (const [i, part] of parts.entries()) expect(part, `the ${keys[i]} column`).toContain('exportValue:')
    expect(block).toContain('exportValue: (row) => formatCents(row.grossPay, row.payCurrency)')
  })

  it('the page draws the sentence naming a week not accepted, and the company’s pay period', () => {
    expect(page).toContain('{row.notAccepted}')
    expect(page).toContain('{periodSays}')
  })
})

describe('Profitability says cost, and keeps paid for money that went out', () => {
  it('the column for what the signed weeks cost reads Cost, never Paid', () => {
    const table = readFileSync(join(process.cwd(), 'src/app/dashboard/profitability/cut-table.tsx'), 'utf8')
    expect(table).toContain("{ key: 'paidCents', label: 'Cost',")
    expect(table).not.toContain("label: 'Paid'")
    expect(table).not.toContain('Paid is what those weeks cost you')
  })
})
