import { describe, it, expect } from 'vitest'
import { buildExport, toCsv, missingIds } from '@/lib/payroll-export'

/**
 * Etyme does not run payroll and should not. What it knows is what is
 * owed and to whom — the hours, whose signature stands behind them, at
 * what rate — which is the part the provider cannot work out.
 *
 * A payroll file is acted on. It becomes a bank transfer, usually the
 * same week, and nobody reads it first.
 */

const d = (s: string) => new Date(`${s}T00:00:00Z`)

function row(over: Partial<Parameters<typeof buildExport>[1][number]> = {}) {
  return {
    personName: 'Rohan Menon',
    payrollId: 'E10041',
    contractType: 'W2',
    periodStart: d('2026-08-01'),
    periodEnd: d('2026-08-15'),
    submittedHours: 80,
    acceptedHours: null,
    employerAcceptedAt: d('2026-08-16'),
    rateCents: 7800,
    currency: 'USD',
    costCode: 'EA-4100',
    orderNumber: 'SO-2026-014',
    ...over,
  }
}

describe('what goes in the file', () => {
  it('exports the accepted hours, not the submitted ones', () => {
    const e = buildExport('ADP', [row({ submittedHours: 80, acceptedHours: 76 })])
    expect(e.lines[0].hours).toBe(76)
  })

  it('falls back to submitted where the employer accepted them as they were', () => {
    expect(buildExport('ADP', [row()]).lines[0].hours).toBe(80)
  })

  it('totals the money from the hours actually going out', () => {
    const e = buildExport('ADP', [row({ acceptedHours: 76 })])
    expect(e.totalCents).toBe(76 * 7800)
    expect(e.says).toBe('1 person, 76 hours, $5,928.00 for ADP.')
  })
})

describe('what it refuses to export', () => {
  it('leaves out hours nobody accepted, and names who', () => {
    // A file that quietly omits somebody is how a contractor goes unpaid
    // for a fortnight and nobody can say why.
    const e = buildExport('ADP', [row(), row({ personName: 'Sade Aluko', employerAcceptedAt: null })])
    expect(e.lines).toHaveLength(1)
    expect(e.skipped).toEqual([
      { personName: 'Sade Aluko', periodEnd: d('2026-08-15'), why: 'Nobody has accepted these hours for pay yet.' },
    ])
    expect(e.says).toMatch(/1 left out — nobody has accepted their hours\.$/)
  })

  it('leaves out a sheet accepted at zero', () => {
    const e = buildExport('ADP', [row({ acceptedHours: 0 })])
    expect(e.lines).toHaveLength(0)
    expect(e.skipped[0].why).toBe('Accepted at zero hours.')
  })

  it('says what is holding it up when there is nothing to send', () => {
    const e = buildExport('ADP', [row({ employerAcceptedAt: null })])
    expect(e.says).toBe('Nothing to send. 1 person is waiting on somebody to accept their hours.')
  })

  it('says plainly when there was simply nothing', () => {
    expect(buildExport('ADP', []).says).toBe('Nothing to send. No accepted hours in this period.')
  })
})

describe('the file each provider will actually take', () => {
  it('writes ADP’s own column names', () => {
    // A file the provider rejects is a file somebody has to rekey.
    const csv = toCsv(buildExport('ADP', [row()]))
    expect(csv.split('\n')[0]).toBe('Co Code,File #,Name,Reg Hours,Rate,Period Start,Period End,Dept')
    expect(csv.split('\n')[1]).toBe(',E10041,Rohan Menon,80,78.00,2026-08-01,2026-08-15,EA-4100')
  })

  it('writes Paychex’s, which are different', () => {
    const csv = toCsv(buildExport('PAYCHEX', [row()]))
    expect(csv.split('\n')[0]).toBe(
      'Employee ID,Employee Name,Earnings Code,Hours,Rate,Pay Period End,Cost Center'
    )
    expect(csv.split('\n')[1]).toContain('REG')
  })

  it('writes everything we know on the generic one', () => {
    const csv = toCsv(buildExport('GENERIC', [row()]))
    expect(csv.split('\n')[0]).toContain('order')
    expect(csv.split('\n')[1]).toContain('SO-2026-014')
  })

  it('survives a name with a comma in it', () => {
    const csv = toCsv(buildExport('GENERIC', [row({ personName: 'Menon, Rohan' })]))
    expect(csv).toContain('"Menon, Rohan"')
  })
})

describe('before it is sent', () => {
  it('names anybody with no payroll id, because ADP drops those rows silently', () => {
    const e = buildExport('ADP', [row(), row({ personName: 'Lucia Braga', payrollId: null })])
    expect(missingIds(e)).toEqual(['Lucia Braga'])
  })

  it('says nothing when everybody has one', () => {
    expect(missingIds(buildExport('ADP', [row()]))).toEqual([])
  })
})
