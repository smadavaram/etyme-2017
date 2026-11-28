import { describe, it, expect } from 'vitest'
import { mayTarget, readTargetAsk } from '@/lib/skills/performance-read'

const ask = (over: Record<string, unknown> = {}) => ({ subjectKind: 'SKILL', subjectKey: 'census.classify', period: 'WEEK', target: 38, ...over })

describe('reading a target change', () => {
  it('only the Owner may set a target', () => {
    expect(mayTarget('Owner')).toBeNull()
    expect(mayTarget('Admin')).toMatch(/Only the firm’s Owner/)
    expect(mayTarget(null)).not.toBeNull()
  })

  it('a whole number of zero or more is a target, and null clears it', () => {
    expect(readTargetAsk(ask())).toMatchObject({ ok: true, ask: { target: 38, period: 'WEEK' } })
    expect(readTargetAsk(ask({ target: 0 }))).toMatchObject({ ok: true })
    expect(readTargetAsk(ask({ target: null }))).toMatchObject({ ok: true, ask: { target: null } })
  })

  it('a fraction, a negative, a string or an absent target is refused in a sentence', () => {
    for (const target of [1.5, -1, '5', undefined, 10_000_000]) {
      const r = readTargetAsk(ask({ target }))
      expect(r).toMatchObject({ ok: false, field: 'target' })
    }
  })

  it('a skill or an agent the firm does not have is refused, and so is an unknown period', () => {
    expect(readTargetAsk(ask({ subjectKey: 'nothing.here' }))).toMatchObject({ ok: false, field: 'subjectKey' })
    expect(readTargetAsk(ask({ subjectKind: 'AGENT', subjectKey: 'census.classify' }))).toMatchObject({ ok: false, field: 'subjectKey' })
    expect(readTargetAsk(ask({ subjectKind: 'AGENT', subjectKey: 'census-keeper' }))).toMatchObject({ ok: true })
    expect(readTargetAsk(ask({ period: 'YEAR' }))).toMatchObject({ ok: false, field: 'period' })
    expect(readTargetAsk(ask({ subjectKind: 'TEAM' }))).toMatchObject({ ok: false, field: 'subjectKind' })
  })
})
