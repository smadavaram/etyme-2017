import { describe, it, expect } from 'vitest'
import {
  breachClockWarning, breachCompanyNotice, breachPersonNotice, breachStaffAlert,
  warningsDue, type Breach,
} from '@/lib/notify/breach'
import { remaining } from '@/lib/notify/letters'

/**
 * What is said while a breach clock is running, and what is said to the
 * people in it.
 *
 * Two things are being defended here. One: a number nobody has counted
 * is never printed, because a plausible figure in the first notice is
 * quoted back for a year. Two: a clock that nags hourly is a clock
 * somebody mutes on the worst week of their year, so it speaks twice —
 * a day out, and when it is missed.
 */

const plain = (s: string) => s.replace(/[  ]/g, ' ')

const discovered = new Date('2026-09-19T09:15:00Z')

const breach: Breach = {
  reference: 'BR-2026-04',
  what: 'A resume file was readable by somebody signed in at another company.',
  discoveredAt: discovered,
  discoveredBy: 'the nightly access review',
  populations: ['candidate', 'business'],
  peopleAffected: 14,
  companiesAffected: ['Northbend Athletic', 'Veritan Talent'],
  categories: ['Resumes', 'A consultant own profile'],
  clocks: [
    { id: 'AUTHORITY', dueAt: new Date('2026-09-22T09:15:00Z'), owner: 'Dana Whitfield' },
    { id: 'PEOPLE', dueAt: new Date('2026-09-24T09:15:00Z'), owner: 'Marcus Oyelaran' },
  ],
}

describe('when a breach is recorded, staff hear first', () => {
  const alert = () => breachStaffAlert({
    breach, now: new Date('2026-09-19T10:15:00Z'), url: 'https://etyme.example/incidents/BR-2026-04',
  })

  it('says what happened, when it was discovered and who is affected', () => {
    const body = plain(alert().body)
    expect(body).toContain('A resume file was readable by somebody signed in at another company.')
    expect(body).toContain('Discovered September 19, 2026 at 9:15 AM UTC, by the nightly access review')
    expect(body).toContain('People: 14 people')
    expect(body).toContain('Populations: candidates and business users')
    expect(body).toContain('Companies: Northbend Athletic and Veritan Talent')
    expect(body).toContain('Records: Resumes and A consultant own profile')
  })

  it('says it has not counted the people yet rather than printing a plausible number', () => {
    const body = breachStaffAlert({
      breach: { ...breach, peopleAffected: null, categories: [] },
      now: new Date('2026-09-19T10:15:00Z'),
      url: 'https://etyme.example/incidents/BR-2026-04',
    }).body
    expect(body).toContain('Not counted yet. Nobody should quote a number until it is.')
    expect(body).toContain('We will say which records when we know, rather than guess at it now.')
    expect(body).not.toMatch(/People: \d+/)
  })

  it('names both clocks, the hour each runs out and who owns it', () => {
    const body = plain(alert().body)
    expect(body).toContain('the supervisory authority — runs out September 22, 2026 at 9:15 AM UTC, 2 days left. Dana Whitfield owns it.')
    expect(body).toContain('the people affected — runs out September 24, 2026 at 9:15 AM UTC, 4 days left. Marcus Oyelaran owns it.')
    expect(alert().subject).toBe('Breach BR-2026-04 recorded — two clocks running')
  })

  it('a breach with no clock set says so, rather than reading as though nothing is owed', () => {
    const body = breachStaffAlert({
      breach: { ...breach, clocks: [] }, now: discovered, url: 'https://etyme.example/i',
    }).body
    expect(body).toContain('No clock has been set on this yet')
  })

  it('goes to the staff channel with email behind it, and carries one action', () => {
    const n = alert()
    expect(n.channels).toEqual(['TEAMS', 'EMAIL'])
    expect(n.card?.action).toEqual({ label: 'Open the incident', url: 'https://etyme.example/incidents/BR-2026-04' })
  })
})

describe('the clock speaks twice and no more', () => {
  it('a breach warning says how long is left in hours when under a day', () => {
    const n = breachClockWarning({
      breach,
      clock: breach.clocks[0],
      now: new Date('2026-09-21T15:15:00Z'), // 18 hours before the deadline
      url: 'https://etyme.example/incidents/BR-2026-04',
    })
    expect(n.subject).toBe('18 hours left to tell the supervisory authority about breach BR-2026-04')
    expect(plain(n.body)).toContain('The deadline to tell the supervisory authority is September 22, 2026 at 9:15 AM UTC. That is 18 hours left.')
    expect(n.body).toContain('Dana Whitfield owns this notice.')
  })

  it('says how late it is once the clock has run out, and who owns the notice', () => {
    const n = breachClockWarning({
      breach,
      clock: breach.clocks[0],
      now: new Date('2026-09-22T14:15:00Z'), // five hours after
      url: 'https://etyme.example/incidents/BR-2026-04',
    })
    expect(n.subject).toBe('Overdue: the supervisory authority has not been told about breach BR-2026-04 — 5 hours late')
    expect(n.body).toContain('Dana Whitfield owns this notice.')
    expect(n.body).toContain('record the hour it went')
    expect(n.card?.facts).toContainEqual({ name: 'Late by', value: '5 hours late' })
  })

  it('a clock warns a day out and again when it is missed, and never in between', () => {
    const [authority] = breach.clocks
    const at = (iso: string, sent: { clockId: 'AUTHORITY' | 'PEOPLE'; kind: 'DAY_BEFORE' | 'MISSED' }[] = []) =>
      warningsDue({ clocks: [authority], now: new Date(iso), alreadySent: sent })

    expect(at('2026-09-20T09:15:00Z'), 'two days out is silence').toEqual([])
    expect(at('2026-09-21T15:15:00Z').map((w) => w.kind)).toEqual(['DAY_BEFORE'])
    expect(
      at('2026-09-22T05:15:00Z', [{ clockId: 'AUTHORITY', kind: 'DAY_BEFORE' }]),
      'four hours out, having already warned, is silence'
    ).toEqual([])
    expect(
      at('2026-09-22T14:15:00Z', [{ clockId: 'AUTHORITY', kind: 'DAY_BEFORE' }]).map((w) => w.kind)
    ).toEqual(['MISSED'])
    expect(
      at('2026-09-23T14:15:00Z', [
        { clockId: 'AUTHORITY', kind: 'DAY_BEFORE' },
        { clockId: 'AUTHORITY', kind: 'MISSED' },
      ]),
      'a day after the miss, having said so once, is silence'
    ).toEqual([])
  })

  it('a clock whose notice has already gone is never chased, however late the hour', () => {
    const answered = { ...breach.clocks[0], notifiedAt: new Date('2026-09-21T08:00:00Z') }
    expect(warningsDue({ clocks: [answered], now: new Date('2026-09-30T00:00:00Z'), alreadySent: [] })).toEqual([])
  })

  it('under an hour is said as under an hour, because no whole number is honest there', () => {
    expect(remaining(new Date('2026-09-22T08:45:00Z'), breach.clocks[0].dueAt).said).toBe('less than an hour left')
    expect(remaining(new Date('2026-09-22T09:45:00Z'), breach.clocks[0].dueAt).said).toBe('less than an hour late')
  })
})

describe('the notice itself is the kind a good company sends', () => {
  const contact = { name: 'Dana Whitfield', email: 'security@etyme.example' }

  const toCompany = () => breachCompanyNotice({
    breach,
    company: { name: 'Northbend Athletic' },
    whatWeDid: ['Closed the hole within the hour.', 'Read the access log back to the day it opened.'],
    whatToDo: ['Tell us if you see a read on your records you cannot account for.'],
    contact,
  })

  const toPerson = () => breachPersonNotice({
    breach,
    person: { name: 'Priya Raman', audience: 'candidate' },
    whatWeDid: ['Closed the hole within the hour.'],
    whatToDo: [],
    contact,
    replyTo: 'priya.raman.personal@gmail.example',
  })

  it('says what happened, what data, what we did and what to do — in that order', () => {
    const body = toCompany().body
    const order = ['What happened:', 'What was in it:', 'What we did:', 'What you should do:', 'Who to ask:']
      .map((h) => body.indexOf(h))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(body).toContain('Quote BR-2026-04.')
  })

  it('a person with nothing to do is told there is nothing to do, not given a chore to look busy', () => {
    const body = toPerson().body
    expect(body).toContain('What you should do: nothing. There is no step for you.')
    expect(body).toContain('you should know, not because there is something for you to fix')
  })

  it('a person hears by email and never on Teams, at the address we have for them', () => {
    const n = toPerson()
    expect(n.channels).toEqual(['EMAIL'])
    expect(n.card).toBeNull()
    expect(n.to).toBe('priya.raman.personal@gmail.example')
    expect(n.body.startsWith('Priya,')).toBe(true)
  })

  it('a company hears on its channel, and the card carries the contact rather than a mailbox', () => {
    const n = toCompany()
    expect(n.channels).toEqual(['TEAMS', 'EMAIL'])
    expect(n.card?.facts).toContainEqual({ name: 'Contact', value: 'Dana Whitfield, security@etyme.example' })
    expect(n.subject).toBe('Security incident at Etyme affecting Northbend Athletic — BR-2026-04')
  })

  it('no notice contains apology theater, legalese, or a state name out of the code', () => {
    const BANNED = [
      /apolog/i, /inconvenience/i, /abundance of caution/i, /we (?:take|value)[^.]{0,40}seriously/i,
      /valued (?:customer|candidate)/i, /pursuant/i, /heretofore/i, /aforementioned/i,
      /utiliz/i, /herein/i, /notwithstanding/i, /rest assured/i,
    ]
    const ALLOWED = new Set(['UTC', 'AM', 'PM', 'BR'])

    for (const n of [toCompany(), toPerson(), breachStaffAlert({ breach, now: discovered, url: 'https://etyme.example/i' })]) {
      const text = `${n.subject}\n${n.body}`
      for (const b of BANNED) expect(text, `${b} in "${n.subject}"`).not.toMatch(b)
      const shouting = [...text.replace(/https?:\/\/\S+/g, '').matchAll(/\b[A-Z]{2,}(?:_[A-Z]+)*\b/g)]
        .map((m) => m[0]).filter((w) => !ALLOWED.has(w))
      expect(shouting, shouting.join(', ')).toEqual([])
    }
  })

  it('what we cannot describe honestly is said as that, never as work nobody has done', () => {
    const body = breachCompanyNotice({
      breach, company: { name: 'Northbend Athletic' }, whatWeDid: [], whatToDo: [], contact,
    }).body
    expect(body).toContain('nothing yet that we can describe honestly')
    expect(body).toContain('writing now rather than waiting until there is a better sentence')
  })
})
