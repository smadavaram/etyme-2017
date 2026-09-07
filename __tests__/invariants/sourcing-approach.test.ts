import { describe, it, expect } from 'vitest'
import {
  mayApproach, approachText, provenanceIsSaid, checkIsAllowed, LINKEDIN_RULE,
  type Contact,
} from '@/lib/sourcing-approach'

/**
 * The first message to somebody who never asked to hear from us.
 *
 * A vendor with four people on their bench, no LinkedIn Recruiter seat
 * and no Dice subscription cannot source at all. The bought list gives
 * them a first lead. It is also creepy, and every rule here exists to
 * keep the distance between "a vendor found me" and "I am on a list
 * being farmed" — a distance good intentions do not maintain.
 */

const contact = (over: Partial<Contact> = {}): Contact => ({
  email: 'ravi@example.com',
  skills: ['SAP FICO', 'ABAP'],
  wasConsultant: true,
  approachedAt: null,
  optedOutAt: null,
  heldByCompanyId: null,
  ...over,
})

const VENDOR = 'cloudepa'
const PLACES = ['SAP FICO', 'Java']

describe('one approach per person, across every vendor on the platform', () => {
  it('lets the first vendor write to them', () => {
    expect(mayApproach(contact(), VENDOR, PLACES).ok).toBe(true)
  })

  it('refuses a second vendor while the first is still talking to them', () => {
    // The rule that matters most, and the only one that cannot be
    // reconstructed from ordinary politeness. A thousand vendors each
    // allowed one polite first message is a thousand messages to one
    // person, every sender behaving perfectly.
    const v = mayApproach(contact({ heldByCompanyId: 'someone-else' }), VENDOR, PLACES)
    expect(v.ok).toBe(false)
    expect(v.refusal).toBe('HELD_BY_ANOTHER')
    expect(v.reason).toMatch(/one approach per person, across everybody/i)
  })

  it('refuses everybody once they have been written to and did not answer', () => {
    // The hold is released when the first vendor gives up. The record of
    // having been approached is not — that is what stops the next vendor
    // starting the same conversation over.
    const v = mayApproach(
      contact({ approachedAt: new Date('2026-01-01'), heldByCompanyId: null }),
      VENDOR, PLACES
    )
    expect(v.refusal).toBe('ALREADY_APPROACHED')
    expect(v.reason).toMatch(/There is no second message/i)
  })

  it('still lets the vendor who holds them continue', () => {
    expect(mayApproach(
      contact({ approachedAt: new Date('2026-01-01'), heldByCompanyId: VENDOR }),
      VENDOR, PLACES
    ).ok).toBe(true)
  })
})

describe('stop binds the whole platform, not the vendor who was told', () => {
  it('refuses every vendor once somebody has opted out', () => {
    const v = mayApproach(contact({ optedOutAt: new Date('2026-02-01') }), 'a-different-vendor', PLACES)
    expect(v.refusal).toBe('OPTED_OUT')
    expect(v.reason).toMatch(/binds every vendor here, not just the one they told/i)
  })

  it('puts opting out ahead of every other reason, so it is never reached around', () => {
    const v = mayApproach(
      contact({ optedOutAt: new Date('2026-02-01'), wasConsultant: false, email: null }),
      VENDOR, PLACES
    )
    expect(v.refusal).toBe('OPTED_OUT')
  })
})

describe('only people who actually contracted, about work they actually did', () => {
  it('refuses somebody the record does not show contracting', () => {
    // The whole justification for writing at all. Otherwise it is a
    // mailshot with a nicer tone.
    const v = mayApproach(contact({ wasConsultant: false }), VENDOR, PLACES)
    expect(v.refusal).toBe('NOT_A_CONSULTANT')
    expect(v.reason).toMatch(/mailshot/i)
  })

  it('refuses when their skills have nothing to do with what this vendor places', () => {
    const v = mayApproach(contact({ skills: ['Nursing'] }), VENDOR, PLACES)
    expect(v.refusal).toBe('NOT_RELEVANT')
    expect(v.reason).toMatch(/being found and being farmed/i)
  })

  it('refuses when the record says nothing about their skills at all', () => {
    // An empty record is not a licence. It is a reason to leave them be.
    expect(mayApproach(contact({ skills: [] }), VENDOR, PLACES).refusal).toBe('NOT_RELEVANT')
  })

  it('matches on the skill regardless of how it was capitalised', () => {
    expect(mayApproach(contact({ skills: ['sap fico'] }), VENDOR, PLACES).ok).toBe(true)
  })
})

describe('the one message says why them, and where the details came from', () => {
  const msg = approachText({
    personName: 'Ravi Patel',
    vendorName: 'Cloudepa',
    becauseOf: 'SAP FICO',
    provenance: 'you were listed as an SAP contractor on a candidate list we bought in 2020',
  })

  it('answers "why me" in the first line, which is the first thing anybody thinks', () => {
    expect(msg.body).toMatch(/your name came up because/i)
    expect(msg.body).toContain('SAP FICO')
  })

  it('says where the details came from, which is the whole difference', () => {
    expect(msg.body).toMatch(/candidate list we bought in 2020/)
  })

  it('offers a way out in this message, not a later one', () => {
    expect(msg.body).toMatch(/you will not hear from us or from anyone else here again/i)
  })

  it('does not pitch a role, because that is what made everybody stop reading', () => {
    expect(msg.body).not.toMatch(/\$|\/hr|apply|opportunity|urgent|immediate/i)
  })

  it('goes out in the vendor’s name, never ours', () => {
    expect(msg.body).toMatch(/Cloudepa here/)
    expect(msg.body).not.toMatch(/Etyme/i)
    expect(msg.subject).not.toMatch(/Etyme/i)
  })
})

describe('“where we got your details” has to actually say something', () => {
  it('accepts a real answer', () => {
    expect(provenanceIsSaid('you were listed as an SAP contractor on a candidate list we bought in 2020')).toBe(true)
  })

  it('refuses the evasion everybody reaches for', () => {
    // What somebody writes when the honest answer is uncomfortable. It
    // tells the reader nothing, which is the point of writing it.
    expect(provenanceIsSaid('publicly available sources')).toBe(false)
    expect(provenanceIsSaid('from our database of candidates')).toBe(false)
    expect(provenanceIsSaid('various sources online')).toBe(false)
  })

  it('refuses an empty or near-empty answer', () => {
    expect(provenanceIsSaid('')).toBe(false)
    expect(provenanceIsSaid('a list')).toBe(false)
  })
})

describe('checking LinkedIn before writing', () => {
  it('lets a person open a profile and record what they saw', () => {
    expect(checkIsAllowed('PERSON')).toBe(true)
  })

  it('never lets the system fetch one', () => {
    // CLAUDE.md already sets this: LinkedIn is a field somebody pastes
    // in, not something we go and get. Automated collection breaches
    // their terms whatever the CFAA says — hiQ was not unauthorised
    // access and hiQ still lost on breach of contract.
    expect(checkIsAllowed('AUTOMATED')).toBe(false)
    expect(LINKEDIN_RULE).toMatch(/The system never fetches one/i)
    expect(LINKEDIN_RULE).toMatch(/not worth the leads/i)
  })
})
