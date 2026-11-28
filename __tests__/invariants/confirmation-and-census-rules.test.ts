import { describe, it, expect } from 'vitest'
import {
  itemState, dualAuthorizations, blockReleased, twoSeats, confirmationRefusal, confirmedMoment, countingConfirmations, daysWaiting,
  type SubmissionFact,
} from '@/lib/agents/confirmation-rules'
import {
  censusOn, changesBetween, standingOn, sideOf, weeklyLine, PROPOSED_DORMANT_AFTER_DAYS, type CensusFacts,
} from '@/lib/agents/census-rules'

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const sub = (id: string, over: Partial<SubmissionFact> = {}): SubmissionFact => ({
  id, personId: 'p1', personName: 'Priya Nair', jobKey: 'c1|data engineer', jobTitle: 'Data Engineer',
  submittedAt: d('2026-11-01'), endedAt: null, checkState: 'SENT', ...over,
})
const mail = (id: string, outcome: string, at: string) => ({ id, outcome, createdAt: d(at) })

describe('a submission against its confirmation', () => {
  it('a draft submission is never a confirmed one, even with a confirmation on it', () => {
    expect(itemState({ submission: { checkState: 'READY' }, confirmations: [{ id: 'c', mailSendId: null, confirmedAt: d('2026-11-02') }], mails: [], blocked: false })).toBe('NOT_SENT')
  })
  it('a submission that went out with nothing back is awaiting', () => {
    expect(itemState({ submission: { checkState: 'SENT' }, confirmations: [], mails: [mail('m1', 'SENT', '2026-11-01')], blocked: false })).toBe('AWAITING')
  })
  it('a recorded confirmation makes the submission confirmed', () => {
    expect(itemState({ submission: { checkState: 'SENT' }, confirmations: [{ id: 'c', mailSendId: null, confirmedAt: d('2026-11-02') }], mails: [], blocked: false })).toBe('CONFIRMED')
  })
  it('a letter that bounced reopens the submission as failed delivery', () => {
    expect(itemState({ submission: { checkState: 'SENT' }, confirmations: [], mails: [mail('m1', 'FAILED_DELIVERY', '2026-11-01')], blocked: false })).toBe('FAILED_DELIVERY')
  })
  it('a bounce after a confirmation reopens a submission that read confirmed', () => {
    expect(itemState({ submission: { checkState: 'SENT' }, confirmations: [{ id: 'c', mailSendId: null, confirmedAt: d('2026-11-02') }], mails: [mail('m1', 'FAILED_DELIVERY', '2026-11-05')], blocked: false })).toBe('FAILED_DELIVERY')
  })
  it('a bounce before a confirmation was answered by it, so the submission reads confirmed', () => {
    expect(itemState({ submission: { checkState: 'SENT' }, confirmations: [{ id: 'c', mailSendId: null, confirmedAt: d('2026-11-05') }], mails: [mail('m1', 'FAILED_DELIVERY', '2026-11-02')], blocked: false })).toBe('CONFIRMED')
  })
  it('a confirmation tied to a letter that never left does not count', () => {
    const conf = [{ id: 'c', mailSendId: 'm1', confirmedAt: d('2026-11-02') }]
    expect(countingConfirmations(conf, [mail('m1', 'DEMO_SKIPPED', '2026-11-01')])).toEqual([])
    expect(itemState({ submission: { checkState: 'SENT' }, confirmations: conf, mails: [mail('m1', 'DEMO_SKIPPED', '2026-11-01')], blocked: false })).toBe('AWAITING')
  })
  it('a confirmation tied to a letter that bounced reads failed delivery', () => {
    expect(itemState({ submission: { checkState: 'SENT' }, confirmations: [{ id: 'c', mailSendId: 'm1', confirmedAt: d('2026-11-02') }], mails: [mail('m1', 'FAILED_DELIVERY', '2026-11-01')], blocked: false })).toBe('FAILED_DELIVERY')
  })
  it('a submission held as a double authorization reads on hold whatever else is true', () => {
    expect(itemState({ submission: { checkState: 'SENT' }, confirmations: [{ id: 'c', mailSendId: null, confirmedAt: d('2026-11-02') }], mails: [], blocked: true })).toBe('BLOCKED')
  })
  it('days waiting are whole days and never negative', () => {
    expect(daysWaiting(d('2026-11-01'), d('2026-11-04'))).toBe(3)
    expect(daysWaiting(d('2026-11-04'), d('2026-11-01'))).toBe(0)
  })
})

describe('the same person put forward twice for the same job', () => {
  it('two live submissions of one person for one job in overlapping time are a double authorization', () => {
    const g = dualAuthorizations([sub('a'), sub('b', { submittedAt: d('2026-11-03') })])
    expect(g).toHaveLength(1)
    expect(g[0].map((s) => s.id)).toEqual(['a', 'b'])
  })
  it('the same person for two different jobs is not one', () => {
    expect(dualAuthorizations([sub('a'), sub('b', { jobKey: 'c1|analyst' })])).toEqual([])
  })
  it('two different people for one job is not one', () => {
    expect(dualAuthorizations([sub('a'), sub('b', { personId: 'p2' })])).toEqual([])
  })
  it('a submission that ended is not live, so it holds nothing', () => {
    expect(dualAuthorizations([sub('a', { endedAt: d('2026-11-02') }), sub('b', { submittedAt: d('2026-11-03') })])).toEqual([])
  })
  it('a draft is not an authorization', () => {
    expect(dualAuthorizations([sub('a'), sub('b', { checkState: 'DRAFT' })])).toEqual([])
  })
  it('the hold lifts only when two different people said yes', () => {
    expect(blockReleased(['dana'])).toBe(false)
    expect(blockReleased(['dana', 'dana'])).toBe(false)
    expect(blockReleased(['dana', null])).toBe(false)
    expect(blockReleased(['dana', 'ivo'])).toBe(true)
  })
  it('a firm with one working seat has nobody to put the override to', () => {
    expect(twoSeats(null, 'dana', null)).toBeNull()
    expect(twoSeats('oli', 'dana', null)).toEqual(['oli', 'dana'])
    expect(twoSeats(null, 'dana', 'ivo')).toEqual(['dana', 'ivo'])
  })
})

describe('who may record a confirmation, and when', () => {
  const ok = { state: 'AWAITING' as const, channel: 'PHONE', alreadyConfirmed: false }
  it('a confirmation on a draft is refused in a sentence', () => {
    expect(confirmationRefusal({ ...ok, state: 'NOT_SENT' })).toMatch(/draft is not a confirmation/)
  })
  it('a confirmation on a submission on hold is refused in a sentence naming two people', () => {
    expect(confirmationRefusal({ ...ok, state: 'BLOCKED' })).toMatch(/Two different people/)
  })
  it('a channel that is not one of the four is refused', () => {
    expect(confirmationRefusal({ ...ok, channel: 'CARRIER_PIGEON' })).toMatch(/email, phone, portal or manual/)
  })
  it('a second confirmation of one submission is refused', () => {
    expect(confirmationRefusal({ ...ok, alreadyConfirmed: true })).toMatch(/already confirmed/)
  })
  it('a failed delivery can be confirmed another way', () => {
    expect(confirmationRefusal({ ...ok, state: 'FAILED_DELIVERY' })).toBeNull()
  })
})

const facts = (over: Partial<CensusFacts> = {}): CensusFacts => ({ key: 'CUSTOMER:n', name: 'Northwind', side: 'CUSTOMER', addedAt: d('2026-01-01'), events: [], windows: [], ...over })

describe('the census of customers and suppliers', () => {
  it('a company with no contract, bill or submission in 90 days is dormant', () => {
    expect(standingOn(facts({ events: [d('2026-08-01')] }), d('2026-11-23')).standing).toBe('DORMANT')
  })
  it('a company with something in the last 90 days is active', () => {
    expect(standingOn(facts({ events: [d('2026-09-01')] }), d('2026-11-23')).standing).toBe('ACTIVE')
  })
  it('the ninetieth quiet day is dormant and the eighty-ninth is not', () => {
    const last = d('2026-08-25')
    expect(standingOn(facts({ events: [last] }), new Date(last.getTime() + 89 * 86_400_000)).standing).toBe('ACTIVE')
    expect(standingOn(facts({ events: [last] }), new Date(last.getTime() + PROPOSED_DORMANT_AFTER_DAYS * 86_400_000)).standing).toBe('DORMANT')
  })
  it('a contract running today keeps a company active however old its start', () => {
    expect(standingOn(facts({ windows: [{ start: d('2025-01-01'), end: null }] }), d('2026-11-23')).standing).toBe('ACTIVE')
  })
  it('a company that never traded reads dormant with nothing on record', () => {
    expect(standingOn(facts(), d('2026-11-23'))).toEqual({ standing: 'DORMANT', lastActivity: null })
  })
  it('a relationship maps to a side, and a prospect-style one to none', () => {
    expect(sideOf('CLIENT')).toBe('CUSTOMER'); expect(sideOf('SUPPLIER')).toBe('SUPPLIER'); expect(sideOf('ALUMNI')).toBeNull()
  })
  it('a company added after the day is not in that day’s census', () => {
    expect(censusOn([facts({ addedAt: d('2026-11-20') })], d('2026-11-16'))).toEqual([])
  })
  it('what changed since last week is who went dormant, who came back and who joined', () => {
    const f = [
      facts({ key: 'a', name: 'Alpha', events: [d('2026-08-22')] }),
      facts({ key: 'b', name: 'Beta', events: [d('2026-11-22')] }),
      facts({ key: 'c', name: 'Gamma', addedAt: d('2026-11-20'), events: [d('2026-11-21')] }),
    ]
    const changes = changesBetween(censusOn(f, d('2026-11-16')), censusOn(f, d('2026-11-23')))
    expect(changes.map((c) => c.says)).toEqual([
      'Alpha went dormant as a customer: last activity 2026-08-22.',
      'Beta is active again as a customer.',
      'Gamma is new on the census as a customer, active.',
    ])
  })
  it('the weekly line says dormant is a proposal and names who is dormant', () => {
    const rows = censusOn([facts({ events: [d('2026-01-05')] })], d('2026-11-23'))
    const line = weeklyLine(rows, [], d('2026-11-22'))
    expect(line).toMatch(/1 customer \(0 active, 1 dormant\)/)
    expect(line).toMatch(/a proposal/); expect(line).toMatch(/Dormant now: Northwind/); expect(line).toMatch(/No change since last week/)
  })
})

describe('the day a confirmation is recorded as of', () => {
  const sent = new Date('2026-11-10T09:00:00Z')
  const now = new Date('2026-11-23T15:00:00Z')
  it('no day typed means now', () => {
    expect(confirmedMoment(undefined, sent, now)).toEqual({ ok: true, at: now })
  })
  it('today is recorded as the moment it was recorded', () => {
    expect(confirmedMoment('2026-11-23', sent, now)).toEqual({ ok: true, at: now })
  })
  it('an earlier day after the submission was sent is recorded as that day', () => {
    const r = confirmedMoment('2026-11-12', sent, now)
    expect(r.ok && r.at.toISOString().slice(0, 10)).toBe('2026-11-12')
  })
  it('a day that has not happened is refused in a sentence', () => {
    const r = confirmedMoment('2026-11-24', sent, now)
    expect(r.ok === false && r.says).toMatch(/has not happened yet/)
  })
  it('a day before the submission was sent is refused in a sentence', () => {
    const r = confirmedMoment('2026-11-09', sent, now)
    expect(r.ok === false && r.says).toMatch(/before the submission was sent/)
  })
  it('the day the submission was sent is allowed', () => {
    expect(confirmedMoment('2026-11-10', sent, now).ok).toBe(true)
  })
  it('something that is not a day is refused in a sentence', () => {
    expect(confirmedMoment('yesterday', sent, now).ok).toBe(false)
  })
})
