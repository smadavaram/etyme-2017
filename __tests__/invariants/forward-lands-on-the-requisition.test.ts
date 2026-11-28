import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { landingFor, type LandingFacts } from '@/app/api/submissions/[id]/forward/landing'

/**
 * A prime's candidate reaches the client's requisition.
 *
 * Break #3 on the founder's list: a sub-vendor submitting straight to a
 * client arrived on the requisition; a prime sending a candidate on did
 * not. The forward route wrote a fresh copy of the prime's record onto the
 * client's books every time and put the candidate there, so the client's
 * own requisition — the one it raised, approved and sent the prime — never
 * showed them. These sentences say where a forwarded candidate lands.
 */

function facts(over: Partial<LandingFacts> = {}): LandingFacts {
  return {
    destinationName: 'Northbend Athletic',
    destinationId: 'northbend',
    source: { id: 'cs-role', title: 'Supply planning analyst' },
    ancestors: [],
    sent: [{ requirementId: 'nb-req', title: 'Supply planning analyst' }],
    requested: null,
    ...over,
  }
}

describe('where a candidate sent on to a client lands', () => {
  it('a candidate a prime sends on lands on the requisition the client sent the prime', () => {
    const l = landingFor(facts())
    expect(l).toEqual({ kind: 'REQUISITION', requirementId: 'nb-req', because: 'the one job they sent you' })
  })

  it('a prime whose own record was copied from the client’s role lands on that role, whatever else it was sent', () => {
    const l = landingFor(facts({
      ancestors: [{ id: 'msp-role', companyId: 'maren' }, { id: 'nb-original', companyId: 'northbend' }],
      sent: [{ requirementId: 'a', title: 'A' }, { requirementId: 'b', title: 'B' }],
    }))
    expect(l).toMatchObject({ kind: 'REQUISITION', requirementId: 'nb-original' })
  })

  it('where the client sent the prime several roles, the one under the same title is chosen', () => {
    const l = landingFor(facts({
      source: { id: 'cs-role', title: '  supply  planning analyst ' },
      sent: [
        { requirementId: 'nb-req', title: 'Supply planning analyst' },
        { requirementId: 'nb-other', title: 'Demand planner' },
      ],
    }))
    expect(l).toMatchObject({ kind: 'REQUISITION', requirementId: 'nb-req' })
  })

  it('where several roles could be meant and nothing decides, the prime is asked which, by title, rather than guessed for', () => {
    const l = landingFor(facts({
      source: { id: 'cs-role', title: 'Planner' },
      sent: [
        { requirementId: 'nb-req', title: 'Supply planning analyst' },
        { requirementId: 'nb-other', title: 'Demand planner' },
      ],
    }))
    expect(l.kind).toBe('CHOOSE')
    if (l.kind !== 'CHOOSE') return
    expect(l.says).toBe('Northbend Athletic sent you 2 jobs: “Supply planning analyst”, “Demand planner”. Say which one this candidate is for.')
    expect(l.options.map((o) => o.requirementId)).toEqual(['nb-req', 'nb-other'])
  })

  it('a prime that names the role gets that role, when it is one the client sent it', () => {
    const l = landingFor(facts({
      sent: [{ requirementId: 'nb-req', title: 'x' }, { requirementId: 'nb-other', title: 'y' }],
      requested: 'nb-other',
    }))
    expect(l).toMatchObject({ kind: 'REQUISITION', requirementId: 'nb-other' })
  })

  it('a role the client never sent the prime cannot be named into, because a typed id is not a role somebody was given', () => {
    const l = landingFor(facts({ requested: 'somebody-elses-req' }))
    expect(l).toEqual({
      kind: 'REFUSE',
      says: 'Northbend Athletic did not send you that job, so nobody can be put forward on it from here.',
    })
  })

  it('a firm the destination never sent a role still gets its candidate through, on a copy of its own record', () => {
    expect(landingFor(facts({ sent: [] }))).toEqual({ kind: 'COPY' })
  })
})

describe('the forward route uses the landing, and the client’s own door', () => {
  const ROUTE = readFileSync(join(process.cwd(), 'src/app/api/submissions/[id]/forward/route.ts'), 'utf8')

  it('the forward route asks where the candidate lands before it writes anything', () => {
    const land = ROUTE.indexOf('const landing = landingFor({')
    const create = ROUTE.indexOf('prisma.submission.create(')
    expect(land).toBeGreaterThan(-1)
    expect(create).toBeGreaterThan(land)
  })

  it('a candidate landing on the client’s requisition meets the same door a direct submission does — open, not paused, first in wins', () => {
    expect(ROUTE).toContain('const shut = whyNotOpen({')
    expect(ROUTE).toContain("code: 'PAUSED'")
    expect(ROUTE).toContain('First in wins.')
  })

  it('a copy written for a destination that sent nothing carries the end client with it', () => {
    expect(ROUTE).toContain('endClientCompanyId: submission.requirement.endClientCompanyId,')
  })
})
