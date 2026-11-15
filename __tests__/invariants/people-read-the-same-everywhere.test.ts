import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { grantSaid } from '@/app/api/settings/grants/says'
import { whoOptionLabel } from '@/components/settings/give-access'
import { personOption } from '@/app/dashboard/settings/owners/view'
import { signUpPersonName } from '@/app/api/onboarding/person-name'
import { footerRole, seatCrumb } from '@/components/shell/sidebar-props'
import { defaultModeSays, joinSentence, type JoinFacts } from '@/lib/join-words'
import { modeSays } from '@/lib/identity/policy'
import { siteAddressLine } from '@/lib/site-rules'
import { NO_ROLE_LABEL, NO_ROLE_SEES } from '@/lib/access-grant'
import { groupMappedSays, seatedAsWords } from '@/lib/identity/screen-words'
import { roleInWords } from '@/lib/team-structure/screen'
import { hatsFor } from '@/lib/nav-table'

/**
 * One person reads the same on every screen that names them (fix list,
 * 2026-11-15, findability and access): a grant to somebody invited says
 * when it starts; the pickers say who is invited, waiting or paused, and
 * print the address beside the name; a firm's first person is not named
 * after the firm; the account menu says "No role yet" where Users &
 * permissions does; Settings → Sign-in says which default applies; and a
 * site's address is printed with its ZIP.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('the sentence a grant is confirmed in', () => {
  it('a grant to somebody who has signed in says they may now do it', () => {
    expect(grantSaid({ holderName: 'Dana Whitlock', doWhat: 'read margin', scopeWords: 'for the whole company' }))
      .toBe('Dana Whitlock may now read margin for the whole company.')
  })

  it('a grant to somebody invited and never signed in says they may do it once they sign in, with the address they were invited on', () => {
    expect(grantSaid({ holderName: 'Pat Kim', doWhat: 'read margin', scopeWords: 'for the whole company', invited: true, invitedAs: 'pat@northwind-staffing.example' }))
      .toBe('Pat Kim may read margin for the whole company once they sign in with pat@northwind-staffing.example.')
  })

  it('a grant to somebody invited with no address kept still says it starts once they sign in', () => {
    expect(grantSaid({ holderName: 'Pat Kim', doWhat: 'read margin', scopeWords: 'for the whole company', invited: true, invitedAs: null }))
      .toBe('Pat Kim may read margin for the whole company once they sign in.')
  })

  it('the grants route asks whether the person has signed in by the rule the WHO list reads, and words the answer through the one sentence', () => {
    const route = read('src/app/api/settings/grants/route.ts')
    expect(route).toContain('hasSignedIn({ invitedAt: seat.invitedAt, lastUsedAt: seat.lastUsedAt, everSignedIn: seat.person.credentials.length > 0 })')
    expect(route).toContain('const said = grantSaid(')
    expect(route).not.toMatch(/may now \$\{labelOf/)
  })
})

describe('the WHO picker on Give access', () => {
  it('each person reads with their role and their state: invited, paused, or no role yet for somebody signed in with no role', () => {
    expect(whoOptionLabel({ name: 'Pat Kim', roleName: 'Recruiter', state: 'INVITED' })).toBe('Pat Kim · Recruiter · invited')
    expect(whoOptionLabel({ name: 'Sam Ortiz', roleName: 'HR', state: 'PAUSED' })).toBe('Sam Ortiz · HR · paused')
    expect(whoOptionLabel({ name: 'Lee Okafor', roleName: null, state: 'WAITING_FOR_ROLE' })).toBe(`Lee Okafor · ${NO_ROLE_LABEL}`)
    expect(whoOptionLabel({ name: 'Dana Whitlock', roleName: 'Owner', state: 'WITH_ACCESS' })).toBe('Dana Whitlock · Owner')
  })

  it('the Give access picker shows a person holding the Member role as No role yet', () => {
    expect(whoOptionLabel({ name: 'Tomas Reyes', roleName: 'Member', state: 'WITH_ACCESS' })).toBe('Tomas Reyes · No role yet')
    expect(whoOptionLabel({ name: 'Tomas Reyes', roleName: 'Member', state: 'INVITED' })).toBe('Tomas Reyes · No role yet · invited')
    expect(whoOptionLabel({ name: 'Tomas Reyes', roleName: 'Member', state: 'WITH_ACCESS' })).not.toContain('Member')
  })
})

describe('Settings, Owners', () => {
  it('a person in either picker reads with the address they sign in with, so two records of one person can be told apart', () => {
    expect(personOption({ name: 'Dana Whitlock', email: 'dana@northwind-staffing.example', role: 'Admin' })).toBe('Dana Whitlock · dana@northwind-staffing.example · Admin')
    expect(personOption({ name: 'Northwind Staffing', email: 'dana@northwind-staffing.example', you: true })).toBe('Northwind Staffing · dana@northwind-staffing.example (you)')
    expect(personOption({ name: 'dana@northwind-staffing.example', email: 'dana@northwind-staffing.example' })).toBe('dana@northwind-staffing.example')
  })

  it('the Owners list prints each Owner’s address under the name, and both pickers word each person through the one label', () => {
    const page = read('src/app/dashboard/settings/owners/page.tsx')
    expect(page).toContain('{o.email}</span>')
    expect(page.match(/personOption\(o\)/g)).toHaveLength(2)
  })
})

describe('the name a firm’s first person is given at sign-up', () => {
  it('the company’s own name typed in the form never names the person: the first part of the address stands in', () => {
    expect(signUpPersonName('Northwind Staffing', 'dana@northwind-staffing.example', 'Northwind Staffing')).toBe('dana')
    expect(signUpPersonName('northwind  staffing', 'dana@northwind-staffing.example', 'Northwind Staffing')).toBe('dana')
  })

  it('a role word is never a person’s name either', () => {
    expect(signUpPersonName('HR', 'hradmin@northwind-staffing.example', 'Northwind Staffing')).toBe('hradmin')
    expect(signUpPersonName('AP & Payroll', 'pay@northwind-staffing.example', null)).toBe('pay')
  })

  it('a real name is kept, and nothing typed falls back to the address', () => {
    expect(signUpPersonName('Dana Whitlock', 'dana@northwind-staffing.example', 'Northwind Staffing')).toBe('Dana Whitlock')
    expect(signUpPersonName('', 'dana@northwind-staffing.example', 'Northwind Staffing')).toBe('dana')
    expect(signUpPersonName(undefined, 'dana@northwind-staffing.example', null)).toBe('dana')
  })

  it('the sign-up route names only a person it creates, through the one rule, and a one-person firm keeps her firm’s name as hers', () => {
    const route = read('src/app/api/onboarding/route.ts')
    expect(route).toContain("create: { primaryEmail: email, name: signUpPersonName(body.name, email, companyNamed) }")
    expect(route).toContain('update: {},')
    expect(route).toContain('const companyNamed = ownFirm ? null :')
    expect(read('src/app/api/onboarding/person-name.ts')).toContain("import { renameNameSays } from '@/app/api/access/row-acts'")
  })
})

describe('the account menu', () => {
  it('a person with no role, or only the Member role a sign-up is seated in, reads No role yet, the words Users & permissions says', () => {
    expect(footerRole('VENDOR', null)).toBe(`Supplier · ${NO_ROLE_LABEL}`)
    expect(footerRole('VENDOR', 'Member')).toBe(`Supplier · ${NO_ROLE_LABEL}`)
    expect(footerRole('VENDOR', 'Recruiter')).toBe('Supplier · Recruiter')
  })

  it('the header names a seat with the Member role as No role yet, as its footer does', () => {
    const seat = { isConsultant: false, hasCompany: true, seatedAtClient: null }
    expect(seatCrumb({ ...seat, roleName: 'Member' })).toBe(NO_ROLE_LABEL)
    expect(seatCrumb({ ...seat, roleName: null })).toBe(NO_ROLE_LABEL)
    expect(footerRole('VENDOR', 'Member').endsWith(seatCrumb({ ...seat, roleName: 'Member' })!)).toBe(true)
    expect(seatCrumb({ ...seat, roleName: 'Recruiter' })).toBe('Recruiter')
    expect(seatCrumb({ isConsultant: true, hasCompany: false, roleName: null, seatedAtClient: null })).toBe('Consultant')
    expect(seatCrumb({ ...seat, roleName: 'Member', seatedAtClient: 'Harborline Tech' })).toBe('At Harborline Tech')
    expect(seatCrumb({ ...seat, roleName: 'Program manager', seatedAtClient: 'Harborline Tech' })).toBe('Program manager at Harborline Tech')
    // The header and the phone's account footer both read it.
    expect(read('src/components/shell/header.tsx')).toContain('const crumb = seatCrumb(')
    expect(read('src/components/shell/header.tsx')).not.toMatch(/'Consultant' : roleName/)
    expect(read('src/components/shell/mobile-nav.tsx')).toContain('role={seatCrumb(')
  })
})

describe('Settings, Sign-in', () => {
  const facts = (over: Partial<JoinFacts> = {}): JoinFacts => ({
    companyName: 'Northwind Staffing', kind: 'VENDOR', slug: 'northwind', mode: 'OPEN', domains: [], ...over,
  })

  it('a firm with no verified domain and no choice saved reads that the default applies, invitation only, because no domain is verified', () => {
    expect(defaultModeSays(facts())).toBe('No choice made yet, so the default applies: invitation only, because no domain is verified.')
    expect(defaultModeSays(facts({ domains: [{ domain: 'northwind-staffing.example', verified: false, joinPolicy: 'AUTO' }] })))
      .toBe('No choice made yet, so the default applies: invitation only, because no domain is verified.')
    // And the line under the heading says the same thing.
    expect(joinSentence(facts())).toMatch(/by invitation only\./)
  })

  it('a firm with a verified domain people join by reads the default sentence for its domain', () => {
    expect(defaultModeSays(facts({ domains: [{ domain: 'northwind-staffing.example', verified: true, joinPolicy: 'AUTO' }] })))
      .toBe(modeSays('OPEN', 'Northwind Staffing'))
  })

  it('a firm whose verified domain admits nobody is told the default is invitation only, and why', () => {
    expect(defaultModeSays(facts({ domains: [{ domain: 'northwind-staffing.example', verified: true, joinPolicy: 'NONE' }] })))
      .toBe('No choice made yet, so the default applies: invitation only, because nobody joins by your verified domain.')
  })

  it('a firm with a directory and no choice saved reads that the directory is the default', () => {
    expect(defaultModeSays(facts({ mode: 'SSO_ONLY' }))).toBe(`No choice made yet, so the default applies: ${modeSays('SSO_ONLY', 'Northwind Staffing')}`)
  })

  it('the panel no longer says "Nothing is set yet.", and the people list puts each address on its own line under the name', () => {
    const page = read('src/app/dashboard/settings/sign-in/page.tsx')
    expect(page).not.toContain("'Nothing is set yet.'")
    expect(page).toContain('o.unsetSays ?? o.says')
    expect(page).toContain('<span className="block text-etyme-ink">{p.name}</span>')
    expect(page).toContain('<span className="block text-etyme-muted break-all">{p.email}</span>')
  })
})

describe('Settings, Sites', () => {
  it('a site’s address is printed with its ZIP, from what is kept and nothing else', () => {
    expect(siteAddressLine({ address: '100 Main Street', city: 'Denver', state: 'CO', postalCode: '80202' })).toBe('100 Main Street, Denver, CO 80202')
    expect(siteAddressLine({ address: null, city: 'Denver', state: null, postalCode: '80202' })).toBe('Denver, 80202')
    expect(siteAddressLine({ address: ' ', city: null, state: null, postalCode: null })).toBeNull()
  })

  it('the street box shows a plain example, never "Not found. Type it.", and the table prints the address under the name', () => {
    const page = read('src/app/dashboard/settings/sites/page.tsx')
    expect(page).not.toContain('Not found. Type it.')
    expect(page).toContain('{addressOf(s) && <p className="text-[11px] text-etyme-faint">{addressOf(s)}</p>}')
    expect(page).toContain('siteAddressLine(s, home, countryName)')
  })

  it('a site in the company’s own country reads street, city, state and ZIP, and names no country', () => {
    expect(siteAddressLine({ address: '100 Main Street', city: 'Denver', state: 'CO', postalCode: '80202', country: 'US' }, 'US')).toBe('100 Main Street, Denver, CO 80202')
  })

  it('a site outside the company’s own country leaves no state slot where none is kept and ends with the country’s name', () => {
    const name = (c: string) => ({ GB: 'United Kingdom', US: 'United States' } as Record<string, string>)[c] ?? c
    expect(siteAddressLine({ address: '12 King Street', city: 'Leeds', state: null, postalCode: 'LS1 4DY', country: 'GB' }, 'US', name)).toBe('12 King Street, Leeds, LS1 4DY, United Kingdom')
    expect(siteAddressLine({ address: '100 Main Street', city: 'Denver', state: 'CO', postalCode: '80202', country: 'US' }, 'GB', name)).toBe('100 Main Street, Denver, CO 80202, United States')
    // A country setup does not list reads as its two letters.
    expect(siteAddressLine({ city: 'Lisbon', postalCode: '1100-148', country: 'pt' }, 'US', name)).toBe('Lisbon, 1100-148, PT')
  })

  it('where the company’s own country is not known, every site names its country rather than guess which is home', () => {
    expect(siteAddressLine({ city: 'Denver', state: 'CO', country: 'US' }, null)).toBe('Denver, CO, US')
  })

  it('the Sites route tells the page the company’s own country, falling back to the primary site’s', () => {
    const route = read('src/app/api/settings/locations/route.ts')
    expect(route).toContain('own?.country ?? read.sites.find((s) => s.isPrimary)?.country ?? null')
    expect(route).toContain('kind: caller.company.kind, country }')
  })
})

describe('the Member role, said of a person or offered as a choice for one', () => {
  it('a directory group mapped to the Member role reads No role yet', () => {
    expect(groupMappedSays('Sales', 'Member')).toBe(`People in Sales are seated with no role yet. ${NO_ROLE_SEES}`)
    expect(groupMappedSays('Sales', 'Recruiter')).toBe('People in Sales are seated as Recruiter.')
    expect(seatedAsWords('Member')).toBe('with no role yet')
    expect(seatedAsWords('member')).toBe('with no role yet')
    expect(seatedAsWords('HR')).toBe('as HR')
    // Settings › Sign-in: the mapped list, the role picker and the people
    // list each word the role through the one rule, and the picker says
    // what a person with no role sees once that choice is made.
    const page = read('src/app/dashboard/settings/sign-in/page.tsx')
    expect(page).toContain('{x.groupId} · {roleWords(x.role)}')
    expect(page).toContain('<option key={r.id} value={r.id}>{roleWords(r.name)}</option>')
    expect(page).toContain('holdsNoRole(r.name)) && <p className="text-[12px] text-etyme-muted">{NO_ROLE_SEES}</p>')
    expect(page).toContain('{roleWords(p.role)}')
    // The route's answer and its log, and the directory's own seatings.
    const groups = read('src/app/api/settings/sign-in/groups/route.ts')
    expect(groups).toContain('groupMappedSays(groupName ?? groupId, role.name)')
    expect(groups).not.toMatch(/to \$\{role\.name\}/)
    const provision = read('src/lib/identity/provision.ts')
    expect(provision).not.toMatch(/seat is now \$\{(map\.role\.name|MEMBER_ROLE)\}/)
    expect(provision).toContain('seatedAsWords(MEMBER_ROLE)')
  })

  it('Team structure names a person holding the Member role as No role yet on every line that names them', () => {
    expect(roleInWords('Member')).toBe(NO_ROLE_LABEL)
    expect(roleInWords(null)).toBe(NO_ROLE_LABEL)
    expect(roleInWords('Recruiter')).toBe('Recruiter')
    const page = read('src/app/dashboard/settings/team-structure/page.tsx')
    expect(page).not.toMatch(/s\.role \? ` · \$\{s\.role\}`/)
    expect(page).not.toMatch(/\{p\.role\}/)
    expect(page).toContain('`${b.lead.name} · ${roleInWords(b.lead.role)}`')
  })

  it('Settings › Owners offers the Member role as No role yet and names a person holding it so', () => {
    expect(personOption({ name: 'Tomas Reyes', email: 'tomas@northwind-staffing.example', role: 'Member' })).toBe('Tomas Reyes · tomas@northwind-staffing.example · No role yet')
    const page = read('src/app/dashboard/settings/owners/page.tsx')
    expect(page).toContain('<option key={x.id} value={x.id}>{roleWords(x.name)}</option>')
    expect(page).toContain('{NO_ROLE_SEES}')
  })

  it('the account menu lists a seat holding the Member role as the company and No role yet', () => {
    const lines = hatsFor({ seats: [{ contextId: 'm1', type: 'EMPLOYEE', companyName: 'Northwind Staffing', roleName: 'Member' }], activeContextId: 'm1', personName: 'Tomas Reyes', isConsultant: false, youOffered: false, hat: 'firm' })
    expect(lines.map((l) => l.label)).toEqual(['Northwind Staffing · No role yet'])
  })

  it('a contact holding the Member role at another firm carries no title, and reads as staff there', () => {
    const route = read('src/app/api/contacts/route.ts')
    expect(route).toContain('const title = holdsNoRole(s.role?.name) ? null : s.role!.name')
    expect(route).toContain("`${title ?? 'Staff'} at ${s.company.name}`")
  })
})
