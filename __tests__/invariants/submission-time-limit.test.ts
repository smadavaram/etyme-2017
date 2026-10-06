import { describe, it, expect } from 'vitest'
import { timeLimitAtSubmission, reasonGiven, addMonths, type TimeLimitRules } from '@/app/api/submissions/time-limit'
import { workAuthAtSubmission } from '@/app/api/submissions/work-authorization'
import { daysFor } from '@/lib/tenure-days'

/**
 * The time limit and work authorization, asked where a person is put
 * forward (Addendum E). Tenure is the person's at the client, across
 * every supplier; the counting is regulatory's (`lib/tenure-days`).
 */

const NOW = new Date('2026-10-05T00:00:00Z')
const day = (iso: string) => new Date(`${iso}T00:00:00Z`)
const daysBefore = (n: number) => new Date(NOW.getTime() - n * 86_400_000)

const LIMIT_18: TimeLimitRules = { capMonths: 18, capMode: 'BLOCK', breakDays: 90, breakMode: 'BLOCK' }
const base = { personName: 'Priya Raman', clientName: 'Northbend Athletic', now: NOW }
const job = (months: number | null, startDate: Date | null = null) => ({ startDate, months })

describe('the client’s time limit, at the door where a person is put forward', () => {
  it('a person still on site past the client’s time limit is refused, with the earliest day after the break they owe', () => {
    const v = timeLimitAtSubmission({
      ...base, rules: LIMIT_18, job: job(6),
      contracts: [{ startDate: daysBefore(daysFor(18) + 10), endDate: day('2026-12-31'), state: 'IN_PROGRESS' }],
    })
    expect(v.outcome).toBe('BLOCK')
    if (v.outcome === 'PASS') throw new Error('expected a refusal')
    expect(v.code).toBe('TIME_LIMIT_REACHED')
    // The contract ends Dec 31; a 90-day break runs to Mar 31.
    expect(v.eligibleOn?.toISOString().slice(0, 10)).toBe('2027-03-31')
    expect(v.says).toContain('Northbend Athletic')
    expect(v.says).toContain('Mar 31, 2027')
  })

  it('tenure from two suppliers is added together, and a chain’s two rungs on the same days count once', () => {
    // Ten months through one firm, then ten through another: twenty months.
    const twenty = timeLimitAtSubmission({
      ...base, rules: LIMIT_18, job: job(3),
      contracts: [
        { startDate: daysBefore(620), endDate: daysBefore(316), state: 'ENDED' },
        { startDate: daysBefore(310), endDate: null, state: 'IN_PROGRESS' },
      ],
    })
    expect(twenty.outcome).toBe('BLOCK')
    // The same ten months held by a prime and its sub is ten months, not twenty.
    const chain = timeLimitAtSubmission({
      ...base, rules: LIMIT_18, job: job(1),
      contracts: [
        { startDate: daysBefore(300), endDate: null, state: 'IN_PROGRESS' },
        { startDate: daysBefore(300), endDate: null, state: 'IN_PROGRESS' },
      ],
    })
    expect(chain.outcome).toBe('PASS')
  })

  it('a person past the limit who has left is refused until the break ends, and the sentence gives that day', () => {
    const v = timeLimitAtSubmission({
      ...base, rules: LIMIT_18, job: job(6),
      contracts: [{ startDate: daysBefore(600), endDate: daysBefore(30), state: 'ENDED' }],
    })
    expect(v.outcome).toBe('BLOCK')
    if (v.outcome === 'PASS') throw new Error('expected a refusal')
    expect(v.code).toBe('TIME_LIMIT_REACHED')
    expect(v.eligibleOn?.getTime()).toBe(daysBefore(30).getTime() + 90 * 86_400_000)
  })

  it('a person past the limit whose break has been served may be put forward again, as the tenure ledger reads them', () => {
    const v = timeLimitAtSubmission({
      ...base, rules: LIMIT_18, job: job(null),
      contracts: [{ startDate: daysBefore(800), endDate: daysBefore(200), state: 'ENDED' }],
    })
    expect(v.outcome).toBe('PASS')
  })

  it('a client with a limit and no break rule gives no day of eligibility, and the refusal says so rather than inventing one', () => {
    const v = timeLimitAtSubmission({
      ...base, rules: { ...LIMIT_18, breakDays: null }, job: job(6),
      contracts: [{ startDate: daysBefore(700), endDate: daysBefore(10), state: 'ENDED' }],
    })
    expect(v.outcome).toBe('BLOCK')
    if (v.outcome === 'PASS') throw new Error('expected a refusal')
    expect(v.eligibleOn).toBeNull()
    expect(v.says).toContain('no day')
  })

  it('a person inside the client’s break, under the limit, is refused until the break ends', () => {
    const v = timeLimitAtSubmission({
      ...base, rules: LIMIT_18, job: job(6),
      contracts: [{ startDate: daysBefore(200), endDate: daysBefore(20), state: 'ENDED' }],
    })
    expect(v.outcome).toBe('BLOCK')
    if (v.outcome === 'PASS') throw new Error('expected a refusal')
    expect(v.code).toBe('IN_BREAK')
    expect(v.eligibleOn?.getTime()).toBe(daysBefore(20).getTime() + 90 * 86_400_000)
  })

  it('a client that set its time limit to warn is warned, not refused', () => {
    const v = timeLimitAtSubmission({
      ...base, rules: { ...LIMIT_18, capMode: 'WARN' }, job: job(6),
      contracts: [{ startDate: daysBefore(600), endDate: null, state: 'IN_PROGRESS' }],
    })
    expect(v.outcome).toBe('WARN')
  })

  it('a job whose length would carry the person past the limit warns, with the day the limit falls, and asks for a reason', () => {
    // Fifteen months served; a six-month job takes them past eighteen.
    const v = timeLimitAtSubmission({
      ...base, rules: { ...LIMIT_18, breakDays: null }, job: job(6, day('2026-11-01')),
      contracts: [{ startDate: daysBefore(457), endDate: daysBefore(1), state: 'ENDED' }],
    })
    expect(v.outcome).toBe('WARN')
    if (v.outcome === 'PASS') throw new Error('expected a warning')
    expect(v.code).toBe('RUNS_PAST_LIMIT')
    expect(v.reachedOn).not.toBeNull()
    expect(v.reachedOn!.getTime()).toBeLessThan(addMonths(day('2026-11-01'), 6).getTime())
    expect(v.says).toContain('Give a reason')
  })

  it('a job that ends before the limit is reached passes without a word', () => {
    const v = timeLimitAtSubmission({
      ...base, rules: { ...LIMIT_18, breakDays: null }, job: job(3),
      contracts: [{ startDate: daysBefore(100), endDate: daysBefore(1), state: 'ENDED' }],
    })
    expect(v).toEqual({ outcome: 'PASS', unknown: null })
  })

  it('a job with no length is not guessed at: it passes and says the question could not be answered', () => {
    const v = timeLimitAtSubmission({
      ...base, rules: { ...LIMIT_18, breakDays: null }, job: job(null),
      contracts: [{ startDate: daysBefore(450), endDate: daysBefore(1), state: 'ENDED' }],
    })
    expect(v.outcome).toBe('PASS')
    if (v.outcome !== 'PASS') throw new Error('expected a pass')
    expect(v.unknown).toContain('not known')
  })

  it('a client with no time limit and no break says nothing at all', () => {
    const v = timeLimitAtSubmission({
      ...base, rules: { capMonths: null, capMode: 'BLOCK', breakDays: null, breakMode: 'BLOCK' }, job: job(24),
      contracts: [{ startDate: daysBefore(900), endDate: null, state: 'IN_PROGRESS' }],
    })
    expect(v).toEqual({ outcome: 'PASS', unknown: null })
  })

  it('a month on from the 31st is the last day of the shorter month', () => {
    expect(addMonths(day('2027-01-31'), 1).toISOString().slice(0, 10)).toBe('2027-02-28')
    expect(addMonths(day('2026-11-01'), 6).toISOString().slice(0, 10)).toBe('2027-05-01')
  })

  it('a reason is a sentence: given per person or once for the batch, and a word or two of filler is not one', () => {
    expect(reasonGiven({ reason: 'ok' }, 'p1')).toBeNull()
    expect(reasonGiven({ reason: 'The client asked for her by name for the cutover.' }, 'p1')).toContain('cutover')
    expect(reasonGiven({ reason: 'batch reason, long enough', reasons: { p1: 'Her own reason, long enough.' } }, 'p1'))
      .toBe('Her own reason, long enough.')
    expect(reasonGiven({}, 'p1')).toBeNull()
  })
})

describe('work authorization, warned at submission and refused at activation', () => {
  const who = { personName: 'Priya Raman', now: NOW }

  it('a person with no work authorization on record is warned about, and the submission still goes through', () => {
    const v = workAuthAtSubmission({ ...who, rows: [], startsOn: null })
    expect(v.ok).toBe(false)
    if (v.ok) throw new Error('expected a warning')
    expect(v.code).toBe('NO_WORK_AUTH')
    expect(v.says).toContain('no work authorization on record')
    expect(v.says).toContain('goes through')
  })

  it('a check still running is not authorization on record', () => {
    const v = workAuthAtSubmission({ ...who, rows: [{ type: 'I9_EVERIFY', status: 'IN_PROGRESS' }], startsOn: null })
    expect(v.ok).toBe(false)
  })

  it('authorization that runs out before the job starts is warned about, with both days', () => {
    const v = workAuthAtSubmission({
      ...who,
      rows: [{ type: 'I9_EVERIFY', status: 'CLEAR', expiresAt: day('2026-11-15') }],
      startsOn: day('2026-12-01'),
    })
    expect(v.ok).toBe(false)
    if (v.ok) throw new Error('expected a warning')
    expect(v.code).toBe('WORK_AUTH_RUNS_OUT')
    expect(v.says).toContain('Nov 15, 2026')
    expect(v.says).toContain('Dec 1, 2026')
  })

  it('authorization that begins after the job starts is warned about', () => {
    const v = workAuthAtSubmission({
      ...who,
      rows: [{ type: 'RIGHT_TO_WORK', status: 'CLEAR', validFrom: day('2027-01-10') }],
      startsOn: day('2026-12-01'),
    })
    expect(v.ok).toBe(false)
    if (v.ok) throw new Error('expected a warning')
    expect(v.code).toBe('WORK_AUTH_NOT_YET')
  })

  it('a cleared I-9 that covers the first day says nothing', () => {
    const v = workAuthAtSubmission({
      ...who,
      rows: [{ type: 'I9_EVERIFY', status: 'CLEAR', expiresAt: null }],
      startsOn: day('2026-12-01'),
    })
    expect(v).toEqual({ ok: true })
  })

  it('a background check is not work authorization', () => {
    const v = workAuthAtSubmission({ ...who, rows: [{ type: 'BACKGROUND_CHECK', status: 'CLEAR' }], startsOn: null })
    expect(v.ok).toBe(false)
  })
})
