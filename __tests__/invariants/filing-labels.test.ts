import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { filingLabels, type FilingLine } from '@/lib/consultant-portfolio/filing-labels'

/**
 * The third screen walk, 2026-11-03, S2: Nikhil, with two lines at
 * Pinnacle Resourcing, was offered two identical options, "Pinnacle
 * Resourcing · through Pinnacle Resourcing", in File your hours and in
 * File an expense.
 */

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
const line = (o: Partial<FilingLine>): FilingLine => ({
  contractId: 'c1', site: null, client: null, payer: 'Pinnacle Resourcing', job: null,
  startDate: '2026-11-02', endDate: '2027-04-30', ...o,
})

describe('a worker with two lines at one firm is offered options that read apart', () => {
  it('a line with no end client names the client it sells to, never the firm that pays them twice', () => {
    expect(filingLabels([line({ client: 'Northbend Athletic' })])).toEqual(['Northbend Athletic · through Pinnacle Resourcing'])
    expect(filingLabels([line({})])).toEqual(['Pinnacle Resourcing'])
  })

  it('a line with an end client names where the work is, through whom', () => {
    expect(filingLabels([line({ site: 'Northbend Athletic', client: 'Computer Systems' , payer: 'Techpeple' })]))
      .toEqual(['Northbend Athletic · through Techpeple'])
  })

  it('two lines at two clients read by the client alone', () => {
    expect(filingLabels([
      line({ contractId: 'a', client: 'Northbend Athletic' }),
      line({ contractId: 'b', client: 'Cavanaugh Glassworks' }),
    ])).toEqual([
      'Northbend Athletic · through Pinnacle Resourcing',
      'Cavanaugh Glassworks · through Pinnacle Resourcing',
    ])
  })

  it('two lines at one client on two jobs are told apart by the job', () => {
    expect(filingLabels([
      line({ contractId: 'a', client: 'Northbend Athletic', job: 'HCM integration lead' }),
      line({ contractId: 'b', client: 'Northbend Athletic', job: 'Payroll analyst' }),
    ])).toEqual([
      'Northbend Athletic · through Pinnacle Resourcing · HCM integration lead',
      'Northbend Athletic · through Pinnacle Resourcing · Payroll analyst',
    ])
  })

  it('two lines on one job at one client are told apart by their dates', () => {
    const labels = filingLabels([
      line({ contractId: 'a', job: 'Payroll analyst', startDate: '2026-06-01', endDate: '2026-10-31' }),
      line({ contractId: 'b', job: 'Payroll analyst', startDate: '2026-11-02', endDate: null }),
    ])
    expect(labels).toEqual([
      'Pinnacle Resourcing · Jun 1 – Oct 31, 2026',
      'Pinnacle Resourcing · from Nov 2, 2026',
    ])
    expect(new Set(labels).size).toBe(2)
  })

  it('the job and the dates are added only where two options would otherwise read alike', () => {
    const labels = filingLabels([
      line({ contractId: 'a', client: 'Northbend Athletic', job: 'HCM integration lead' }),
      line({ contractId: 'b', client: 'Cavanaugh Glassworks', job: 'HCM integration lead' }),
    ])
    expect(labels.every((l) => !l.includes('HCM') && !l.includes('2026'))).toBe(true)
  })

  it('File your hours and File an expense both read the option the route labelled, never the site and the payer again', () => {
    const route = read('src/app/api/me/work/route.ts')
    expect(route).toMatch(/const labels = filingLabels\(/)
    expect(route).toMatch(/label: labels\[i\]/)
    expect(read('src/app/dashboard/my-work/page.tsx')).toMatch(/<option key=\{f\.contractId\} value=\{f\.contractId\}>\{f\.label\}<\/option>/)
    expect(read('src/app/dashboard/my-work/your-expense.tsx')).toMatch(/<option key=\{o\.contractId\} value=\{o\.contractId\}>\{o\.label\}<\/option>/)
  })
})
