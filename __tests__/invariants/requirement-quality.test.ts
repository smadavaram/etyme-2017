import { describe, it, expect } from 'vitest'
import {
  rateRealistic, askableSkills, anybodyForIt, timeToFill, boundsAgree,
  score, grade, STEPS, SPEC, TOO_MANY_MUST_HAVES, TOO_SOON_DAYS, type Role,
} from '@/lib/requirement-quality'
import { decide } from '@/lib/loop'
import type { Observation } from '@/lib/benchmark'

/**
 * A role with a rate below what the work clears at, four must-have skills
 * nobody has together, and a start date next Monday is not a role. It is a
 * month of everybody's time, and at the end of it the vendor looks bad and
 * the manager decides contractors are hard to find.
 *
 * This is also the first loop written against the harness rather than by
 * hand — the proof that the second one costs an hour, not a day.
 */

const NOW = new Date('2026-08-21T00:00:00Z')

const HISTORY: Observation[] = [10000, 11000, 12000, 13000, 14000, 15000].map((r) => ({
  rateCents: r,
  survived: true,
  skills: ['SAP FICO'],
  location: 'Denver, CO',
  at: new Date('2026-07-01'),
}))

function role(over: Partial<Role> = {}): Role {
  return {
    title: 'SAP FICO Consultant',
    skills: ['SAP FICO', 'S/4HANA'],
    location: 'Denver, CO',
    billMin: 11000,
    billMax: 14000,
    startDate: new Date('2026-09-21'),
    plausibleOnBench: 5,
    history: HISTORY,
    now: NOW,
    ...over,
  }
}

describe('is the money realistic', () => {
  it('fails a ceiling below what anything has ever cleared at', () => {
    // The commonest reason a role sits open for a month, and knowable on
    // the day it is written down.
    const f = rateRealistic(role({ billMax: 8000 }))!
    expect(f.verdict).toBe('FAIL')
    expect(f.reason).toBe(
      'This tops out at $80 and nothing under $110 has cleared for work like this in 6 submissions. Raise the ceiling or expect it to sit open.'
    )
  })

  it('says a generous role will fill fast, rather than saying nothing', () => {
    const f = rateRealistic(role({ billMax: 18000 }))!
    expect(f.verdict).toBe('PASS')
    expect(f.reason).toMatch(/It should fill quickly/)
  })

  it('confirms a rate inside the band', () => {
    expect(rateRealistic(role())!.verdict).toBe('PASS')
  })

  it('says nothing at all without enough history to be worth saying', () => {
    // A quality score built on three observations would fail good roles
    // and be switched off inside a week.
    expect(rateRealistic(role({ history: HISTORY.slice(0, 3) }))).toBeNull()
    expect(rateRealistic(role({ history: [] }))).toBeNull()
  })
})

describe('is the skill list a list or a wish', () => {
  it('passes two or three', () => {
    expect(askableSkills(role()).verdict).toBe('PASS')
  })

  it('fails a role with no skills, because nothing can be matched against it', () => {
    const f = askableSkills(role({ skills: [] }))
    expect(f.verdict).toBe('FAIL')
    expect(f.reason).toMatch(/nobody can be scored/)
  })

  it('fails a wish list, and says to pick the two or three that matter', () => {
    // Past six the intersection is one person in the country and they are
    // not looking.
    const many = Array.from({ length: TOO_MANY_MUST_HAVES + 1 }, (_, i) => `Skill ${i}`)
    const f = askableSkills(role({ skills: many }))
    expect(f.verdict).toBe('FAIL')
    expect(f.reason).toMatch(/stops describing a person/)
  })
})

describe('is there anybody at all', () => {
  it('fails when nobody on the bench comes close', () => {
    // Not a matching problem to be solved with a better model. A role for
    // a bench that does not exist, and worth knowing on day one.
    const f = anybodyForIt(role({ plausibleOnBench: 0 }))
    expect(f.verdict).toBe('FAIL')
    expect(f.reason).toMatch(/goes to the network or somebody gets hired/)
  })

  it('nudges towards the network when there are only one or two', () => {
    const f = anybodyForIt(role({ plausibleOnBench: 2 }))
    expect(f.verdict).toBe('PASS')
    expect(f.reason).toMatch(/Worth opening it to the network/)
  })

  it('is quietly satisfied with five', () => {
    expect(anybodyForIt(role({ plausibleOnBench: 5 })).reason).toBe(
      '5 on the bench could plausibly do it.'
    )
  })
})

describe('is there time', () => {
  it('fails a start date in the past', () => {
    const f = timeToFill(role({ startDate: new Date('2026-08-01') }))!
    expect(f.verdict).toBe('FAIL')
    expect(f.reason).toMatch(/was 20 days ago. Move it or close the role/)
  })

  it('fails a week, because that is not enough to source and clear paperwork', () => {
    const soon = new Date(NOW.getTime() + (TOO_SOON_DAYS - 1) * 86400000)
    const f = timeToFill(role({ startDate: soon }))!
    expect(f.verdict).toBe('FAIL')
    expect(f.reason).toMatch(/say plainly that it will slip/)
  })

  it('passes a month', () => {
    expect(timeToFill(role())!.verdict).toBe('PASS')
  })

  it('says nothing when no date has been set', () => {
    expect(timeToFill(role({ startDate: null }))).toBeNull()
  })
})

describe('do the bounds contradict each other', () => {
  it('catches a floor above the ceiling', () => {
    // A copy-and-paste, and then nothing matches and nobody knows why.
    const f = boundsAgree(role({ billMin: 15000, billMax: 12000 }))!
    expect(f.verdict).toBe('FAIL')
    expect(f.reason).toMatch(/Nothing will ever match this/)
  })

  it('stays silent when they are fine, rather than adding a cheerful pass', () => {
    expect(boundsAgree(role())).toBeNull()
  })
})

describe('the score', () => {
  it('is a hundred when nothing is wrong', () => {
    const findings = STEPS.map((s) => s.run(role())).filter(Boolean) as any[]
    expect(score(findings)).toBe(100)
    expect(grade(100)).toBe('Nothing wrong with this one.')
  })

  it('falls with each real problem', () => {
    const bad = role({ billMin: 6000, billMax: 8000, skills: [], plausibleOnBench: 0 })
    const findings = STEPS.map((s) => s.run(bad)).filter(Boolean) as any[]
    expect(score(findings)).toBeLessThan(50)
    expect(grade(score(findings))).toBe('This role is unlikely to be filled as written.')
  })

  it('does not count a check that could not run against the role', () => {
    // The role is not worse because something on our side did not answer.
    const findings = [
      { code: 'A', checker: 'RULE' as const, verdict: 'PASS' as const, reason: 'fine' },
      { code: 'B', checker: 'MODEL' as const, verdict: 'PASS' as const, reason: 'no', unverified: true },
    ]
    expect(score(findings)).toBe(100)
  })
})

describe('what the harness gives it for free', () => {
  it('every check is arithmetic — not one of them needs a model', () => {
    expect(STEPS.every((s) => s.checker === 'RULE')).toBe(true)
  })

  it('caps at two attempts, because nothing here gets better by being asked again', () => {
    expect(SPEC.maxAttempts).toBe(2)
    const bad = role({ skills: [] })
    const findings = STEPS.map((s) => s.run(bad)).filter(Boolean) as any[]
    expect(decide(findings, 2, SPEC.maxAttempts).mayRetry).toBe(false)
  })

  it('produces a fix list the harness can present without knowing anything about roles', () => {
    // Coherent bounds, so this tests the two faults it means to and not
    // the floor-above-ceiling one as well.
    const bad = role({ billMin: 6000, billMax: 8000, plausibleOnBench: 0 })
    const findings = STEPS.map((s) => s.run(bad)).filter(Boolean) as any[]
    const o = decide(findings, 1, SPEC.maxAttempts)
    expect(o.state).toBe('NEEDS_FIX')
    expect(o.toFix.map((f) => f.code).sort()).toEqual(['ANYBODY_FOR_IT', 'RATE_REALISTIC'])
    expect(o.toFix.every((f) => f.reason.length > 10)).toBe(true)
  })
})
