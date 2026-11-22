import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { CHAIN_STATES, nextState, amountNeededFor } from '@/lib/money/money-chain'
import {
  STATE_STRIP, COUNTED_STATES, TOTAL_LABEL, amountAskedFor, centsFrom, emptyMonthSays, historySays, mayReadLoop, mayRunLoop,
  monthBeside, monthKeyOf, nextMove, nextOf, readMonth, stateLabel,
} from '@/lib/money-loop'
import { rolesFor } from '@/lib/company-defaults'

/**
 * The money loop's screens, in words (record 107, Flow B, B2 to B6). The
 * rules of a chain are tested in money-loop-chain; this holds what the
 * screens say, and that they say it the way the rules mean it.
 */

const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n)
  return statSync(p).isDirectory() ? files(p) : [p]
})
const SCREENS = [...files(join(process.cwd(), 'src/app/dashboard/money-loop')), ...files(join(process.cwd(), 'src/app/api/money-loop')), join(process.cwd(), 'src/lib/money-loop.ts')]

describe('the money loop’s screens', () => {
  it('the state strip holds the rule’s seven states in the rule’s order, and the next move is the rule’s next state', () => {
    expect([...STATE_STRIP]).toEqual([...CHAIN_STATES])
    for (const s of [...CHAIN_STATES, 'DISPUTED'] as const) {
      expect(nextOf(s), s).toBe(nextState(s))
      expect(amountAskedFor(s), s).toBe(amountNeededFor(s))
    }
  })

  it('every state reads in the trade’s words, never as a machine name', () => {
    expect(COUNTED_STATES.map(stateLabel)).toEqual(['Timesheet owed', 'Timesheet received', 'Reconciled', 'Invoiced', 'Payment pending', 'Paid, not confirmed', 'Closed', 'Disputed'])
    for (const f of SCREENS.filter((f) => f.endsWith('.tsx'))) {
      const drawn = readFileSync(f, 'utf8').replace(/\{[^{}]*\}/g, '')
      expect(drawn, f).not.toMatch(/>[^<]*\b(TIMESHEET_OWED|PAID_UNCONFIRMED|CONFIRMED_CLOSED|PAYMENT_PENDING)\b/)
    }
  })

  it('each move has a button in a clerk’s words, and asks an amount only where a person states one', () => {
    expect(STATE_STRIP.map((s) => nextMove(s)).map((m) => (m ? [m.button, m.amountLabel] : null))).toEqual([
      ['Record the timesheet', 'Amount the timesheet states'],
      ['Mark it reconciled', null],
      ['Record the invoice', 'Amount invoiced'],
      ['Mark payment pending', null],
      ['Record the payment', 'Amount paid'],
      ['Confirm and close', null],
      null,
    ])
    expect(nextMove('DISPUTED')).toBeNull()
  })

  it('an amount is read as it was typed, in whole cents, and never rounded or guessed', () => {
    expect(centsFrom('16,000.00')).toBe(1600000)
    expect(centsFrom('16000')).toBe(1600000)
    expect(centsFrom('0.5')).toBe(50)
    expect(centsFrom('19.99')).toBe(1999)
    for (const bad of ['', '16000.005', '-5', 'sixteen', '$100', '1e3', null, 16000]) expect(centsFrom(bad), String(bad)).toBeNull()
  })

  it('a month is its first day to its last day, and the months beside it are the calendar’s', () => {
    const feb = readMonth('2028-02')!
    expect([feb.start.toISOString().slice(0, 10), feb.end.toISOString().slice(0, 10), feb.words]).toEqual(['2028-02-01', '2028-02-29', 'February 2028'])
    expect([monthBeside('2026-12', 1), monthBeside('2027-01', -1), monthKeyOf(new Date('2026-12-31T00:00:00Z'))]).toEqual(['2027-01', '2026-12', '2026-12'])
    for (const bad of ['2026-13', '2026-1', 'December', '', null]) expect(readMonth(bad), String(bad)).toBeNull()
  })

  it('an empty month says what it waits on, to the seat reading it', () => {
    expect(emptyMonthSays('December 2026', 0, true)).toMatch(/^Nobody was on a running contract in December 2026/)
    expect(emptyMonthSays('December 2026', 1, true)).toBe('1 consultant is on a running contract in December 2026, and the month is not opened yet. Open it to start each one at “Timesheet owed”.')
    expect(emptyMonthSays('December 2026', 7, false)).toBe('7 consultants are on a running contract in December 2026, and the month is not opened yet. A seat that runs payroll opens it.')
  })

  it('a month loaded as history says so, with its source and the day it was true', () => {
    expect(historySays('the October payroll sheet', 'Nov 15, 2026')).toBe('Loaded as history from the October payroll sheet, as of Nov 15, 2026.')
  })

  it('the total is what timesheets state, and no money loop screen says payable', () => {
    expect(TOTAL_LABEL).toBe('Total stated on timesheets')
    for (const f of SCREENS) expect(readFileSync(f, 'utf8'), f).not.toMatch(/payable/i)
  })

  it('at a supplier, AP & Payroll and the Owner read and move the money loop, and an Account Manager, a recruiter and HR do neither', () => {
    const roles = rolesFor('VENDOR')
    const holds = (name: string) => roles.find((r) => r.name === name)!.permissions
    for (const name of ['Owner', 'AP & Payroll']) expect([mayReadLoop(holds(name)), mayRunLoop(holds(name))], name).toEqual([true, true])
    for (const name of ['Account Manager', 'Recruiter', 'HR']) expect([mayReadLoop(holds(name)), mayRunLoop(holds(name))], name).toEqual([false, false])
  })

  it('no money loop screen imports a file that reads the database', () => {
    for (const f of SCREENS.filter((f) => f.includes('/dashboard/') || f.endsWith('lib/money-loop.ts'))) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/from '@\/lib\/(db|money\/money-chain|decision-items|record-ledger)'/)
    }
  })
})
