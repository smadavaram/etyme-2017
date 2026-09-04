/**
 * What is about to go wrong, when, and whose job it is.
 *
 * Addendum E: tenure accrues to the person at the client across ALL
 * vendors; enforcement BLOCKS where legally grounded and WARNS everywhere
 * else; alumni re-engagement must check the ledger BEFORE the action is
 * offered, showing an eligibility date rather than a button.
 *
 * A client is not one person. These tests pin the ownership as much as the
 * arithmetic, because governance addressed to nobody in particular becomes
 * everybody's backlog — which is the failure that makes clients build the
 * spreadsheet instead.
 */

import { describe, it, expect } from 'vitest'
import {
  projectTenure,
  projectBreakInService,
  projectExpiry,
  projectContractEnd,
  sortHorizon,
  byTeam,
  ownerFor,
  type HorizonItem,
} from '@/lib/governance-horizon'

const NOW = new Date('2026-08-16T00:00:00Z')
const WINDOW = 120

// ── Who owns what ──────────────────────────────────────────

describe('Every rule belongs to a team', () => {

  it('a tenure breach is HR — it is co-employment exposure', () => {
    expect(ownerFor('TENURE_CAP')).toBe('HR')
  })

  it('a break in service is HR', () => {
    expect(ownerFor('BREAK_IN_SERVICE')).toBe('HR')
  })

  it('a lapsed supplier insurance is procurement', () => {
    expect(ownerFor('INSURANCE_REQUIRED')).toBe('PROCUREMENT')
  })

  it('a rate above band is procurement, not the hiring manager', () => {
    expect(ownerFor('RATE_BAND')).toBe('PROCUREMENT')
  })

  it('going over the headcount plan belongs to whoever owns the budget', () => {
    expect(ownerFor('HEADCOUNT_PLAN')).toBe('HIRING_MANAGER')
  })

  it('a client can override who owns a rule', () => {
    expect(ownerFor('RATE_BAND', 'LEGAL')).toBe('LEGAL')
  })

  it('an unrecognised rule falls to HR rather than to nobody', () => {
    expect(ownerFor('SOMETHING_NEW')).toBe('HR')
  })
})

// ── Tenure ─────────────────────────────────────────────────

describe('Tenure caps are dated, not vague', () => {
  const person = { personId: 'p1', personName: 'Priya Raman', capMonths: 18, accruing: true }

  it('someone six months short is given the date they cross', () => {
    const item = projectTenure({ ...person, monthsAccrued: 12 }, NOW, 200)!
    expect(item.date).toBe('2027-02-16')
    expect(item.headline).toContain('reaches the 18-month cap on 2027-02-16')
  })

  it('a cap is a block, because it is legally grounded', () => {
    const item = projectTenure({ ...person, monthsAccrued: 16 }, NOW, WINDOW)!
    expect(item.severity).toBe('BLOCK')
    expect(item.owner).toBe('HR')
  })

  it('somebody already past the cap is a live breach, not a projection', () => {
    const item = projectTenure({ ...person, monthsAccrued: 19 }, NOW, WINDOW)!
    expect(item.daysAway).toBe(0)
    expect(item.headline).toContain('is past the 18-month cap')
  })

  it('a cap inside two months says the extension will be blocked', () => {
    const item = projectTenure({ ...person, monthsAccrued: 17 }, NOW, WINDOW)!
    expect(item.action).toContain('extension is blocked')
  })

  it('somebody no longer on site is not accruing and raises nothing', () => {
    // Projecting a breach for a person who left invents exposure.
    expect(projectTenure({ ...person, monthsAccrued: 17, accruing: false }, NOW, WINDOW)).toBeNull()
  })

  it('a cap beyond the window is not shown yet', () => {
    expect(projectTenure({ ...person, monthsAccrued: 2 }, NOW, WINDOW)).toBeNull()
  })
})

// ── Break in service ───────────────────────────────────────

describe('A break in service ends on a date somebody can plan around', () => {
  const alum = { personId: 'p2', personName: 'Marcus Webb', requiredBreakDays: 90 }

  it('the eligibility date is given, not a button', () => {
    const item = projectBreakInService(
      { ...alum, lastEndedAt: new Date('2026-07-01T00:00:00Z') }, NOW, WINDOW
    )!
    expect(item.date).toBe('2026-09-29')
    expect(item.headline).toContain('becomes eligible to return on 2026-09-29')
  })

  it('it is a warning, not a block — this is the good news', () => {
    const item = projectBreakInService(
      { ...alum, lastEndedAt: new Date('2026-07-01T00:00:00Z') }, NOW, WINDOW
    )!
    expect(item.severity).toBe('WARN')
  })

  it('somebody whose break has already ended is not still pending', () => {
    expect(projectBreakInService(
      { ...alum, lastEndedAt: new Date('2026-01-01T00:00:00Z') }, NOW, WINDOW
    )).toBeNull()
  })

  it('somebody eligible today is told they can be asked back now', () => {
    const item = projectBreakInService(
      { ...alum, lastEndedAt: new Date('2026-05-18T00:00:00Z') }, NOW, WINDOW
    )!
    expect(item.daysAway).toBe(0)
    expect(item.action).toContain('ask them back')
  })
})

// ── Expiries ───────────────────────────────────────────────

describe('An expiring certificate carries the stake with it', () => {
  const cert = {
    id: 'v1', subjectKind: 'VENDOR' as const, subjectId: 'c1',
    subjectName: 'Cloudepa Inc.', type: 'INSURANCE_GL',
  }

  it('the number of people relying on it is in the headline', () => {
    const item = projectExpiry(
      { ...cert, expiresAt: new Date('2026-09-06T00:00:00Z'), activeWorkers: 12 }, NOW, WINDOW
    )!
    expect(item.headline).toContain('12 people on site')
    expect(item.headline).toContain('general liability cover')
  })

  it('one person is one person, not "1 people"', () => {
    const item = projectExpiry(
      { ...cert, expiresAt: new Date('2026-09-06T00:00:00Z'), activeWorkers: 1 }, NOW, WINDOW
    )!
    expect(item.headline).toContain('1 person on site')
  })

  it('insurance is procurement, work authorisation is HR', () => {
    const ins = projectExpiry(
      { ...cert, expiresAt: new Date('2026-09-06T00:00:00Z'), activeWorkers: 3 }, NOW, WINDOW
    )!
    const auth = projectExpiry(
      { ...cert, type: 'I9_EVERIFY', subjectKind: 'PERSON', expiresAt: new Date('2026-09-06T00:00:00Z'), activeWorkers: 1 },
      NOW, WINDOW
    )!
    expect(ins.owner).toBe('PROCUREMENT')
    expect(auth.owner).toBe('HR')
  })

  it('an already lapsed certificate says new starts are blocked', () => {
    const item = projectExpiry(
      { ...cert, expiresAt: new Date('2026-08-01T00:00:00Z'), activeWorkers: 12 }, NOW, WINDOW
    )!
    expect(item.daysAway).toBeLessThan(0)
    expect(item.headline).toContain('lapsed on 2026-08-01')
    expect(item.action).toContain('blocked')
  })
})

// ── Contract endings ───────────────────────────────────────

describe('Only undecided endings are worth surfacing', () => {
  const c = { contractId: 'sc1', personId: 'p3', personName: 'Ana Duarte' }

  it('an ending with no decision recorded is raised to the hiring manager', () => {
    const item = projectContractEnd(
      { ...c, endsAt: new Date('2026-10-01T00:00:00Z'), undecided: true }, NOW, WINDOW
    )!
    expect(item.owner).toBe('HIRING_MANAGER')
    expect(item.headline).toContain('no decision recorded')
  })

  it('an ending somebody has already decided is not nagged about', () => {
    expect(projectContractEnd(
      { ...c, endsAt: new Date('2026-10-01T00:00:00Z'), undecided: false }, NOW, WINDOW
    )).toBeNull()
  })
})

// ── Ordering and routing ───────────────────────────────────

describe('The horizon is ordered the way somebody would work it', () => {
  const item = (severity: 'BLOCK' | 'WARN', daysAway: number, owner: any = 'HR'): HorizonItem => ({
    kind: 'TENURE_CAP', owner, severity, date: '2026-01-01', daysAway,
    subject: { kind: 'PERSON', id: 'x', name: 'X' }, headline: '', action: null, actionable: true,
  })

  it('what blocks comes before what merely warns', () => {
    const sorted = sortHorizon([item('WARN', 2), item('BLOCK', 90)])
    expect(sorted[0].severity).toBe('BLOCK')
  })

  it('within the same severity, soonest first', () => {
    const sorted = sortHorizon([item('BLOCK', 40), item('BLOCK', 5), item('BLOCK', 90)])
    expect(sorted.map(i => i.daysAway)).toEqual([5, 40, 90])
  })

  it('each team sees only its own work', () => {
    const grouped = byTeam([
      item('BLOCK', 5, 'HR'),
      item('BLOCK', 9, 'PROCUREMENT'),
      item('WARN', 2, 'HIRING_MANAGER'),
    ])
    expect(grouped.HR).toHaveLength(1)
    expect(grouped.PROCUREMENT).toHaveLength(1)
    expect(grouped.HIRING_MANAGER).toHaveLength(1)
    expect(grouped.LEGAL).toHaveLength(0)
  })

  it('a team with nothing pending gets an empty list, never undefined', () => {
    const grouped = byTeam([])
    expect(grouped.LEGAL).toEqual([])
  })
})
