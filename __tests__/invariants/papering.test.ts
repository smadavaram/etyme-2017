import { describe, it, expect } from 'vitest'
import {
  awardHandoff, mayPaper, paperingRow, deskPhraseFor, daysWaiting,
  holdsContractDesk, holdsSubmitDesk,
  type Seat, type AwardFacts,
} from '@/lib/papering'

const NOW = new Date('2026-09-17T12:00:00Z')
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000)

const ACCOUNT_MANAGER: Seat = {
  personId: 'p-am', personName: 'Marisol Vega', roleName: 'Account Manager',
  permissions: ['submissions.read', 'submissions.create', 'submissions.rate', 'rates.read'],
}
const CONTRACT_MANAGER: Seat = {
  personId: 'p-cm', personName: 'Anwar Bhatt', roleName: 'Contract Manager',
  permissions: ['assignments.read', 'assignments.write', 'rates.read', 'rates.write'],
}
const RECRUITER: Seat = {
  personId: 'p-rec', personName: 'Tomas Ilves', roleName: 'Recruiter',
  permissions: ['submissions.read', 'submissions.create'],
}
const OWNER: Seat = {
  personId: 'p-own', personName: 'Helena Marsh', roleName: 'Owner', permissions: ['*'],
}
const AP: Seat = {
  personId: 'p-ap', personName: 'Ruth Calder', roleName: 'AP & Payroll',
  permissions: ['payroll.run', 'payments.record'],
}

const PLACEMENT: AwardFacts = {
  personName: 'Priya Raman',
  clientName: 'Northbend Athletic',
  roleTitle: 'SAP FICO Consultant',
  rateCents: 13_500,
  currency: 'USD',
  startDate: new Date('2026-09-28T00:00:00Z'),
}

describe('When a candidate is placed, the baton passes from the desk that sold to the desk that papers', () => {

  it('when a candidate is placed, the desk that papers contracts is told, and the desk that submitted is not asked to', () => {
    const h = awardHandoff(PLACEMENT, [ACCOUNT_MANAGER, CONTRACT_MANAGER, RECRUITER, AP])

    expect(h.toPaper?.personIds).toEqual(['p-cm'])
    expect(h.toPaper?.title).toContain('Paper the contract')

    // The account manager and the recruiter hear that it was won. They
    // are never asked to paper it, because they cannot.
    expect(h.toSell?.personIds.sort()).toEqual(['p-am', 'p-rec'])
    expect(h.toSell?.title).toContain('Won')
    expect(h.toSell?.body).not.toContain('Open it')
  })

  it('an account manager cannot paper the contract they won, and is told by name who can', () => {
    const verdict = mayPaper(ACCOUNT_MANAGER.permissions, [CONTRACT_MANAGER])

    expect(verdict.ok).toBe(false)
    expect(verdict.says).toContain('Anwar Bhatt (Contract Manager)')
    expect(verdict.says).toContain('two desks')
    // A sentence, never a code.
    expect(verdict.says).not.toMatch(/FORBIDDEN|assignments\.write/)
  })

  it('a contract manager who was never asked to submit anybody is not told the deal was won twice', () => {
    const h = awardHandoff(PLACEMENT, [CONTRACT_MANAGER])
    expect(h.toSell).toBeNull()
    expect(h.toPaper?.personIds).toEqual(['p-cm'])
  })

  it('an owner who holds every desk is told once, as the desk that acts', () => {
    const h = awardHandoff(PLACEMENT, [OWNER])
    expect(h.toPaper?.personIds).toEqual(['p-own'])
    expect(h.toSell).toBeNull()
    expect(holdsContractDesk(OWNER.permissions)).toBe(true)
    expect(holdsSubmitDesk(OWNER.permissions)).toBe(true)
  })

  it('a firm that has seated nobody on the contract desk is told to seat one, rather than told nothing', () => {
    const h = awardHandoff(PLACEMENT, [ACCOUNT_MANAGER, AP])
    expect(h.toPaper).toBeNull()
    expect(h.says).toContain('nobody at your firm holds the contract desk yet')
    expect(h.says).toContain('Users & permissions')
  })

  it('the notice names the person, the client, the role and the rate, so nobody opens the contract to find out what it is', () => {
    const h = awardHandoff(PLACEMENT, [CONTRACT_MANAGER])
    const body = h.toPaper!.body
    expect(body).toContain('Priya Raman')
    expect(body).toContain('Northbend Athletic')
    expect(body).toContain('SAP FICO Consultant')
    expect(body).toContain('$135/hr')
    expect(body).toContain('Sep 28, 2026')
  })

  it('a rate nobody has agreed is said to be unconfirmed rather than printed as zero', () => {
    const h = awardHandoff({ ...PLACEMENT, rateCents: null }, [CONTRACT_MANAGER])
    expect(h.toPaper!.body).toContain('at a rate nobody has confirmed yet')
    expect(h.toPaper!.body).not.toContain('$0')
  })

  it('two people on the contract desk are both told, and named to the seller as both', () => {
    const second: Seat = { personId: 'p-cm2', personName: 'Dana Okafor', roleName: 'Contract Manager', permissions: ['assignments.write'] }
    const h = awardHandoff(PLACEMENT, [ACCOUNT_MANAGER, CONTRACT_MANAGER, second])
    expect(h.toPaper?.personIds.sort()).toEqual(['p-cm', 'p-cm2'])
    expect(h.deskPhrase).toBe('Anwar Bhatt (Contract Manager) and Dana Okafor (Contract Manager)')
  })

  it('nine people on the contract desk are named as one and a count, because a sentence is not a list', () => {
    const many: Seat[] = Array.from({ length: 9 }, (_, i) => ({
      personId: `p-${i}`, personName: `Person ${i}`, roleName: 'Contract Manager', permissions: ['assignments.write'],
    }))
    expect(deskPhraseFor(many)).toBe('Person 0 (Contract Manager) and 8 others who paper contracts here')
  })
})

describe('A contract nobody has papered sits on the supplier’s own queue', () => {

  const DRAFT = {
    state: 'DRAFT',
    personName: 'Priya Raman',
    clientName: 'Northbend Athletic',
    roleTitle: 'SAP FICO Consultant',
    rateCents: 13_500,
    currency: 'USD',
    waitingSince: day(-9),
    startDate: day(30),
  }

  it('a contract waiting to be papered is on the supplier’s own queue, with how long it has waited', () => {
    const row = paperingRow(DRAFT, NOW)!
    expect(row.type).toBe('CONTRACT_PAPERING')
    expect(row.title).toBe('Paper the contract — Priya Raman')
    expect(row.subtitle).toContain('awarded 9 days ago, still a draft')
    expect(row.waitedDays).toBe(9)
  })

  it('a contract still unpapered after a week is urgent, and one awarded this morning is not', () => {
    expect(paperingRow({ ...DRAFT, waitingSince: day(-9) }, NOW)!.urgency).toBe('HIGH')
    expect(paperingRow({ ...DRAFT, waitingSince: day(-4) }, NOW)!.urgency).toBe('MEDIUM')
    const today = paperingRow({ ...DRAFT, waitingSince: NOW }, NOW)!
    expect(today.urgency).toBe('LOW')
    expect(today.subtitle).toContain('awarded today, still a draft')
  })

  it('a draft whose start date is next week is urgent however recently it was awarded, because nobody starts on a draft', () => {
    const row = paperingRow({ ...DRAFT, waitingSince: NOW, startDate: day(5) }, NOW)!
    expect(row.urgency).toBe('HIGH')
    expect(row.subtitle).toContain('starts in 5 days')
  })

  it('a contract papered but not started is a second row, because starting somebody is a different act', () => {
    const row = paperingRow({ ...DRAFT, state: 'PENDING_VERIFICATION', waitingSince: day(-2) }, NOW)!
    expect(row.type).toBe('CONTRACT_START')
    expect(row.title).toBe('Start Priya Raman at Northbend Athletic')
    expect(row.subtitle).toContain('papered 2 days ago, not started')
  })

  it('a placement whose start date has already passed and which has not started is urgent', () => {
    const row = paperingRow({ ...DRAFT, state: 'VERIFIED', waitingSince: day(-10), startDate: day(-3) }, NOW)!
    expect(row.urgency).toBe('HIGH')
    expect(row.subtitle).toContain('due to start 3 days ago')
  })

  it('a placement already under way is nobody’s decision and makes no row at all', () => {
    expect(paperingRow({ ...DRAFT, state: 'IN_PROGRESS' }, NOW)).toBeNull()
    expect(paperingRow({ ...DRAFT, state: 'CANCELLED' }, NOW)).toBeNull()
    expect(paperingRow({ ...DRAFT, state: 'ENDED' }, NOW)).toBeNull()
  })

  it('a queue row says what is missing in words, and never names a database state', () => {
    for (const state of ['DRAFT', 'PENDING_VERIFICATION', 'VERIFIED']) {
      const row = paperingRow({ ...DRAFT, state }, NOW)!
      expect(`${row.title} ${row.subtitle}`).not.toMatch(/DRAFT|PENDING_VERIFICATION|VERIFIED|IN_PROGRESS/)
    }
  })

  it('a draft with no rate agreed says so on the row rather than showing nothing', () => {
    const row = paperingRow({ ...DRAFT, rateCents: null }, NOW)!
    expect(row.subtitle).toContain('rate not confirmed')
    expect(row.subtitle).not.toContain('$0')
  })

  it('counts a wait in whole days and never in negative ones', () => {
    expect(daysWaiting(day(-1), NOW)).toBe(1)
    expect(daysWaiting(day(1), NOW)).toBe(0)
  })
})
