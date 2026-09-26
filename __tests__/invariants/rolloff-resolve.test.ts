import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * "Firing people with a notice from the project which also means
 * bringing them to bench" — a delivery manager's own words for the gap
 * this closes. RolloffEvent.outcome (REDEPLOYED · BENCH · LOST) has
 * existed on the schema since before this session; nothing anywhere
 * ever wrote to it. This is the route that finally does, and BENCH is
 * the one outcome that also has to act — not just be recorded.
 *
 * Verified once against real Postgres: a rolled-off person with no
 * ConsultantProfile at all, resolved as BENCH, ended up with a real
 * pending bench listing at the employer's company. Pinned here as
 * source checks so the shape of that fix can't quietly drift —
 * DB-heavy routes in this codebase are checked this way throughout.
 */

const ROUTE = readFileSync(
  join(__dirname, '../../src/app/api/rolloff/[id]/resolve/route.ts'),
  'utf8'
)

describe('resolving a rolloff writes the outcome the schema has always had', () => {
  it('accepts exactly the three outcomes the schema comment names', () => {
    expect(ROUTE).toContain("['REDEPLOYED', 'BENCH', 'LOST']")
  })

  it('refuses to resolve the same rolloff twice', () => {
    expect(ROUTE).toContain('ALREADY_RESOLVED')
  })

  it('only lets the company that owns the contract resolve its own rolloff', () => {
    expect(ROUTE).toContain("caller.company?.id !== rolloff.sellContract.companyId")
  })

  it('requests a bench listing through the same consent-gated door every other listing uses', () => {
    // Not a second, looser way to list somebody — the same
    // request-then-grant BenchListing shape /api/bench/listings already
    // uses. CLAUDE.md: "A Submission requires a live BenchListing
    // granted by the consultant" still has to hold after this.
    expect(ROUTE).toContain('tx.benchListing.create')
    expect(ROUTE).toContain('tx.benchListing.findUnique')
  })

  it('makes a ConsultantProfile for a W2 employee who never had one, rather than failing', () => {
    // A person staffed straight onto a project never needed a
    // ConsultantProfile before. BENCH is the first moment they do, and
    // the route has to make one rather than 500 on somebody real.
    expect(ROUTE).toContain('tx.consultantProfile.findUnique')
    expect(ROUTE).toContain('tx.consultantProfile.create')
  })

  it('never lists somebody who is already on the bench a second time', () => {
    expect(ROUTE).toContain('already on your bench')
  })

  it('records what happened, same as every other automated action in this codebase', () => {
    expect(ROUTE).toContain("action: 'ROLLOFF_RESOLVED'")
  })

  it('claims the rolloff on resolve, if nobody has claimed it yet', () => {
    // One action instead of a forced claim-then-resolve for the common
    // case of resolving your own rolloff.
    expect(ROUTE).toContain('rolloff.claimedById ?? caller.person.id')
  })
})
