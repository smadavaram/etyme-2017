import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  twinOnOwnList, identityDomain, sameDomainRefused, namesakeSays, mayEditRecord,
  companyTiles, noPositionTile, countedTwiceSays, domainCell, addressCell, NO_POSITION_WORDS,
} from '@/lib/counterparty'

/**
 * The Companies list and Add a company, after the founder's firm pressed
 * them on 2026-11-14 (record 72): a company is known by its domain among
 * the companies a firm recorded, every row is in a tile, no cell is a bare
 * dash, and a recorded company can be corrected. The rules are pure and
 * read here; the routes are walked in
 * __integration__/companies-list-reads-its-own-book.test.ts.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const own = [
  { id: 'a', name: 'SoftHQ', domain: 'softhq-inc.example' },
  { id: 'b', name: 'Bluefen Recruiting', domain: null },
  { id: 'c', name: 'Harborline Tech', domain: 'harborline-tech.example' },
]

describe('a company is known by its domain', () => {
  it('the same name on a different domain is two companies, and the reply names the one already there', () => {
    const r = twinOnOwnList({ name: 'SoftHQ', domain: 'softhq.example' }, own)
    expect(r.twin).toBeNull()
    expect(r.namesake?.id).toBe('a')
    expect(namesakeSays(r.namesake!)).toBe('Another company on your list is also called SoftHQ, on softhq-inc.example.')
  })

  it('a domain already on the list is the same company whatever the name, and the refusal names it with its domain', () => {
    const r = twinOnOwnList({ name: 'Completely Different', domain: 'softhq-inc.example' }, own)
    expect(r).toMatchObject({ by: 'DOMAIN', twin: { id: 'a' } })
    expect(sameDomainRefused(r.twin!)).toBe('SoftHQ (softhq-inc.example) is on your Companies list already on that domain. Open it there rather than record it twice.')
  })

  it('a domain written with www, a scheme and a path is the same company as the bare domain', () => {
    expect(twinOnOwnList({ name: 'x', domain: 'https://www.SoftHQ-Inc.example/about' }, own).twin?.id).toBe('a')
  })

  it('a subdomain of a domain already on the list is the same company', () => {
    expect(twinOnOwnList({ name: 'x', domain: 'mail.harborline-tech.example' }, own).twin?.id).toBe('c')
  })

  it('with no domain on either side, the same name is the same company, compared without case or punctuation', () => {
    expect(twinOnOwnList({ name: 'BLUEFEN-recruiting.', domain: '' }, own)).toMatchObject({ by: 'NAME', twin: { id: 'b' } })
  })

  it('where the names match and only one side has a domain, it is recorded and the reply says the name is shared', () => {
    const typedOnly = twinOnOwnList({ name: 'Bluefen Recruiting', domain: 'bluefen.example' }, own)
    expect(typedOnly).toMatchObject({ twin: null, namesake: { id: 'b' } })
    expect(namesakeSays(typedOnly.namesake!)).toBe('Another company on your list is also called Bluefen Recruiting, with no domain yet.')
    expect(twinOnOwnList({ name: 'SoftHQ', domain: null }, own)).toMatchObject({ twin: null, namesake: { id: 'a' } })
  })

  it('a personal email domain is never a company’s identity, so the name decides', () => {
    expect(identityDomain('gmail.com')).toBeNull()
    expect(identityDomain('mail.yahoo.com')).toBeNull()
    expect(identityDomain('Northwind-Staffing.example')).toBe('northwind-staffing.example')
    expect(twinOnOwnList({ name: 'Bluefen Recruiting', domain: 'gmail.com' }, own)).toMatchObject({ by: 'NAME', twin: { id: 'b' } })
  })
})

describe('a recorded company can be corrected, and only there', () => {
  const me = { id: 'me', name: 'Northwind Staffing' }
  const record = { id: 'x', name: 'Rivetstone', claimedAt: null, listedById: 'me', seats: 0 }
  it('the firm that recorded it, with the right to keep its list of companies, may correct it', () => {
    expect(mayEditRecord({ me, permissions: ['vendors.manage'], other: record })).toEqual({ ok: true })
  })
  it('a company on Etyme keeps its own name, said in a sentence', () => {
    const v = mayEditRecord({ me, permissions: ['*'], other: { ...record, claimedAt: new Date() } })
    expect(v).toMatchObject({ ok: false, code: 'ON_ETYME', says: 'Rivetstone is on Etyme, so it keeps its own name and domain. Nothing was changed.' })
    expect(mayEditRecord({ me, permissions: ['*'], other: { ...record, seats: 1 } }).ok).toBe(false)
  })
  it('another firm’s record and a seat without the right are refused in a sentence', () => {
    expect(mayEditRecord({ me, permissions: ['*'], other: { ...record, listedById: 'them' } }).ok).toBe(false)
    expect(mayEditRecord({ me, permissions: ['timesheets.read'], other: record })).toMatchObject({ ok: false, code: 'FORBIDDEN' })
  })
})

describe('every row on the Companies list is in a tile', () => {
  const rows = [
    { positions: ['CUSTOMER'] as const, notClassified: false },
    { positions: ['CUSTOMER', 'SUPPLIER'] as const, notClassified: false },
    { positions: ['SUPPLIER'] as const, notClassified: false },
    { positions: ['PRIME'] as const, notClassified: false },
    { positions: [] as const, notClassified: true },
    { positions: [] as const, notClassified: true },
    { positions: [] as const, notClassified: false },
    { positions: [] as const, notClassified: false, notLinked: true },
  ]
  it('the tiles count customers, suppliers, primes, not classified, works with you and not linked yet', () => {
    expect(companyTiles(rows)).toEqual({ total: 8, customers: 2, suppliers: 2, primes: 1, msps: 0, notClassified: 2, worksWithYou: 1, notLinked: 1, countedTwice: 1 })
  })
  it('the tiles less the companies counted twice add up to the total', () => {
    const t = companyTiles(rows)
    expect(t.customers + t.suppliers + t.primes + t.msps + t.notClassified + t.worksWithYou + t.notLinked - t.countedTwice).toBe(t.total)
  })
  it('a company that is both a customer and a supplier counts in both, and the page says so in one line', () => {
    expect(countedTwiceSays(1)).toBe('1 company holds two positions with you, such as customer and supplier, so it is counted under both.')
    expect(countedTwiceSays(3)).toBe('3 companies hold two positions with you, such as customer and supplier, so each is counted under both.')
  })
  it('a row with no position reads in words, never a bare dash', () => {
    expect(noPositionTile({ positions: [], notClassified: false })).toBe('WORKS_WITH_YOU')
    expect(NO_POSITION_WORDS.WORKS_WITH_YOU).toBe('Works with you, no position yet')
    expect(NO_POSITION_WORDS.NOT_LINKED).toBe('Not linked yet')
  })
})

describe('what the Companies list draws in each cell', () => {
  it('a typed domain is marked as typed by you, and a company with no domain reads "No domain yet"', () => {
    expect(domainCell({ domain: null, notedDomain: 'northwind-staffing.example' })).toEqual({ domain: 'northwind-staffing.example', note: 'typed by you' })
    expect(domainCell({ domain: null, notedDomain: null })).toEqual({ domain: null, note: 'No domain yet' })
    expect(domainCell({ domain: 'harborline-tech.example' })).toEqual({ domain: 'harborline-tech.example', note: null })
  })
  it('a company nobody there has joined reads "Not on Etyme" in its Etyme address, and a firm with a seat and no claim shows its address', () => {
    expect(addressCell({ slug: 'rivetstone', onEtyme: false })).toEqual({ slug: null, note: 'Not on Etyme' })
    expect(addressCell({ slug: 'harborline', onEtyme: true })).toEqual({ slug: 'harborline', note: null })
    expect(addressCell({ slug: '', onEtyme: true, notLinked: true })).toEqual({ slug: null, note: 'Not linked yet' })
  })
  it('the Domain column is the second column of the Companies list', () => {
    const page = read('src/app/dashboard/companies/page.tsx')
    const cols = page.slice(page.indexOf('const columns: Column<Company>[] = ['))
    const keys = [...cols.slice(0, cols.indexOf('\n  ]\n')).matchAll(/^\s{6}key: '([a-zA-Z]+)'/gm)].map((m) => m[1])
    expect(keys.slice(0, 3)).toEqual(['name', 'domain', 'slug'])
  })
  it('the list draws no bare dash under To you, Etyme address, Domain or Entity type', () => {
    const page = read('src/app/dashboard/companies/page.tsx')
    expect(page).not.toContain('<span className="text-etyme-faint">—</span>')
    expect(page).not.toContain("row.entityType ?? '—'")
  })
})

describe('every box the correction route asks for is on the Edit dialog', () => {
  const route = read('src/app/api/companies/[id]/record/route.ts')
  const page = read('src/app/dashboard/companies/page.tsx')
  const dialog = page.slice(page.indexOf('function EditRecord'), page.indexOf('function PositionsPanel'))
  it('the route reads the name, the domain and the entity type, and refuses without a name', () => {
    for (const box of ['name', 'domain', 'entityType']) expect(route).toContain(`body?.${box}`)
    expect(route).toContain("'Give the company’s name, at least two letters.', { field: 'name' }")
  })
  it('the dialog has a box for each and sends each of them on Save', () => {
    expect(dialog).toContain('label="Company name *"')
    expect(dialog).toContain('label="Domain"')
    expect(dialog).toContain('label="Entity type"')
    expect(dialog).toContain('JSON.stringify({ name: form.name, domain: form.domain, entityType: form.entityType })')
    expect(dialog).toContain('<form onSubmit={save} noValidate')
  })
  it('the dialog is drawn only where the route takes it, and says that saving emails nobody', () => {
    expect(page).toContain('{read.may.edit && <EditRecord')
    expect(dialog).toContain('{NEVER_EMAILS}')
  })
})
