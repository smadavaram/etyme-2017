/**
 * The company of one.
 *
 * A self-employed consultant or a one-employee vendor is the easiest
 * firm this product can serve: existing work in hand, nothing to
 * migrate, nobody to convince. The schema anticipated them —
 * CONSULTANT_CORP has been a company kind from the start — and then
 * three doors were shut in their face:
 *
 *   the registration route did not accept the kind at all,
 *   a personal email was refused outright, and
 *   every company got the same seven vendor roles regardless of kind,
 *   because rolesFor() existed, was tested, and was never called.
 *
 * Adding an enum is not building a feature. These tests hold the door
 * open.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mayRegisterWithEmail, rolesFor } from '@/lib/company-defaults'

describe('A one-person consulting corporation registers on any email', () => {

  it('gmail is enough, because a consultant corp claims no domain', () => {
    const v = mayRegisterWithEmail('CONSULTANT_CORP', true)
    expect(v.ok).toBe(true)
    expect(v.says).toContain('claims no domain')
  })

  it('a vendor still needs a work email, because a vendor claims one', () => {
    expect(mayRegisterWithEmail('VENDOR', true).ok).toBe(false)
    expect(mayRegisterWithEmail('CLIENT', true).ok).toBe(false)
  })

  it('the refusal points a solo person at the door that is open', () => {
    // Somebody refused with no alternative just leaves. The message
    // names the kind that works with any email.
    expect(mayRegisterWithEmail('VENDOR', true).says).toContain('one-person')
  })

  it('a work email registers anything', () => {
    for (const k of ['VENDOR', 'CLIENT', 'MSP', 'GSI', 'CONSULTANT_CORP'] as const) {
      expect(mayRegisterWithEmail(k, false).ok, k).toBe(true)
    }
  })
})

describe('A company of one is not staffed like a company of forty', () => {

  it('a consultant corp starts with one role that runs it, Owner, and no staff desks', () => {
    // Member is the seat anybody arriving on a claimed domain is given at
    // once (founder, 2026-10-07) — their own work only, no desk at all —
    // so it is the one other role every kind carries.
    const roles = rolesFor('CONSULTANT_CORP')
    expect(roles.map((r) => r.name)).toEqual(['Owner', 'Member'])
    expect(roles[0].name).toBe('Owner')
  })

  it('and that role says what it means in one sentence', () => {
    expect(rolesFor('CONSULTANT_CORP')[0].blurb).toBe('Everything. It is your company.')
  })
})

describe('The registration route actually opens these doors', () => {

  // Route logic has no database harness, so these pin the source the way
  // the positioning tests pin the home page: the claims must be present
  // in the code that runs, not only in a library nothing calls.
  const ROUTE = readFileSync(join(process.cwd(), 'src/app/api/companies/route.ts'), 'utf8')

  it('the route accepts CONSULTANT_CORP as a kind', () => {
    expect(ROUTE).toContain("'VENDOR', 'CLIENT', 'MSP', 'GSI', 'CONSULTANT_CORP'")
  })

  it('the personal-email rule comes from the tested function, not folklore', () => {
    expect(ROUTE).toContain('mayRegisterWithEmail(kind, personalEmail)')
  })

  it('a personal email never becomes a verified company domain', () => {
    // gmail.com recorded as domainVerified would be a lie the whole
    // identity model then repeats.
    // The route passes no domain for a personal email, and the one
    // creation function marks a domain verified only where there is one.
    const CREATE = readFileSync(join(process.cwd(), 'src/lib/company-create.ts'), 'utf8')
    expect(ROUTE).toContain('personalEmail || !adding.ownsIt ? null :')
    expect(CREATE).toContain('domainVerified: input.domain !== null')
  })

  it('the owner of a consultant corp is created as its consultant, listed on their own bench', () => {
    // Otherwise they register and face an Add consultant form asking
    // about themselves in the third person.
    expect(ROUTE).toContain('consultantProfile.upsert')
    expect(ROUTE).toContain('benchListing.create')
  })

  it('roles are seeded per kind rather than seven vendor roles for everybody', () => {
    // Through the one creation function first sign-in uses (2026-10-07).
    const CREATE = readFileSync(join(process.cwd(), 'src/lib/company-create.ts'), 'utf8')
    expect(ROUTE).toContain('createCompany(')
    expect(ROUTE).not.toContain('const DEFAULT_ROLES')
    expect(CREATE).toContain('rolesFor(input.kind)')
  })
})
