import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { awardDoor, placeByAward, AWARDABLE_FROM, type AwardDoorFacts } from '@/lib/award'

/**
 * One road to PLACED, and it is the award.
 *
 * A full lifecycle walk on the seeded demo found a new consultant going
 * bench → submitted → interviewed → OFFERED and stopping there. The award
 * (`POST /api/submissions/[id]/award`) writes the contract, the order, the
 * dates and the stand-down, and its only door was a "Place" button on the
 * requisition page. The door people actually met was a bare status flip to
 * PLACED from the Submissions list, which wrote nothing behind it — and
 * then "→ Contract" as a second step. Two roads, and the one people took
 * placed nobody.
 *
 * These sentences hold the one road: who may take it, from where, and
 * that every screen asks the same function the route refuses on.
 */

const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

function facts(over: Partial<AwardDoorFacts> = {}): AwardDoorFacts {
  return {
    callerCompanyId: 'northbend',
    callerCompanyName: 'Northbend Athletic',
    mayHire: true,
    requirementCompanyId: 'northbend',
    fromCompanyId: 'pinnacle',
    fromCompanyName: 'Pinnacle Resourcing',
    toCompanyId: 'northbend',
    toCompanyName: 'Northbend Athletic',
    personName: 'Tariq Al-Amin',
    status: 'OFFERED',
    contractId: null,
    ...over,
  }
}

describe('who may award, and from where', () => {
  it('the client’s hiring desk may award a candidate who holds an offer', () => {
    const d = awardDoor(facts())
    expect(d.open).toBe(true)
    expect(d.says).toContain('writes the contract, the order and the billing dates in one step')
  })

  it('a candidate may be awarded from submitted, shortlisted, interview or offered — a client may hire without an interview', () => {
    for (const status of ['SUBMITTED', 'SHORTLISTED', 'INTERVIEW', 'OFFERED']) {
      expect(awardDoor(facts({ status })).open, status).toBe(true)
    }
    expect(AWARDABLE_FROM).toContain('OFFERED')
  })

  it('a supplier never awards its own candidate, and is told who decides', () => {
    const d = awardDoor(facts({ callerCompanyId: 'pinnacle', callerCompanyName: 'Pinnacle Resourcing' }))
    expect(d.open).toBe(false)
    if (d.open) return
    expect(d.code).toBe('OWN_CANDIDATE')
    expect(d.httpStatus).toBe(403)
    expect(d.says).toBe('A supplier never awards its own candidate. Northbend Athletic decides whether Tariq Al-Amin is placed.')
  })

  it('a supplier is refused even on a requisition it recorded itself, because awarding its own candidate is still awarding itself the role', () => {
    const d = awardDoor(facts({ callerCompanyId: 'pinnacle', requirementCompanyId: 'pinnacle' }))
    expect(d.open).toBe(false)
    if (!d.open) expect(d.code).toBe('OWN_CANDIDATE')
  })

  it('a prime awards a sub-vendor’s candidate that was put forward to the prime', () => {
    const d = awardDoor(facts({
      callerCompanyId: 'auralis', callerCompanyName: 'Auralis Software',
      requirementCompanyId: 'northbend', toCompanyId: 'auralis', toCompanyName: 'Auralis Software',
      fromCompanyId: 'marrow', fromCompanyName: 'Marrow Field',
    }))
    expect(d.open).toBe(true)
  })

  it('a firm that is neither hiring nor the one the candidate was sent to cannot award, and is told who can', () => {
    const d = awardDoor(facts({ callerCompanyId: 'brightmoor', callerCompanyName: 'Brightmoor Staffing' }))
    expect(d.open).toBe(false)
    if (d.open) return
    expect(d.code).toBe('NOT_THE_BUYER')
    expect(d.says).toBe('Only Northbend Athletic, who Tariq Al-Amin was put forward to, can award this position.')
  })

  it('a desk at the hiring company that does not hire — the AP clerk, the viewer — is told to ask the hiring manager', () => {
    const d = awardDoor(facts({ mayHire: false }))
    expect(d.open).toBe(false)
    if (d.open) return
    expect(d.code).toBe('NOT_HIRING')
    expect(d.says).toContain('a hiring or program manager. Ask them to award Tariq Al-Amin.')
  })

  it('somebody turned down, withdrawn or stood down cannot be awarded, and the refusal says why', () => {
    const words: Record<string, string> = {
      REJECTED: 'Tariq Al-Amin was turned down, so there is no position to award them.',
      WITHDRAWN: 'Tariq Al-Amin was withdrawn, so there is no position to award them.',
      NOT_SELECTED: 'Tariq Al-Amin was stood down when the role was filled, so there is no position to award them.',
    }
    for (const [status, says] of Object.entries(words)) {
      const d = awardDoor(facts({ status }))
      expect(d.open, status).toBe(false)
      if (d.open) continue
      expect(d.code).toBe('NOT_IN_THE_RUNNING')
      expect(d.says).toBe(says)
    }
  })

  it('a person who already holds a contract on this requisition is not offered the award again', () => {
    const d = awardDoor(facts({ status: 'PLACED', contractId: 'sc_1' }))
    expect(d.open).toBe(false)
    if (d.open) return
    expect(d.code).toBe('ALREADY_AWARDED')
    expect(d.contractId).toBe('sc_1')
  })

  it('a submission marked placed with no contract behind it can still be awarded, so it is repaired rather than stranded', () => {
    expect(awardDoor(facts({ status: 'PLACED', contractId: null })).open).toBe(true)
  })
})

describe('a bare status change to placed is refused', () => {
  const STATUS = read('src/app/api/submissions/[id]/status/route.ts')

  it('a bare status change to placed is refused, and the sentence points the buyer at Place', () => {
    expect(placeByAward('Tariq Al-Amin', true, 'Northbend Athletic')).toBe(
      'Tariq Al-Amin is placed by awarding the position, which writes the contract, the order and the billing dates in the same step. Press Place on their row.'
    )
    expect(STATUS).toContain("code: 'PLACE_BY_AWARD'")
    expect(STATUS).toMatch(/if \(status === 'PLACED'\) \{[\s\S]{0,400}status: 409/)
  })

  it('the supplier asking for placed is told the client places them by awarding', () => {
    expect(placeByAward('Tariq Al-Amin', false, 'Northbend Athletic')).toBe(
      'Tariq Al-Amin is placed when Northbend Athletic awards the position, which writes the contract and its billing dates in the same step.'
    )
  })

  it('the status route lists placed as a transition from nowhere', () => {
    const table = STATUS.slice(STATUS.indexOf('const transitions'), STATUS.indexOf('const transitions') + 900)
    expect(table).not.toMatch(/\[[^\]]*'PLACED'[^\]]*\]/)
  })

  it('nothing but the award writes placed onto a submission', () => {
    const AWARD = read('src/app/api/submissions/[id]/award/route.ts')
    expect(AWARD).toContain("data: { status: 'PLACED', decidedAt: new Date() }")
    expect(STATUS).not.toMatch(/data:\s*\{\s*status:\s*'PLACED'/)
  })
})

describe('every door to a placement is the award, and never lies', () => {
  const AWARD = read('src/app/api/submissions/[id]/award/route.ts')
  const LIST_ROUTE = read('src/app/api/submissions/route.ts')
  const REQ_ROUTE = read('src/app/api/requisitions/[id]/route.ts')
  const SUBMISSIONS = read('src/app/dashboard/submissions/page.tsx')
  const REQUISITION = read('src/app/dashboard/requisitions/[id]/page.tsx')

  it('the award route refuses on the same function the lists ask before offering Place', () => {
    expect(AWARD).toContain('const door = awardDoor({')
    expect(LIST_ROUTE).toContain('const door = awardDoor({')
    expect(REQ_ROUTE).toContain('const door = awardDoor({')
  })

  it('the Submissions row offers Place only where the route said the reader may award', () => {
    expect(SUBMISSIONS).toContain('{row.award?.open && (')
    expect(SUBMISSIONS).toContain('fetch(`/api/submissions/${placeSubmission.id}/award`')
  })

  it('the requisition page offers Place only where the route said the reader may award', () => {
    expect(REQUISITION).toContain('c.award?.open && s.remaining > 0')
    expect(REQUISITION).toContain('fetch(`/api/submissions/${c.id}/award`')
  })

  it('the Submissions list no longer offers to turn a placed row into a second contract', () => {
    expect(SUBMISSIONS).not.toContain('/convert`')
    expect(SUBMISSIONS).not.toContain('→ Contract')
  })

  it('a placed row leads to its placement', () => {
    expect(SUBMISSIONS).toContain('/dashboard/placements/${row.contractId}')
    expect(REQUISITION).toContain('/dashboard/placements/${c.contractId}')
  })
})
