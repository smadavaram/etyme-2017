import { describe, it, expect } from 'vitest'
import {
  decide, signature, summarise, termSentence,
  DEFAULT_WINDOW_DAYS, ANOMALY_HOLD_BELOW, type Sheet,
} from '@/lib/auto-approval'

/**
 * A contractor works a week, submits, and the manager who approves it is
 * on holiday. Two weeks later the vendor cannot invoice, the contractor
 * cannot be paid, and nobody did anything wrong.
 *
 * So the agreement says how long the client has, and after that silence
 * counts. This is the function that moves money without a human, so
 * every branch of it is tested.
 */

const NOW = new Date('2026-08-29T09:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)

function sheet(over: Partial<Sheet> = {}): Sheet {
  return {
    id: 'ts-1',
    personName: 'Rohan Menon',
    submittedAt: daysAgo(6),
    totalHours: 40,
    clientApprovedAt: null,
    anomalyScore: 90,
    anomalyReason: null,
    windowDays: 5,
    autoApproves: true,
    clientName: 'Calder Manufacturing',
    ...over,
  }
}

describe('when silence counts as approval', () => {
  it('approves once the window has passed', () => {
    const d = decide(sheet(), NOW)
    expect(d.verdict).toBe('APPROVE')
    expect(d.says).toBe(
      'Approved automatically. Rohan Menon submitted 40 hours 6 days ago and ' +
      'Calder Manufacturing agreed to a 5 day window. Nobody looked at it.'
    )
  })

  it('waits while there is still time, and says how much', () => {
    const d = decide(sheet({ submittedAt: daysAgo(2) }), NOW)
    expect(d.verdict).toBe('WAITING')
    expect(d.says).toBe('Calder Manufacturing has 3 more days to approve this.')
  })

  it('does not say "1 days" on the last day', () => {
    expect(decide(sheet({ submittedAt: daysAgo(4) }), NOW).says).toMatch(/1 more day to/)
  })

  it('falls back to five days where the agreement says nothing', () => {
    expect(DEFAULT_WINDOW_DAYS).toBe(5)
    expect(decide(sheet({ windowDays: null, submittedAt: daysAgo(4) }), NOW).verdict).toBe('WAITING')
    expect(decide(sheet({ windowDays: null, submittedAt: daysAgo(5) }), NOW).verdict).toBe('APPROVE')
  })
})

describe('what it refuses to do', () => {
  it('never fires on a sheet with a question over it, however long it waits', () => {
    // Auto-approving the one sheet that is actually wrong is how a client
    // stops trusting all of it.
    const d = decide(
      sheet({ submittedAt: daysAgo(90), anomalyScore: 20, anomalyReason: '60 hours in one week' }),
      NOW
    )
    expect(d.verdict).toBe('HELD')
    expect(d.says).toBe(
      'Held for a person: 60 hours in one week. Automatic approval does not apply to a sheet with a question over it.'
    )
  })

  it('holds below the threshold and approves above it', () => {
    expect(ANOMALY_HOLD_BELOW).toBe(60)
    expect(decide(sheet({ anomalyScore: 59 }), NOW).verdict).toBe('HELD')
    expect(decide(sheet({ anomalyScore: 60 }), NOW).verdict).toBe('APPROVE')
  })

  it('treats a sheet nobody has assessed as ordinary rather than suspect', () => {
    // Holding everything because the anomaly check has not run yet would
    // stop every invoice on a deployment that never turned it on.
    expect(decide(sheet({ anomalyScore: null }), NOW).verdict).toBe('APPROVE')
  })

  it('does nothing where the client never agreed to it', () => {
    const d = decide(sheet({ autoApproves: false, submittedAt: daysAgo(60) }), NOW)
    expect(d.verdict).toBe('NOT_ALLOWED')
    expect(d.says).toBe(
      'Calder Manufacturing has not agreed to automatic approval. This waits for a person.'
    )
  })

  it('leaves an already approved sheet alone', () => {
    expect(decide(sheet({ clientApprovedAt: daysAgo(1) }), NOW).verdict).toBe('ALREADY')
  })
})

describe('what gets written down', () => {
  it('names nobody, because an auto-approval that names a manager is a forgery', () => {
    // The whole value of the record is that somebody can tell the two
    // apart four months later when the invoice is disputed.
    const sig = signature(NOW)
    expect(sig.clientApprovedById).toBeNull()
    expect(sig.autoApproved).toBe(true)
    expect(sig.clientApprovedAt).toEqual(NOW)
  })
})

describe('the overnight report', () => {
  it('leads with what was held, because that is the news', () => {
    const out = summarise([
      decide(sheet({ id: 'a' }), NOW),
      decide(sheet({ id: 'b' }), NOW),
      decide(sheet({ id: 'c', anomalyScore: 10, anomalyReason: 'odd' }), NOW),
      decide(sheet({ id: 'd', submittedAt: daysAgo(1) }), NOW),
    ])
    expect(out.says).toBe(
      '1 held for a person, 2 approved automatically, 1 still inside the window.'
    )
    expect(out.approved).toBe(2)
    expect(out.held).toBe(1)
  })

  it('says nothing happened rather than printing zeroes', () => {
    expect(summarise([]).says).toBe('No timesheets waiting on a client.')
  })
})

describe('the term, in the client’s own words', () => {
  it('says what they signed up to', () => {
    expect(termSentence(5, true)).toBe(
      'Timesheets are approved automatically if nobody has responded within 5 working days. ' +
      'Anything that looks unusual is held for a person regardless.'
    )
  })

  it('says plainly when they did not sign up to it', () => {
    expect(termSentence(5, false)).toBe(
      'Timesheets wait for a person however long that takes. Nothing is ever approved automatically.'
    )
  })

  it('does not say "1 working days"', () => {
    expect(termSentence(1, true)).toMatch(/within 1 working day\./)
  })
})
