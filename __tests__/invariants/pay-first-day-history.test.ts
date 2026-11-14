import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  FIRST_PERIOD_WHO,
  FIRST_DAY_CHANGED_REASON,
  firstDayChangedSays,
  firstDayRefusedSays,
  firstDayChangeWarning,
  asksBeforeFirstDayChange,
  askedFirstDay,
} from '@/lib/pay-dates'
import { ADMIN_PERMISSIONS } from '@/lib/company-defaults'
import { ACTIONS } from '@/lib/autonomy'

/**
 * Who sets the first pay period's first day, the history of it, and the
 * warning before it moves under pay already recorded (the skeptic's walk
 * of the pay periods, 2026-11-14). The founder has not said which Sunday,
 * so the cases use all three he may choose: Dec 6, Dec 13 and Dec 27, 2026.
 */

const PANEL = readFileSync(join(process.cwd(), 'src/components/settings/payroll-panel.tsx'), 'utf8')
const ROUTE = readFileSync(join(process.cwd(), 'src/app/api/settings/payroll/route.ts'), 'utf8')
const SETTINGS = readFileSync(join(process.cwd(), 'src/lib/payroll-settings.ts'), 'utf8')

const words = (s: string) => s.trim().split(/\s+/).length
const sentences = (s: string) => s.split(/(?<=\.)\s+/).filter(Boolean)

describe('a change of the first pay day leaves a history', () => {
  it('a change of the first pay day is said with the old day, the new day and who changed it', () => {
    expect(firstDayChangedSays('Asha Rao', '2026-12-06', '2026-12-13'))
      .toBe('Asha Rao changed the first pay period’s first day from Dec 6, 2026 to Dec 13, 2026.')
    expect(firstDayChangedSays('Asha Rao', '2026-12-13', '2026-12-27'))
      .toBe('Asha Rao changed the first pay period’s first day from Dec 13, 2026 to Dec 27, 2026.')
  })

  it('setting the first day the first time, and clearing it, are each said as what they are', () => {
    expect(firstDayChangedSays('Asha Rao', null, '2026-12-06'))
      .toBe('Asha Rao set the first pay period’s first day to Dec 6, 2026.')
    expect(firstDayChangedSays('Asha Rao', '2026-12-27', null))
      .toBe('Asha Rao cleared the first pay period’s first day, which was Dec 27, 2026.')
  })

  it('a refused change is said with the day as it stands and the day that was asked for', () => {
    expect(firstDayRefusedSays('Ben Ito', '2026-12-27', '2026-12-06'))
      .toBe('Ben Ito was refused changing the first pay period’s first day from Dec 27, 2026 to Dec 6, 2026.')
    expect(firstDayRefusedSays('Ben Ito', null, '2026-12-13'))
      .toBe('Ben Ito was refused changing the first pay period’s first day from not set to Dec 13, 2026.')
    expect(askedFirstDay('')).toBeNull()
    expect(askedFirstDay(' 2026-12-06 ')).toBe('2026-12-06')
  })

  it('the change and the refusal are each written to the activity log, the refusal before it is sent', () => {
    // The row a change writes sits in the same transaction as the change.
    const set = SETTINGS.slice(SETTINGS.indexOf('export async function setPaySettings'), SETTINGS.indexOf('export async function recordFirstDayRefused'))
    expect(set).toContain('prisma.$transaction(')
    expect(set).toContain("action: 'PAY_FIRST_DAY_CHANGED'")
    expect(set).toContain('payload: { from, to, by: byId }')
    expect(SETTINGS).toContain("action: 'PAY_FIRST_DAY_CHANGE_REFUSED'")
    // The route waits for the refusal's row before it sends the refusal.
    const patch = ROUTE.slice(ROUTE.indexOf('export async function PATCH'))
    expect(patch.indexOf('await recordFirstDayRefused(')).toBeGreaterThan(-1)
    expect(patch.indexOf('await recordFirstDayRefused(')).toBeLessThan(patch.indexOf('return g.error'))
  })

  it('on the activity log a change is a person’s own act, and a refusal is a block with nothing to undo', () => {
    expect(ACTIONS.PAY_FIRST_DAY_CHANGED).toMatchObject({ kind: 'ATTRIBUTED', basis: 'RULE' })
    expect(ACTIONS.PAY_FIRST_DAY_CHANGE_REFUSED).toMatchObject({ kind: 'ENFORCEMENT', outcome: 'BLOCK' })
    expect(FIRST_DAY_CHANGED_REASON).toBe('Pay already recorded stays as it is. Pay periods are counted from the new first day.')
  })
})

describe('the screen says who sets the first day, as the route allows', () => {
  it('the Settings screen says the Owner or an Admin sets the first day, because an Admin may change payroll too', () => {
    expect(FIRST_PERIOD_WHO).toBe('The Owner or an Admin sets it.')
    expect(ADMIN_PERMISSIONS).toContain('settings.manage')
    expect(ROUTE).toContain("hasPermission(caller.permissions, 'settings.manage')")
    const weekBranch = PANEL.slice(PANEL.indexOf('{byWeek ? ('), PANEL.indexOf(') : (', PANEL.indexOf('{byWeek ? (')))
    expect(weekBranch).toContain('{FIRST_PERIOD_WHO}')
  })
})

describe('moving the first day under pay already recorded asks first', () => {
  it('where the company has run payroll, Save asks before moving the first day to another Sunday', () => {
    expect(asksBeforeFirstDayChange('2026-12-06', '2026-12-13', true)).toBe(true)
    expect(asksBeforeFirstDayChange('2026-12-13', '2026-12-27', true)).toBe(true)
    expect(asksBeforeFirstDayChange(null, '2026-12-06', true)).toBe(true)
  })

  it('with no payroll run, the same day, or the day cleared, Save does not ask', () => {
    expect(asksBeforeFirstDayChange('2026-12-06', '2026-12-13', false)).toBe(false)
    expect(asksBeforeFirstDayChange('2026-12-27', '2026-12-27', true)).toBe(false)
    expect(asksBeforeFirstDayChange('2026-12-27', null, true)).toBe(false)
  })

  it('the question is one sentence saying pay already recorded stays as it is and periods count from the new day', () => {
    for (const [day, said] of [['2026-12-06', 'Dec 6, 2026'], ['2026-12-13', 'Dec 13, 2026'], ['2026-12-27', 'Dec 27, 2026']]) {
      const s = firstDayChangeWarning(day)
      expect(s).toBe(`Pay already recorded stays as it is, and pay periods from here on are counted from ${said}.`)
      expect(sentences(s)).toHaveLength(1)
      expect(words(s)).toBeLessThan(25)
    }
  })

  it('the screen shows that sentence with Save and Cancel, and saves only when Save is pressed', () => {
    expect(PANEL).toContain('firstDayChangeWarning(draft.payFirstPeriodStart)')
    expect(PANEL).toContain('asksBeforeFirstDayChange(saved?.payFirstPeriodStart ?? null, draft.payFirstPeriodStart ?? null, !!saved?.payrollRun)')
    expect(PANEL).toContain('onClick={() => save(true)}')
    expect(PANEL).toMatch(/onClick=\{\(\) => setAsking\(false\)\}[\s\S]{0,200}Cancel/)
    expect(ROUTE).toContain('payrollRun: await hasRunPayroll(companyId)')
  })

  it('every new sentence is under twenty-five words and never says desk or program office', () => {
    const all = [
      FIRST_PERIOD_WHO, FIRST_DAY_CHANGED_REASON,
      firstDayChangedSays('Asha Rao', '2026-12-06', '2026-12-13'),
      firstDayRefusedSays('Ben Ito', '2026-12-27', '2026-12-06'),
      firstDayChangeWarning('2026-12-13'),
    ]
    for (const text of all) {
      for (const s of sentences(text)) expect(words(s), s).toBeLessThan(25)
      expect(text).not.toMatch(/\bdesk\b|program office/i)
    }
  })
})
