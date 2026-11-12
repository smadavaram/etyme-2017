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
    const v = checkSubdomain('techpeple', new Set(['techpeple']))
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
    const a = assessSubdomainChange('techpeple', 'techpeple-talent', 0)
    expect(a.allowed).toBe(true)
    expect(a.consequences.join(' ')).toMatch(/keep working/i)
  })

  it('says that everything already sent keeps working', () => {
    const a = assessSubdomainChange('old', 'new', 0)
    expect(a.consequences.join(' ')).toMatch(/invitations, document requests, bills/i)
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
    expect(tenantFromHost('techpeple.etyme.com')).toEqual({ kind: 'SUBDOMAIN', value: 'techpeple' })
  })

  it('ignores the port', () => {
    expect(tenantFromHost('techpeple.etyme.com:3000').value).toBe('techpeple')
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

// ── Connect your domain (founder, "build it" on the drawing, 2026-11-12) ──

import { readFileSync as readSrc } from 'node:fs'
import { connectDomainView, stepsMailto, DOMAIN_GIVES, NO_DOMAIN_LINE, MAIL_LINE } from '@/lib/domains-owned'
import { canClaim } from '@/lib/company-domains'
import { checkItemAnswer } from '@/lib/setup-checklist'

describe('connect your domain', () => {
  const waiting = { id: 'cd1', domain: 'byrnenursing.example', verifiedAt: null, verifiedVia: null, proofToken: 'tok7f3a' }

  it('a domain waiting for its proof shows the one TXT record to add and the sentence that says to press Check now', () => {
    const v = connectDomainView([waiting])
    expect(v.rows[0]).toMatchObject({
      state: 'WAITING', firstVerifiedOn: null,
      record: { type: 'TXT', host: '_etyme-verify', name: '_etyme-verify.byrnenursing.example', value: 'etyme-domain-verification=tok7f3a' },
    })
    expect(v.rows[0].says).toBe('Add this TXT record where byrnenursing.example’s DNS is kept, then press Check now. It usually shows within a few minutes, sometimes an hour.')
    expect(v.verified).toBe(false)
    // One claim at a time: nothing new is offered while one waits.
    expect(v.offerClaim).toBe(false)
  })

  it('a verified domain says how it was proved and the day it was first verified, and asks for nothing more', () => {
    const v = connectDomainView([{ ...waiting, verifiedAt: new Date('2026-11-12T15:00:00Z'), verifiedVia: 'DNS_TXT' }])
    expect(v.rows[0]).toMatchObject({ state: 'VERIFIED', firstVerifiedOn: '2026-11-12', record: null, says: 'byrnenursing.example is verified by its DNS record.' })
    expect(v.verified).toBe(true)
    expect(v.offerClaim).toBe(false)
  })

  it('a company with no domain is offered the field, and the step stays skippable', () => {
    const v = connectDomainView([])
    expect(v).toMatchObject({ rows: [], verified: false, offerClaim: true })
    expect(checkItemAnswer('VENDOR', 'DOMAIN', 'SKIPPED')).toMatchObject({ ok: true })
  })

  it('the screen says what verifying gives: the choice of who joins by sign-in, the company’s directory, and recovery, and never promises colleagues join with no invitation', () => {
    expect(DOMAIN_GIVES).toEqual([
      'You choose whether people on your domain may join by signing in, or come in by invitation only.',
      'Your people can sign in through your company’s own directory.',
      'An Owner who loses access can get it back by proving the domain again.',
    ])
    expect(MAIL_LINE).toBe('Your email keeps working. This adds one record and never changes or removes a mail record.')
  })

  it('the domain page says how people join today in the one join sentence, and verifying a domain answers with it, never with a join of its own', () => {
    const tapin = 'People join Tapin by invitation only. An Owner or Admin invites each person from Users & permissions.'
    expect(connectDomainView([], tapin).joins).toBe(tapin)
    expect(connectDomainView([]).joins).toBeNull()
    const read = (f: string) => require('node:fs').readFileSync(require('node:path').join(process.cwd(), f), 'utf8') as string
    expect(read('src/app/api/settings/domain/route.ts')).toContain('joinSentenceFor(companyId)')
    expect(read('src/app/dashboard/settings/domain/connect-domain.tsx')).toContain('Today: {view.joins}')
    const check = read('src/app/api/settings/setup/[item]/route.ts')
    expect(check).not.toContain('now join by signing in')
    expect(check).toContain('is verified.${joins ? ` ${joins}` : \'\'}')
    const words = read('src/lib/setup-checklist.ts')
    expect(words).toContain("line: 'Verify your domain',")
    expect(words).not.toContain('so colleagues join by signing in')
  })

  it('Etyme does not sell, register or move domains, and the screen names no registrar and carries no referral link', () => {
    expect(NO_DOMAIN_LINE).toContain('Etyme does not sell, hold or move domains')
    const screen = readSrc('src/app/dashboard/settings/domain/connect-domain.tsx', 'utf8') + NO_DOMAIN_LINE
    for (const word of ['GoDaddy', 'Namecheap', 'Bluehost', 'Google Workspace', 'Microsoft 365', 'referral', '?ref=', 'https://']) {
      expect(screen, word).not.toContain(word)
    }
  })

  it('a consumer address and Etyme’s own domain are refused in a sentence', () => {
    expect(canClaim('gmail.com', undefined, false)).toMatchObject({ ok: false, reason: 'gmail.com belongs to everybody. A company cannot claim a consumer provider — invite those people individually instead.' })
    expect(canClaim('etyme.com', undefined, false)).toMatchObject({ ok: false, reason: 'etyme.com is Etyme\'s own address, so no company can claim it. Your Etyme address stands for your company instead.' })
  })

  it('the steps can be emailed to the person who runs the DNS, from the person’s own mail and never through Etyme', () => {
    const v = connectDomainView([waiting])
    const link = stepsMailto(v.rows[0])!
    expect(link.startsWith('mailto:?subject=')).toBe(true)
    const body = decodeURIComponent(link.split('&body=')[1])
    expect(body).toContain('Name: _etyme-verify')
    expect(body).toContain('Value: etyme-domain-verification=tok7f3a')
    expect(stepsMailto(connectDomainView([{ ...waiting, verifiedAt: new Date(), verifiedVia: 'DNS_TXT' }]).rows[0])).toBeNull()
  })

  it('the setup item and Settings draw one screen, and both claim and check through the one DNS proof', () => {
    expect(readSrc('src/app/dashboard/settings/setup/items.tsx', 'utf8')).toContain('<ConnectDomain suggested={d.suggested}')
    expect(readSrc('src/app/dashboard/settings/domain/page.tsx', 'utf8')).toContain('<ConnectDomain />')
    const screen = readSrc('src/app/dashboard/settings/domain/connect-domain.tsx', 'utf8')
    expect(screen).toContain("fetch('/api/settings/setup/domain'")
    expect(screen).toContain("{ action: 'CHECK', id: r.id }")
    expect(screen).toContain("{ action: 'CLAIM', domain }")
    expect(readSrc('src/app/api/settings/domain/route.ts', 'utf8')).not.toMatch(/resolveTxt|companyDomain\.(create|update)/)
  })
})
