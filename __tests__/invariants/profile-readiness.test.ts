import { describe, it, expect } from 'vitest'
import { readiness, saysToVendor, type Record_ } from '@/lib/profile-readiness'

/**
 * The 2017 `candidates` table had nine boolean columns and
 * `is_profile_active` opened only when all nine were set. The instinct
 * was right — a bench full of stubs that look like finished people is
 * worse than a small bench, because every filter and score downstream
 * treats them as equals.
 *
 * The shape was wrong. Nine columns means a migration per step, a flag
 * that disagrees with the data the moment either is written alone, and
 * no way to say why anything matters. And it was all-or-nothing, which
 * is why real benches filled with records nobody finished: the gate was
 * too blunt to be worth passing.
 */

const NOW = new Date('2026-09-08T00:00:00Z')

const full = (over: Partial<Record_> = {}): Record_ => ({
  name: 'Priya Iyer',
  email: 'priya@example.com',
  headline: 'SAP FICO Consultant',
  skills: ['SAP FICO', 'ABAP'],
  location: 'Dallas, Texas',
  workAuth: 'GC',
  rateFloorCents: 8500,
  availableFrom: new Date('2026-10-01'),
  resumeCount: 1,
  confirmedAt: new Date('2026-08-20'),
  ownCompanyId: null,
  ...over,
})

describe('a record nobody finished cannot be sold', () => {
  it('refuses to market somebody with no skills recorded', () => {
    // The one that matters most: nothing can match them at all.
    const r = readiness(full({ skills: [] }), NOW)
    expect(r.marketable).toBe(false)
    expect(r.next?.key).toBe('SKILLS')
  })

  it('refuses when there is nowhere they can work', () => {
    expect(readiness(full({ location: null }), NOW).marketable).toBe(false)
  })

  it('refuses when there is no way to reach them', () => {
    expect(readiness(full({ email: null }), NOW).marketable).toBe(false)
  })

  it('treats whitespace as missing, because it is', () => {
    expect(readiness(full({ location: '   ' }), NOW).marketable).toBe(false)
    expect(readiness(full({ skills: ['', '  '] }), NOW).marketable).toBe(false)
  })
})

describe('but missing a nicety does not make somebody invisible', () => {
  it('still markets a consultant with no headline', () => {
    // 2017 hid them. That is why benches filled with half-finished
    // records — the gate was too blunt to be worth passing.
    const r = readiness(full({ headline: null }), NOW)
    expect(r.marketable).toBe(true)
    expect(r.weakening).toBe(1)
  })

  it('still markets a consultant with no CV, and says it lowers their odds', () => {
    const r = readiness(full({ resumeCount: 0 }), NOW)
    expect(r.marketable).toBe(true)
    expect(r.says).toMatch(/would make it more likely/i)
  })

  it('never blocks on work authorisation, whatever else is true', () => {
    // The same rule lib/work-authorisation enforces from the other
    // side: unknown status is a question, never a refusal.
    const r = readiness(full({ workAuth: null }), NOW)
    expect(r.marketable).toBe(true)
    expect(r.steps.find((s) => s.key === 'WORK_AUTH')!.weight).toBe('ADVISES')
  })

  it('says plainly that work authorisation will not be used to rule them out', () => {
    const step = readiness(full(), NOW).steps.find((s) => s.key === 'WORK_AUTH')!
    expect(step.why).toMatch(/never used to rule you out without a legal reason/i)
  })
})

describe('it asks for one thing, not nine', () => {
  it('names a single next step rather than handing over a checklist', () => {
    // A checklist of nine is a checklist nobody starts.
    const r = readiness(full({ skills: [], headline: null, resumeCount: 0, rateFloorCents: null }), NOW)
    expect(r.next).not.toBeNull()
    expect(r.says).toContain(r.next!.label)
  })

  it('puts a blocking step ahead of an advisory one, however many advisories there are', () => {
    const r = readiness(
      full({ location: null, headline: null, resumeCount: 0, rateFloorCents: null, availableFrom: null }),
      NOW
    )
    expect(r.next!.key).toBe('LOCATION')
  })

  it('tells somebody who is finished that they are finished', () => {
    const r = readiness(full(), NOW)
    expect(r.blocking).toBe(0)
    expect(r.weakening).toBe(0)
    expect(r.says).toMatch(/Nothing is holding you back/i)
  })

  it('explains why each step matters to them, not to us', () => {
    const cv = readiness(full(), NOW).steps.find((s) => s.key === 'CV')!
    expect(cv.why).toMatch(/an agency writes their own version of you/i)
  })
})

describe('a stale confirmation counts as unconfirmed, and only weakens', () => {
  it('treats a confirmation from last year as not done', () => {
    const r = readiness(full({ confirmedAt: new Date('2025-01-01') }), NOW)
    expect(r.steps.find((s) => s.key === 'CONFIRMED')!.done).toBe(false)
    expect(r.marketable).toBe(true)
  })

  it('accepts a recent one', () => {
    expect(readiness(full({ confirmedAt: new Date('2026-08-20') }), NOW)
      .steps.find((s) => s.key === 'CONFIRMED')!.done).toBe(true)
  })
})

describe('somebody trading through their own company is asked different things', () => {
  it('does not ask an individual about company paperwork', () => {
    expect(readiness(full(), NOW).steps.some((s) => s.key === 'CORP')).toBe(false)
  })

  it('does ask a one-person corporation', () => {
    expect(readiness(full({ ownCompanyId: 'c1' }), NOW).steps.some((s) => s.key === 'CORP')).toBe(true)
  })
})

describe('a recruiter is told something different from the consultant', () => {
  it('tells a vendor whether they can send this person, not how to improve', () => {
    // Different audience, different sentence. A recruiter does not need
    // coaching.
    expect(saysToVendor(readiness(full(), NOW), 'Priya')).toBe('Priya is ready to send.')
  })

  it('names what is missing when they cannot be sent', () => {
    const r = readiness(full({ skills: [] }), NOW)
    expect(saysToVendor(r, 'Priya')).toMatch(/cannot be put forward: what you do is missing/i)
  })

  it('tells a vendor to ask them, where the gaps are the consultant’s to fill', () => {
    const r = readiness(full({ headline: null, resumeCount: 0 }), NOW)
    expect(saysToVendor(r, 'Priya')).toMatch(/2 things are missing — ask them/i)
  })

  it('says "one thing is missing", not "1 thing are missing"', () => {
    // These sentences are read by people, which is the entire point of
    // writing them rather than returning a count.
    const r = readiness(full({ headline: null }), NOW)
    expect(saysToVendor(r, 'Priya')).toBe('Priya can be sent, but one thing is missing — ask them.')
  })
})
