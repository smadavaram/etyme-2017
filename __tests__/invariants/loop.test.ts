import { describe, it, expect } from 'vitest'
import {
  decide, mayProceed, DEFAULT_MAX_ATTEMPTS, type Finding, type Outcome,
} from '@/lib/loop'

/**
 * Twenty-eight modules in this build decide pass or fail. Exactly one of
 * them loops. The rest check once, say something sensible, and are never
 * counted, never sampled, never allowed a second attempt, and never
 * noticed when they start being wrong.
 *
 * Not carelessness — a complete loop has six parts, assembling them by
 * hand takes a day, so the seventh surface gets three of the six and the
 * eighth gets a different three.
 *
 * This is the harness. A surface using it gets all six because it is the
 * harness, not because somebody remembered.
 */

function pass(code = 'A'): Finding {
  return { code, checker: 'RULE', verdict: 'PASS', reason: 'fine' }
}

function fail(code = 'B'): Finding {
  return { code, checker: 'RULE', verdict: 'FAIL', reason: 'Attach a CV.' }
}

function couldNotRun(code = 'C'): Finding {
  return {
    code,
    checker: 'MODEL',
    verdict: 'PASS',
    unverified: true,
    reason: 'This check could not run this time. Nobody has verified it.',
  }
}

describe('where the findings leave a record', () => {
  it('is ready when nothing failed', () => {
    const o = decide([pass('A'), pass('B')], 1)
    expect(o.state).toBe('READY')
    expect(o.summary).toBe('All 2 checks passed.')
  })

  it('asks for fixes and counts them', () => {
    const o = decide([pass(), fail()], 1)
    expect(o.state).toBe('NEEDS_FIX')
    expect(o.toFix).toHaveLength(1)
    expect(o.summary).toBe('1 to fix.')
    expect(o.mayRetry).toBe(true)
  })

  it('stops after the cap and asks for a person', () => {
    // The next attempt costs the same as the first and has never once
    // worked.
    const o = decide([fail()], DEFAULT_MAX_ATTEMPTS)
    expect(o.mayRetry).toBe(false)
    expect(o.attemptsLeft).toBe(0)
    expect(o.summary).toMatch(/still wrong after 3 tries/)
  })

  it('lets a surface set its own cap', () => {
    expect(decide([fail()], 1, 1).mayRetry).toBe(false)
    expect(decide([fail()], 1, 5).mayRetry).toBe(true)
  })
})

describe('a check that could not run', () => {
  it('is neither a pass nor a fail', () => {
    // Saying it passed would be the worst of the three possible answers.
    const o = decide([pass(), couldNotRun()], 1)
    expect(o.passed).toHaveLength(1)
    expect(o.unverified).toHaveLength(1)
  })

  it('is said out loud rather than implying somebody looked', () => {
    expect(decide([pass(), couldNotRun()], 1).summary).toBe(
      'All 1 checks passed. 1 could not be checked.'
    )
  })

  it('does not stop the record being ready, because nothing actually failed', () => {
    expect(decide([couldNotRun()], 1).state).toBe('READY')
  })

  it('is still said when there are fixes as well', () => {
    expect(decide([fail(), couldNotRun()], 1).summary).toBe('1 to fix. 1 could not be checked.')
  })
})

describe('whether the thing may proceed', () => {
  it('says yes when every check passed', () => {
    expect(mayProceed(decide([pass()], 1), false).ok).toBe(true)
  })

  it('mentions the ones that could not run, even while letting it through', () => {
    const v = mayProceed(decide([pass(), couldNotRun()], 1), false)
    expect(v.ok).toBe(true)
    expect(v.reason).toMatch(/1 check could not run/)
  })

  it('blocks while anything is red, and says what', () => {
    const v = mayProceed(decide([fail()], 1), false)
    expect(v.ok).toBe(false)
    expect(v.reason).toBe('Attach a CV.')
  })

  it('can be overridden, and says the override was recorded', () => {
    // A gate nobody can pass gets worked around outside the product,
    // which is worse than a gate with a log.
    const v = mayProceed(decide([fail()], 1), true)
    expect(v.ok).toBe(true)
    expect(v.reason).toMatch(/Recorded against whoever pressed it/)
  })
})

describe('what the harness guarantees every surface', () => {
  /**
   * These are the six parts. A surface that goes through runLoop gets all
   * of them; the point of testing the shape here is that a seventh loop
   * cannot quietly ship with four.
   */

  it('gives every finding a code, a verdict and a reason somebody can act on', () => {
    const o = decide([fail('DOCS_PRESENT')], 1)
    const f = o.toFix[0]
    expect(f.code).toBeTruthy()
    expect(f.verdict).toBe('FAIL')
    expect(f.reason.length).toBeGreaterThan(4)
  })

  it('separates who decided, because a rule cannot be wrong in an interesting way', () => {
    const o = decide([pass('A'), { ...pass('B'), checker: 'MODEL' }], 1)
    expect(o.passed.map((f) => f.checker)).toEqual(['RULE', 'MODEL'])
  })

  it('always reports how many attempts are left', () => {
    expect(decide([fail()], 1).attemptsLeft).toBe(2)
    expect(decide([fail()], 2).attemptsLeft).toBe(1)
    expect(decide([fail()], 3).attemptsLeft).toBe(0)
  })
})
