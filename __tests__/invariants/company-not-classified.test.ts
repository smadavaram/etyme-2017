/**
 * A company recorded as "Company — not classified yet" (founder,
 * 2026-11-12, Tapin). Two facts, never one: the Kind is what a company
 * is; the position (Customer above us, Supplier below us, Prime, MSP) is
 * on the relationship record between the two firms. A firm written down
 * with no position is on the Companies list and nowhere else.
 *
 * Stage one is the schema, the rules and the routes. The screens and the
 * acceptance walk are stage two.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rolesFor, packFor, mayRegisterWithEmail } from '@/lib/company-defaults'
import { kindWord, kindLabel, otherFirmWord } from '@/lib/parties'
import { menuFor, getNavForKind } from '@/lib/nav-table'
import { createCompany } from '@/lib/company-create'

const root = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

describe('a company not classified yet is a record, never a reader', () => {
  it('the schema holds the kind as one more value, so no existing company changes', () => {
    const schema = read('prisma/schema.prisma')
    const kinds = schema.slice(schema.indexOf('enum CompanyKind {'), schema.indexOf('}', schema.indexOf('enum CompanyKind {')))
    for (const k of ['VENDOR', 'CLIENT', 'MSP', 'GSI', 'CONSULTANT_CORP', 'UNCLASSIFIED']) expect(kinds).toContain(k)
    // No column for a position on the company itself: a position lives on
    // the relationship record between two firms.
    const company = schema.slice(schema.indexOf('model Company {'), schema.indexOf('\n}', schema.indexOf('model Company {')))
    expect(company).not.toMatch(/\bposition\b|\brelationship\b\s+String/)
  })

  it('a company not classified yet has no roles, so nobody can be seated at it', () => {
    expect(rolesFor('UNCLASSIFIED')).toEqual([])
  })

  it('a company not classified yet reads as Company, never as Supplier or Consultant', () => {
    expect(kindWord('UNCLASSIFIED')).toBe('Company')
    expect(kindLabel('UNCLASSIFIED')).toBe('Company · Not classified yet')
    expect(otherFirmWord('UNCLASSIFIED')).toBe('company')
    for (const w of [kindWord('UNCLASSIFIED'), kindLabel('UNCLASSIFIED')]) {
      expect(w).not.toMatch(/Supplier|Consultant|Client/)
    }
  })

  it('no menu is built for a company not classified yet, because it has no seat', () => {
    expect(getNavForKind('UNCLASSIFIED', false)).toEqual([])
    expect(menuFor('UNCLASSIFIED', false).flatMap((g) => g.links ?? [])).toEqual([])
  })

  it('nobody registers a company of their own as not classified', () => {
    const v = mayRegisterWithEmail('UNCLASSIFIED', true)
    expect(v.ok).toBe(false)
    expect(v.says).toBe('Say what kind of company you are registering: a supplier, a client, an MSP, an integrator or your own one-person company.')
  })

  it('a company not classified yet carries the plain pack for its country, never an integrator’s', () => {
    expect(packFor('UNCLASSIFIED', 'US')).toBe('US_IT')
    expect(packFor('UNCLASSIFIED', 'IN')).toBe('IN_DELIVERY')
  })

  it('creating a company not classified yet with somebody seated as its owner is refused before anything is written', async () => {
    const nothing = new Proxy({}, { get: () => { throw new Error('nothing may be written') } })
    await expect(
      createCompany(
        { name: 'Rivermark Partners', kind: 'UNCLASSIFIED', slug: 'rivermark', domain: null, byPersonId: 'p1', seatAsOwner: true, claimDomain: false, startsSetup: false },
        nothing as any,
      ),
    ).rejects.toThrow('nobody is seated at it')
  })

  it('a record of a firm not on Etyme holds no domain, claims none, has no calendar and no words on a page', () => {
    const src = read('src/lib/company-create.ts')
    expect(src).toMatch(/const recordOnly = input\.kind === 'UNCLASSIFIED'/)
    expect(src).toMatch(/const domain = recordOnly \|\| isPlatformDomain/)
    expect(src).toMatch(/input\.claimDomain && domain && !recordOnly/)
    expect(src).toMatch(/!recordOnly && \(HOLIDAY_COUNTRIES/)
    expect(src).toMatch(/recordOnly\s*\n?\s*\? \{\}/)
  })
})
