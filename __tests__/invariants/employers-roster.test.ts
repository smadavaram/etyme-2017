import { describe, it, expect } from 'vitest'
import { standingOf, rosterSummary, mayMarket, type RosterPerson } from '@/lib/consultant-portfolio'

/**
 * A firm's roster of the people it employs.
 *
 * Teleworld Solutions is the real case: a systems integrator holding five
 * live EMPLOYEE seats, whose Consultants page read "TOTAL 0 consultants"
 * and whose Bench page was bare, because every talent screen read bench
 * listings — and you do not ask your own W2 for permission to staff them.
 */

const NOW = new Date('2026-09-26T12:00:00.000Z')

function person(over: Partial<RosterPerson> = {}): RosterPerson {
  return {
    personId: 'p_1',
    name: 'Karthik Menon',
    seat: 'Validation Engineer',
    practice: 'Delivery — avionics software assurance practice',
    skills: [],
    listed: false,
    lines: [],
    ...over,
  }
}

describe('a firm sees the people it employs', () => {
  it('a firm sees the people it employs even where none of them has agreed to be marketed', () => {
    const teleworld = [
      person({ personId: 'p_1', name: 'Karthik Menon', lines: [{ live: false, startsOn: new Date('2025-11-30'), endsOn: new Date('2026-09-05'), clientName: 'Corveldt Aerospace' }] }),
      person({ personId: 'p_2', name: 'Amara Nwosu', seat: 'Data Engineer' }),
      person({ personId: 'p_3', name: 'Felix Brenner', seat: 'ERP Finance Consultant' }),
      person({ personId: 'p_4', name: 'Deepa Varma', seat: 'Integration Architect' }),
      person({ personId: 'p_5', name: 'Sunil Raghavan', seat: 'Owner' }),
    ]
    const s = rosterSummary(teleworld, NOW)
    expect(s.total).toBe(5)
    expect(s.marketable).toBe(0)
    expect(s.says).toMatch(/^5 people on your payroll/)
  })

  it('somebody whose assignment ended and who is on nothing else is between projects, with the day it ended', () => {
    const v = standingOf(
      person({ lines: [{ live: false, startsOn: new Date('2025-11-30'), endsOn: new Date('2026-09-05T00:00:00.000Z'), clientName: 'Corveldt Aerospace' }] }),
      NOW
    )
    expect(v.standing).toBe('BETWEEN_PROJECTS')
    expect(v.freeForDays).toBe(21)
    expect(v.free).toBe(true)
    expect(v.says).toContain('Corveldt Aerospace')
    expect(v.says).toContain('21 days between projects')
  })

  it('somebody on a live contract is on a project and is not counted as free', () => {
    const v = standingOf(
      person({ lines: [{ live: true, startsOn: new Date('2026-06-28'), endsOn: new Date('2027-06-28T00:00:00.000Z'), clientName: 'Corveldt Aerospace' }] }),
      NOW
    )
    expect(v.standing).toBe('ON_PROJECT')
    expect(v.free).toBe(false)
    expect(v.says).toMatch(/On a project at Corveldt Aerospace, until/)
  })

  it('somebody on a paused contract is still engaged, and the row says so', () => {
    const v = standingOf(person({ lines: [{ live: true, paused: true, startsOn: null, endsOn: null, clientName: 'Corveldt Aerospace' }] }), NOW)
    expect(v.standing).toBe('ON_PROJECT')
    expect(v.free).toBe(false)
    expect(v.says).toMatch(/paused/)
    expect(v.says).toMatch(/not free to allocate/)
  })

  it('somebody whose contract starts next week is starting soon, never between projects', () => {
    const v = standingOf(
      person({ lines: [{ live: false, startsOn: new Date('2026-10-05T00:00:00.000Z'), endsOn: new Date('2027-04-05'), clientName: 'Corveldt Aerospace' }] }),
      NOW
    )
    expect(v.standing).toBe('STARTING_SOON')
    expect(v.free).toBe(false)
    expect(v.says).toMatch(/Starts at Corveldt Aerospace on October 5, 2026/)
  })

  it('an employee with no work on the record is named, and is never counted as available', () => {
    const v = standingOf(person({ name: 'Amara Nwosu', seat: 'Data Engineer' }), NOW)
    expect(v.standing).toBe('NOT_ON_THE_RECORD')
    expect(v.free).toBe(false)
    expect(v.freeForDays).toBeNull()
    expect(v.says).toMatch(/No contract here carries their name/)
    expect(v.says).toMatch(/nothing on the record says whether they are free/i)
  })

  it('a roster names the seat each person holds, so the firm’s owner is not read as somebody to staff', () => {
    const v = standingOf(person({ name: 'Sunil Raghavan', seat: 'Owner' }), NOW)
    expect(v.says).toContain('Their seat says Owner')
    expect(v.free).toBe(false)
    // And the only number a delivery manager can act on excludes him.
    const s = rosterSummary([person({ name: 'Sunil Raghavan', seat: 'Owner' })], NOW)
    expect(s.betweenProjects).toBe(0)
    expect(s.notOnTheRecord).toBe(1)
  })

  it('the count of people between projects is the only one the firm can act on, and it says so', () => {
    const s = rosterSummary(
      [
        person({ personId: 'p_1', lines: [{ live: false, startsOn: null, endsOn: new Date('2026-09-05'), clientName: 'Corveldt Aerospace' }] }),
        person({ personId: 'p_2', seat: 'Data Engineer' }),
        person({ personId: 'p_3', seat: 'Owner' }),
      ],
      NOW
    )
    expect(s.betweenProjects).toBe(1)
    expect(s.notOnTheRecord).toBe(2)
    expect(s.says).toMatch(/1 between projects/)
    expect(s.says).toMatch(/2 have no contract on the record here/)
    expect(s.says).toMatch(/nothing says whether they are free/)
  })

  it('a roster never offers to put forward somebody who has granted no listing', () => {
    const no = mayMarket({ name: 'Amara Nwosu', listed: false })
    expect(no.ok).toBe(false)
    expect(no.says).toMatch(/granted no bench listing/)
    expect(no.says).toMatch(/nothing here markets, shares or lists them/)
    // And it says where it does happen, rather than leaving a dead end.
    expect(no.says).toMatch(/from the job itself/)
  })

  it('somebody who did grant a listing may be marketed, and the roster says which', () => {
    const yes = mayMarket({ name: 'Helena Marsh', listed: true })
    expect(yes.ok).toBe(true)
    const s = rosterSummary([person({ listed: true }), person({ personId: 'p_2', listed: false })], NOW)
    expect(s.marketable).toBe(1)
    expect(s.total).toBe(2)
  })

  it('a roster reports how many of its people it cannot describe, rather than filling it in', () => {
    const s = rosterSummary(
      [person({ skills: ['Avionics'] }), person({ personId: 'p_2', skills: [] }), person({ personId: 'p_3', skills: ['  '] })],
      NOW
    )
    expect(s.skillsKnown).toBe(1)
    expect(s.skillsUnknown).toBe(2)
  })

  it('a firm with nobody on its payroll is told what that means, not shown a zero', () => {
    const s = rosterSummary([], NOW)
    expect(s.total).toBe(0)
    expect(s.says).toMatch(/Nobody is on your payroll here yet/)
    expect(s.says).toMatch(/the employment is the consent/)
  })

  it('the longest-running of two live contracts is the one the row describes', () => {
    const v = standingOf(
      person({
        lines: [
          { live: true, startsOn: null, endsOn: new Date('2026-12-01'), clientName: 'Corveldt Aerospace' },
          { live: true, startsOn: null, endsOn: new Date('2027-06-28'), clientName: 'Harlow Health' },
        ],
      }),
      NOW
    )
    expect(v.on).toBe('Harlow Health')
  })
})
