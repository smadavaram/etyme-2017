import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  worksAtChoices, mayWorkAt, rolesOffered, kindsHeld, contactRecordedLog, memberElsewhereSays, problems,
  ownFirmChoice, NOT_ON_YOUR_LIST_SAYS, ADD_A_COMPANY_HREF, OWN_FIRM_KIND,
} from '@/lib/contacts'
import { decidedBy, kindOf } from '@/lib/autonomy'

/**
 * Contacts, after the founder's firm pressed it on 2026-11-14 (record 72,
 * items H1, A2, B4, H2, B6). A firm can add its own people; Works for
 * offers what the Companies list holds, read by one reader; Contacts is
 * people; the role is optional; and adding a contact is on the activity log.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const page = read('src/app/dashboard/contacts/page.tsx')
const route = read('src/app/api/contacts/route.ts')
const modal = page.slice(page.indexOf('function AddContactModal'))

const book = {
  own: { id: 'me', name: 'Northwind Staffing' },
  companies: [
    { id: 'h1', name: 'Harborline Tech', domain: 'harborline-tech.example' },
    { id: 'h2', name: 'Harborline Tech', domain: null },
    { id: 'a', name: 'Alder Freight', domain: null },
  ],
}

describe('a firm can add its own people as contacts', () => {
  it('Works for offers the firm’s own name first, marked as its own firm', () => {
    const choices = worksAtChoices(book)
    expect(choices[0]).toEqual({ id: 'me', name: 'Northwind Staffing (your own firm)', own: true })
    expect(ownFirmChoice('Northwind Staffing')).toBe('Northwind Staffing (your own firm)')
    expect(choices.filter((c) => c.own)).toHaveLength(1)
  })

  it('the firm’s own name is never offered twice, even where the list somehow holds it', () => {
    const choices = worksAtChoices({ ...book, companies: [...book.companies, { id: 'me', name: 'Northwind Staffing', domain: null }] })
    expect(choices.filter((c) => c.id === 'me')).toHaveLength(1)
  })

  it('the route takes a contact at the firm’s own firm, and at any company on its list, and at nothing else', () => {
    expect(mayWorkAt(book, 'me')).toBe(true)
    expect(mayWorkAt(book, 'h2')).toBe(true)
    expect(mayWorkAt(book, 'somebody-else')).toBe(false)
  })

  it('choosing the own firm starts the role on Team member, and leaving it puts the role back on Other', () => {
    expect(OWN_FIRM_KIND).toBe('MEMBER')
    expect(modal).toContain("return own ? (kind === 'OTHER' ? OWN_FIRM_KIND : kind) : kind === OWN_FIRM_KIND ? 'OTHER' : kind")
  })

  it('under the own firm one quiet line says a colleague gets no login, with links only where the reader’s seat opens the page', () => {
    expect(modal).toContain('Saving a colleague here gives them no login and sends them nothing.')
    expect(modal).toContain('const mayInvite = mayOpen(USERS_HREF, permissions)')
    expect(modal).toContain("const mayAddCandidate = paysPeople && mayOpen(ADD_CANDIDATE_HREF, permissions)")
    expect(modal).toContain('{mayInvite && <> A colleague who needs a login is invited under')
    expect(modal).toContain('{mayAddCandidate && <> A person you pay is added under')
  })
})

describe('Works for and the route read one list', () => {
  it('every company on the list is offered once, sorted by name, and two of one name are told apart by their domain', () => {
    expect(worksAtChoices(book).slice(1).map((c) => c.name)).toEqual([
      'Alder Freight',
      'Harborline Tech (harborline-tech.example)',
      'Harborline Tech (no domain yet)',
    ])
  })

  it('the picker and the route ask the same reader, which is the Companies list’s own', () => {
    expect(route).toContain('worksAt: await worksAtBook(caller)')
    expect(route).toContain('const book = await worksAtBook(caller)')
    expect(route).toContain('if (!adding && !mayWorkAt(book, atCompanyIdTyped)) {')
    const reader = read('src/app/api/contacts/works-at.ts')
    expect(reader).toContain('await companiesOnList(caller, false, true)')
    expect(read('src/app/api/companies/route.ts')).toContain('await companiesOnList(caller, verdict.includesOwn, withRecords)')
    expect(route).not.toContain('dealingsOf')
  })

  it('a company that is not on your list is refused in a sentence that links to Add a company', () => {
    expect(NOT_ON_YOUR_LIST_SAYS).toBe('That company is not on your Companies list. Add it there first, then add the people you know at it.')
    expect(ADD_A_COMPANY_HREF).toBe('/dashboard/companies?new=1')
  })
})

describe('Contacts is people', () => {
  it('the Contacts page draws no second list of companies, and links to Companies instead', () => {
    expect(page).not.toContain('No counterparties yet')
    expect(page).not.toContain("fetch('/api/counterparties')")
    expect(page).not.toContain('contacts-companies')
    expect(page).toContain('<Link href={COMPANIES_HREF} className="text-[13px] text-etyme-action">Companies</Link>')
  })

  it('the role filter lists only roles somebody on the list holds, in the table’s order', () => {
    expect(kindsHeld([{ kind: 'OTHER' }, { kind: 'AP' }, { kind: 'AP' }]).map((k) => k.label)).toEqual(['Accounts payable', 'Other'])
    expect(kindsHeld([])).toEqual([])
    expect(page).toContain('...(contacts.held ?? []).map(')
  })

  it('Team member is offered as a role only when the own firm is chosen', () => {
    expect(rolesOffered(false).map((k) => k.label)).not.toContain('Team member')
    expect(rolesOffered(false).map((k) => k.label)).toContain('Other')
    expect(rolesOffered(true).map((k) => k.label)).toContain('Team member')
    expect(modal).toContain('const kinds = rolesOffered(atOwnFirm)')
  })

  it('a Team member at another company is refused in a sentence that says what to pick instead', () => {
    expect(memberElsewhereSays('Harborline Tech')).toBe('Team member is for somebody at your own firm. Pick their role at Harborline Tech, or leave it on Other.')
    expect(route).toContain("if (contactKindOf(body?.kind) === 'MEMBER' && !atOwnFirm) {")
  })
})

describe('the role is optional', () => {
  it('a contact with no role, or a blank one, raises no problem', () => {
    expect(problems({ name: 'Dana Whitfield', email: 'dana@harborline-tech.example' })).toEqual([])
    expect(problems({ name: 'Dana Whitfield', email: 'dana@harborline-tech.example', kind: '' })).toEqual([])
  })

  it('a role that is a word the table does not hold is refused, even one every object answers to', () => {
    expect(problems({ name: 'Dana Whitfield', email: 'dana@harborline-tech.example', kind: 'toString' })).toHaveLength(1)
  })
})

describe('adding a contact is on the activity log', () => {
  it('the row says who added whom at which company, that nothing was sent, and that it cannot be undone', () => {
    const at = contactRecordedLog({ byName: 'Priya Raman', name: 'Dana Whitfield', atName: 'Harborline Tech', ownFirm: false })
    expect(at.summary).toBe('Priya Raman added Dana Whitfield at Harborline Tech to Contacts')
    expect(at.reason).toBe('Added by hand to this company’s own contacts. Nothing was sent to them.')
    expect(at.reversible).toBe(false)
    const own = contactRecordedLog({ byName: 'Priya Raman', name: 'Sam Ortiz', atName: 'Northwind Staffing', ownFirm: true })
    expect(own.reason).toBe('Added by hand as a colleague at this firm. Nothing was sent to them, and it gives them no login.')
  })

  it('the row is a person’s own act, attributed by rule', () => {
    expect(kindOf('CONTACT_RECORDED')).toBe('ATTRIBUTED')
    expect(decidedBy('CONTACT_RECORDED').by).toBe('RULE')
  })

  it('the contact and its row are written in one transaction', () => {
    expect(route).toMatch(/prisma\.\$transaction\(async \(tx\) => \{[\s\S]*?const made = await tx\.companyContact\.create[\s\S]*?await tx\.automationLog\.create\(\{[\s\S]*?action: 'CONTACT_RECORDED'/)
  })

  it('the activity log files the row under Contacts, and the company’s drawer reads it in its history', () => {
    expect(read('src/app/dashboard/automation/page.tsx')).toContain("if (action.startsWith('CONTACT')) return 'Contacts'")
    expect(read('src/app/api/companies/positions.ts')).toContain("'COMPANY_RECORD_EDITED', 'CONTACT_RECORDED']")
  })
})
