import { describe, it, expect } from 'vitest'
import {
  checkSubdomain,
  checkCustomDomain,
  verificationRecord,
  servingRecord,
  assessSubdomainChange,
  tenantFromHost,
  RESERVED_SUBDOMAINS,
} from '@/lib/domains-owned'

/**
 * Sign-up guesses an address from the email domain and until now nothing
 * could change it. Fine for ninety seconds, wrong forever after: companies
 * rebrand, the guess is sometimes ugly, and a firm with its own domain
 * wants its own address rather than a subdomain of ours.
 */

const NONE = new Set<string>()

describe('choosing a subdomain', () => {
  it('accepts an ordinary name', () => {
    const v = checkSubdomain('terumobct', NONE)
    expect(v.ok).toBe(true)
    expect(v.value).toBe('terumobct')
  })

  it('tidies up capitals and spaces rather than refusing them', () => {
    expect(checkSubdomain('  TerumoBCT  ', NONE).value).toBe('terumobct')
  })

  it('refuses a name already taken, and says so plainly', () => {
    const v = checkSubdomain('cloudepa', new Set(['cloudepa']))
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/already somebody else's/i)
  })

  it('refuses one of ours', () => {
    expect(checkSubdomain('api', NONE).ok).toBe(false)
    expect(checkSubdomain('admin', NONE).ok).toBe(false)
  })

  it('refuses names mail and certificates need', () => {
    // Handing out "mail" or "_acme-challenge" breaks something nobody
    // connects to a form somebody filled in months earlier.
    for (const name of ['mail', 'mx', 'autodiscover', '_acme-challenge', '_dmarc']) {
      expect(checkSubdomain(name, NONE).ok, name).toBe(false)
    }
  })

  it('refuses names that would let a company impersonate the platform', () => {
    // secure.etyme.com reads as ours, not theirs, to the person receiving
    // the link.
    for (const name of ['secure', 'billing', 'verify', 'accounts', 'payments']) {
      expect(checkSubdomain(name, NONE).ok, name).toBe(false)
    }
  })

  it('explains which rule a refused name broke', () => {
    // "Invalid subdomain" sends somebody to guess, and guessing at a form
    // is how people give up.
    expect(checkSubdomain('ab', NONE).reason).toMatch(/three characters/i)
    expect(checkSubdomain('has spaces', NONE).reason).toMatch(/letters, numbers and hyphens/i)
    expect(checkSubdomain('-leading', NONE).reason).toMatch(/hyphen/i)
  })

  it('refuses a name DNS itself would not carry', () => {
    expect(checkSubdomain('a'.repeat(64), NONE).ok).toBe(false)
    expect(checkSubdomain('a'.repeat(64), NONE).reason).toMatch(/DNS/)
  })

  it('refuses two hyphens together, which DNS reads as an encoded name', () => {
    expect(checkSubdomain('xn--foo', NONE).ok).toBe(false)
  })

  it('keeps back every reserved name without exception', () => {
    for (const name of RESERVED_SUBDOMAINS) {
      expect(checkSubdomain(name, NONE).ok, name).toBe(false)
    }
  })
})

describe('mapping a domain you own', () => {
  it('accepts a subdomain of your own company', () => {
    const v = checkCustomDomain('talent.terumobct.com', NONE)
    expect(v.ok).toBe(true)
    expect(v.value).toBe('talent.terumobct.com')
  })

  it('accepts a pasted URL, because that is what is in the address bar', () => {
    expect(checkCustomDomain('https://talent.terumobct.com/careers', NONE).value)
      .toBe('talent.terumobct.com')
  })

  it('refuses a bare word that is not a domain', () => {
    expect(checkCustomDomain('terumobct', NONE).reason).toMatch(/full domain/i)
  })

  it('refuses one of our own hosts, and points at the right field', () => {
    const v = checkCustomDomain('foo.etyme.com', NONE)
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/field above/i)
  })

  it('refuses a domain already mapped to somebody else', () => {
    expect(checkCustomDomain('nike.com', new Set(['nike.com'])).ok).toBe(false)
  })

  it('accepts a shape it cannot yet prove, because shape is not evidence', () => {
    // Anybody can type google.com into a form. This says the shape is
    // right and nothing else — DNS settles ownership.
    const v = checkCustomDomain('google.com', NONE)
    expect(v.ok).toBe(true)
    expect(v.reason).toMatch(/prove you own it/i)
  })
})

describe('proving ownership', () => {
  it('asks for a record only somebody controlling the zone can publish', () => {
    const r = verificationRecord('talent.terumobct.com', 'tok_abc123')
    expect(r.type).toBe('TXT')
    expect(r.name).toBe('_etyme-verify.talent.terumobct.com')
    expect(r.value).toContain('tok_abc123')
  })

  it('ties the token to the domain, so a record copied from another company proves nothing', () => {
    const a = verificationRecord('a.com', 'tok_one')
    const b = verificationRecord('b.com', 'tok_two')
    expect(a.value).not.toBe(b.value)
    expect(a.name).not.toBe(b.name)
  })

  it('tells them it may take an hour and they can walk away', () => {
    expect(verificationRecord('x.com', 't').instruction).toMatch(/leave this page/i)
  })
})

describe('where a verified domain points', () => {
  it('gives a subdomain a CNAME', () => {
    const r = servingRecord('talent.terumobct.com')
    expect(r.type).toBe('CNAME')
    expect(r.value).toBe('cname.etyme.com')
  })

  it('gives a bare domain an ALIAS, because DNS forbids a CNAME there', () => {
    // The commonest support conversation in this whole feature.
    const r = servingRecord('terumobct.com')
    expect(r.type).toBe('ALIAS')
    expect(r.note).toMatch(/cannot hold a CNAME/i)
    expect(r.note).toMatch(/subdomain/i)
  })

  it('never hands out a bare IP address', () => {
    // Our addresses change; an IP in somebody else's zone file is an
    // outage waiting for the day we move.
    expect(servingRecord('x.com').value).not.toMatch(/^\d+\.\d+\.\d+\.\d+$/)
  })
})

describe('changing an address', () => {
  it('keeps the old one working, which is what makes this safe to offer', () => {
    const a = assessSubdomainChange('cloudepa', 'cloudepa-talent', 0)
    expect(a.allowed).toBe(true)
    expect(a.consequences.join(' ')).toMatch(/keep working/i)
  })

  it('says that everything already sent keeps working', () => {
    const a = assessSubdomainChange('old', 'new', 0)
    expect(a.consequences.join(' ')).toMatch(/invitations, document requests, invoices/i)
  })

  it('refuses a change to the address you already have', () => {
    expect(assessSubdomainChange('same', 'same', 0).allowed).toBe(false)
  })

  it('mentions it when somebody keeps changing their mind', () => {
    // Every old address is kept alive forever, so the fourth change is
    // worth a word.
    const a = assessSubdomainChange('third', 'fourth', 3)
    expect(a.allowed).toBe(true)
    expect(a.consequences.join(' ')).toMatch(/settling on one/i)
  })
})

describe('working out whose company a visitor is looking at', () => {
  it('reads a company subdomain', () => {
    expect(tenantFromHost('cloudepa.etyme.com')).toEqual({ kind: 'SUBDOMAIN', value: 'cloudepa' })
  })

  it('ignores the port', () => {
    expect(tenantFromHost('cloudepa.etyme.com:3000').value).toBe('cloudepa')
  })

  it('treats our own hosts as the platform rather than a tenant', () => {
    expect(tenantFromHost('etyme.com').kind).toBe('PLATFORM')
    expect(tenantFromHost('www.etyme.com').kind).toBe('PLATFORM')
    expect(tenantFromHost('api.etyme.com').kind).toBe('PLATFORM')
  })

  it('does not treat a deeper name as a tenant', () => {
    // a.b.etyme.com is ours, not a company called "a.b".
    expect(tenantFromHost('a.b.etyme.com').kind).toBe('PLATFORM')
  })

  it('reads anything else as a mapped domain', () => {
    expect(tenantFromHost('talent.terumobct.com')).toEqual({
      kind: 'CUSTOM',
      value: 'talent.terumobct.com',
    })
  })

  it('treats local development as the platform', () => {
    expect(tenantFromHost('localhost:3000').kind).toBe('PLATFORM')
    expect(tenantFromHost('127.0.0.1').kind).toBe('PLATFORM')
  })
})

describe('the middleware and the library agree about what is ours', () => {
  it('keeps the middleware’s platform list inside the reserved list', async () => {
    // The middleware duplicates this list because it runs on the edge and
    // cannot import a module that pulls in Prisma types. A duplicate that
    // drifts would hand out a name in one place and refuse it in the other.
    const { readFileSync } = await import('fs')
    const { join } = await import('path')
    const src = readFileSync(join(process.cwd(), 'src/middleware.ts'), 'utf8')

    const block = src.match(/PLATFORM_SUBDOMAINS = new Set\(\[([\s\S]*?)\]\)/)
    expect(block, 'middleware should declare PLATFORM_SUBDOMAINS').not.toBeNull()

    const names = [...block![1].matchAll(/'([a-z0-9_-]+)'/g)].map((m) => m[1])
    expect(names.length).toBeGreaterThan(10)

    const missing = names.filter((n) => !RESERVED_SUBDOMAINS.has(n))
    expect(missing, `middleware treats these as ours but the form would hand them out: ${missing.join(', ')}`).toEqual([])
  })
})
