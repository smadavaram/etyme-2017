/**
 * What may be asked for, and when.
 *
 * A business wants to know a candidate is real and can lawfully do the
 * work before it spends a client's time. That instinct is right and the
 * usual implementation of it is unlawful — asking for a passport before
 * an offer is the employer choosing which document it wants to see,
 * before the law lets it ask at all.
 *
 * So: two stages. Questions and attestations at application, documents
 * at award. Nothing is dropped, things are moved, and the business is
 * told why.
 */

import { describe, it, expect } from 'vitest'
import {
  stageFor, compile, standingOf, clearance, WARN_WITHIN_DAYS,
  type Wish, type Held, type Ask,
} from '@/lib/document-stages'

const wish = (over: Partial<Wish> & { key: string }): Wish => ({
  label: over.key, hint: '', required: true, wantedAt: 'APPLICATION', ...over,
})

describe('Identity documents wait for an offer, and the question does not', () => {

  it('will not take a passport at application', () => {
    expect(stageFor('RIGHT_TO_WORK', 'US').stage).toBe('ENGAGEMENT')
    expect(stageFor('RIGHT_TO_WORK', 'UK').stage).toBe('ENGAGEMENT')
    expect(stageFor('RIGHT_TO_WORK', 'EU').stage).toBe('ENGAGEMENT')
  })

  it('lets the question be asked at application, which is what the business needed', () => {
    expect(stageFor('WORK_AUTH_QUESTION').stage).toBe('APPLICATION')
  })

  it('gives the reason in the country’s own terms', () => {
    expect(stageFor('RIGHT_TO_WORK', 'US').because).toContain('document abuse')
    expect(stageFor('RIGHT_TO_WORK', 'UK').because).toContain('before the first day')
    expect(stageFor('RIGHT_TO_WORK', 'EU').because).toContain('data minimisation')
  })

  it('a country with no rule of its own still gets the safe default', () => {
    expect(stageFor('RIGHT_TO_WORK', 'IN').stage).toBe('ENGAGEMENT')
    expect(stageFor('RIGHT_TO_WORK', 'IN').because).toContain('after an offer')
  })
})

describe('Asking too early moves the item rather than losing it', () => {

  const compiled = compile(
    [wish({ key: 'RESUME' }), wish({ key: 'RIGHT_TO_WORK' }), wish({ key: 'BACKGROUND_CHECK' })],
    'US'
  )

  it('keeps what may lawfully be asked at application', () => {
    expect(compiled.application.map((a) => a.key)).toContain('RESUME')
  })

  it('moves the document to award rather than dropping it', () => {
    expect(compiled.engagement.map((a) => a.key)).toEqual(['RIGHT_TO_WORK', 'BACKGROUND_CHECK'])
  })

  it('adds the question that stands in for it, so nothing is actually lost', () => {
    const q = compiled.application.find((a) => a.key === 'RIGHT_TO_WORK_Q')
    expect(q?.kind).toBe('QUESTION')
    expect(q?.hint).toContain('authorised to work')
  })

  it('tells the business what moved and why, rather than quietly overruling them', () => {
    expect(compiled.moved.map((m) => m.key)).toEqual(['RIGHT_TO_WORK', 'BACKGROUND_CHECK'])
    expect(compiled.moved[1].because).toContain('conditional offer')
  })

  it('a business may always collect later than it has to', () => {
    const late = compile([wish({ key: 'RESUME', wantedAt: 'ENGAGEMENT' })])
    expect(late.engagement.map((a) => a.key)).toEqual(['RESUME'])
    expect(late.moved).toHaveLength(0)
  })

  it('an item nobody wrote a rule for stays where the business put it', () => {
    // Refusing to carry an unknown item would make the product unusable
    // in the first country nobody thought about.
    const odd = compile([wish({ key: 'SOMETHING_LOCAL' })])
    expect(odd.application.map((a) => a.key)).toEqual(['SOMETHING_LOCAL'])
  })
})

describe('Background verification is separated from what a candidate volunteers', () => {

  it('a claimed work history may be asked at application', () => {
    expect(stageFor('EMPLOYMENT_HISTORY').stage).toBe('APPLICATION')
    expect(stageFor('EDUCATION_HISTORY').stage).toBe('APPLICATION')
  })

  it('verifying it with a current employer waits, because it can cost them their job', () => {
    expect(stageFor('EMPLOYMENT_VERIFICATION').stage).toBe('ENGAGEMENT')
    expect(stageFor('EMPLOYMENT_VERIFICATION').because).toContain('cost somebody their job')
  })

  it('a degree does not stop being true, so its check never expires', () => {
    const c = compile([wish({ key: 'EDUCATION_VERIFICATION', wantedAt: 'ENGAGEMENT' })])
    expect(c.engagement[0].validMonths).toBeNull()
  })

  it('bank details and a date of birth are not application questions', () => {
    expect(stageFor('BANK_DETAILS').stage).toBe('ENGAGEMENT')
    expect(stageFor('DOB_SSN').stage).toBe('ENGAGEMENT')
    expect(stageFor('BANK_DETAILS').because).toContain('fraud target')
  })
})

describe('A supplier is not a job applicant', () => {

  it('company documents are asked for up front, because none of this is about a person', () => {
    for (const k of ['W9', 'INSURANCE_GL', 'INSURANCE_WC', 'BUSINESS_PARTNER', 'SOC2', 'FINANCIALS']) {
      expect(stageFor(k).stage, k).toBe('APPLICATION')
    }
  })
})

// ── Expiry, which is only useful as a thing that is checked ─────────

const AT = new Date('2019-06-15T00:00:00Z')
const spec = { key: 'INSURANCE_GL', label: 'General liability insurance', validMonths: 12 }

describe('A document on file is not the same as a document in date', () => {

  it('names how long is left', () => {
    const held: Held = { key: spec.key, label: spec.label, expiresAt: new Date('2019-09-15T00:00:00Z'), verifiedAt: AT }
    const s = standingOf(held, spec, AT)
    expect(s.standing).toBe('VALID')
    expect(s.daysLeft).toBe(92)
  })

  it('chases a month before it lapses, which is long enough to renew one', () => {
    expect(WARN_WITHIN_DAYS).toBe(30)
    const held: Held = { key: spec.key, label: spec.label, expiresAt: new Date('2019-07-01T00:00:00Z'), verifiedAt: AT }
    const s = standingOf(held, spec, AT)
    expect(s.standing).toBe('EXPIRING')
    expect(s.says).toBe('General liability insurance expires in 16 days. Ask for the renewal now.')
  })

  it('says how long ago it lapsed, not merely that it did', () => {
    const held: Held = { key: spec.key, label: spec.label, expiresAt: new Date('2019-03-01T00:00:00Z'), verifiedAt: AT }
    expect(standingOf(held, spec, AT).says).toBe('General liability insurance expired 106 days ago.')
  })

  it('works out the expiry from the issue date where the document did not carry one', () => {
    // Issued April 2018, valid twelve months, so it lapsed in April 2019.
    const lapsed: Held = { key: spec.key, label: spec.label, issuedAt: new Date('2018-04-01T00:00:00Z'), verifiedAt: AT }
    expect(standingOf(lapsed, spec, AT).standing).toBe('EXPIRED')

    const live: Held = { key: spec.key, label: spec.label, issuedAt: new Date('2018-08-01T00:00:00Z'), verifiedAt: AT }
    expect(standingOf(live, spec, AT).standing).toBe('VALID')
  })

  it('refuses to treat an unknown expiry as fine', () => {
    // This was the 2017 bug: a nullable column nothing swept, so a
    // certificate that lapsed in March was still green in July.
    const held: Held = { key: spec.key, label: spec.label, verifiedAt: AT }
    const s = standingOf(held, spec, AT)
    expect(s.standing).toBe('NO_EXPIRY_RECORDED')
    expect(s.says).toContain('passes every check until the day somebody audits it')
  })

  it('a document that genuinely never expires is simply valid', () => {
    const held: Held = { key: 'W9', label: 'W-9', verifiedAt: AT }
    expect(standingOf(held, { key: 'W9', label: 'W-9', validMonths: null }, AT).standing).toBe('VALID')
  })

  it('flags one nobody has confirmed they actually looked at', () => {
    const held: Held = { key: 'W9', label: 'W-9' }
    const s = standingOf(held, { key: 'W9', label: 'W-9', validMonths: null }, AT)
    expect(s.unverified).toBe(true)
    expect(s.says).toContain('Nobody has confirmed they checked it')
  })

  it('says plainly when it was never collected', () => {
    expect(standingOf(null, spec, AT).standing).toBe('MISSING')
  })
})

describe('Blocking somebody from starting is reserved for what actually should', () => {

  const asks: Ask[] = [
    { key: 'RIGHT_TO_WORK', label: 'Right to work', kind: 'DOCUMENT', stage: 'ENGAGEMENT', hint: '', required: true, validMonths: null },
    { key: 'INSURANCE_GL', label: 'General liability insurance', kind: 'DOCUMENT', stage: 'ENGAGEMENT', hint: '', required: false, validMonths: 12 },
  ]

  it('a missing required document stops the start', () => {
    const c = clearance(asks, new Map(), AT)
    expect(c.clear).toBe(false)
    expect(c.blocking.map((b) => b.key)).toEqual(['RIGHT_TO_WORK'])
  })

  it('an expired required document stops it too', () => {
    const held = new Map<string, Held>([
      ['RIGHT_TO_WORK', { key: 'RIGHT_TO_WORK', label: 'Right to work', expiresAt: new Date('2019-01-01T00:00:00Z'), verifiedAt: AT }],
    ])
    expect(clearance(asks, held, AT).clear).toBe(false)
  })

  it('an optional one is a chase, not a block', () => {
    // A system that blocks on everything gets switched off, and one that
    // blocks on nothing is decoration.
    const held = new Map<string, Held>([
      ['RIGHT_TO_WORK', { key: 'RIGHT_TO_WORK', label: 'Right to work', verifiedAt: AT }],
    ])
    const c = clearance(asks, held, AT)
    expect(c.clear).toBe(true)
    expect(c.chasing.map((x) => x.key)).toContain('INSURANCE_GL')
    expect(c.says).toBe('Cleared to start. 1 thing to chase.')
  })

  it('says so when everything is genuinely in order', () => {
    const held = new Map<string, Held>([
      ['RIGHT_TO_WORK', { key: 'RIGHT_TO_WORK', label: 'Right to work', verifiedAt: AT }],
      ['INSURANCE_GL', { key: 'INSURANCE_GL', label: 'General liability insurance', expiresAt: new Date('2020-06-01T00:00:00Z'), verifiedAt: AT }],
    ])
    expect(clearance(asks, held, AT).says).toBe('Everything required is on file and in date.')
  })
})
