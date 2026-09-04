/**
 * Getting a company into Etyme.
 *
 * What goes wrong is not sign-in. It is that the second person from a
 * company creates a second company, and six weeks later there are three
 * "Nike Inc" records with the requisitions split between them.
 *
 * A verified work-email domain solves that outright, and these tests are
 * mostly about holding that one rule: the domain is the company, so
 * everybody after the first person joins.
 */

import { describe, it, expect } from 'vitest'
import {
  classifyEmail, domainOf, decideEntry, slugFromDomain,
  guessCompanyName, COMPANY_TYPES, typeByKey,
} from '@/lib/onboarding'

const terumo = { id: 'c1', name: 'Terumo BCT', kind: 'CLIENT', memberCount: 12 }

describe('Who is signing in', () => {

  it('a work address is corporate', () => {
    expect(classifyEmail('d.whitfield@terumobct.com')).toBe('CORPORATE')
  })

  it('gmail is a person, not a company', () => {
    expect(classifyEmail('ravi.patel@gmail.com')).toBe('CONSUMER')
  })

  it('so are the other big consumer providers', () => {
    for (const e of ['a@yahoo.com', 'b@outlook.com', 'c@icloud.com', 'd@proton.me']) {
      expect(classifyEmail(e)).toBe('CONSUMER')
    }
  })

  it('something that is not an address is refused', () => {
    expect(classifyEmail('not-an-email')).toBe('INVALID')
    expect(classifyEmail('missing@domain')).toBe('INVALID')
    expect(classifyEmail('@nothing.com')).toBe('INVALID')
  })

  it('a mail subdomain is the same company, not a second one', () => {
    // This used to keep contractors.nike.com as the domain, so somebody at
    // nike.com matched nothing and created a second tenant for the same
    // organisation — neither able to see the other's requisitions,
    // invoices or people. Reducing to the registrable domain is what makes
    // join-beats-create actually hold.
    expect(classifyEmail('j.smith@contractors.nike.com')).toBe('CORPORATE')
    expect(domainOf('j.smith@contractors.nike.com')).toBe('nike.com')
    expect(domainOf('other@nike.com')).toBe('nike.com')
  })

  it('case and spacing do not change the answer', () => {
    expect(classifyEmail('  D.Whitfield@TerumoBCT.com ')).toBe('CORPORATE')
  })
})

describe('The domain is the company', () => {

  it('the first person from a domain sets the company up', () => {
    const d = decideEntry('d.whitfield@terumobct.com', null)
    expect(d.action).toBe('CREATE')
    expect(d.message).toContain('Nobody from terumobct.com is here yet')
  })

  it('everybody after them joins it', () => {
    // The whole point. No search box, no invite code, no duplicate.
    const d = decideEntry('m.okafor@terumobct.com', terumo)
    expect(d.action).toBe('JOIN')
    expect(d.message).toContain('12 colleagues')
  })

  it('joining is never offered as a choice against creating', () => {
    // Offering the choice is how duplicates get made: the person who is
    // unsure picks create.
    const d = decideEntry('m.okafor@terumobct.com', terumo)
    expect(d.action).not.toBe('CREATE')
  })

  it('the second person ever is told they are joining one colleague', () => {
    const d = decideEntry('m.okafor@terumobct.com', { ...terumo, memberCount: 1 })
    expect(d.message).toContain('already on Etyme')
    expect(d.message).not.toContain('colleagues')
  })

  it('a company with nobody in it yet does not say "0 colleagues"', () => {
    // Companies exist before their first sign-in — imported from a client
    // list, or seeded. The count is true and reads as broken.
    const d = decideEntry('a@nike.com', { ...terumo, name: 'Nike Inc.', memberCount: 0 })
    expect(d.message).toBe('Nike Inc. is already on Etyme. Joining it.')
    expect(d.message).not.toContain('0 colleagues')
  })

  it('a consultant on gmail signs in without a company, and is not refused', () => {
    // Consultants are the third side of this market, not a failed signup.
    const d = decideEntry('ravi.patel@gmail.com', null)
    expect(d.action).toBe('CONSULTANT')
    expect(d.message).toContain('as a consultant')
  })

  it('and is told what to do if they meant to set up a company', () => {
    const d = decideEntry('ravi.patel@gmail.com', null)
    expect(d.message).toContain('work email')
  })

  it('a malformed address is refused plainly', () => {
    expect(decideEntry('nonsense', null).action).toBe('REFUSE')
  })
})

describe('The company address', () => {

  it('comes from the domain', () => {
    expect(slugFromDomain('terumobct.com', new Set())).toBe('terumobct')
  })

  it('drops www', () => {
    expect(slugFromDomain('www.nike.com', new Set())).toBe('nike')
  })

  it('numbers a collision rather than refusing it', () => {
    // Two companies can genuinely own similar domains. Telling the second
    // to think of another name is a poor first minute.
    expect(slugFromDomain('nike.com', new Set(['nike']))).toBe('nike-2')
    expect(slugFromDomain('nike.com', new Set(['nike', 'nike-2']))).toBe('nike-3')
  })

  it('will not hand out a word the product uses', () => {
    expect(slugFromDomain('api.com', new Set())).toBe('api-2')
    expect(slugFromDomain('admin.io', new Set())).toBe('admin-2')
  })

  it('strips anything that would break a URL', () => {
    expect(slugFromDomain('acme_corp!.com', new Set())).toBe('acme-corp')
  })

  it('a domain that reduces to nothing still gets an address', () => {
    expect(slugFromDomain('---.com', new Set())).toBe('company')
  })
})

describe('The first screen is not an empty box', () => {

  it('a name is guessed from the domain', () => {
    expect(guessCompanyName('terumobct.com')).toBe('Terumobct')
  })

  it('hyphens become words', () => {
    expect(guessCompanyName('cloud-epa.com')).toBe('Cloud Epa')
  })
})

describe('What this company does here', () => {

  it('there are five ways in', () => {
    expect(COMPANY_TYPES).toHaveLength(5)
  })

  it('a client who hires contractors', () => {
    const t = typeByKey('client')!
    expect(t.kind).toBe('CLIENT')
    expect(t.example).toContain('Terumo')
  })

  it('a GSI both delivers and buys', () => {
    const t = typeByKey('gsi')!
    expect(t.kind).toBe('GSI')
    expect(t.posture).toBe('PRIME')
  })

  it('an MSP runs somebody else programme', () => {
    expect(typeByKey('msp')!.kind).toBe('MSP')
  })

  it('a prime supplier holds the client agreement', () => {
    const t = typeByKey('prime')!
    expect(t.kind).toBe('VENDOR')
    expect(t.posture).toBe('PRIME')
  })

  it('a bench supplier sells through other suppliers', () => {
    const t = typeByKey('bench')!
    expect(t.kind).toBe('VENDOR')
    expect(t.posture).toBe('BENCH')
  })

  it('prime and bench are the same kind of company, in different postures', () => {
    // Infosys is prime to one client and buys bench from three firms in the
    // same week. This is a starting posture, not an identity.
    expect(typeByKey('prime')!.kind).toBe(typeByKey('bench')!.kind)
  })

  it('every option says what it means without jargon', () => {
    for (const t of COMPANY_TYPES) {
      expect(t.blurb.length).toBeGreaterThan(30)
      expect(t.example.length).toBeGreaterThan(0)
    }
  })

  it('an unknown option is not silently accepted', () => {
    expect(typeByKey('something-else')).toBeNull()
  })
})
