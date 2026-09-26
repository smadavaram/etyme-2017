import { describe, it, expect } from 'vitest'
import {
  drawSample, agreement, thisWeek, question, checkReview,
  SAMPLE_SIZE, WORRY_BELOW, type Reviewable,
} from '@/lib/review'

/**
 * The failure this exists to prevent: an agent grading its own homework.
 * It reports 96% accuracy, the dashboard is green, clients quietly stop
 * calling, and by the time anybody investigates the ledger has been lying
 * for months.
 *
 * So a person reviews ten a week. Small enough that somebody actually does
 * it — a review nobody completes is worse than no review, because an empty
 * queue reads as "nothing to worry about".
 */

const NOW = new Date('2026-08-21T12:00:00Z') // a Friday

function check(over: Partial<Reviewable> = {}): Reviewable {
  return {
    id: 'c1',
    code: 'SKILLS_EVIDENCED',
    verdict: 'PASS',
    reason: 'All 3 claimed skills are in the CV.',
    evidence: 'SAP FICO: "Six years on SAP FICO"',
    at: new Date('2026-08-20'),
    agreed: null,
    ...over,
  }
}

describe('which ten go in front of a person', () => {
  it('takes ten', () => {
    const many = Array.from({ length: 40 }, (_, i) => check({ id: `c${i}` }))
    expect(drawSample(many)).toHaveLength(SAMPLE_SIZE)
  })

  it('puts every failure before any pass', () => {
    // A wrong FAIL is a good person rejected and nobody ever finds out. A
    // wrong PASS reaches the client and they tell you. Spend the sample on
    // the invisible one.
    const mixed = [
      check({ id: 'pass-1', verdict: 'PASS' }),
      check({ id: 'fail-1', verdict: 'FAIL' }),
      check({ id: 'pass-2', verdict: 'PASS' }),
      check({ id: 'fail-2', verdict: 'FAIL' }),
    ]
    expect(drawSample(mixed).map((c) => c.id)).toEqual(['fail-1', 'fail-2', 'pass-1', 'pass-2'])
  })

  it('takes the oldest first, so nothing sits in the queue forever', () => {
    const s = drawSample([
      check({ id: 'new', at: new Date('2026-08-20') }),
      check({ id: 'old', at: new Date('2026-08-01') }),
    ])
    expect(s[0].id).toBe('old')
  })

  it('never shows the same one twice', () => {
    const s = drawSample([check({ id: 'done', agreed: true }), check({ id: 'todo' })])
    expect(s.map((c) => c.id)).toEqual(['todo'])
  })

  it('comes back empty when there is nothing to review', () => {
    expect(drawSample([])).toEqual([])
  })
})

describe('how often the person agreed', () => {
  it('says nothing at all before anybody has reviewed one', () => {
    const a = agreement([])
    expect(a.percent).toBeNull()
    expect(a.says).toBe('Nothing reviewed yet. Ten a week is enough.')
  })

  it('refuses to report 100% off two reviews', () => {
    // A confident number from a sample of two is exactly the false comfort
    // this whole surface exists to prevent.
    const a = agreement([{ agreed: true }, { agreed: true }])
    expect(a.says).toBe('2 of 2 so far — too few to mean anything yet.')
    expect(a.worrying).toBe(false)
  })

  it('reports the rate once there is enough to report', () => {
    const a = agreement([
      { agreed: true }, { agreed: true }, { agreed: true },
      { agreed: true }, { agreed: false },
    ])
    expect(a.percent).toBe(80)
    expect(a.says).toBe('You agreed with 80% of the last 5.')
  })

  it('says plainly that the check is not working when agreement falls', () => {
    const a = agreement([
      { agreed: false }, { agreed: false }, { agreed: false },
      { agreed: true }, { agreed: true },
    ])
    expect(a.percent).toBeLessThan(WORRY_BELOW)
    expect(a.worrying).toBe(true)
    expect(a.says).toMatch(/This check is not working — read the notes/)
  })

  it('ignores the ones nobody has got to yet', () => {
    const a = agreement([{ agreed: true }, { agreed: null }, { agreed: null }])
    expect(a.reviewed).toBe(1)
  })
})

describe('this week’s ten', () => {
  it('counts from Monday, not from a rolling seven days', () => {
    // A rolling number lets the promise slip a day at a time until it has
    // quietly stopped.
    const w = thisWeek(
      [
        { at: new Date('2026-08-16T23:00:00Z') }, // the Sunday before — last week
        { at: new Date('2026-08-17T09:00:00Z') }, // Monday
        { at: new Date('2026-08-20T09:00:00Z') },
      ],
      NOW
    )
    expect(w.done).toBe(2)
  })

  it('says how far off it is', () => {
    expect(thisWeek([{ at: new Date('2026-08-19') }], NOW).says).toBe('1 of 10 reviewed this week.')
  })

  it('says done when it is done', () => {
    const ten = Array.from({ length: 10 }, () => ({ at: new Date('2026-08-19') }))
    const w = thisWeek(ten, NOW)
    expect(w.behind).toBe(false)
    expect(w.says).toBe('10 reviewed this week. Done.')
  })
})

describe('what the reviewer is asked', () => {
  it('shows the decision and what it read, not an abstract question', () => {
    const q = question(check())
    expect(q.asks).toBe('The check passed this. Do you agree?')
    expect(q.shows).toMatch(/It read: SAP FICO/)
  })

  it('says "failed" when it failed', () => {
    expect(question(check({ verdict: 'FAIL' })).asks).toBe('The check failed this. Do you agree?')
  })

  it('shows the reason alone when there is no evidence to show', () => {
    expect(question(check({ evidence: null })).shows).toBe('All 3 claimed skills are in the CV.')
  })
})

describe('agreeing and disagreeing', () => {
  it('takes an agreement in one tap', () => {
    // Making somebody type to say "yes, fine" ten times is how a weekly
    // review becomes a weekly non-review.
    expect(checkReview({ agreed: true }).ok).toBe(true)
  })

  it('requires a reason for a disagreement', () => {
    const v = checkReview({ agreed: false })
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/only thing that improves this check/)
  })

  it('does not accept a shrug as a reason', () => {
    expect(checkReview({ agreed: false, note: 'no' }).ok).toBe(false)
  })

  it('records a real disagreement', () => {
    expect(
      checkReview({ agreed: false, note: 'Quoted a line about Docker as evidence for Kubernetes.' })
        .ok
    ).toBe(true)
  })
})
