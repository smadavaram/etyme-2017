/**
 * The money loop's rules, with no database (Flow B, 2026-11-21 → 105, 107).
 */
import { describe, it, expect } from 'vitest'
import { advanceRefusal, nextState, mismatch, closeRefusal, loadRefusal, summarize, CHAIN_STATES } from '@/lib/money/money-chain'

const usd = (cents: number) => ({ cents, currency: 'USD' })

describe('the money chain, as rules', () => {
  it('a chain moves one state at a time and never backward', () => {
    expect(CHAIN_STATES.map(nextState)).toEqual([...CHAIN_STATES.slice(1), null])
    expect(advanceRefusal('TIMESHEET_OWED', 'RECONCILED')).toMatch(/one state at a time/)
    expect(advanceRefusal('INVOICED', 'RECONCILED')).toMatch(/never back/)
    expect(advanceRefusal('TIMESHEET_RECEIVED', 'RECONCILED')).toBeNull()
  })

  it('a timesheet cannot be marked received without the amount it states', () => {
    expect(advanceRefusal('TIMESHEET_OWED', 'TIMESHEET_RECEIVED')).toMatch(/the timesheet states/)
    expect(advanceRefusal('TIMESHEET_OWED', 'TIMESHEET_RECEIVED', { cents: 1050.5, currency: 'USD' })).toMatch(/whole number of cents/)
    expect(advanceRefusal('TIMESHEET_OWED', 'TIMESHEET_RECEIVED', { cents: 100, currency: 'dollars' })).toMatch(/three-letter code/)
    expect(advanceRefusal('TIMESHEET_OWED', 'TIMESHEET_RECEIVED', usd(100))).toBeNull()
  })

  it('a chain cannot be marked invoiced or paid without the amount stated', () => {
    expect(advanceRefusal('RECONCILED', 'INVOICED')).toMatch(/was invoiced/)
    expect(advanceRefusal('PAYMENT_PENDING', 'PAID_UNCONFIRMED')).toMatch(/was paid/)
  })

  it('a disputed chain and a closed chain do not move', () => {
    expect(advanceRefusal('DISPUTED', 'RECONCILED')).toMatch(/disputed/)
    expect(advanceRefusal('CONFIRMED_CLOSED', 'TIMESHEET_OWED')).toMatch(/closed/)
  })

  it('two stated amounts that differ by one cent are a mismatch, said with both figures', () => {
    expect(mismatch({ timesheet: usd(800000), invoiced: usd(799999), paid: null })).toMatch(/\$8,000\.00.*\$7,999\.99/)
    expect(mismatch({ timesheet: usd(800000), invoiced: usd(800000), paid: null })).toBeNull()
  })

  it('an amount in another currency is a mismatch said in a sentence, never converted', () => {
    expect(mismatch({ timesheet: usd(800000), invoiced: { cents: 800000, currency: 'INR' }, paid: null })).toMatch(/USD.*INR.*never compared/)
  })

  it('a chain whose three stated amounts disagree cannot close', () => {
    expect(closeRefusal({ timesheet: usd(100), invoiced: usd(100), paid: usd(90) })).toMatch(/cannot close/)
    expect(closeRefusal({ timesheet: usd(100), invoiced: usd(100), paid: usd(100) })).toBeNull()
  })

  it('a historical chain needs its source, its as-of day and three equal amounts', () => {
    const amounts = { timesheet: usd(100), invoiced: usd(100), paid: usd(100) }
    expect(loadRefusal({ source: '', asOf: new Date('2026-11-01'), amounts })).toMatch(/where this history came from/)
    expect(loadRefusal({ source: 'October payroll sheet', asOf: null, amounts })).toMatch(/the day this history was true/)
    expect(loadRefusal({ source: 'October payroll sheet', asOf: new Date('2026-12-30'), amounts }, new Date('2026-11-21'))).toMatch(/has not happened/)
    expect(loadRefusal({ source: 'October payroll sheet', asOf: new Date('2026-11-01'), amounts: { ...amounts, invoiced: null } })).toMatch(/was invoiced/)
    expect(loadRefusal({ source: 'October payroll sheet', asOf: new Date('2026-11-01'), amounts })).toBeNull()
  })

  it('the period total never adds two currencies, and labels each total as stated', () => {
    const s = summarize([
      { state: 'TIMESHEET_RECEIVED', timesheetAmountCents: 100000, timesheetCurrency: 'USD' },
      { state: 'INVOICED', timesheetAmountCents: 50000, timesheetCurrency: 'USD' },
      { state: 'TIMESHEET_RECEIVED', timesheetAmountCents: 700000, timesheetCurrency: 'INR' },
      { state: 'TIMESHEET_OWED', timesheetAmountCents: null, timesheetCurrency: null },
    ])
    expect(s.statedTotals).toEqual([
      { label: 'stated', currency: 'INR', cents: 700000, says: expect.stringMatching(/stated$/) },
      { label: 'stated', currency: 'USD', cents: 150000, says: '$1,500.00 stated' },
    ])
    expect(s.counts).toMatchObject({ TIMESHEET_RECEIVED: 2, INVOICED: 1, TIMESHEET_OWED: 1, DISPUTED: 0 })
    expect(s.notStated).toBe(1)
  })
})
