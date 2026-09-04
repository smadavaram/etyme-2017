/**
 * Three things decide what somebody sees, and they are not one thing.
 *
 * "As a GSI I have roles that are client type and also vendor type — how
 * do you accommodate both?" And: "differentiate manager and non-manager,
 * not only roles but also persona."
 *
 * Same question twice. Side is what you are doing, role is what you may
 * do, persona is how far it reaches. One field cannot carry three.
 */

import { describe, it, expect } from 'vitest'
import {
  may, reachOf, standing, landOn, REACH_NEVER_WIDENS,
  type Actor, type Seat,
} from '@/lib/persona'

const actor = (over: Partial<Actor> = {}): Actor => ({
  personId: 'me',
  companyId: 'infosys',
  side: 'SELL',
  persona: 'INDIVIDUAL',
  permissions: ['submissions.write', 'margin.read'],
  ...over,
})

describe('A role says what you may do. A persona says how far it reaches', () => {

  it('a recruiter and a recruiting manager hold the same permission', () => {
    // The alternative is minting submissions.write.own and
    // submissions.write.team, and doing it again for every noun.
    const ic = actor({ persona: 'INDIVIDUAL' })
    const mgr = actor({ persona: 'MANAGER', teamPersonIds: ['ravi'] })
    expect(ic.permissions).toEqual(mgr.permissions)
  })

  it('and the manager sees the team’s work where the recruiter sees only their own', () => {
    const subject = { personId: 'ravi', companyId: 'infosys' }
    expect(may(actor(), 'submissions.write', subject).allowed).toBe(false)
    expect(may(actor({ persona: 'MANAGER', teamPersonIds: ['ravi'] }), 'submissions.write', subject).allowed).toBe(true)
  })

  it('says why, in terms of position rather than permission', () => {
    const v = may(actor(), 'submissions.write', { personId: 'ravi', companyId: 'infosys' })
    expect(v.says).toContain('Your role covers it; your position covers your own only')
  })

  it('a manager still cannot reach outside their team', () => {
    const v = may(
      actor({ persona: 'MANAGER', teamPersonIds: ['ravi'] }),
      'submissions.write',
      { personId: 'anita', companyId: 'infosys' }
    )
    expect(v.allowed).toBe(false)
    expect(v.says).toContain('not on your team')
  })

  it('a unit head reaches their practice and not the one next door', () => {
    const head = actor({ persona: 'UNIT_HEAD', orgUnitId: 'sap-practice' })
    expect(may(head, 'submissions.write', { personId: 'x', companyId: 'infosys', orgUnitId: 'sap-practice' }).allowed).toBe(true)
    expect(may(head, 'submissions.write', { personId: 'x', companyId: 'infosys', orgUnitId: 'oracle-practice' }).allowed).toBe(false)
  })

  it('a principal reaches the firm', () => {
    expect(reachOf('PRINCIPAL')).toBe('COMPANY')
    expect(may(actor({ persona: 'PRINCIPAL' }), 'margin.read', { personId: 'anyone', companyId: 'infosys' }).allowed).toBe(true)
  })

  it('reach is about whose work you may see, not how senior you are', () => {
    // An owner of a two-person firm and a team lead at a large one may
    // be the same persona.
    expect(reachOf('INDIVIDUAL')).toBe('OWN')
    expect(reachOf('MANAGER')).toBe('TEAM')
  })
})

describe('Some things do not widen with seniority', () => {

  it('a principal still cannot approve their own timesheet', () => {
    // Being promoted does not make somebody an approver of their own
    // work. Somebody has to be able to say no.
    const v = may(
      actor({ persona: 'PRINCIPAL', permissions: ['timesheet.approve.own'] }),
      'timesheet.approve.own',
      { personId: 'me', companyId: 'infosys' }
    )
    expect(v.allowed).toBe(false)
    expect(v.says).toContain('cannot be the person being paid')
  })

  it('but may approve somebody else’s', () => {
    const v = may(
      actor({ persona: 'PRINCIPAL', permissions: ['timesheet.approve.own'] }),
      'timesheet.approve.own',
      { personId: 'ravi', companyId: 'infosys' }
    )
    expect(v.allowed).toBe(true)
  })

  it('the list is written down rather than inferred, because it has a legal answer', () => {
    expect(REACH_NEVER_WIDENS).toContain('person.bank.read')
    expect(REACH_NEVER_WIDENS).toContain('timesheet.approve.own')
  })
})

describe('A GSI buys and sells at the same firm, and those are separate screens', () => {

  const seat = (over: Partial<Seat> = {}): Seat => ({
    contextId: 'c1', companyId: 'infosys', companyName: 'Infosys',
    side: 'SELL', persona: 'MANAGER', roleName: 'Delivery lead', ...over,
  })

  it('a record on the other side is refused, however senior the person', () => {
    const v = may(
      actor({ side: 'SELL', persona: 'PRINCIPAL' }),
      'margin.read',
      { companyId: 'infosys', side: 'BUY' }
    )
    expect(v.allowed).toBe(false)
    expect(v.says).toContain('switch to see it')
  })

  it('names both hats rather than leaving somebody to discover them', () => {
    const s = standing([seat({ contextId: 'c1', side: 'SELL' }), seat({ contextId: 'c2', side: 'BUY' })])
    expect(s.bothSidesSomewhere).toBe(true)
    expect(s.says).toContain('You buy and sell at Infosys')
  })

  it('says why they are kept apart, in commercial terms', () => {
    const s = standing([seat({ contextId: 'c1', side: 'SELL' }), seat({ contextId: 'c2', side: 'BUY' })])
    expect(s.says).toContain('should not be on one page while you are negotiating')
  })

  it('a firm that only sells is not told it does both', () => {
    expect(standing([seat()]).bothSidesSomewhere).toBe(false)
  })

  it('the company wall is checked before anything else, because it is a different wrong', () => {
    const v = may(actor({ persona: 'PRINCIPAL' }), 'margin.read', { companyId: 'wipro' })
    expect(v.says).toBe('That belongs to another company.')
  })
})

describe('Signing in lands somewhere deliberate, never on whichever seat was granted last', () => {

  const seat = (over: Partial<Seat> = {}): Seat => ({
    contextId: 'c1', companyId: 'infosys', companyName: 'Infosys',
    side: 'SELL', persona: 'MANAGER', roleName: 'Delivery lead', ...over,
  })

  it('one seat, no question asked', () => {
    const r = landOn([seat()])
    expect(r.ask).toBe(false)
    expect(r.seat?.contextId).toBe('c1')
  })

  it('several seats and no memory: it asks rather than guessing', () => {
    // Landing a delivery lead on the buying desk because a context was
    // granted last Tuesday is how somebody quotes the wrong number.
    const r = landOn([seat({ contextId: 'c1' }), seat({ contextId: 'c2', side: 'BUY' })])
    expect(r.ask).toBe(true)
    expect(r.seat).toBeNull()
    expect(r.says).toContain('We will remember it')
  })

  it('goes back where they were, when it remembers', () => {
    const r = landOn([seat({ contextId: 'c1' }), seat({ contextId: 'c2' })], 'c2')
    expect(r.seat?.contextId).toBe('c2')
    expect(r.ask).toBe(false)
  })

  it('ignores a remembered seat they no longer hold', () => {
    const r = landOn([seat({ contextId: 'c1' })], 'revoked')
    expect(r.seat?.contextId).toBe('c1')
  })
})
