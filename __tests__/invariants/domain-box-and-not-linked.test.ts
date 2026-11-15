import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readTypedDomain, unreadableDomainSays, notLinkedYet } from '@/lib/counterparty'
import { ownDomainsFor, CLEARED_NOTE } from '@/app/api/companies/twins'

/**
 * Faults found by hand on 2026-11-15, after the fix list of 2026-11-14
 * (record 72). The routes are walked in
 * __integration__/one-sided-firm-and-domain-box.test.ts; the pure rules
 * and the screen-to-route contract are read here.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('the domain box keeps what was typed, or says why not', () => {
  it('an empty box is no domain, and nothing is said', () => {
    expect(readTypedDomain(undefined)).toEqual({ ok: true, domain: null, says: null })
    expect(readTypedDomain('   ')).toEqual({ ok: true, domain: null, says: null })
  })

  it('a domain written with a scheme, www or capitals is kept bare, and nothing is said', () => {
    expect(readTypedDomain('https://www.Northwind-Staffing.example/about')).toEqual({ ok: true, domain: 'northwind-staffing.example', says: null })
  })

  it('an email address gives its domain, and the reply says the domain was taken from it', () => {
    expect(readTypedDomain('jobs@harborline-tech.example')).toEqual({
      ok: true, domain: 'harborline-tech.example',
      says: 'The domain was taken from the email address you typed: harborline-tech.example.',
    })
  })

  it('a port, a trailing dot, plain words or a bare @ are refused in a sentence that says how to type it', () => {
    for (const typed of ['harborline-tech.example:8080', 'harborline-tech.example.', 'not a domain!!', '@harborline-tech.example', 'jobs@']) {
      expect(readTypedDomain(typed)).toEqual({ ok: false, says: unreadableDomainSays(typed) })
    }
    expect(unreadableDomainSays('not a domain!!')).toBe('not a domain!! does not read as a domain. Type it like northwind-staffing.example, or leave the box empty.')
  })

  it('a long unreadable entry is shortened in the sentence, so the refusal stays short', () => {
    expect(unreadableDomainSays('x'.repeat(200)).length).toBeLessThan(160)
  })
})

describe('every door with a domain box reads it the one way', () => {
  it('Add a company, the clients door and Edit each read the box through readTypedDomain and refuse with field domain', () => {
    for (const p of ['src/app/api/companies/route.ts', 'src/app/api/clients/route.ts', 'src/app/api/companies/[id]/record/route.ts']) {
      const src = read(p)
      expect(src, p).toContain('readTypedDomain(body')
      expect(src, p).toMatch(/field: 'domain'/)
    }
  })

  it('the Add a company form shows the route’s own sentence when the domain is refused', () => {
    const page = read('src/app/dashboard/companies/page.tsx')
    expect(page).toContain("setError(refusalSentence(body.error?.message, { what: 'Adding a company' })")
    expect(page).toContain("domain: form.domain.trim() || undefined")
  })
})

describe('a domain cleared on Edit stays cleared', () => {
  const fakeDb = (invites: { companyId: string; domain: string }[]) => ({
    supplierInvite: { findMany: async ({ where }: any) => invites.filter((i) => where.companyId.in.includes(i.companyId)) },
  }) as any
  const invite = [{ companyId: 'c1', domain: 'tidewater.example' }]

  it('a pasted supplier with no note reads the domain on its invitation', async () => {
    const m = await ownDomainsFor('me', [{ id: 'c1', website: null, claimedAt: null, listedById: 'me' }], fakeDb(invite))
    expect(m.get('c1')).toEqual({ domain: 'tidewater.example', from: 'INVITATION' })
  })

  it('a pasted supplier whose domain was cleared on Edit reads no domain, and the invitation is not read back', async () => {
    const m = await ownDomainsFor('me', [{ id: 'c1', website: CLEARED_NOTE, claimedAt: null, listedById: 'me' }], fakeDb(invite))
    expect(m.has('c1')).toBe(false)
  })

  it('the Edit route saves a cleared box as cleared only where an invitation carries a domain, and checks what the list reads before it logs', () => {
    const src = read('src/app/api/companies/[id]/record/route.ts')
    expect(src).toContain('website: domain ?? (fromInvitation ? CLEARED_NOTE : null)')
    expect(src).toContain('if (now !== domain) throw')
  })
})

describe('a firm on Etyme you only wrote down is not described to you', () => {
  it('a firm on Etyme reached only by your own writing is not linked yet; your own record nobody claimed never is', () => {
    expect(notLinkedYet({ ownSideOnly: true, onEtyme: true, mine: false })).toBe(true)
    expect(notLinkedYet({ ownSideOnly: true, onEtyme: true, mine: true })).toBe(false)
    expect(notLinkedYet({ ownSideOnly: true, onEtyme: false, mine: false })).toBe(false)
    expect(notLinkedYet({ ownSideOnly: false, onEtyme: true, mine: false })).toBe(false)
  })

  it('the Companies list, the drawer and Contacts ask the one rule', () => {
    expect(read('src/app/api/companies/route.ts')).toContain('notLinkedYet({')
    const drawer = read('src/app/api/companies/[id]/extend/route.ts')
    expect(drawer).toContain('notLinkedYet({')
    // The drawer's read refuses a not-linked firm before it reads any position.
    const get = drawer.slice(drawer.indexOf('export async function GET'))
    expect(get.indexOf('drawnNotLinked(caller, other)')).toBeGreaterThan(-1)
    expect(get.indexOf('drawnNotLinked(caller, other)')).toBeLessThan(get.indexOf('readOne(me, other)'))
    const contacts = read('src/app/api/contacts/route.ts')
    expect(contacts).toContain('dealingsWithSides(caller, false)')
    expect(contacts).toContain('!notLinkedYet({ ownSideOnly: ownSideOnly.has(id)')
  })
})
