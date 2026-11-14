import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  needsSigningInEtyme, offEtymeAsks, checkOffEtymeSignOff, clientSaysOn, OFF_ETYME_OVERTIME, type WeekChain,
} from '@/lib/week-approval'
import { topDown, signersOf, type LadderRung } from '@/app/api/timesheets/chain-turn'
import {
  payrollLineSays, holidaySeedOffers, holidaysFrom, DEFAULT_PAY_RHYTHM,
  FIRST_PERIOD_LABEL, FIRST_PERIOD_HELP, FIRST_DAY_CONFIRM_TITLE, FIRST_DAY_CONFIRM_BUTTON, type PayRhythm,
} from '@/lib/pay-dates'
import { usFederalHolidays } from '@/lib/holidays'
import { noCalendarSays } from '@/app/api/settings/no-calendar'

/**
 * The Tapin walk of 2026-11-14 (tags tpc and tpd), the architect's four
 * items: a long week at a client not on Etyme, the payroll panel, the
 * holiday set for the rest of this year, and Settings, Cycles with no
 * calendar of its own.
 */

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

// Lakeshore Mills buys from Brightmoor Staffing, who employs Marisol Quintero.
const RUNG: LadderRung = { sellContractId: 'bm-rung', companyId: 'brightmoor', clientCompanyId: 'lakeshore', endClientCompanyId: null, supplierSellContractId: null }
const LADDER = topDown([RUNG])
const LONG = { '2026-10-12': 10, '2026-10-13': 9, '2026-10-14': 9, '2026-10-15': 9, '2026-10-16': 9 }

function week(over: Partial<WeekChain['week']> = {}, chain: Partial<WeekChain> = {}, multiplierBps: number | null = null): WeekChain {
  return {
    week: {
      id: 'w', personId: 'marisol', personName: 'Marisol Quintero', personEmail: 'm@x.example',
      periodStart: new Date('2026-10-11T00:00:00Z'), periodEnd: new Date('2026-10-17T00:00:00Z'),
      totalHours: 46, days: LONG, leaveDays: {}, status: 'SUBMITTED', submittedAt: new Date('2026-10-17T00:00:00Z'),
      clientApprovedAt: null, employerAcceptedAt: null, sellContractId: 'bm-rung',
      anomalyScore: null, anomalyReason: null, hoursPerWeek: null, contractEnd: null, decisions: [],
      ...over,
    },
    ladder: LADDER,
    rungs: new Map([
      ['bm-rung', { id: 'bm-rung', companyId: 'brightmoor', clientCompanyId: 'lakeshore', endClientCompanyId: null, sellerName: 'Brightmoor Staffing', buyerName: 'Lakeshore Mills', billRate: 7000, overtimeAfterHours: null, overtimeMultiplierBps: multiplierBps }],
    ]),
    signers: signersOf(LADDER),
    clientId: 'lakeshore',
    clientName: 'Lakeshore Mills',
    clientOffPlatform: true,
    employerId: 'brightmoor',
    names: new Map([['lakeshore', 'Lakeshore Mills'], ['brightmoor', 'Brightmoor Staffing']]),
    ...chain,
  }
}

describe('a week over forty hours at a client that is not on Etyme', () => {
  it('asks for the client’s reason and how it approved the hours over forty, instead of refusing, and the link stays refused', () => {
    const c = week()
    expect(needsSigningInEtyme(c)).toBe(
      '46h claimed on a 40h-a-week job. A week like this is signed in Etyme by somebody at Lakeshore Mills, with the reason it is right, so it cannot be approved by email.'
    )
    expect(offEtymeAsks(c)).toEqual({
      says: '46h claimed on a 40h-a-week job. Lakeshore Mills is not on Etyme, so attach its approval with its reason and its answer on the extra hours.',
      reasonLabel: 'Why the week is right, in the words of Lakeshore Mills',
      overtime: {
        hours: 6, afterHours: 40,
        asks: 'How Lakeshore Mills approved the 6 hours over 40',
        choices: [
          { value: 'SAME_RATE', label: 'At the usual rate' },
          { value: 'PREMIUM', label: 'At a premium, time and a half' },
        ],
      },
    })
    expect(OFF_ETYME_OVERTIME).toEqual(['SAME_RATE', 'PREMIUM'])
  })

  it('a long week at a client that is on Etyme is still signed in Etyme, with the refusal word for word as before', () => {
    const c = week({}, { clientOffPlatform: false })
    expect(offEtymeAsks(c)).toBeNull()
    expect(checkOffEtymeSignOff(c, { clientReason: 'Plant shutdown', overtime: 'SAME_RATE', approverName: 'Ruth Abara' })).toBeNull()
    expect(needsSigningInEtyme(c)).toMatch(/A week like this is signed in Etyme by somebody at Lakeshore Mills, with the reason it is right, so it cannot be approved by email\.$/)
  })

  it('a week whose employer is also its client is still approved in Etyme, even where that client is not on Etyme', () => {
    const c = week({}, { employerId: 'lakeshore' })
    expect(offEtymeAsks(c)).toBeNull()
    expect(needsSigningInEtyme(c)).toBe('Lakeshore Mills employs Marisol Quintero and is also the client on this week, so it approves the week in Etyme.')
  })

  it('an attached approval of a long week is refused without the client’s reason, in a sentence', () => {
    for (const clientReason of [undefined, '', '   ']) {
      expect(checkOffEtymeSignOff(week(), { clientReason, overtime: 'SAME_RATE', approverName: 'Ruth Abara' })).toEqual({
        ok: false, status: 422, code: 'VALIDATION', field: 'clientReason',
        says: 'Give the reason Lakeshore Mills gave for this week, in its own words. It goes on the approval.',
      })
    }
  })

  it('an attached approval of a long week is refused without how the client approved the extra hours, and nothing is defaulted', () => {
    for (const overtime of [undefined, '', 'TIME_OFF', 'premium']) {
      expect(checkOffEtymeSignOff(week(), { clientReason: 'Line changeover ran long', overtime, approverName: 'Ruth Abara' })).toEqual({
        ok: false, status: 422, code: 'VALIDATION', field: 'overtime',
        says: 'Say how Lakeshore Mills approved the 6 hours over 40: at the usual rate, or at a premium.',
      })
    }
  })

  it('the client’s yes at the usual rate prices the six hours at the usual rate, and both answers are written on the approval', () => {
    const v = checkOffEtymeSignOff(week(), { clientReason: ' Line changeover ran long ', overtime: 'SAME_RATE', approverName: 'Ruth Abara' })
    expect(v && v.ok).toBe(true)
    if (!v || !v.ok) return
    expect(v.signOff.decisions).toEqual([{ weekOf: '2026-10-11', overtimeHours: 6, treatment: 'SAME_RATE', appliedBps: 10_000 }])
    expect(v.signOff.says).toBe('Reason given by Lakeshore Mills: “Line changeover ran long”. Ruth Abara approved the 6 hours over 40 at the usual rate.')
  })

  it('the client’s yes at a premium prices the hours at the contract’s own multiple', () => {
    const v = checkOffEtymeSignOff(week({}, {}, 20_000), { clientReason: 'Audit week', overtime: 'PREMIUM', approverName: 'Ruth Abara' })
    if (!v || !v.ok) throw new Error('refused')
    expect(v.signOff.decisions[0]).toMatchObject({ treatment: 'PREMIUM', appliedBps: 20_000, overtimeHours: 6 })
    expect(v.signOff.says).toBe('Reason given by Lakeshore Mills: “Audit week”. Ruth Abara approved the 6 hours over 40 at double time.')
  })

  it('what the client said is read back off its signature, and nothing is read off a signature that carries only its words', () => {
    const words = 'Approved by email: Ruth Abara, ruth@lakeshore.example — Lakeshore Mills was not on Etyme'
    expect(clientSaysOn(`${words}. Reason given by Lakeshore Mills: “Audit week”.`, words)).toBe('Reason given by Lakeshore Mills: “Audit week”.')
    expect(clientSaysOn(words, words)).toBeNull()
    expect(clientSaysOn(null, words)).toBeNull()
  })

  it('every question the attach route asks on a long week, the week page has a field for and sends', () => {
    const page = src('src/app/dashboard/weeks/[id]/page.tsx')
    const route = src('src/app/api/week-approvals/route.ts')
    for (const field of ['clientReason', 'overtime']) {
      expect(route).toContain(`form.get('${field}')`)
      expect(page).toContain(`fd.set('${field}'`)
      expect(page).toContain(`name="${field}"`)
    }
    // Asked only on such a week, and the client's words are shown on the approval.
    expect(page).toContain('asks.reasonLabel')
    expect(page).toContain('asks.overtime.choices.map')
    expect(page).toContain('{a.clientSays && ')
  })
})

describe('the payroll panel in Settings', () => {
  const biweekly = (first: string | null): PayRhythm => ({ ...DEFAULT_PAY_RHYTHM, payPeriod: 'BIWEEKLY', payDayOffsetDays: 6, payCalcOffsetDays: 4, payFirstPeriodStart: first })

  it('says the company’s own current pay period and its two days once its Sunday is set, and never a period that does not exist', () => {
    const today = new Date('2026-11-14T15:00:00Z')
    expect(payrollLineSays(biweekly('2026-10-11'), today)).toBe(
      'This pay period is Nov 8 – Nov 21, 2026. Its pay is worked out Wed, Nov 25, 2026 and paid Fri, Nov 27, 2026.'
    )
    expect(payrollLineSays(biweekly('2026-10-11'), today)).not.toContain('Nov 14')
  })

  it('keeps the example line only where the Sunday is not set', () => {
    expect(payrollLineSays(biweekly(null), new Date('2026-11-14T15:00:00Z'))).toBe(
      'A period ending Sat, Nov 14 is worked out Wed, Nov 18 and paid Fri, Nov 20.'
    )
  })

  it('a pay day on a holiday on the company’s calendar is said moved on the current period’s line', () => {
    const said = payrollLineSays(biweekly('2026-12-06'), new Date('2026-12-10T12:00:00Z'), { holidays: ['2026-12-25'] })
    expect(said).toBe(
      'This pay period is Dec 6 – Dec 19, 2026. Its pay is worked out Wed, Dec 23, 2026 and paid Thu, Dec 24, 2026. The pay day moved from Fri, Dec 25, 2026, a day off or a holiday.'
    )
  })

  it('the setting is called the Sunday pay periods are counted from, and its one line says periods run before and after it', () => {
    expect(FIRST_PERIOD_LABEL).toBe('The Sunday your pay periods are counted from')
    expect(FIRST_PERIOD_HELP).toBe('Pick any Sunday a pay period starts on. Periods run Sunday to Saturday, before and after it.')
  })

  it('a Sunday typed and not saved shows its first period and pay day before Save, by the company’s own day-off rule', () => {
    const panel = src('src/components/settings/payroll-panel.tsx')
    expect(panel).toContain('payPeriodHolding(firstCheck.day, draft, rule)')
    expect(panel).toContain('firstPeriodSays(firstShown)')
    expect(panel).toContain("' Not saved yet.'")
    expect(src('src/app/api/settings/payroll/route.ts')).toContain('dayOffRule: rule')
  })

  it('the second press to save a moved Sunday has its own heading, is focused, and names what it does, never a bare Save', () => {
    const panel = src('src/components/settings/payroll-panel.tsx')
    expect(FIRST_DAY_CONFIRM_TITLE).toBe('One more press: save the new Sunday?')
    expect(FIRST_DAY_CONFIRM_BUTTON).toBe('Yes, count pay periods from the new Sunday')
    const box = panel.slice(panel.indexOf('role="alertdialog"'), panel.indexOf('</div>', panel.indexOf('onClick={() => save(true)}')))
    expect(box).toContain('{FIRST_DAY_CONFIRM_TITLE}')
    expect(box).toContain('FIRST_DAY_CONFIRM_BUTTON')
    expect(box).toContain('ref={confirmRef}')
    expect(box).not.toMatch(/>\s*Save\s*</)
    expect(panel).toContain('confirmRef.current?.focus()')
  })

  it('where the holiday calendar is empty, the panel says beside the pay day what the Payroll page says', () => {
    expect(src('src/app/api/settings/payroll/route.ts')).toContain('noHolidays: noHolidaysSays(companyName, rule)')
    expect(src('src/components/settings/payroll-panel.tsx')).toContain('saved.noHolidays')
  })
})

describe('Settings, Holidays', () => {
  it('in November the one-press sets are the rest of this year and all of next year', () => {
    expect(holidaySeedOffers(new Date('2026-11-14T12:00:00Z'))).toEqual([
      { year: 2026, from: '2026-11-14', label: 'Add US holidays for the rest of 2026' },
      { year: 2027, from: null, label: 'Add US holidays for 2027' },
    ])
    const page = src('src/app/dashboard/settings/page.tsx')
    expect(page).toContain('holidaySeedOffers(new Date())')
    expect(page).toContain('from: o.from')
  })

  it('the rest of this year adds only the days still to come, so Christmas Day is added in November without typing it', () => {
    const rest = holidaysFrom(usFederalHolidays(2026), '2026-11-14')
    expect(rest.map((h) => h.date)).toContain('2026-12-25')
    expect(rest.every((h) => h.date >= '2026-11-14')).toBe(true)
    expect(rest.map((h) => h.date)).not.toContain('2026-07-03')
    expect(holidaysFrom(usFederalHolidays(2027), null)).toHaveLength(usFederalHolidays(2027).length)
  })
})

describe('Settings, Cycles, for a company with no calendar of its own', () => {
  const offer = { id: 'US_IT', label: 'US weekly hours, biweekly pay' }

  it('says which calendar its contracts use, which get no due dates, and the Owner’s step, in a payroll person’s words', () => {
    const said = noCalendarSays({ companyName: 'Brightmoor Staffing', fallbackLabel: 'US weekly hours, biweekly pay', offer, canEdit: true })
    expect(said.says).toEqual([
      'Brightmoor Staffing has no calendar of due dates of its own yet.',
      'A contract from an award, an extension or the bench uses the "US weekly hours, biweekly pay" calendar instead.',
      'A placement recorded by hand, or a submission turned into a contract, gets no due dates.',
      'So no timesheet is due on it, and no bill or pay date is set.',
      'Set the "US weekly hours, biweekly pay" calendar below. Contracts made after that take their dates from it.',
    ])
    expect(said.offer).toEqual(offer)
    for (const s of said.says) expect(s.split(/\s+/).length).toBeLessThanOrEqual(25)
  })

  it('a reader who may not change settings is told who can set it, and is offered no button', () => {
    const said = noCalendarSays({ companyName: 'Brightmoor Staffing', fallbackLabel: 'US weekly hours, biweekly pay', offer, canEdit: false })
    expect(said.says[said.says.length - 1]).toBe('Your Owner or an Admin can set one here.')
    expect(said.offer).toBeNull()
  })

  it('the contract doors that fall back to a calendar fall back to the one the sentence names', () => {
    for (const p of ['src/app/api/submissions/[id]/award/route.ts', 'src/app/api/contracts/[id]/extend/route.ts', 'src/app/api/bench/ours/holds/[id]/place/route.ts']) {
      expect(src(p)).toContain("templatePack ?? 'US_IT'")
    }
    expect(src('src/app/api/contracts/route.ts')).toContain('if (company.templatePack && end)')
    expect(src('src/app/api/submissions/[id]/convert/route.ts')).toContain('if (submission.fromCompany.templatePack && end)')
  })

  it('Settings never tells a company "This should not happen — tell somebody"', () => {
    const page = src('src/app/dashboard/settings/page.tsx')
    expect(page).not.toContain('This should not happen — tell somebody')
    expect(page).not.toContain('No template pack')
    expect(page).toContain('data.noCalendar?.says')
  })
})
