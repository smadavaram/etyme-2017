import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { CHAIN_STATES, nextState, amountNeededFor } from '@/lib/money/money-chain'
import {
  STATE_STRIP, COUNTED_STATES, TOTAL_LABEL, amountAskedFor, centsFrom, emptyMonthSays, historySays, mayReadLoop, mayRunLoop,
  monthBeside, monthKeyOf, nextMove, nextOf, readMonth, stateLabel,
  START_MONTH, seeMonth, noMonthSays, decidedSays, disputedShareSays, advanceFields, loadFields, openMonthFields,
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
    expect(emptyMonthSays('December 2026', 1, true)).toBe('1 consultant is on a running contract in December 2026, and the month is not started yet. Start it to put each one at “Timesheet owed”.')
    expect(emptyMonthSays('December 2026', 7, false)).toBe('7 consultants are on a running contract in December 2026, and the month is not started yet. A seat that runs payroll starts it.')
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

  const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
  const B2 = 'src/app/dashboard/money-loop/page.tsx'
  const B3 = 'src/app/dashboard/money-loop/placements/[id]/page.tsx'
  const B5 = 'src/app/dashboard/money-loop/periods/[month]/page.tsx'
  const FORM = 'src/app/dashboard/money-loop/advance-form.tsx'

  it('no sentence a person reads on the money loop says chain: a payroll clerk says month', () => {
    // Every quoted string and every run of drawn text, on the screens, in the routes, in the words and in the rules' own ledger lines.
    const all = [...SCREENS, join(process.cwd(), 'src/lib/money/money-chain.ts')]
    for (const f of all) {
      const lines = readFileSync(f, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l) && !/^\s*(import|export \* from)\b/.test(l) && !/\bfrom '[^']+'\s*$/.test(l))
      for (const l of lines) {
        const code = l.replace(/\s\/\/ .*$/, '')
        const said = [...code.matchAll(/'([^']*)'|`([^`]*)`|(?<!=)>([^<>{}]+)</g)].map((m) => (m[1] ?? m[2] ?? m[3]).replace(/\$\{[^}]*\}/g, ' '))
        for (const s of said) {
          if (/money-loop\/chains|money-chain/.test(s)) continue
          expect(s, `${f}: ${l.trim()}`).not.toMatch(/\bchains?\b/i)
        }
      }
    }
  })

  it('the button that creates a month’s records says “Start this month”, and the link to the month’s page says “See” and the month', () => {
    expect(START_MONTH).toBe('Start this month')
    expect(seeMonth('November 2026')).toBe('See November 2026')
    const page = read(B2)
    expect(page).toContain('<SubmitButton pending={busy}>{START_MONTH}</SubmitButton>')
    expect(page).toContain('{seeMonth(data.monthWords)}</Link>')
    // No button or link on the money loop says a bare "Open <something>" twice over: none says Open and the month.
    expect(page).not.toMatch(/>Open \{data\.monthWords\}</)
  })

  it('the form that starts a month is drawn only where its route would take it, so never for a month that has not begun', () => {
    expect(read(B2)).toContain('{data.mayStart && (')
    const route = read('src/app/api/money-loop/route.ts')
    expect(route).toContain('mayStart: seat.mayRun && notOpened > 0 && !notBegun')
    expect(route).toContain("if (notBegun) return refused(422, notBegun, 'month')")
  })

  it('the form that loads a past month as closed is drawn only for a month that has fully ended, and says why otherwise', () => {
    const page = read(B5)
    expect(page).toMatch(/\{!data\.load\.offered\s*\? <p[^>]*>\{data\.load\.says\}<\/p>/)
    expect(page).toContain('min={data.load.earliest} max={data.load.latest}')
    const route = read('src/app/api/money-loop/periods/[month]/route.ts')
    expect(route).toContain('load: { offered: seat.mayRun && !notEnded')
    expect(route).toContain("if (notEnded) return refused(422, notEnded, 'month')")
    expect(route).toContain("if (badDay) return refused(422, badDay, 'asOf')")
  })

  it('every refusal a money loop route sends has a place to show on the form that caused it: on its box where the form drew one, under the form otherwise', () => {
    // The entity box draws the route's sentence. It could not, so Save with no entity chosen did nothing and said nothing.
    const parts = read('src/app/dashboard/money-loop/parts.tsx')
    expect(parts).toMatch(/export function EntityField\(\{[^}]*\berror\b[^}]*\}/)
    expect(parts).toContain('<Field label="The legal entity this is done for" id={id} error={error}>')
    const form = read(FORM)
    // The move form: every field it may draw has a box that shows its refusal, and any other refusal is shown under the form.
    const moveFields = new Set(STATE_STRIP.flatMap((s) => advanceFields(s, true)))
    for (const f of moveFields) expect(form, f).toContain(`at('${f}')`)
    expect(form).toContain('{err && !draws.includes(err.field as keyof AdvanceTyped) && <FormMessage tone="error">{err.says}</FormMessage>}')
    // Returning a month from its dispute.
    expect(form).toContain('error={onEntity ? err!.says : undefined}')
    expect(form).toContain('{err && !onEntity && <FormMessage tone="error">{err.says}</FormMessage>}')
    // Loading a past month as closed.
    const load = read(B5)
    for (const f of loadFields(true)) expect(load.includes(`at('${f}')`) || load.includes(`money('${f}'`), f).toBe(true)
    expect(load).toContain("<Field label={label} id={`ml-load-${k}`} error={at(k)}>")
    expect(load).toContain("{said && !(said.tone === 'error' && draws.includes(said.field as keyof LoadTyped)) && <FormMessage tone={said.tone}>{said.says}</FormMessage>}")
    // Starting a month.
    const start = read(B2)
    expect(openMonthFields(true)).toEqual(['month', 'actingEntityId'])
    expect(start).toContain('error={onEntity ? said!.says : undefined}')
    expect(start).toContain('{said && !onEntity && <div className="mb-4"><FormMessage tone={said.tone}>{said.says}</FormMessage></div>}')
    // And every entity box on these screens is handed its refusal.
    for (const f of [FORM, B2, B5]) for (const m of read(f).matchAll(/<EntityField [^\n]*\/>/g)) expect(m[0], f).toContain('error={')
  })

  it('at phone width the consultants page and the month page stack each consultant as lines, and nothing scrolls sideways', () => {
    for (const f of [B2, B5]) {
      const page = read(f)
      expect(page, f).not.toContain('overflow-x-auto')
      expect(page, f).toContain('<table className="hidden sm:table ')
      expect(page, f).toContain('<ul className="sm:hidden ')
    }
    // What the sideways scroll hid is a line of its own on a phone.
    const list = read(B2).split('<ul className="sm:hidden ')[1]
    expect(list).toContain('Started {dayWords(r.start)}')
    expect(list).toContain('{monthState(r)}')
    const month = read(B5).split('<ul className="sm:hidden ')[1]
    for (const line of ['<StateChip state={c.state} label={c.label} />', 'Invoiced: ', 'Paid: ', '{nextOf(c)}']) expect(month, line).toContain(line)
    expect(read(B5)).toContain("{c.dispute.open ? 'Open the decision' : 'Decision recorded'}")
  })

  it('a month after a contract’s end says the contract ended on its last day, never that the month is not started', () => {
    const nov = readMonth('2026-11')!, jun = readMonth('2027-06')!, aug = readMonth('2026-08')!
    const line = { consultant: 'Rosa Delgado', start: new Date('2026-09-01T00:00:00Z'), end: new Date('2027-03-31T00:00:00Z') }
    expect(noMonthSays({ ...line, month: jun, notBegun: 'June 2027 has not begun. It can be started from Jun 1, 2027.' }))
      .toBe('Rosa Delgado’s contract ended on Mar 31, 2027, so there is no June 2027 to follow.')
    expect(noMonthSays({ ...line, month: aug, notBegun: null })).toBe('Rosa Delgado’s contract starts on Sep 1, 2026, so there is no August 2026 to follow yet.')
    expect(noMonthSays({ ...line, end: null, month: jun, notBegun: 'June 2027 has not begun. It can be started from Jun 1, 2027.' })).toBe('June 2027 has not begun. It can be started from Jun 1, 2027.')
    expect(noMonthSays({ ...line, month: nov, notBegun: null })).toMatch(/^November 2026 has not been started for Rosa Delgado\. A seat that runs payroll starts the month/)
    expect(read(B3)).toContain('{!c && <p className="text-[14px] text-etyme-muted">{data.noMonthSays}</p>}')
  })

  it('a month returned from a dispute keeps the link to its recorded decision, saying who decided, on which day, and what', () => {
    expect(decidedSays('Dana Owner', 'Nov 22, 2026', 'REJECTED')).toBe('Decided by Dana Owner on Nov 22, 2026: Rejected')
    expect(decidedSays('Dana Owner', 'Nov 22, 2026', 'APPROVED')).toBe('Decided by Dana Owner on Nov 22, 2026: Approved')
    expect(read(B3)).toContain('<DecisionLink id={d.decisionId}>{d.says}</DecisionLink>')
    expect(read(B5)).toContain('<DecisionLink id={c.decided.decisionId}>{c.decided.says}</DecisionLink>')
  })

  it('the payroll summary says how much of the total stated on timesheets is on disputed months', () => {
    expect(disputedShareSays('$16,000.00', 1)).toBe('$16,000.00 of this is on 1 disputed month.')
    expect(disputedShareSays('$31,250.00', 2)).toBe('$31,250.00 of this is on 2 disputed months.')
    expect(read(B5)).toContain('{disputedShareSays(amount(disputed.cents, disputed.currency), disputed.months)}')
  })

  it('no money loop screen imports a file that reads the database', () => {
    for (const f of SCREENS.filter((f) => f.includes('/dashboard/') || f.endsWith('lib/money-loop.ts'))) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/from '@\/lib\/(db|money\/money-chain|decision-items|record-ledger)'/)
    }
  })
})
