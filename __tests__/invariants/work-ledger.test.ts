import { describe, it, expect } from 'vitest'
import {
  submittedHours, hoursCovered, live, chain, position, mayAssert,
  supersede, historyOf, gaps,
  type Record_, type Assertion, type Role,
} from '@/lib/work-ledger'

/**
 * Hours are a fact. Approvals are opinions about that fact.
 *
 * 2017 duplicated: approving a buy-side sheet copied it, the cycle and
 * every transaction onto the sell side, so three companies meant three
 * copies of one week and "is this approved" had three answers.
 *
 * What I built last week collapsed: one record, two signature fields —
 * correct for two parties, silently wrong for three.
 *
 * One immutable record, as many assertions as there are parties.
 */

const at = (s: string) => new Date(`${s}T09:00:00Z`)

function record(over: Partial<Record_> = {}): Record_ {
  return {
    id: 'r1',
    personId: 'p1',
    personName: 'Rohan Menon',
    days: [
      { on: '2026-08-03', hours: 8 },
      { on: '2026-08-04', hours: 8 },
      { on: '2026-08-05', hours: 8 },
      { on: '2026-08-06', hours: 8 },
      { on: '2026-08-07', hours: 8 },
    ],
    periodStart: '2026-08-03',
    periodEnd: '2026-08-07',
    submittedAt: at('2026-08-08'),
    supersededById: null,
    ...over,
  }
}

function assertion(over: Partial<Assertion> = {}): Assertion {
  return {
    id: 'a1',
    recordId: 'r1',
    companyId: 'client',
    companyName: 'Calder Manufacturing',
    role: 'CLIENT_APPROVAL',
    from: null,
    to: null,
    hours: 40,
    rateCents: 9000,
    state: 'LIVE',
    at: at('2026-08-10'),
    byId: 'dana',
    auto: false,
    note: null,
    supersedesId: null,
    ...over,
  }
}

/** A real three-party chain: sub employs, prime passes on, client signs. */
const THREE: { companyId: string; companyName: string; role: Role }[] = [
  { companyId: 'client', companyName: 'Calder Manufacturing', role: 'CLIENT_APPROVAL' },
  { companyId: 'prime', companyName: 'Vertex Talent', role: 'PASS_THROUGH' },
  { companyId: 'sub', companyName: 'Cloudepa Systems', role: 'EMPLOYER_ACCEPTANCE' },
]

describe('a chain deeper than two', () => {
  it('waits on every party, not just the two with signature fields', () => {
    // The exact case the two-column model got silently wrong.
    const legs = chain(record(), THREE, [assertion()])
    const p = position(record(), legs)
    expect(p.waitingOn.map((l) => l.companyName)).toEqual(['Vertex Talent', 'Cloudepa Systems'])
    expect(p.says).toBe('40 hours submitted. Waiting on Vertex Talent and Cloudepa Systems.')
  })

  it('is complete only when everybody has spoken', () => {
    const legs = chain(record(), THREE, [
      assertion(),
      assertion({ id: 'a2', companyId: 'prime', companyName: 'Vertex Talent', role: 'PASS_THROUGH', rateCents: 8500 }),
      assertion({ id: 'a3', companyId: 'sub', companyName: 'Cloudepa Systems', role: 'EMPLOYER_ACCEPTANCE', rateCents: 7800 }),
    ])
    expect(position(record(), legs).complete).toBe(true)
  })

  it('shows a party who joined mid-assignment immediately, with nothing asserted', () => {
    // Derived from the contracts at read time rather than copied at
    // write time, so nobody has to backfill rows they did not know were
    // missing.
    const legs = chain(record(), THREE, [])
    expect(legs).toHaveLength(3)
    expect(legs[1].says).toBe('Vertex Talent has not passed on these hours yet.')
  })
})

describe('each leg carries its own money', () => {
  it('bills at the client’s rate and pays at the employer’s', () => {
    const legs = chain(record(), THREE, [
      assertion({ rateCents: 9000 }),
      assertion({ id: 'a3', companyId: 'sub', companyName: 'Cloudepa Systems', role: 'EMPLOYER_ACCEPTANCE', rateCents: 7800 }),
      assertion({ id: 'a2', companyId: 'prime', companyName: 'Vertex Talent', role: 'PASS_THROUGH', rateCents: 8500 }),
    ])
    const p = position(record(), legs)
    expect(p.billableCents).toBe(40 * 9000)
    expect(p.payableCents).toBe(40 * 7800)
  })

  it('stores neither number, so two copies cannot disagree', () => {
    // Both derive from the assertions every time they are asked.
    const legs = chain(record(), THREE, [assertion()])
    expect(position(record(), legs).billableCents).toBe(360000)
    expect(position(record({ days: [{ on: '2026-08-03', hours: 8 }] }), legs).billableCents).toBe(360000)
  })
})

describe('partial approval is the ordinary case', () => {
  it('covers a date range rather than a whole sheet', () => {
    // A client signs off four days and queries the fifth. Modelling that
    // as a whole-sheet status makes the common thing the exception.
    const a = assertion({ from: '2026-08-03', to: '2026-08-06', hours: 32 })
    expect(hoursCovered(record(), a)).toBe(32)
    expect(chain(record(), THREE, [a])[0].says).toBe(
      'Calder Manufacturing approved 32 hours, 2026-08-03 to 2026-08-06.'
    )
  })

  it('says plainly when they accepted fewer hours than the range holds', () => {
    const a = assertion({ hours: 36, note: 'Four hours of travel nobody agreed to bill.' })
    expect(chain(record(), THREE, [a])[0].says).toBe(
      'Calder Manufacturing approved 36 of the 40 hours submitted. Four hours of travel nobody agreed to bill.'
    )
  })

  it('names an automatic approval as one nobody looked at', () => {
    const a = assertion({ auto: true, byId: null })
    expect(chain(record(), THREE, [a])[0].says).toBe(
      'Calder Manufacturing approved all 40 hours. Approved automatically — nobody looked.'
    )
  })
})

describe('nothing is ever edited', () => {
  it('supersedes rather than overwrites, and keeps both', () => {
    const old = assertion()
    const v = supersede(old, 32, 'A day was logged on the wrong assignment.', 'dana', at('2026-08-12'))
    expect(v.ok).toBe(true)
    expect(v.withdraw.state).toBe('SUPERSEDED')
    expect(v.add.supersedesId).toBe('a1')
    expect(v.says).toBe(
      'Calder Manufacturing: 40 hours becomes 32. A day was logged on the wrong assignment. The original stays on the record.'
    )
  })

  it('needs a reason, because the old number stays visible', () => {
    expect(supersede(assertion(), 32, 'no', 'dana', at('2026-08-12')).ok).toBe(false)
  })

  it('will not let the same party answer twice without withdrawing', () => {
    const v = mayAssert('client', 'CLIENT_APPROVAL', THREE, [assertion()])
    expect(v.ok).toBe(false)
    expect(v.says).toMatch(/Withdraw the old one first — it is not overwritten\./)
  })

  it('refuses a company speaking for somebody else’s leg', () => {
    // One party asserting on another's behalf turns a chain back into a
    // single signature wearing three hats.
    expect(mayAssert('prime', 'CLIENT_APPROVAL', THREE, []).says).toBe(
      'That is not your part of this chain to answer.'
    )
  })
})

describe('the audit chain is free', () => {
  it('reads the history of one leg in order, without reconstructing anything', () => {
    const first = assertion({ id: 'a1', hours: 40, state: 'SUPERSEDED', at: at('2026-08-10') })
    const second = assertion({
      id: 'a2', hours: 32, at: at('2026-08-12'),
      note: 'A day on the wrong assignment.', supersedesId: 'a1',
    })
    expect(historyOf([second, first], 'client', 'CLIENT_APPROVAL')).toEqual([
      '2026-08-10: Calder Manufacturing said 40 hours, later changed, by dana',
      '2026-08-12: Calder Manufacturing said 32 hours, by dana — A day on the wrong assignment.',
    ])
  })

  it('never hides a withdrawal', () => {
    const w = assertion({ state: 'WITHDRAWN' })
    expect(historyOf([w], 'client', 'CLIENT_APPROVAL')[0]).toMatch(/withdrew 40 hours/)
    expect(live([w])).toHaveLength(0)
  })
})

describe('a chain with an offline party in the middle', () => {
  it('names the hole rather than resolving it away', () => {
    // Pretending somebody else's approval covers it is how a sub-vendor
    // pays on a signature nobody collected.
    const legs = chain(record(), THREE, [assertion()])
    expect(gaps(legs, new Set(['client', 'sub']))).toEqual([
      'Vertex Talent is not on Etyme, so nothing here carries their approval. Somebody has to collect it another way.',
    ])
  })

  it('says nothing about a leg that is simply still waiting', () => {
    const legs = chain(record(), THREE, [assertion()])
    expect(gaps(legs, new Set(['client', 'prime', 'sub']))).toEqual([])
  })
})

describe('the facts underneath', () => {
  it('adds up what the person recorded', () => {
    expect(submittedHours(record())).toBe(40)
  })
})
