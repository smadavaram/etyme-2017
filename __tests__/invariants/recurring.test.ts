import { describe, it, expect } from 'vitest'
import {
  patterns, headline, PATTERN_AT, NEED_AT_LEAST, type Failure,
} from '@/lib/recurring'

/**
 * The loop is four steps: an agent does the job, somebody checks it, a
 * person fixes what went wrong, and the fix is saved so it does not come
 * back. The fourth is the one everybody skips, and skipping it means
 * fixing the same mistake forever while the cost never falls.
 *
 * We built the first three and stopped. The check says Ravi has no CV.
 * Somebody attaches one. Tomorrow it says Kavitha has no CV, and nothing
 * anywhere notices that the answer is not "attach a CV" — it is "collect
 * CVs when somebody joins the bench".
 */

function fail(code: string, recordId: string): Failure {
  return { code, recordId, at: new Date('2026-08-20') }
}

describe('what counts as a pattern', () => {
  it('names a check that keeps failing across different submissions', () => {
    const found = patterns(
      ['s1', 's2', 's3', 's4', 's5'].map((s) => fail('CV_ATTACHED', s)),
      10
    )
    expect(found).toHaveLength(1)
    expect(found[0].says).toBe(
      'No CV attached has failed on 5 of the last 10 submissions — 50%.'
    )
  })

  it('counts one stubborn submission once, not once per attempt', () => {
    // A package that fails three attempts is one fault. Counting the
    // attempts would turn a single awkward record into an emergency.
    const found = patterns(
      [fail('CV_ATTACHED', 's1'), fail('CV_ATTACHED', 's1'), fail('CV_ATTACHED', 's1')],
      10
    )
    expect(found).toHaveLength(0)
  })

  it('ignores bad luck — two failures in fifty is not a pattern', () => {
    expect(patterns([fail('CV_ATTACHED', 's1'), fail('CV_ATTACHED', 's2')], 50)).toHaveLength(0)
  })

  it('uses a share rather than a count, because eight means two different things', () => {
    // Eight CV failures is nothing at four hundred submissions a week and
    // an emergency at twelve.
    const eight = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((s) => fail('CV_ATTACHED', s))
    expect(patterns(eight, 12)).toHaveLength(1)
    expect(patterns(eight, 400)).toHaveLength(0)
  })

  it('needs a few before it says anything at all', () => {
    const three = ['a', 'b', 'c'].map((s) => fail('CV_ATTACHED', s))
    expect(three.length).toBeLessThan(NEED_AT_LEAST)
    expect(patterns(three, 4)).toHaveLength(0)
  })

  it('says nothing when nothing has been checked', () => {
    expect(patterns([fail('CV_ATTACHED', 's1')], 0)).toEqual([])
  })
})

describe('naming the real fix', () => {
  it('points upstream of the symptom, not at it', () => {
    // "Attach a CV" is what the check already said, and it is not what
    // this screen is for.
    const found = patterns(['a', 'b', 'c', 'd'].map((s) => fail('CV_ATTACHED', s)), 8)
    expect(found[0].reallyFix).toMatch(/when somebody joins the bench, not when a role turns up/)
    expect(found[0].reallyFix).not.toMatch(/^Attach a CV/)
  })

  it('sends a consent failure at the missing mobile numbers', () => {
    const found = patterns(['a', 'b', 'c', 'd'].map((s) => fail('CONSENT', s)), 8)
    expect(found[0].reallyFix).toMatch(/somebody without one is asked by nobody/)
  })

  it('sends a stale-availability failure at the fortnightly text', () => {
    const found = patterns(['a', 'b', 'c', 'd'].map((s) => fail('AVAILABLE_IN_WINDOW', s)), 8)
    expect(found[0].reallyFix).toMatch(/the fortnightly text is what fixes that/)
  })

  it('has something to say about a code it has never seen', () => {
    const found = patterns(['a', 'b', 'c', 'd'].map((s) => fail('SOMETHING_NEW', s)), 8)
    expect(found[0].reallyFix).toBe('Worth looking at where this keeps coming from.')
  })
})

describe('ranking', () => {
  it('puts the worst first, because that is the one to fix', () => {
    const found = patterns(
      [
        ...['a', 'b', 'c', 'd'].map((s) => fail('CONSENT', s)),
        ...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((s) => fail('CV_ATTACHED', s)),
      ],
      10
    )
    expect(found[0].code).toBe('CV_ATTACHED')
    expect(found[0].percent).toBeGreaterThan(found[1].percent)
  })
})

describe('what goes at the top of the screen', () => {
  it('says nothing when there is no pattern', () => {
    // A panel that always has something in it is a panel nobody reads.
    // Silence here means the loop is working.
    expect(headline([])).toBeNull()
  })

  it('leads with the worst one', () => {
    const found = patterns(['a', 'b', 'c', 'd', 'e'].map((s) => fail('CV_ATTACHED', s)), 10)
    expect(headline(found)).toBe(
      'No CV attached has failed on 5 of the last 10 submissions — 50%.'
    )
  })

  it('counts the rest rather than listing them', () => {
    const found = patterns(
      [
        ...['a', 'b', 'c', 'd', 'e'].map((s) => fail('CV_ATTACHED', s)),
        ...['a', 'b', 'c', 'd'].map((s) => fail('CONSENT', s)),
      ],
      10
    )
    expect(headline(found)).toMatch(/And 1 other keeps coming back/)
  })
})

describe('the thresholds are deliberate', () => {
  it('treats under a third as noise', () => {
    expect(PATTERN_AT).toBe(0.3)
  })
})
