/**
 * The rolodex: people at counterparties, with no login and no seat.
 *
 * The audit put the gap plainly: you could record that Wipro exists and
 * not who at Wipro answers the phone. A staffing business is a rolodex
 * with invoicing attached, and this is the rolodex.
 */

import { describe, it, expect } from 'vitest'
import {
  KINDS, problems, alreadyOnFile, claimMatches, normalEmail, normalPhone,
} from '@/lib/contacts'

describe('A contact says what you would call them about, not just who they are', () => {

  it('every kind of contact carries what to call them for', () => {
    for (const [k, v] of Object.entries(KINDS)) {
      expect(v.callAbout.length, k).toBeGreaterThan(10)
    }
  })

  it('accounts payable is the one you chase an unpaid invoice through', () => {
    expect(KINDS.AP.callAbout).toContain('unpaid invoices')
  })
})

describe('The form checks itself, because a browser refusal in a modal is invisible', () => {

  it('needs a name, and says why', () => {
    expect(problems({ name: '' })[0].says).toContain('who they are calling')
  })

  it('a wrong email is quoted back rather than called invalid', () => {
    const p = problems({ name: 'Dana Whitfield', email: 'dana.whitfield' })
    expect(p[0].says).toContain('"dana.whitfield" is not an email address')
  })

  it('an email is optional — a hallway conversation gives you a name and nothing else', () => {
    expect(problems({ name: 'Dana Whitfield' })).toEqual([])
  })

  it('a kind nobody defined is refused rather than stored as mystery text', () => {
    expect(problems({ name: 'Dana', kind: 'WIZARD' })[0].field).toBe('kind')
  })
})

describe('Two Rajesh Kumars at Infosys is Tuesday, not a duplicate', () => {

  const existing = [
    { id: 'c1', name: 'Rajesh Kumar', email: 'rajesh.k@infosys.com', phone: '(303) 555-0100', atCompanyId: 'infosys' },
  ]

  it('the same email at the same company is the same person', () => {
    const v = alreadyOnFile({ name: 'R Kumar', email: 'RAJESH.K@Infosys.com ', atCompanyId: 'infosys' }, existing)
    expect(v.duplicate).toBe(true)
    expect(v.says).toContain('Update them rather than adding a twin')
  })

  it('the same phone written differently still collides', () => {
    const v = alreadyOnFile({ name: 'Rajesh', phone: '303.555.0100', atCompanyId: 'infosys' }, existing)
    expect(v.duplicate).toBe(true)
  })

  it('the same name alone never merges, because names are not identifiers', () => {
    const v = alreadyOnFile({ name: 'Rajesh Kumar', atCompanyId: 'infosys' }, existing)
    expect(v.duplicate).toBe(false)
  })

  it('the same email at a different company is a different rolodex entry', () => {
    const v = alreadyOnFile({ name: 'Rajesh', email: 'rajesh.k@infosys.com', atCompanyId: 'wipro' }, existing)
    expect(v.duplicate).toBe(false)
  })

  it('a name-only entry is allowed through, because a strict rolodex stays empty', () => {
    expect(alreadyOnFile({ name: 'Somebody From The Call', atCompanyId: 'infosys' }, existing).duplicate).toBe(false)
  })
})

describe('When a contact joins the platform, the entry links rather than duplicating', () => {

  const contacts = [
    { id: 'c1', name: 'Dana Whitfield', email: 'dana@terumo.com', personId: null },
    { id: 'c2', name: 'Old Entry', email: 'dana@terumo.com', personId: 'already-linked' },
    { id: 'c3', name: 'Somebody Else', email: 'other@terumo.com', personId: null },
  ]

  it('matches on the exact email they signed in with, nothing fuzzier', () => {
    // Linking the wrong contact hands one tenant's notes about a person
    // to a different person.
    const m = claimMatches('Dana@Terumo.com', contacts)
    expect(m.map((x) => x.contactId)).toEqual(['c1'])
  })

  it('links, never merges — the notes stay the rolodex owner’s', () => {
    expect(claimMatches('dana@terumo.com', contacts)[0].says).toContain('Linked, not merged')
  })

  it('leaves an already-linked entry alone', () => {
    expect(claimMatches('dana@terumo.com', contacts).map((x) => x.contactId)).not.toContain('c2')
  })
})

describe('Normalisation is boring on purpose', () => {

  it('emails compare lowercased and trimmed', () => {
    expect(normalEmail(' Dana@Terumo.COM ')).toBe('dana@terumo.com')
  })

  it('phones compare as digits, so formatting never makes two of one number', () => {
    expect(normalPhone('(303) 555-0100')).toBe(normalPhone('303.555.0100'))
  })

  it('six digits is not a phone number', () => {
    expect(normalPhone('123456')).toBeNull()
  })
})
