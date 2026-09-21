/**
 * The rolodex: people at counterparties, with no login and no seat.
 *
 * The audit put the gap plainly: you could record that Wipro exists and
 * not who at Wipro answers the phone. A staffing business is a rolodex
 * with invoicing attached, and this is the rolodex.
 */

import { describe, it, expect } from 'vitest'
import {
  KINDS, problems, alreadyOnFile, claimMatches, normalEmail, normalPhone, kindOfRole,
} from '@/lib/contacts'
import { rolesFor } from '@/lib/company-defaults'

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
    { id: 'c1', name: 'Dana Whitfield', email: 'dana@talvern.example', personId: null },
    { id: 'c2', name: 'Old Entry', email: 'dana@talvern.example', personId: 'already-linked' },
    { id: 'c3', name: 'Somebody Else', email: 'other@talvern.example', personId: null },
  ]

  it('matches on the exact email they signed in with, nothing fuzzier', () => {
    // Linking the wrong contact hands one tenant's notes about a person
    // to a different person.
    const m = claimMatches('Dana@Talvern.Example', contacts)
    expect(m.map((x) => x.contactId)).toEqual(['c1'])
  })

  it('links, never merges — the notes stay the rolodex owner’s', () => {
    expect(claimMatches('dana@talvern.example', contacts)[0].says).toContain('Linked, not merged')
  })

  it('leaves an already-linked entry alone', () => {
    expect(claimMatches('dana@talvern.example', contacts).map((x) => x.contactId)).not.toContain('c2')
  })
})

describe('Normalization is boring on purpose', () => {

  it('emails compare lowercased and trimmed', () => {
    expect(normalEmail(' Dana@Talvern.EXAMPLE ')).toBe('dana@talvern.example')
  })

  it('phones compare as digits, so formatting never makes two of one number', () => {
    expect(normalPhone('(303) 555-0100')).toBe(normalPhone('303.555.0100'))
  })

  it('six digits is not a phone number', () => {
    expect(normalPhone('123456')).toBeNull()
  })
})

/**
 * ── The chips that filed five of six desks wrong ─────────────────────
 *
 * The browser walk of 2026-09-21 opened Contacts as Vertex Global and
 * read Cavanaugh Glassworks' desks back: its **Compliance Officer** and
 * its **HR Partner** chipped "Delivery", its **Owner** chipped "Hiring
 * manager", its **Approver** and its **Program Manager** both chipped
 * "Executive". One set of regular expressions was answering for every
 * kind of firm, and the pattern that catches a delivery manager also
 * catches "compliance" and "hr".
 *
 * Every seeded role of every kind of company now has its chip asserted
 * here, read off `rolesFor` rather than typed out, so a role added to
 * `lib/company-defaults` with no chip fails on the commit that adds it.
 */
describe('a desk at another firm is filed under the desk it actually is', () => {
  const chip = (role: string, kind: string) => KINDS[kindOfRole(role, kind)].label

  it('a client’s compliance officer is Compliance, not Delivery', () => {
    expect(chip('Compliance Officer', 'CLIENT')).toBe('Compliance')
  })

  it('a client’s HR partner is HR, not Delivery', () => {
    expect(chip('HR Partner', 'CLIENT')).toBe('HR')
  })

  it('a client’s program manager is the program office, not an executive', () => {
    expect(chip('Program Manager', 'CLIENT')).toBe('Program office')
  })

  it('a client’s hiring manager is the hiring manager and its owner is not', () => {
    expect(chip('Hiring Manager', 'CLIENT')).toBe('Hiring manager')
    expect(chip('Owner', 'CLIENT')).toBe('Executive')
  })

  it('a client’s AP clerk pays us and a supplier’s AR desk bills us', () => {
    expect(chip('AP Clerk', 'CLIENT')).toBe('Accounts payable')
    expect(chip('Accounts Receivable', 'VENDOR')).toBe('Billing')
  })

  it('an account manager is the relationship, never accounts payable', () => {
    // CLAUDE.md records this one by name: "the mapping bug that filed an
    // account manager under Accounts payable".
    expect(chip('Account Manager', 'VENDOR')).toBe('Executive')
  })

  it('a supplier’s HR keeps its own people’s paperwork and is filed as HR', () => {
    expect(chip('HR', 'VENDOR')).toBe('HR')
  })

  it('a supplier’s contract manager is who you call about the agreement', () => {
    expect(chip('Contract Manager', 'VENDOR')).toBe('Procurement')
  })

  it('a program office’s supplier manager is procurement and its coordinator is recruiting', () => {
    expect(chip('Supplier Manager', 'MSP')).toBe('Procurement')
    expect(chip('Coordinator', 'MSP')).toBe('Recruiting')
  })

  it('every seeded role at every kind of company gets a chip that is not the catch-all', () => {
    const missing: string[] = []
    for (const kind of ['VENDOR', 'CLIENT', 'MSP', 'GSI', 'CONSULTANT_CORP'] as const) {
      for (const role of rolesFor(kind)) {
        // Viewer is deliberately the catch-all: somebody who reads the
        // program and changes nothing is not a desk you call about
        // anything.
        if (role.name === 'Viewer') continue
        if (kindOfRole(role.name, kind) === 'OTHER') missing.push(`${kind}: ${role.name}`)
      }
    }
    expect(missing, `these desks are filed as "Contact":\n  ${missing.join('\n  ')}`).toEqual([])
  })

  it('a title somebody typed by hand still gets a sensible chip', () => {
    expect(chip('VP of Engineering', 'CLIENT')).toBe('Executive')
    expect(chip('Accounts Payable Supervisor', 'CLIENT')).toBe('Accounts payable')
    expect(chip('Compliance Analyst', 'VENDOR')).toBe('Compliance')
    expect(chip('', 'VENDOR')).toBe('Contact')
  })
})
