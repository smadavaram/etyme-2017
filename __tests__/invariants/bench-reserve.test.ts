/**
 * The bench reserve as a ledger rather than a setting.
 *
 * A firm could configure a reserve-funded bench, run payroll for a year,
 * and have no record anywhere of what was in anybody's pot. A setting with
 * nothing writing to it is not a feature.
 */

import { describe, it, expect } from 'vitest'
import {
  holdBackPosting, reserveBalance, drawFromReserve, exitPosting,
  type Policy, type ReserveMovement,
} from '@/lib/bench-policy'

const RESERVE_FUNDED: Policy = {
  policy: 'RESERVE_FUNDED',
  reserveBps: 1_000,
  reserveOnExit: 'PAY_OUT',
}

function hold(amountCents: number, day: string): ReserveMovement {
  return { kind: 'HOLD', amountCents, at: new Date(day), says: 'held' }
}

describe('Money goes into the pot only under the policy that says so', () => {
  it('a share earned under a reserve-funded policy writes a hold-back posting for the consultant’s own pot', () => {
    const p = holdBackPosting(RESERVE_FUNDED, 1_000_000)
    expect(p).not.toBeNull()
    expect(p!.kind).toBe('HOLD')
    expect(p!.amountCents).toBe(100_000)
    expect(p!.says).toContain('their money, held')
  })

  it('a consultant on any other bench policy has nothing held back and no reserve posting', () => {
    for (const policy of ['NO_PAY', 'FULL_PAY', 'REDUCED_RATE'] as const) {
      expect(holdBackPosting({ policy, benchRateBps: 5_000 }, 1_000_000)).toBeNull()
    }
  })

  it('a reserve-funded policy with no percentage set holds nothing rather than guessing one', () => {
    expect(holdBackPosting({ policy: 'RESERVE_FUNDED' }, 1_000_000)).toBeNull()
  })
})

describe('The balance is the movements, and nothing is stored as a total', () => {
  it('a reserve balance is the sum of holds less draws, and is never negative in normal use', () => {
    const b = reserveBalance([
      hold(100_000, '2026-01-31'),
      hold(100_000, '2026-02-28'),
      { kind: 'DRAW', amountCents: -60_000, at: new Date('2026-03-15'), says: 'bench' },
    ])
    expect(b.balanceCents).toBe(140_000)
    expect(b.heldCents).toBe(200_000)
    expect(b.drawnCents).toBe(60_000)
    expect(b.overdrawn).toBe(false)
  })

  it('an empty ledger says nobody has ever held anything back, rather than showing a zero', () => {
    const b = reserveBalance([])
    expect(b.balanceCents).toBe(0)
    expect(b.says).toContain('Nothing has ever been held back')
  })

  it('a pot that has been overdrawn is shown as it is, never floored to zero', () => {
    const b = reserveBalance([
      hold(50_000, '2026-01-31'),
      { kind: 'DRAW', amountCents: -80_000, at: new Date('2026-02-15'), says: 'bench' },
    ])
    expect(b.balanceCents).toBe(-30_000)
    expect(b.overdrawn).toBe(true)
    expect(b.says).toContain('somebody’s real money')
  })
})

describe('A bench week comes out of the pot, and only as far as the pot goes', () => {
  it('a bench week draws from the reserve only as far as the pot goes', () => {
    const d = drawFromReserve(140_000, 200_000, 'two weeks on the bench')
    expect(d.posting!.amountCents).toBe(-140_000)
    expect(d.shortfallCents).toBe(60_000)
    expect(d.says).toContain('carrying them out of its own money')
  })

  it('a pot that covers the week leaves the rest in it', () => {
    const d = drawFromReserve(500_000, 200_000, 'a week on the bench')
    expect(d.posting!.amountCents).toBe(-200_000)
    expect(d.shortfallCents).toBe(0)
    expect(d.says).toContain('3,000.00 left')
  })

  it('an empty pot writes no posting at all and names the decision that follows', () => {
    const d = drawFromReserve(0, 200_000, 'a week on the bench')
    expect(d.posting).toBeNull()
    expect(d.shortfallCents).toBe(200_000)
    expect(d.says).toContain('firm’s own money and its own decision')
  })
})

describe('What happens to the pot when somebody goes', () => {
  it('on exit a reserve is paid out or forfeited by the firm’s own setting and the reason is on the record', () => {
    const out = exitPosting(RESERVE_FUNDED, 240_000, 'PROJECT_ENDED')
    expect(out.posting!.kind).toBe('PAY_OUT')
    expect(out.posting!.amountCents).toBe(-240_000)
    expect(out.payOutCents).toBe(240_000)
    expect(out.says).toContain('the assignment ending')
  })

  it('a forfeited reserve writes the posting with the reason, so nobody has to reconstruct it later', () => {
    const policy: Policy = { ...RESERVE_FUNDED, reserveOnExit: 'DEPENDS_ON_REASON' }
    const out = exitPosting(policy, 240_000, 'RESIGNED')
    expect(out.posting!.kind).toBe('FORFEIT')
    expect(out.keptByFirmCents).toBe(240_000)
    expect(out.says).toContain('a resignation')
    expect(out.says).toContain('Expect to be asked to show the reason')
  })

  it('the same policy pays out where the assignment ended and keeps where they walked', () => {
    const policy: Policy = { ...RESERVE_FUNDED, reserveOnExit: 'DEPENDS_ON_REASON' }
    expect(exitPosting(policy, 100_000, 'RELEASED').payOutCents).toBe(100_000)
    expect(exitPosting(policy, 100_000, 'DISMISSED').keptByFirmCents).toBe(100_000)
  })

  it('an empty pot on exit writes nothing at all', () => {
    const out = exitPosting(RESERVE_FUNDED, 0, 'RESIGNED')
    expect(out.posting).toBeNull()
    expect(out.says).toContain('nothing moves')
  })

  it('the whole pot leaves in one posting, so the balance afterwards is exactly nothing', () => {
    const movements: ReserveMovement[] = [hold(100_000, '2026-01-31'), hold(140_000, '2026-02-28')]
    const before = reserveBalance(movements)
    const out = exitPosting(RESERVE_FUNDED, before.balanceCents, 'PROJECT_ENDED')
    const after = reserveBalance([
      ...movements,
      { kind: out.posting!.kind, amountCents: out.posting!.amountCents, at: new Date(), says: out.says },
    ])
    expect(after.balanceCents).toBe(0)
  })
})
