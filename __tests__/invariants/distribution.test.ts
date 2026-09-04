/**
 * Passing work up and down a chain without breaching what you signed.
 *
 * A client raises a role. It reaches an MSP, who passes it to a prime,
 * who passes it to two subs, who each ask a bench vendor. At every hop
 * somebody forwards an email containing more than they were allowed to
 * send — not maliciously, but because the alternative is retyping the
 * requirement, and the thing they retype is the thing they were sent.
 */

import { describe, it, expect } from 'vitest'
import {
  forward, marketUp, describeClient, seatKey, personKey, alreadyThere,
  record, beyond, type Requirement, type Candidate, type Hop,
} from '@/lib/distribution'

const SALT = 'etyme-test-salt'
const AT = new Date('2026-06-15T00:00:00Z')

const hop = (over: Partial<Hop> = {}): Hop => ({
  fromCompanyId: 'prime', fromName: 'Prime Systems',
  toCompanyId: 'sub', toName: 'Sub Staffing',
  depth: 1, agreementId: 'msa-1',
  clientNameConfidential: true, ndaInPlace: true,
  ...over,
})

const req = (over: Partial<Requirement> = {}): Requirement => ({
  id: 'req-1',
  title: 'Validation engineer',
  endClientName: 'Terumo BCT',
  endClientIndustry: 'Fortune 500 medical device',
  endClientRegion: 'the Denver area',
  hiringManager: 'Dana Whitfield',
  billRateCents: 9_500,
  bandMinCents: 6_000,
  bandMaxCents: 7_200,
  headcount: 3,
  otherVendorIds: ['v1', 'v2'],
  ...over,
})

describe('A requirement going down the chain loses what it may not carry', () => {

  it('describes the client rather than naming it where the agreement forbids it', () => {
    const d = forward(req(), hop({ clientNameConfidential: true }), 'client-1', SALT)
    expect(d.payload.client).toBe('A Fortune 500 medical device company in the Denver area')
    expect(d.payload.clientIsDescribed).toBe(true)
  })

  it('describes it even with an NDA, if the agreement above forbids naming', () => {
    const d = forward(req(), hop({ clientNameConfidential: true, ndaInPlace: true }), 'client-1', SALT)
    expect(d.withheld.find((w) => w.field === 'endClientName')!.because)
      .toContain('forbids naming the end client downstream')
  })

  it('names it where the agreement allows and an NDA is on file', () => {
    const d = forward(req(), hop({ clientNameConfidential: false, ndaInPlace: true }), 'client-1', SALT)
    expect(d.payload.client).toBe('Terumo BCT')
    expect(d.payload.clientIsDescribed).toBe(false)
  })

  it('withholds the name where there is no NDA, whatever the agreement says', () => {
    const d = forward(req(), hop({ clientNameConfidential: false, ndaInPlace: false }), 'client-1', SALT)
    expect(d.payload.clientIsDescribed).toBe(true)
    expect(d.withheld.find((w) => w.field === 'endClientName')!.because).toContain('No NDA')
  })

  it('never forwards what the sender is being paid, at any depth or trust level', () => {
    for (const h of [hop({ depth: 0 }), hop({ depth: 4, ndaInPlace: true, clientNameConfidential: false })]) {
      const d = forward(req(), h, 'client-1', SALT)
      expect(d.withheld.map((w) => w.field)).toContain('billRate')
      expect(JSON.stringify(d.payload)).not.toContain('9500')
    }
  })

  it('sends the band instead, which is the number that decides whether they bid', () => {
    const d = forward(req(), hop(), 'client-1', SALT)
    expect(d.payload.bandMinCents).toBe(6_000)
    expect(d.payload.bandMaxCents).toBe(7_200)
    expect(d.withheld.find((w) => w.field === 'billRate')!.because)
      .toContain('band you may work within')
  })

  it('withholds the hiring manager, and says what happens if you go round the chain', () => {
    const d = forward(req(), hop(), 'client-1', SALT)
    expect(d.withheld.find((w) => w.field === 'hiringManager')!.because)
      .toContain('ends the relationship for everybody in the chain')
  })

  it('never says who else was asked', () => {
    const d = forward(req(), hop(), 'client-1', SALT)
    expect(d.withheld.map((w) => w.field)).toContain('otherVendors')
    expect(JSON.stringify(d.payload)).not.toContain('v1')
  })

  it('falls back to something honest when there is nothing to describe it with', () => {
    const bare = req({ endClientIndustry: null, endClientRegion: null })
    expect(describeClient(bare)).toBe('A client we hold the relationship with')
  })
})

describe('The blind key lets two rivals find a collision without learning anything', () => {

  it('is the same for every chain reaching the same seat', () => {
    const viaPrime = forward(req(), hop({ toName: 'Sub A' }), 'client-1', SALT)
    const viaMsp = forward(req(), hop({ toName: 'Sub B', depth: 2 }), 'client-1', SALT)
    expect(viaPrime.payload.seatKey).toBe(viaMsp.payload.seatKey)
  })

  it('is different for a different seat at the same client', () => {
    expect(seatKey('client-1', 'req-1', SALT)).not.toBe(seatKey('client-1', 'req-2', SALT))
  })

  it('is different for the same seat number at a different client', () => {
    expect(seatKey('client-1', 'req-1', SALT)).not.toBe(seatKey('client-2', 'req-1', SALT))
  })

  it('says nothing about the client it came from', () => {
    const k = seatKey('terumo-bct', 'req-1', SALT)
    expect(k).toMatch(/^seat_[a-z0-9]+$/)
    expect(k).not.toContain('terumo')
  })

  it('stops a second submission and refuses to say who got there first', () => {
    const c = { personKey: personKey('ravi', SALT), seatKey: seatKey('client-1', 'req-1', SALT) }
    const clash = alreadyThere(c, [c])
    expect(clash.collides).toBe(true)
    expect(clash.advice).toContain('Who got there first is not ours to tell you')
  })

  it('says why it matters, in terms of what it costs the supplier', () => {
    const c = { personKey: personKey('ravi', SALT), seatKey: seatKey('client-1', 'req-1', SALT) }
    expect(alreadyThere(c, [c]).advice).toContain('costs a supplier the account')
  })

  it('lets an unrelated person through', () => {
    const mine = { personKey: personKey('ravi', SALT), seatKey: seatKey('client-1', 'req-1', SALT) }
    const theirs = { personKey: personKey('anita', SALT), seatKey: seatKey('client-1', 'req-1', SALT) }
    expect(alreadyThere(mine, [theirs]).collides).toBe(false)
  })

  it('lets the same person through for a different seat', () => {
    const here = { personKey: personKey('ravi', SALT), seatKey: seatKey('client-1', 'req-1', SALT) }
    const there = { personKey: personKey('ravi', SALT), seatKey: seatKey('client-1', 'req-2', SALT) }
    expect(alreadyThere(here, [there]).collides).toBe(false)
  })
})

// ── Going the other way ─────────────────────────────────────────────

const cand = (over: Partial<Candidate> = {}): Candidate => ({
  personId: 'ravi',
  name: 'Ravi Patel',
  email: 'ravi@example.com',
  phone: '555-0100',
  currentEmployer: 'Northwind Contracting',
  askRateCents: 7_000,
  payRateCents: 5_600,
  resumeUrl: '/r/full.pdf',
  redactedResumeUrl: '/r/redacted.pdf',
  ...over,
})

describe('A consultant goes up the chain unnamed until there is a right to represent', () => {

  it('sends a reference rather than a name', () => {
    const d = marketUp(cand(), hop({ rightToRepresent: false }), SALT)
    expect(d.payload.named).toBe(false)
    expect(d.payload.name).toBeNull()
    expect(d.payload.reference).toMatch(/^p_[a-z0-9]+$/)
  })

  it('says why, in the terms a bench vendor actually worries about', () => {
    const d = marketUp(cand(), hop({ rightToRepresent: false }), SALT)
    expect(d.withheld.find((w) => w.field === 'personName')!.because)
      .toContain('a prime with the name can go direct')
  })

  it('withholds the current employer, because naming it identifies them anyway', () => {
    const d = marketUp(cand(), hop({ rightToRepresent: false }), SALT)
    expect(d.payload.currentEmployer).toBeNull()
    expect(d.withheld.find((w) => w.field === 'currentEmployer')!.because)
      .toContain('cost them the job they still have')
  })

  it('sends the redacted résumé rather than the full one', () => {
    const d = marketUp(cand(), hop({ rightToRepresent: false }), SALT)
    expect(d.payload.resumeUrl).toBe('/r/redacted.pdf')
  })

  it('sends nothing at all rather than a full résumé when no redacted one exists', () => {
    const d = marketUp(cand({ redactedResumeUrl: null }), hop({ rightToRepresent: false }), SALT)
    expect(d.payload.resumeUrl).toBeNull()
    expect(d.withheld.map((w) => w.field)).toContain('resume')
  })

  it('names them once the right to represent is signed', () => {
    const d = marketUp(cand(), hop({ rightToRepresent: true }), SALT)
    expect(d.payload.named).toBe(true)
    expect(d.payload.name).toBe('Ravi Patel')
    expect(d.payload.resumeUrl).toBe('/r/full.pdf')
  })

  it('never sends what they are actually paid, even under a right to represent', () => {
    const d = marketUp(cand(), hop({ rightToRepresent: true }), SALT)
    expect(d.withheld.map((w) => w.field)).toContain('payRate')
    expect(JSON.stringify(d.payload)).not.toContain('5600')
  })

  it('sends what is being asked for them, which is the number this hop needs', () => {
    expect(marketUp(cand(), hop(), SALT).payload.askRateCents).toBe(7_000)
  })

  it('keeps the same reference all the way up, so a collision is still findable', () => {
    const atSub = marketUp(cand(), hop({ depth: 3 }), SALT)
    const atPrime = marketUp(cand(), hop({ depth: 1, toName: 'Prime' }), SALT)
    expect(atSub.payload.personKey).toBe(atPrime.payload.personKey)
  })
})

describe('What was sent, to whom, under which agreement', () => {

  it('records the agreement and everything withheld', () => {
    const h = hop()
    const d = forward(req(), h, 'client-1', SALT)
    const r = record(h, 'REQUIREMENT', 'req-1', d, ['rateBand', 'headcount', 'endClientRegion'], AT)
    expect(r.agreementId).toBe('msa-1')
    expect(r.ndaInPlace).toBe(true)
    expect(r.withheld.length).toBe(d.withheld.length)
  })

  it('reads back as a sentence, because the question is asked a year later', () => {
    const d = forward(req(), hop(), 'client-1', SALT)
    expect(d.says).toBe(
      'Validation engineer sent to Sub Staffing without naming the client. 4 fields withheld.'
    )
  })
})

describe('The guarantee stops where the platform does, and says so', () => {

  it('holds for the next hop when the recipient is here', () => {
    expect(beyond(hop(), true).blind).toBe(false)
  })

  it('admits it cannot see past a company that is not on the platform', () => {
    const b = beyond(hop(), false)
    expect(b.blind).toBe(true)
    expect(b.says).toContain('an email we cannot see')
  })

  it('says what to do about it rather than only warning', () => {
    // The difference between a control and a comfort.
    expect(beyond(hop(), false).says).toContain('invite them')
  })
})
