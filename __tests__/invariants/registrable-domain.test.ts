import { describe, it, expect } from 'vitest'
import {
  registrableDomain,
  registrableLabel,
  sameOrganisation,
} from '@/lib/registrable-domain'

/**
 * The whole join-beats-create design rests on one idea: the verified work
 * email domain IS the company. So the domain has to be the same string for
 * everybody who works there — and it was not.
 *
 * Somebody signing in from user@mail.corp.com stored mail.corp.com. Their
 * colleague on user@corp.com matched nothing and created a second company:
 * two tenants for one organisation, neither able to see the other's
 * requisitions, invoices or people.
 */

describe('finding the domain somebody actually registered', () => {
  it('leaves an ordinary company domain alone', () => {
    expect(registrableDomain('cloudepa.com')).toBe('cloudepa.com')
  })

  it('strips a mail subdomain, which is the bug that split a company in two', () => {
    expect(registrableDomain('mail.corp.com')).toBe('corp.com')
    expect(registrableDomain('eu.mail.corp.com')).toBe('corp.com')
  })

  it('keeps three labels where the suffix needs them', () => {
    // bbc.co.uk is registrable; co.uk is not. Getting this backwards would
    // put every British company into one tenant.
    expect(registrableDomain('bbc.co.uk')).toBe('bbc.co.uk')
    expect(registrableDomain('mail.bbc.co.uk')).toBe('bbc.co.uk')
    expect(registrableDomain('infosys.co.in')).toBe('infosys.co.in')
    expect(registrableDomain('acme.com.au')).toBe('acme.com.au')
  })

  it('never treats a bare public suffix as a company', () => {
    expect(registrableDomain('co.uk')).toBeNull()
    expect(registrableDomain('com.au')).toBeNull()
  })

  it('keeps hosted platforms apart, because merging them would be catastrophic', () => {
    // Two unrelated companies on onmicrosoft.com are not one company.
    expect(registrableDomain('acme.onmicrosoft.com')).toBe('acme.onmicrosoft.com')
    expect(registrableDomain('other.onmicrosoft.com')).toBe('other.onmicrosoft.com')
    expect(sameOrganisation('a@acme.onmicrosoft.com', 'b@other.onmicrosoft.com')).toBe(false)
  })

  it('accepts a whole email address, because that is what the caller has', () => {
    expect(registrableDomain('user@mail.corp.com')).toBe('corp.com')
    expect(registrableDomain('user+tag@corp.com')).toBe('corp.com')
  })

  it('accepts a pasted URL', () => {
    expect(registrableDomain('https://mail.corp.com/inbox')).toBe('corp.com')
  })

  it('ignores a trailing dot, which is a valid fully-qualified name', () => {
    expect(registrableDomain('corp.com.')).toBe('corp.com')
  })

  it('refuses anything that is not a domain', () => {
    expect(registrableDomain('')).toBeNull()
    expect(registrableDomain('localhost')).toBeNull()
    expect(registrableDomain('has space.com')).toBeNull()
    expect(registrableDomain('corp..com')).toBeNull()
    expect(registrableDomain('corp_underscore.com')).toBeNull()
  })

  it('fails safe on a suffix it has never heard of', () => {
    // An unknown multi-part suffix is read as a normal two-label domain.
    // That splits a tenant at worst; it never merges two companies, which
    // is the failure that cannot be undone.
    expect(registrableDomain('acme.unknownsuffix.zz')).toBe('unknownsuffix.zz')
  })
})

describe('the label an address is built from', () => {
  it('takes the company name, not the mail subdomain', () => {
    // The old code took the first label, so a company on mail.corp.com
    // became "mail" — a reserved name, so it fell through to "mail-2".
    expect(registrableLabel('user@mail.corp.com')).toBe('corp')
  })

  it('takes the name and not the suffix on a multi-part domain', () => {
    expect(registrableLabel('ops@mail.acme.co.uk')).toBe('acme')
  })

  it('returns nothing when there is no domain to read', () => {
    expect(registrableLabel('nonsense')).toBeNull()
  })
})

describe('whether two people work at the same company', () => {
  it('says yes across mail subdomains', () => {
    // The question join-beats-create actually asks.
    expect(sameOrganisation('a@corp.com', 'b@mail.corp.com')).toBe(true)
    expect(sameOrganisation('a@eu.corp.co.uk', 'b@corp.co.uk')).toBe(true)
  })

  it('says no across genuinely different companies', () => {
    expect(sameOrganisation('a@corp.com', 'b@other.com')).toBe(false)
    expect(sameOrganisation('a@corp.com', 'b@corp.co.uk')).toBe(false)
  })

  it('says no when either side is not a domain', () => {
    expect(sameOrganisation('a@corp.com', 'nonsense')).toBe(false)
  })
})
