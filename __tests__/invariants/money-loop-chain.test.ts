/**
 * The money loop's rules, with no database (Flow B, 2026-11-21 → 105, 107).
 */
import { describe, it, expect } from 'vitest'
import {
  advanceRefusal, nextState, mismatch, closeRefusal, loadRefusal, summarize, CHAIN_STATES,
  openPeriodRefusal, loadPeriodRefusal, disputeQuestion, historyLines, periodWords,
} from '@/lib/money/money-chain'

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

  const month = (key: string) => {
    const [y, m] = key.split('-').map(Number)
    return { periodStart: new Date(Date.UTC(y, m - 1, 1)), periodEnd: new Date(Date.UTC(y, m, 0)) }
  }
  const TODAY = new Date('2026-11-22T00:00:00Z')

  it('a month is said by its name, the way a payroll clerk says it', () => {
    expect(periodWords(month('2026-11'))).toBe('November 2026')
    expect(periodWords({ periodStart: new Date('2026-11-02'), periodEnd: new Date('2026-11-15') })).toBe('Nov 2, 2026 to Nov 15, 2026')
  })

  it('a month that has not begun cannot be started, and the current month and a past one can', () => {
    expect(openPeriodRefusal(month('2026-12'), TODAY)).toBe('December 2026 has not begun. It can be started from Dec 1, 2026.')
    expect(openPeriodRefusal(month('2027-06'), TODAY)).toMatch(/^June 2027 has not begun/)
    expect(openPeriodRefusal(month('2026-11'), TODAY)).toBeNull()
    expect(openPeriodRefusal(month('2026-11'), new Date('2026-11-01T00:00:00Z'))).toBeNull()
    expect(openPeriodRefusal(month('2026-10'), TODAY)).toBeNull()
  })

  it('a month is loaded as closed only once it has fully ended on the firm’s own day', () => {
    expect(loadPeriodRefusal(month('2026-10'), TODAY)).toBeNull()
    expect(loadPeriodRefusal(month('2026-11'), TODAY)).toBe('November 2026 has not ended. A month is loaded as closed once it has ended, from Dec 1, 2026.')
    // On its own last day the month has not ended yet; the day after, it has.
    expect(loadPeriodRefusal(month('2026-11'), new Date('2026-11-30T00:00:00Z'))).toMatch(/has not ended/)
    expect(loadPeriodRefusal(month('2026-11'), new Date('2026-12-01T00:00:00Z'))).toBeNull()
    expect(loadPeriodRefusal(month('2027-06'), TODAY)).toMatch(/^June 2027 has not ended/)
  })

  it('a month that has not happened cannot be saved as paid and closed, whatever else is typed', () => {
    const amounts = { timesheet: usd(100), invoiced: usd(100), paid: usd(100) }
    expect(loadRefusal({ ...month('2027-06'), source: 'the payroll sheet', asOf: new Date('2026-11-20'), amounts }, TODAY)).toMatch(/^June 2027 has not ended/)
    expect(loadRefusal({ ...month('2026-11'), source: 'the payroll sheet', asOf: new Date('2026-11-20'), amounts }, TODAY)).toMatch(/^November 2026 has not ended/)
  })

  it('the day a past month was true is on or after the month’s last day and not after today', () => {
    const amounts = { timesheet: usd(100), invoiced: usd(100), paid: usd(100) }
    const oct = { ...month('2026-10'), source: 'the October payroll sheet', amounts }
    expect(loadRefusal({ ...oct, asOf: new Date('2026-10-30') }, TODAY)).toBe('The day this history was true cannot be before the month’s last day, Oct 31, 2026.')
    expect(loadRefusal({ ...oct, asOf: new Date('2026-11-23') }, TODAY)).toMatch(/has not happened/)
    expect(loadRefusal({ ...oct, asOf: new Date('2026-10-31') }, TODAY)).toBeNull()
    expect(loadRefusal({ ...oct, asOf: new Date('2026-11-22') }, TODAY)).toBeNull()
  })

  it('a dispute asks one proposed course, the one taken when it returns: keep the earlier amount and state the new one again', () => {
    expect(disputeQuestion('Ana Consultant', 'November 2026', { timesheet: usd(1600000), invoiced: usd(1525000), paid: null }, 'invoiced'))
      .toBe('Ana Consultant, November 2026: the invoiced amount differs from the timesheet’s. Keep the timesheet’s amount and state the invoiced amount again?')
    expect(disputeQuestion('Ana Consultant', 'November 2026', { timesheet: usd(1600000), invoiced: usd(1600000), paid: usd(1) }, 'paid'))
      .toBe('Ana Consultant, November 2026: the paid amount differs from the timesheet’s. Keep the timesheet’s amount and state the paid amount again?')
  })

  it('a dispute’s question states no amount, because every working seat reads the question and only a seat that reads payroll reads the proof', () => {
    const q = disputeQuestion('Ana Consultant', 'November 2026', { timesheet: usd(1600000), invoiced: usd(1525000), paid: null }, 'invoiced')
    expect(q).not.toMatch(/\d,\d|\$|USD/)
    expect(q).not.toMatch(/Which amount is right/)
  })

  it('a history load writes seven lines, each saying its own state, and the three that state an amount say the amount', () => {
    const lines = historyLines({ amounts: { timesheet: usd(1500000), invoiced: usd(1500000), paid: usd(1500000) }, source: 'the October payroll sheet', asOf: new Date('2026-11-15') }, TODAY)
    const tail = ' Loaded as history on Nov 22, 2026, as of Nov 15, 2026, from the October payroll sheet.'
    expect(lines).toEqual([
      `Timesheet owed.${tail}`,
      `Timesheet received: $15,000.00 stated on the timesheet.${tail}`,
      `Reconciled.${tail}`,
      `Invoiced: $15,000.00 was invoiced.${tail}`,
      `Payment pending.${tail}`,
      `Paid, not confirmed: $15,000.00 was paid.${tail}`,
      `Confirmed and closed.${tail}`,
    ])
    expect(new Set(lines).size).toBe(7)
  })

  it('the period total says how much of it is on disputed months, per currency', () => {
    const s = summarize([
      { state: 'DISPUTED', timesheetAmountCents: 1600000, timesheetCurrency: 'USD' },
      { state: 'INVOICED', timesheetAmountCents: 900000, timesheetCurrency: 'USD' },
      { state: 'DISPUTED', timesheetAmountCents: null, timesheetCurrency: null },
      { state: 'TIMESHEET_RECEIVED', timesheetAmountCents: 700000, timesheetCurrency: 'INR' },
    ])
    expect(s.statedTotals.map((t) => [t.currency, t.cents])).toEqual([['INR', 700000], ['USD', 2500000]])
    expect(s.disputedTotals).toEqual([{ currency: 'USD', cents: 1600000, months: 1 }])
  })

  it('no refusal or ledger line the rules write says chain: a payroll clerk says month', () => {
    const said = [
      advanceRefusal('DISPUTED', 'RECONCILED'), advanceRefusal('CONFIRMED_CLOSED', 'TIMESHEET_OWED'), advanceRefusal('TIMESHEET_OWED', 'RECONCILED'),
      closeRefusal({ timesheet: usd(100), invoiced: usd(100), paid: usd(90) }),
    ]
    for (const s of said) expect(s).not.toMatch(/chain/i)
    expect(said[0]).toBe('This month is disputed. It moves again once its decision is recorded.')
  })
})
