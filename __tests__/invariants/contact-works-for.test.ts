import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  worksForFromEmail, worksForSays, emailDomain, savedWithCompanySays, savedSays, NEW_COMPANY_CHOICE,
  WORKS_FOR_MISSING, NEW_COMPANY_NAME_MISSING, CHECK_THE_NAME, type WorksAtBook,
} from '@/lib/contacts'
import { KIND_CHOICES, kindChoice, maySetRecordedKind } from '@/lib/counterparty'
import { seatedWhoMay, whoMaySays, notYourButton } from '@/lib/refusal-words'
import { CLIENT_PROGRAMS, SUPPLIER_SEATS, PROGRAM_OFFICE_SEATS, INTEGRATOR_SEATS } from '@/app/demo/seats'

/**
 * Add contact and Add a company, after the founder's firm pressed them on
 * 2026-11-14 (fix list items A1, A2 and A7; record 72). The box is "Works
 * for", asked straight after the email; the email's domain chooses the
 * company on the firm's own list, or names a new one she checks before
 * saving; and every Kind on Add a company says what it is.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const page = read('src/app/dashboard/contacts/page.tsx')
const modal = page.slice(page.indexOf('function AddContactModal'))
const route = read('src/app/api/contacts/route.ts')
const companiesPage = read('src/app/dashboard/companies/page.tsx')
const addCompany = companiesPage.slice(companiesPage.indexOf('function AddCompanyModal'), companiesPage.indexOf('// ── Company Detail Drawer'))

const book: WorksAtBook = {
  own: { id: 'me', name: 'Northwind Staffing', domain: 'northwind-staffing.example' },
  companies: [
    { id: 'h', name: 'Harborline Tech', domain: 'harborline-tech.example' },
    { id: 'a1', name: 'Alder Freight', domain: 'alder.example' },
    { id: 'a2', name: 'Alder Freight West', domain: 'west.alder.example' },
    { id: 'n', name: 'Quill Partners', domain: null },
  ],
  mayRecord: true,
  whoRecords: null,
}

describe('Add contact asks in the order a person says it', () => {
  it('Add contact asks Name, Email, Works for, Role and Title in that order, in one column, with Phone after them', () => {
    const at = (s: string) => { const i = modal.indexOf(s); expect(i, s).toBeGreaterThan(0); return i }
    const order = [
      at("{field('name', 'Name *'"),
      at("{field('email', 'Email'"),
      at('>Works for *</label>'),
      at('>Their role at that firm (optional)</label>'),
      at("{field('title', 'Title'"),
      at("{field('phone', 'Phone'"),
    ]
    expect([...order].sort((x, y) => x - y)).toEqual(order)
    // No two boxes share a row at any width.
    const form = modal.slice(modal.indexOf('<form onSubmit'))
    expect(form).not.toContain('sm:grid-cols-2')
  })

  it('no box on Add contact is called Works at', () => {
    expect(page).not.toContain('Works at')
    expect(route).not.toContain('Works at')
  })

  it('the refusal for a missing company says which company they work for, on the form and at the route', () => {
    expect(WORKS_FOR_MISSING).toBe('Say which company they work for.')
    expect(modal).toContain('p.atCompanyId = WORKS_FOR_MISSING')
    expect(route).toContain("message: WORKS_FOR_MISSING, field: 'atCompanyId'")
  })
})

describe('Works for is read from the email’s domain', () => {
  it('an email at a domain already on the Companies list chooses that company and says which domain matched', () => {
    const r = worksForFromEmail('dana.reyes@harborline-tech.example', book)
    expect(r).toEqual({ read: 'ONE', domain: 'harborline-tech.example', company: { id: 'h', name: 'Harborline Tech' } })
    expect(worksForSays(r, { ownName: 'Northwind Staffing', mayRecord: true }))
      .toBe('Chosen from the email: Harborline Tech uses harborline-tech.example. Choose another if that is wrong.')
  })

  it('an email at a mail subdomain of a listed company’s domain chooses that company', () => {
    expect(worksForFromEmail('ops@mail.harborline-tech.example', book)).toMatchObject({ read: 'ONE', company: { id: 'h' } })
  })

  it('two companies on one organization’s domain are both named, and neither is chosen for her', () => {
    const r = worksForFromEmail('sam@alder.example', book)
    expect(r).toEqual({ read: 'MANY', domain: 'alder.example', companies: [{ id: 'a1', name: 'Alder Freight' }, { id: 'a2', name: 'Alder Freight West' }] })
    expect(worksForSays(r, { ownName: 'Northwind Staffing', mayRecord: true }))
      .toBe('2 companies on your list use alder.example: Alder Freight, Alder Freight West. Choose the one they work for.')
    // The form picks nothing on MANY.
    expect(modal).not.toMatch(/r\.read === 'MANY'\) atCompanyId =/)
  })

  it('an email at a domain nobody on the list uses names a new company, which she sees and may correct before saving', () => {
    const r = worksForFromEmail('lee@kestrel-assembly.example', book)
    expect(r).toEqual({ read: 'NEW', domain: 'kestrel-assembly.example', name: 'Kestrel Assembly' })
    expect(worksForSays(r, { ownName: 'Northwind Staffing', mayRecord: true }))
      .toBe('No company on your list uses kestrel-assembly.example. Saving adds Kestrel Assembly to your Companies, not classified. Nobody is emailed.')
    expect(worksForSays(r, { ownName: 'Northwind Staffing', companyName: 'Kestrel Assembly Inc.', mayRecord: true }))
      .toContain('Saving adds Kestrel Assembly Inc. to your Companies')
    expect(CHECK_THE_NAME).toBe('Check the name before you save. It was read from the email’s domain.')
    expect(modal).toContain('>New company’s name *</label>')
    expect(modal).toContain('<option value={NEW_COMPANY_CHOICE}>')
    expect(NEW_COMPANY_CHOICE).toBe('new')
  })

  it('a new company’s name is read from the registered domain, never from a mail subdomain', () => {
    expect(worksForFromEmail('pat@mail.kestrel-assembly.example', book)).toMatchObject({ read: 'NEW', name: 'Kestrel Assembly' })
  })

  it('a company on the list with no domain is never matched by an email', () => {
    expect(worksForFromEmail('jo@quill.example', book)).toMatchObject({ read: 'NEW' })
  })

  it('an email at a personal mail domain infers no company and names none', () => {
    const r = worksForFromEmail('dana.reyes@gmail.com', book)
    expect(r).toEqual({ read: 'NOT_A_COMPANY', domain: 'gmail.com', platform: false })
    expect(worksForSays(r, { ownName: 'Northwind Staffing', mayRecord: true }))
      .toBe('gmail.com is a personal email domain, so it does not say where they work. Choose the company.')
  })

  it('an email at Etyme’s own domain infers no company', () => {
    const r = worksForFromEmail('partner@etyme.com', book)
    expect(r).toEqual({ read: 'NOT_A_COMPANY', domain: 'etyme.com', platform: true })
    expect(worksForSays(r, { ownName: 'Northwind Staffing', mayRecord: true }))
      .toBe("etyme.com is Etyme's own address, so it does not say where they work. Choose the company.")
  })

  it('an email at the firm’s own domain chooses the firm itself', () => {
    const r = worksForFromEmail('kim@northwind-staffing.example', book)
    expect(r).toEqual({ read: 'OWN', domain: 'northwind-staffing.example', id: 'me' })
    expect(worksForSays(r, { ownName: 'Northwind Staffing', mayRecord: true }))
      .toBe("Chosen from the email: northwind-staffing.example is your own firm's domain. Choose another if that is wrong.")
  })

  it('a firm with no domain of its own matches nothing for its own people', () => {
    expect(worksForFromEmail('kim@northwind-staffing.example', { ...book, own: { id: 'me', name: 'Northwind Staffing', domain: null } })).toMatchObject({ read: 'NEW' })
  })

  it('nothing is read until the email is a full address', () => {
    expect(worksForFromEmail('dana@', book)).toEqual({ read: 'NOTHING' })
    expect(worksForFromEmail('', book)).toEqual({ read: 'NOTHING' })
    expect(emailDomain('Dana@Harborline-Tech.Example')).toBe('harborline-tech.example')
  })

  it('a seat that may not add a company is told who may, and that it can still choose a company on its list', () => {
    const who = notYourButton('adding a company to your Companies list', ['Owner'])
    const r = worksForFromEmail('lee@kestrel-assembly.example', book)
    expect(worksForSays(r, { ownName: 'Northwind Staffing', mayRecord: false, whoRecords: who }))
      .toBe('No company on your list uses kestrel-assembly.example. Adding a company to your Companies list is for the Owner here. Ask them. You can still choose a company that is on your list.')
    // The new-company choice is offered only to a seat that may record one.
    expect(modal).toContain("{mayRecord && read.read === 'NEW' && (")
  })

  it('the form reads the email when she leaves the box, and on Save first if she never left it, so no company is named for her unseen', () => {
    expect(modal).toContain("{field('email', 'Email', 'name@company.example', 'email', false, () => readEmail(form.email))}")
    expect(modal).toContain('if (form.email.trim() !== readFor && !pickedByHand) {')
    expect(modal).toContain('if (next.atCompanyId !== form.atCompanyId || next.newCompanyName !== form.newCompanyName) return')
    // A choice made by hand is never overwritten by the email.
    expect(modal).toContain('if (pickedByHand) return from')
  })

  it('what she reads after a save that added a company says both, and that nothing was sent to anybody', () => {
    expect(savedWithCompanySays('Lee Park', 'Kestrel Assembly'))
      .toBe('Lee Park is in your Contacts at Kestrel Assembly. Kestrel Assembly was added to your Companies, not classified. Nothing was sent to anybody.')
    expect(savedSays('Lee Park', 'Harborline Tech')).toBe('Lee Park is in your Contacts at Harborline Tech. Nothing was sent to them.')
    expect(route).toContain('says: company ? savedWithCompanySays(name, company.name) : savedSays(name, atName),')
  })

  it('a new company with no name is refused in a sentence beside its box', () => {
    expect(NEW_COMPANY_NAME_MISSING).toBe('Give the new company’s name, at least two letters.')
    expect(route).toContain("message: NEW_COMPANY_NAME_MISSING, field: 'newCompanyName'")
  })
})

describe('Add contact adds the company through the one writer Add a company runs', () => {
  const companiesRoute = read('src/app/api/companies/route.ts')
  const record = read('src/app/api/companies/record.ts')

  it('both doors look before recording by one reader and write by one writer, so the twin rule and the log row cannot drift', () => {
    expect(companiesRoute).toContain('await lookBeforeRecording(seatedCaller, {')
    expect(route).toContain('await lookBeforeRecording(caller, { name: newName, domain: read.domain })')
    expect(companiesRoute).toContain('writeRecord(tx, caller, {')
    expect(route).toContain('await writeRecord(tx, caller, { name: newName, slug, domain: emailDomain(body?.email) })')
    expect(record).toContain("action: 'COMPANY_CREATED'")
    expect(record).toContain("kind: 'UNCLASSIFIED'")
    expect(record).toContain('const read = await twinFor(mine.id, { name: typed.name, domain: typed.domain })')
  })

  it('the company and the contact are written in one transaction, the company first, so a failure writes neither', () => {
    expect(route).toMatch(/prisma\.\$transaction\(async \(tx\) => \{[\s\S]*?await writeRecord\(tx,[\s\S]*?tx\.companyContact\.create[\s\S]*?action: 'CONTACT_RECORDED'/)
  })

  it('a seat that may not add a company is refused by the rule Add a company asks, logged before the reply', () => {
    const gate = route.slice(route.indexOf('async function mayAddWithContact'))
    expect(gate).toContain('mayRecordCompany({ seatedAt: { id: me.id, name: me.name }, permissions: caller.permissions })')
    expect(gate.indexOf('await recordRefusal(')).toBeLessThan(gate.indexOf("code: 'NOT_YOURS_TO_ADD'"))
  })

  it('a firm on Etyme she does not work with gets Add a company’s own answer, its one act to ask them to link, and no id, name or address', () => {
    expect(route).toContain('const says = onEtymeAskToLinkSays(EITHER_SIDE)')
    expect(route).toContain("return NextResponse.json({ error: { code: 'ALREADY_ON_ETYME', message: says, relationship: null } }, { status: 409 })")
    expect(modal).toContain('>Ask them to link</button>')
    expect(modal).toContain("body: JSON.stringify({ name: linkable.name, domain: linkable.domain, relationship: linkAs }),")
    expect(addCompany).toContain('<option value="SUPPLIER">as your supplier</option>')
    expect(modal).toContain('<option value="SUPPLIER">as your supplier</option>')
    expect(modal).toContain('<option value="CLIENT">as your customer</option>')
  })

  it('nothing in Add contact sends an email', () => {
    expect(route).not.toMatch(/sendEmail|emailSender|notify\(/)
  })
})

describe('every Kind on Add a company says what it is', () => {
  it('every Kind on Add a company says in one line what it is, and the line under the box follows the choice', () => {
    expect(KIND_CHOICES.map((k) => k.kind)).toEqual(['UNCLASSIFIED', 'VENDOR', 'CLIENT', 'MSP', 'GSI', 'CONSULTANT_CORP'])
    for (const k of KIND_CHOICES) {
      expect(k.means.length, k.kind).toBeGreaterThan(20)
      expect(k.means.split(/\s+/).length, k.kind).toBeLessThanOrEqual(15)
      expect(addCompany).toContain(`<option value="${k.kind}">`)
    }
    expect(addCompany).toContain('{kindChoice(form.kind).means}')
  })

  it('Add a company says Integrator and never GSI, and a contractor’s own company never reads "My own"', () => {
    expect(kindChoice('GSI').word).toBe('Integrator')
    expect(kindChoice('CONSULTANT_CORP').word).toBe('Own company — one person')
    expect(addCompany).not.toMatch(/>GSI</)
    expect(addCompany).not.toContain('My own')
    expect(companiesPage).toContain("case 'GSI': return 'Integrator'")
  })

  it('a Kind is never said in a position’s words', () => {
    for (const k of KIND_CHOICES) expect(k.word).not.toMatch(/^(Supplier|Customer)$/)
  })

  it('the sentence for setting a Kind calls a GSI an integrator', () => {
    const v = maySetRecordedKind({
      to: 'GSI',
      me: { id: 'me', name: 'Northwind Staffing' },
      permissions: ['vendors.manage'],
      other: { id: 'k', name: 'Kestrel Assembly', kind: 'UNCLASSIFIED', claimedAt: null, listedById: 'me', seats: 0 },
    })
    expect(v.ok && v.says).toContain('an integrator')
    expect(v.ok && v.says).not.toContain('GSI')
  })
})

describe('no example in a box names a real-looking company or person', () => {
  const placeholders = (src: string) => [...src.matchAll(/placeholder=(?:"([^"]*)"|\{'([^']*)'\})/g)].map((m) => m[1] ?? m[2])
  const fieldExamples = (src: string) => [...src.matchAll(/\{field\('[a-zA-Z]+', '[^']*', '([^']*)'/g)].map((m) => m[1])

  it('every example on Add a company, Edit and the drawer’s Add a contact describes the box and names nobody', () => {
    const seen = placeholders(companiesPage)
    expect(seen).toEqual(expect.arrayContaining(['Name as on their contract', 'company.example', 'their-address', 'First and last name', 'name@company.example']))
    for (const p of seen) expect(p).not.toMatch(/dana|whitfield|client\.example/i)
    // A domain in an example is always one nobody can register.
    for (const p of seen.filter((x) => /@|\.[a-z]{2,}$/.test(x))) expect(p).toMatch(/\.example$/)
  })

  it('no example on Add a company or Add contact names a firm the demo world holds', () => {
    // Read from the demo's own list, so no firm's name is typed in a test.
    const firms = [...CLIENT_PROGRAMS, ...SUPPLIER_SEATS, ...PROGRAM_OFFICE_SEATS, ...INTEGRATOR_SEATS].map((f) => f.name.toLowerCase())
    expect(firms.length).toBeGreaterThan(3)
    const seen = [...placeholders(companiesPage), ...placeholders(page), ...fieldExamples(modal)].map((x) => x.toLowerCase())
    for (const p of seen) for (const f of firms) expect(p.includes(f), `"${p}" names ${f}`).toBe(false)
  })

  it('every example on Add contact describes the box and names nobody', () => {
    const seen = [...placeholders(page), ...fieldExamples(modal)]
    expect(seen).toEqual(expect.arrayContaining(['First and last name', 'name@company.example', 'Name as on their contract']))
    for (const p of seen) expect(p).not.toMatch(/dana|whitfield|client\.example/i)
    // A domain in an example is always one nobody can register.
    for (const p of seen.filter((x) => /@|\.[a-z]{2,}$/.test(x))) expect(p).toMatch(/\.example$/)
  })
})

describe('a sentence names only the seats the firm has filled', () => {
  const mayActivate = ['Resource Manager', 'Contract Manager']

  it('where no role that may is seated and no Admin is seated, the sentence names the Owner alone', () => {
    const names = seatedWhoMay(mayActivate, ['Owner', 'HR', 'Account Manager'])
    expect(names).toEqual(['Owner'])
    expect(notYourButton('recording a placement', names)).toBe('Recording a placement is for the Owner here. Ask them.')
  })

  it('a firm whose first person has not proved ownership yet, with only an Admin seated, names the Admin alone', () => {
    const names = seatedWhoMay(mayActivate, ['Admin', 'Recruiter'])
    expect(names).toEqual(['Admin'])
    expect(whoMaySays(names)).toBe('an Admin')
  })

  it('where both the Owner and an Admin are seated, both are named', () => {
    expect(seatedWhoMay(mayActivate, ['Owner', 'Admin', 'HR'])).toEqual(['Owner', 'Admin'])
  })

  it('where the seats are not known, the sentence names the Owner, never a seat it cannot see', () => {
    expect(seatedWhoMay(mayActivate, [])).toEqual(['Owner'])
  })
})
