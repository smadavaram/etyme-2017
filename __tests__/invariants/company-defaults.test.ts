import { describe, it, expect } from 'vitest'
import { PERMISSIONS } from '@/lib/permissions'
import {
  rolesFor,
  packFor,
  countryFromDomain,
  defaultsFor,
  type CompanyKind,
} from '@/lib/company-defaults'

/**
 * A company signing up used to receive one row and one role called Owner.
 * No cycle calendar, so nothing was ever due. No holidays, so business-day
 * shifting only avoided weekends. One role, so the access screen offered a
 * new colleague total control or nothing at all.
 *
 * These tests hold the shape of what it gets instead.
 */

const KINDS: CompanyKind[] = ['VENDOR', 'CLIENT', 'MSP', 'GSI', 'CONSULTANT_CORP']

describe('the roles a company starts with', () => {
  it('gives every kind of company exactly one owner role', () => {
    for (const kind of KINDS) {
      const owners = rolesFor(kind).filter((r) => r.isOwner)
      expect(owners, kind).toHaveLength(1)
    }
  })

  it('gives the owner every permission, because somebody has to be able to grant the rest', () => {
    for (const kind of KINDS) {
      const owner = rolesFor(kind).find((r) => r.isOwner)!
      expect(new Set(owner.permissions), kind).toEqual(new Set(PERMISSIONS))
    }
  })

  it('never invents a permission that does not exist', () => {
    // A role naming a permission nobody checks is a role that silently
    // grants nothing, and it looks identical to one that works.
    const known = new Set<string>(PERMISSIONS)
    for (const kind of KINDS) {
      for (const role of rolesFor(kind)) {
        for (const p of role.permissions) {
          expect(known.has(p), `${kind}/${role.name}: ${p}`).toBe(true)
        }
      }
    }
  })

  it('gives a company more than one role to hand out, which is the whole point', () => {
    for (const kind of KINDS) {
      if (kind === 'CONSULTANT_CORP') continue // a one-person company is one role
      expect(rolesFor(kind).length, kind).toBeGreaterThan(1)
    }
  })

  it('describes every role in words the person holding it would recognise', () => {
    for (const kind of KINDS) {
      for (const role of rolesFor(kind)) {
        expect(role.blurb.length, `${kind}/${role.name}`).toBeGreaterThan(10)
      }
    }
  })

  it('gives a client hiring manager no power to choose which suppliers see their requisition', () => {
    // Routing work to a chosen supplier is the oldest way to bend a
    // programme. Raising the requisition is the manager's job; deciding who
    // competes for it is not.
    const hm = rolesFor('CLIENT').find((r) => r.name === 'Hiring Manager')!
    expect(hm.permissions).toContain('requirements.write')
    expect(hm.permissions).not.toContain('requirements.distribute')
  })

  it('lets an AP clerk record a payment but never change a rate', () => {
    // An invoice failing the price check is a contract amendment somebody
    // must approve, not a number this desk can quietly correct.
    for (const kind of ['CLIENT', 'MSP'] as CompanyKind[]) {
      const ap = rolesFor(kind).find((r) => r.name === 'AP Clerk')!
      expect(ap.permissions, kind).toContain('payments.record')
      expect(ap.permissions, kind).not.toContain('rates.write')
    }
  })

  it('keeps a recruiter from seeing what anybody costs', () => {
    // The single exclusion that stops a bench total being worked backwards
    // into somebody's salary.
    const r = rolesFor('VENDOR').find((x) => x.name === 'Recruiter')!
    expect(r.permissions).not.toContain('consultants.cost')
    expect(r.permissions).not.toContain('margin.read')
    expect(r.permissions).not.toContain('pnl.read')
  })

  it('gives only the owner and the programme manager the power to edit the rules', () => {
    // Whoever writes the approval chain decides what everyone else needs
    // permission for. That belongs to fewer people than settings.manage.
    const writers = rolesFor('CLIENT').filter((r) => r.permissions.includes('governance.write'))
    expect(writers.map((r) => r.name).sort()).toEqual(['Owner', 'Programme Manager'])
  })

  it('gives a client roles that make sense at a client, not at a staffing firm', () => {
    const names = rolesFor('CLIENT').map((r) => r.name)
    expect(names).toContain('Hiring Manager')
    expect(names).not.toContain('Recruiter')
  })

  it('gives a supplier roles that make sense at a staffing firm', () => {
    const names = rolesFor('VENDOR').map((r) => r.name)
    expect(names).toContain('Recruiter')
    expect(names).not.toContain('Hiring Manager')
  })

  it('gives a GSI both sides, because it supplies and buys in the same week', () => {
    const names = rolesFor('GSI').map((r) => r.name)
    expect(names).toContain('Recruiter')
    expect(names).toContain('Supplier Manager')
    expect(names).toContain('Delivery Manager')
  })

  it('never gives two roles the same name', () => {
    for (const kind of KINDS) {
      const names = rolesFor(kind).map((r) => r.name)
      expect(new Set(names).size, kind).toBe(names.length)
    }
  })
})

describe('choosing a template pack', () => {
  it('gives an Indian company the India delivery calendar, which includes the GST return', () => {
    expect(packFor('VENDOR', 'IN')).toBe('IN_DELIVERY')
  })

  it('gives a UK company the UK pack', () => {
    expect(packFor('VENDOR', 'GB')).toBe('UK')
    expect(packFor('VENDOR', 'UK')).toBe('UK')
  })

  it('gives a US delivery partner the ERP pack, because SAP programmes bill differently', () => {
    expect(packFor('GSI', 'US')).toBe('US_SAP')
  })

  it('falls back to US IT staffing when nothing is known', () => {
    expect(packFor('VENDOR', null)).toBe('US_IT')
  })
})

describe('guessing the country from the email domain', () => {
  it('reads a country from the domain suffix', () => {
    expect(countryFromDomain('infosys.in')).toBe('IN')
    expect(countryFromDomain('example.ca')).toBe('CA')
  })

  it('handles a two-part suffix, so a UK company is not read as a US one', () => {
    expect(countryFromDomain('terumobct.co.uk')).toBe('GB')
    expect(countryFromDomain('example.co.in')).toBe('IN')
  })

  it('treats a bare .co domain as US, because it is a vanity suffix and not Colombia', () => {
    expect(countryFromDomain('cloudepa.co')).toBe('US')
  })

  it('defaults to US when there is no domain at all', () => {
    expect(countryFromDomain(null)).toBe('US')
  })
})

describe('the whole starting kit', () => {
  it('gives a US vendor a pack, a holiday calendar, roles and a location', () => {
    const d = defaultsFor('VENDOR', 'Cloudepa Inc.', 'cloudepa.com')
    expect(d.templatePack).toBe('US_IT')
    expect(d.country).toBe('US')
    expect(d.seedHolidays).toBe(true)
    expect(d.roles.length).toBeGreaterThan(1)
    expect(d.primaryLocationName).toContain('Cloudepa Inc.')
  })

  it('seeds the right country’s calendar, not America’s', () => {
    // An Indian company used to get no calendar at all, so every cycle
    // date was computed against weekends only. It now gets India's three
    // national days — the rest of that calendar is state and religion
    // specific and moves each year, so guessing it would put confident
    // wrong dates in front of somebody who would trust them.
    const d = defaultsFor('GSI', 'Infosys', 'infosys.in')
    expect(d.country).toBe('IN')
    expect(d.seedHolidays).toBe(true)
    expect(d.templatePack).toBe('IN_DELIVERY')
  })

  it('seeds nothing for a country with no calendar, rather than the wrong one', () => {
    // Seeding another country's public holidays is worse than seeding
    // none: the dates look deliberate and nobody checks them again.
    const d = defaultsFor('VENDOR', 'Muster GmbH', 'muster.de')
    expect(d.country).toBe('DE')
    expect(d.seedHolidays).toBe(false)
  })
})
