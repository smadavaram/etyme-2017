import { describe, it, expect } from 'vitest'
import {
  STAY_CHOICES, readStay, stayFields, stayOver, reminderDue, reminderLeadDays, renewFields, staySays, reminderText,
  endedSays, refusedSays, renewAskText,
} from '../../src/lib/bench-stay'

/**
 * A person chooses how long they stay on a bench — decided 2026-09-30.
 *
 * "Allow candidate to stay on bench for 5, 7, 15, 25, 50, 60, 500 days or
 * until cancelled." Chosen with the yes; the rules here, the doors and
 * the nightly job in `__integration__/bench-matching.test.ts`.
 */

const DAY = 86_400_000
const granted = new Date('2026-10-01T00:00:00Z')

describe('how long a person stays on a bench', () => {
  it('the choices are 5, 7, 15, 25, 50, 60 or 500 days, or until cancelled', () => {
    expect([...STAY_CHOICES]).toEqual([5, 7, 15, 25, 50, 60, 500])
  })

  it('until cancelled is the default and asks nothing more', () => {
    expect(readStay(undefined)).toEqual({ ok: true, days: null })
    expect(readStay(null)).toEqual({ ok: true, days: null })
    expect(stayFields(null, granted)).toEqual({ stayDays: null, staysUntil: null, stayRemindedAt: null })
    expect(stayOver({ staysUntil: null }, new Date('2030-01-01'))).toBe(false)
  })

  it('a choice that is not on the list is refused in a sentence', () => {
    const r = readStay(9)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.says).toContain('5, 7, 15, 25, 50, 60, 500 days, or until you cancel')
  })

  it('a person who chose seven days is out of every match on the eighth', () => {
    const f = stayFields(7, granted)
    expect(f.staysUntil).toEqual(new Date(granted.getTime() + 7 * DAY))
    expect(stayOver(f, new Date(granted.getTime() + 6 * DAY))).toBe(false)
    expect(stayOver(f, new Date(granted.getTime() + 7 * DAY))).toBe(true)
  })

  it('a person is reminded before their bench stay ends — two days ahead, one for the shortest stays', () => {
    expect(reminderLeadDays(5)).toBe(1)
    expect(reminderLeadDays(7)).toBe(1)
    expect(reminderLeadDays(15)).toBe(2)
    const f = stayFields(15, granted)
    expect(reminderDue(f, new Date(granted.getTime() + 12 * DAY))).toBe(false)
    expect(reminderDue(f, new Date(granted.getTime() + 13 * DAY))).toBe(true)
    // Once per stay.
    expect(reminderDue({ ...f, stayRemindedAt: new Date() }, new Date(granted.getTime() + 13 * DAY))).toBe(false)
  })

  it('a person can renew in one step, for the same stay again from today', () => {
    const now = new Date(granted.getTime() + 9 * DAY)
    const r = renewFields({ stayDays: 7, staysUntil: new Date(granted.getTime() + 7 * DAY), revokedAt: new Date(), lapsedAt: new Date() }, now)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.staysUntil).toEqual(new Date(now.getTime() + 7 * DAY))
      expect(r.data.revokedAt).toBeNull()
      expect(r.data.lapsedAt).toBeNull()
    }
  })

  it('a listing the person took back themselves cannot be renewed by a reminder link', () => {
    const r = renewFields({ stayDays: 7, staysUntil: null, revokedAt: new Date(), lapsedAt: null }, granted)
    expect(r.ok).toBe(false)
  })

  it('the stay is said in one plain sentence', () => {
    expect(staySays(stayFields(null, granted), 'Techpeple', granted)).toBe("You stay on Techpeple's bench until you cancel.")
    expect(staySays(stayFields(15, granted), 'Techpeple', granted)).toBe("You stay on Techpeple's bench until October 16, 2026 (15 days). After that it ends by itself.")
  })

  it('the reminder carries the one-tap renew link and says what was sent stays as it is', () => {
    const t = reminderText({ personName: 'Grace Lindqvist', firm: 'Techpeple', until: new Date('2026-10-16T00:00:00Z'), days: 15, url: 'https://x/bench-invite/abc' })
    expect(t.body).toContain('https://x/bench-invite/abc')
    expect(t.body).toContain('Anything already sent stays as it is.')
  })
})

describe('a firm whose name ends in s is written the way a person would write it', () => {
  const firm = 'Pellwright Validation Partners'
  const on = new Date('2026-10-16T00:00:00Z')

  it('"Pellwright Validation Partners\' bench", never "Partners\'s bench", on the person\'s own page', () => {
    const says = staySays(stayFields(null, granted), firm, granted)
    expect(says).toBe("You stay on Pellwright Validation Partners' bench until you cancel.")
    expect(says).not.toContain("Partners's")
  })

  it('the reminder, the renewal ask, and the firm\'s and the submit door\'s sentences use the same rule', () => {
    const all = [
      reminderText({ personName: 'Grace Lindqvist', firm, until: on, days: 15, url: 'u' }).subject,
      reminderText({ personName: 'Grace Lindqvist', firm, until: on, days: 15, url: 'u' }).body,
      renewAskText({ personName: 'Grace Lindqvist', firm, endedOn: on, days: 15, url: 'u' }).body,
      endedSays('Marcus Reyes', firm, on),
      refusedSays('Marcus Reyes', firm, on),
    ].join(' ')
    expect(all).not.toMatch(/s's\b/)
    expect(all).toContain("Pellwright Validation Partners' bench")
    expect(all).toContain("Marcus Reyes' ")
  })

  it('a firm whose name does not end in s still reads "Techpeple\'s bench"', () => {
    expect(staySays(stayFields(null, granted), 'Techpeple', granted)).toContain("Techpeple's bench")
  })
})
