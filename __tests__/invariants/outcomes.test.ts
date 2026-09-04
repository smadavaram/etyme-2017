import { describe, it, expect } from 'vitest'
import {
  counts, bar, whatIsStopping, checkOutcome, isBadSubmission,
  REASONS, TARGET_PER_DAY, type Sub,
} from '@/lib/outcomes'

/**
 * Two things this build never had.
 *
 * Why a submission ended — it stored `status` and nothing else, so a
 * rejection was a state change with no information in it. Twelve months of
 * real rejection reasons across a vendor chain is the only asset here that
 * compounds; every feature can be rebuilt by somebody else in a quarter.
 *
 * And a number. There were phases, and phases always complete.
 */

function sub(over: Partial<Sub> = {}): Sub {
  return {
    requirementId: 'r1',
    submittedAt: new Date('2026-08-20'),
    checkState: 'SENT',
    overriddenAt: null,
    rejectReason: null,
    ...over,
  }
}

describe('saying why', () => {
  it('refuses a rejection with no reason', () => {
    const v = checkOutcome({})
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/only thing about a rejection that is worth anything later/)
  })

  it('refuses a reason that is not one of the buttons', () => {
    // Free text is what somebody types at eight at night and nobody can
    // count afterwards.
    expect(checkOutcome({ reason: 'client was weird' }).ok).toBe(false)
  })

  it('takes one of the eight', () => {
    expect(checkOutcome({ reason: 'RATE' }).ok).toBe(true)
  })

  it('does not require the note, because the code is what gets counted', () => {
    expect(checkOutcome({ reason: 'INTERVIEW', note: null }).ok).toBe(true)
  })

  it('offers a hint against every reason, so the buttons mean the same thing to everybody', () => {
    expect(REASONS).toHaveLength(8)
    expect(REASONS.every((r) => r.hint.length > 10)).toBe(true)
  })
})

describe('which rejections mean the submission was poor', () => {
  it('counts rate, skills and work authorisation against us', () => {
    expect(isBadSubmission('RATE')).toBe(true)
    expect(isBadSubmission('SKILLS')).toBe(true)
    expect(isBadSubmission('WORK_AUTH')).toBe(true)
  })

  it('does not count losing a good candidate to a better one', () => {
    // A shortlisted consultant who did not win the interview is not a
    // failure of the product.
    expect(isBadSubmission('INTERVIEW')).toBe(false)
    expect(isBadSubmission('TIMING')).toBe(false)
    expect(isBadSubmission('NO_REPLY')).toBe(false)
  })
})

describe('what counts as one of the five', () => {
  it('counts one that passed every check and is still live', () => {
    expect(counts(sub())).toBe(true)
  })

  it('counts one that was rejected for a reason that was not our fault', () => {
    expect(counts(sub({ rejectReason: 'INTERVIEW' }))).toBe(true)
  })

  it('does not count one rejected on rate', () => {
    expect(counts(sub({ rejectReason: 'RATE' }))).toBe(false)
  })

  it('does not count one that never cleared the checks', () => {
    expect(counts(sub({ checkState: 'NEEDS_FIX' }))).toBe(false)
    expect(counts(sub({ checkState: 'DRAFT' }))).toBe(false)
  })

  it('does not count one somebody pushed out with checks failing, whatever happened next', () => {
    // The override exists so a recruiter is not blocked. Not so the number
    // can be gamed.
    expect(counts(sub({ overriddenAt: new Date('2026-08-20') }))).toBe(false)
  })
})

describe('the number', () => {
  it('is per day and per requirement, not a total', () => {
    // Five a day across forty roles is an eighth of a submission each and
    // nothing is being filled. Five a day on one role is a shortlist by
    // Thursday.
    const five = Array.from({ length: 25 }, () => sub())
    const b = bar(five, 5)
    expect(b.rate).toBe(5)
    expect(b.hit).toBe(true)
    expect(b.says).toBe('5 good submissions a day across 1 role. That is the bar.')
  })

  it('divides across every open role', () => {
    const across = [
      ...Array.from({ length: 10 }, () => sub({ requirementId: 'r1' })),
      ...Array.from({ length: 10 }, () => sub({ requirementId: 'r2' })),
    ]
    const b = bar(across, 5)
    expect(b.requirements).toBe(2)
    expect(b.rate).toBe(2)
    expect(b.hit).toBe(false)
  })

  it('says the bar out loud when it has not been hit', () => {
    expect(bar([sub()], 1).says).toBe(`1 a day across 1 role. The bar is ${TARGET_PER_DAY}.`)
  })

  it('names the waste when most of what went out did not count', () => {
    // Volume that does not clear the checks is not progress, and reading it
    // as progress is what lets a bad month look like a good one.
    const mostly = [
      sub(),
      ...Array.from({ length: 6 }, () => sub({ rejectReason: 'RATE' })),
    ]
    expect(bar(mostly, 1).says).toBe(
      '1 a day across 1 role. 6 of 7 did not count — fix those before sending more.'
    )
  })

  it('never shows a bare zero on a window where good ones actually went out', () => {
    // Four good over thirty days across three roles is 0.044. Rounded to
    // one place that is "0", which reads as "nothing happened" and is not
    // true — and it is exactly the window a slow month gets looked at on.
    const b = bar(Array.from({ length: 4 }, (_, i) => sub({ requirementId: `r${i % 3}` })), 30)
    expect(b.good).toBe(4)
    expect(b.rate).toBe(0.04)
    expect(b.rate).not.toBe(0)
  })

  it('says nothing rather than dividing by no roles', () => {
    const b = bar([], 7)
    expect(b.rate).toBeNull()
    expect(b.says).toBe('Nothing open yet. The number starts when the first role does.')
  })
})

describe('what is actually stopping it', () => {
  it('ranks the reasons, because "the number is low" is not actionable', () => {
    const subs = [
      ...Array.from({ length: 11 }, () => sub({ rejectReason: 'RATE' })),
      ...Array.from({ length: 3 }, () => sub({ rejectReason: 'SKILLS' })),
    ]
    const top = whatIsStopping(subs)
    expect(top[0]).toEqual({ reason: 'RATE', count: 11, label: 'Rate' })
    expect(top[1].count).toBe(3)
  })

  it('leaves out the losses that were not our fault', () => {
    const subs = [
      sub({ rejectReason: 'RATE' }),
      ...Array.from({ length: 20 }, () => sub({ rejectReason: 'INTERVIEW' })),
    ]
    expect(whatIsStopping(subs)).toHaveLength(1)
  })

  it('is empty when nothing has been rejected', () => {
    expect(whatIsStopping([sub(), sub()])).toEqual([])
  })
})
