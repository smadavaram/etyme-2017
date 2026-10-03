import { describe, it, expect } from 'vitest'
import {
  mayChangeBenchPay, readPolicyChange, policySentence, firmHolidayView, latestPerPerson, personAnswer, readSwitch,
  turnedSays, BENCH_PAY_DESKS, type PolicyNow, type SwitchRow,
} from '@/lib/bench-holiday-switch'
import { BENCH_PROFIT_DESKS } from '@/lib/bench-profit'

/**
 * The bench pay policy and the holiday switches, as the door sees them
 * (founder, 2026-10-03: "A company setting, defaulting to no-pay, and each
 * candidate needs to be activated. GSI companies do autopay.").
 */

const reader = (roleName: string | null, companyKind: string | null = 'VENDOR') => ({
  companyName: 'Brightmoor Staffing', companyKind, roleName, consultantSeat: false,
})

const noPay: PolicyNow = { benchPolicy: 'NO_PAY', benchRateBps: null, benchCarryDays: null, reserveBps: null, reserveOnExit: 'PAY_OUT' }

const turn = (paid: boolean, day: string, name = 'Rahul Iyer', personId: string | null = null): SwitchRow => ({
  personId, paid, setAt: new Date(`${day}T12:00:00Z`), setBy: { name },
})

describe('who sets bench pay', () => {
  it('the owner, the admin and the finance desk may change bench pay, and a recruiter is told who can', () => {
    for (const desk of ['Owner', 'Admin', 'Finance']) expect(mayChangeBenchPay(reader(desk)).ok, desk).toBe(true)
    const r = mayChangeBenchPay(reader('Recruiter'))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.message).toContain('set by the owner, the admin and the finance desk')
      expect(r.message).toContain('(Recruiter)')
    }
  })

  it('the desks that set bench pay are the desks that read bench profit worked out under it', () => {
    expect([...BENCH_PAY_DESKS]).toEqual([...BENCH_PROFIT_DESKS])
  })

  it('a client has no bench pay to set, and is told so in a sentence', () => {
    const r = mayChangeBenchPay(reader('Owner', 'CLIENT'))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toBe('Brightmoor Staffing does not carry people between projects, so it has no bench pay to set.')
  })

  it('a program office runs no bench, so it has no bench pay either', () => {
    expect(mayChangeBenchPay(reader('Owner', 'MSP')).ok).toBe(false)
  })

  it("a consultant's own seat cannot change the firm's bench pay", () => {
    const r = mayChangeBenchPay({ ...reader('Owner'), consultantSeat: true })
    expect(r.ok).toBe(false)
  })
})

describe('the policy', () => {
  it('part pay with no share of pay is refused, because it could not be paid', () => {
    const r = readPolicyChange({ benchPolicy: 'REDUCED_RATE' }, noPay)
    expect(r).toMatchObject({ ok: false, field: 'benchRateBps' })
  })

  it('part pay at 100% is refused and pointed at full pay', () => {
    const r = readPolicyChange({ benchPolicy: 'REDUCED_RATE', benchRateBps: 10_000 }, noPay)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('choose full pay')
  })

  it('a bench paid from the reserve with nothing held back is refused', () => {
    const r = readPolicyChange({ benchPolicy: 'RESERVE_FUNDED' }, noPay)
    expect(r).toMatchObject({ ok: false, field: 'reserveBps' })
  })

  it('a carry limit of zero days or a fraction of a day is refused in a sentence', () => {
    for (const v of [0, 2.5, -3, '90']) {
      const r = readPolicyChange({ benchCarryDays: v }, noPay)
      expect(r, String(v)).toMatchObject({ ok: false, field: 'benchCarryDays' })
    }
    expect(readPolicyChange({ benchCarryDays: null }, noPay)).toMatchObject({ ok: true, data: { benchCarryDays: null } })
  })

  it('a policy nobody recognizes is refused rather than written', () => {
    expect(readPolicyChange({ benchPolicy: 'HALF' }, noPay).ok).toBe(false)
  })

  it('only the fields sent are changed', () => {
    const r = readPolicyChange({ benchPolicy: 'FULL_PAY', benchCarryDays: 60 }, noPay)
    expect(r).toEqual({ ok: true, data: { benchPolicy: 'FULL_PAY', benchCarryDays: 60 }, changed: ['benchPolicy', 'benchCarryDays'] })
  })

  it('the policy reads as one plain sentence: 50% of their pay for up to 90 days', () => {
    expect(policySentence({ ...noPay, benchPolicy: 'REDUCED_RATE', benchRateBps: 5_000, benchCarryDays: 90 }))
      .toBe('50% of their pay while waiting for a project, for up to 90 days.')
    expect(policySentence(noPay)).toBe('No bill, no pay: people waiting for a project are not paid while they wait.')
    expect(policySentence({ ...noPay, benchPolicy: 'FULL_PAY' }))
      .toBe('Full pay while waiting for a project, with no limit on how long.')
  })
})

describe('the holiday switches', () => {
  it('a firm that never turned holiday pay reads off by default, and says nobody turned it', () => {
    const v = firmHolidayView('VENDOR', [])
    expect(v.paid).toBe(false)
    expect(v.says).toBe('Holidays not paid (off for this firm)')
    expect(v.turned).toBeNull()
    expect(v.integratorNote).toBeNull()
  })

  it('an integrator reads on by default, with the reason beside it', () => {
    const v = firmHolidayView('GSI', [])
    expect(v.paid).toBe(true)
    expect(v.integratorNote).toContain('An integrator pays its own people for public holidays on the bench by default')
  })

  it("the latest turn of the firm's switch is in force and says who turned it and when", () => {
    const v = firmHolidayView('VENDOR', [turn(true, '2026-10-01'), turn(false, '2026-10-02', 'Ana Ortiz'), turn(true, '2026-10-03')])
    expect(v.paid).toBe(true)
    expect(v.turned).toBe('Switched on by Rahul Iyer, Oct 3, 2026')
    expect(v.says).toContain('turned on for this firm by Rahul Iyer, Oct 3')
  })

  it("a person's switch in the firm's list does not move the firm's own setting", () => {
    expect(firmHolidayView('VENDOR', [turn(true, '2026-10-03', 'Rahul Iyer', 'p1')]).paid).toBe(false)
  })

  it("a person's latest switch wins over their earlier ones", () => {
    const rows = [turn(true, '2026-10-01', 'A', 'p1'), turn(false, '2026-10-03', 'B', 'p1'), turn(true, '2026-10-02', 'C', 'p2')]
    const latest = latestPerPerson(rows)
    expect(latest.get('p1')!.paid).toBe(false)
    expect(latest.get('p2')!.paid).toBe(true)
    expect(latest.size).toBe(2)
  })

  it('a person switched on at a firm that pays no holidays is still not paid', () => {
    const a = personAnswer('VENDOR', [], turn(true, '2026-10-03', 'Rahul Iyer', 'p1'))
    expect(a.paid).toBe(false)
    expect(a.source).toBe('FIRM_OFF')
  })

  it('a person switched on at a firm that pays holidays is paid, and it says who switched them on', () => {
    const a = personAnswer('VENDOR', [turn(true, '2026-10-01')], turn(true, '2026-10-03', 'Rahul Iyer', 'p1'))
    expect(a.paid).toBe(true)
    expect(a.says).toBe('Paid for holidays: switched on by Rahul Iyer, Oct 3')
  })

  it('a holiday answer is only on or off; anything else is refused', () => {
    expect(readSwitch({ paid: true })).toEqual({ ok: true, paid: true })
    for (const v of ['yes', 1, null, undefined]) expect(readSwitch({ paid: v }).ok, String(v)).toBe(false)
  })

  it('a switch nobody has turned says nothing about who turned it', () => {
    expect(turnedSays(null)).toBeNull()
  })
})
