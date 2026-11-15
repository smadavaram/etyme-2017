import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { recordEditedSummary } from '@/lib/counterparty'
import { KINDS, alreadyOnFile, sameNameOnFile, duplicateSays, ADD_ANYWAY } from '@/lib/contacts'
import { desksHolding } from '@/lib/permissions'
import { ADDS_CONSULTANTS } from '@/lib/consultant-portfolio/who-adds'

/**
 * Two walkers pressed Companies and Contacts in a browser on 2026-11-15.
 * The lists, the counts and identity by domain passed; these stopped them
 * or would make a first-time person hesitate. Each sentence reads the
 * screen's own code path, or the pure rule behind it.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const companies = read('src/app/dashboard/companies/page.tsx')
const contactsPage = read('src/app/dashboard/contacts/page.tsx')
const contactsRoute = read('src/app/api/contacts/route.ts')
const companiesRoute = read('src/app/api/companies/route.ts')
const recordRoute = read('src/app/api/companies/[id]/record/route.ts')
const listSurface = read('src/components/list-surface.tsx')
const addCompany = companies.slice(companies.indexOf('function AddCompanyModal'), companies.indexOf('// ── Company Detail Drawer'))
const drawer = companies.slice(companies.indexOf('function CompanyDrawer'), companies.indexOf('// ── Page ──'))
const linkAsks = companies.slice(companies.indexOf('function LinkAsks'))
const addContact = contactsPage.slice(contactsPage.indexOf('function AddContactModal'))

describe('Edit a recorded company', () => {
  it('after Save, the open drawer reads the row the list now holds, so it shows the saved name, domain and entity type at once', () => {
    expect(companies).toContain('setSelected((prev) => (prev ? companies.find((c) => c.id === prev.id) ?? prev : prev))')
    expect(companies).toMatch(/useEffect\(\(\) => \{\s*setSelected\(\(prev\)[\s\S]*?\}, \[companies\]\)/)
  })

  it('the activity-log line for an edit names the company even when the name was left alone', () => {
    expect(recordEditedSummary('Jo Bennett', 'Harbor Row Staffing', [{ box: 'entity type', from: null, to: 'LLP' }]))
      .toBe('Jo Bennett changed the entity type from nothing to LLP on Harbor Row Staffing')
    expect(recordEditedSummary('Jo Bennett', 'Harbor Row Staffing', [{ box: 'name', from: 'Harbor Row', to: 'Harbor Row Staffing' }]))
      .toBe('Jo Bennett changed the name from Harbor Row to Harbor Row Staffing')
    expect(recordRoute).toContain('summary: recordEditedSummary(caller.person.name, name, changes)')
  })
})

describe('Asks to link that she made', () => {
  it('her own waiting asks show on Companies under "Asked, waiting on them", as the route words them, with no buttons', () => {
    expect(linkAsks).toContain('Asked, waiting on them')
    expect(linkAsks).toContain("m?.state === 'WAITING'")
    expect(linkAsks).toContain('setWaiting(waitingAsks(body?.data?.made))')
    const waitingList = linkAsks.slice(linkAsks.indexOf('Asked, waiting on them'), linkAsks.indexOf('function waitingAsks'))
    expect(waitingList).not.toContain('<button')
    // Only the route's sentence is kept: no id, address or Kind of the other firm.
    expect(linkAsks).toContain('({ id: String(m.id), says: m.says })')
    expect(linkAsks).toContain('if (asks.length === 0 && waiting.length === 0) return null')
  })

  it('the waiting list is read again the moment she asks, from the Add dialog, a row or the drawer', () => {
    expect(companies).toContain('<LinkAsks onAnswered={handleCreated} reread={asksRead} />')
    expect(linkAsks).toContain('useEffect(() => { void load() }, [load, reread])')
    expect(companies.match(/onAsked=\{askSent\}/g)?.length).toBeGreaterThanOrEqual(4)
    expect(companies).toMatch(/function handleCreated\(msg: string\) \{[\s\S]*?askSent\(\)/)
  })
})

describe('Adding by name a firm that is on Etyme', () => {
  it('says what to ask them for in plain words, and the rule is unchanged: no id and no button from a name alone', () => {
    expect(companiesRoute).toContain('ask them for their web domain, ')
    expect(companiesRoute).toContain('or the address their Etyme page opens at, and type it in the Domain box or the Etyme address box.')
    expect(companiesRoute).not.toContain('give their domain or their ` +')
    expect(companiesRoute).toContain("return NextResponse.json({ error: { code: 'SAME_NAME', field: 'domain', message: says } }, { status: 409 })")
  })

  it('the sentence is drawn at the Domain box, beside the Etyme address box, which says what that address is', () => {
    expect(addCompany).toContain("if (e.field === 'domain' && e.code !== 'ALREADY_ON_ETYME' && e.code !== 'ALREADY_HERE')")
    expect(addCompany).toContain('{domainSays && <p className="mt-1 text-[12px] text-etyme-attention">{domainSays}</p>}')
    expect(addCompany).toContain('The first part of the address their Etyme page opens at, before .etyme.com.')
  })
})

describe('Add a company', () => {
  it('a refusal about the domain, and the same domain already on the list, are drawn at the Domain box, not at the top or under the name', () => {
    const domainBox = addCompany.slice(addCompany.indexOf('>Domain</label>'), addCompany.indexOf('Their Etyme address, if they have one'))
    expect(domainBox).toContain('{domainSays && ')
    expect(domainBox).toContain("{twin?.field === 'domain' && (")
    const nameBox = addCompany.slice(addCompany.indexOf('Company name *'), addCompany.indexOf('>Domain</label>'))
    expect(nameBox).toContain("{twin?.field === 'name' && (")
    expect(nameBox).not.toContain('domainSays')
  })
})

describe('The Companies list', () => {
  it('each tile filters the list as its chip does, and says which one is chosen', () => {
    expect(companies).toContain('onClick={() => setPositionFilter(t.key)}')
    expect(companies).toContain('aria-pressed={positionFilter === t.key}')
    expect(companies).toContain('{companyTilesShown(tiles).map((t) => (')
    // Every tile's filter is one a chip also offers.
    const tileKeys = [...companies.slice(companies.indexOf('function companyTilesShown'), companies.indexOf('function emptyUnder')).matchAll(/key: '([A-Z_]+)' as const/g)].map((m) => m[1])
    expect(tileKeys).toEqual(['ALL', 'CUSTOMER', 'SUPPLIER', 'PRIME', 'MSP', 'NOT_CLASSIFIED', 'WORKS_WITH_YOU', 'NOT_LINKED'])
    for (const k of tileKeys) expect(companies).toMatch(new RegExp(`key: '${k}'(?: as const)?, label:`))
  })

  it('under a filter with nothing in it, the list says what is true for that filter, never "No companies yet"', () => {
    expect(companies).toContain('emptyMessage={emptyUnder(positionFilter, filterWord, companies.length)}')
    expect(companies).toContain("if (filter === 'ALL' || total === 0) return 'No companies yet.'")
    expect(companies).toContain('return `None of your companies is under ${word}. Press All to see every company on your list.`')
  })

  it('the words about a customer agreement sit beside the chip, so the table wraps rather than running past its box', () => {
    expect(companies).toContain("<Chip key={p} tone={p === 'CUSTOMER' ? 'verified' : 'action'}>{POSITION_WORDS[p]}</Chip>")
    expect(companies).not.toMatch(/<Chip[^>]*>[^<]*no agreement signed yet/)
    expect(companies).toContain("'No agreement signed yet'")
  })

  it('starts on the feed at phone width where the reader has not chosen a view on this device', () => {
    expect(companies).toContain('phoneView="feed"')
    expect(listSurface).toContain("if (saved === 'feed' || saved === 'table') { setOwn(saved); onView?.(saved) }")
    expect(listSurface).toContain("else if (phoneView && window.matchMedia?.('(max-width: 767px)').matches) { setOwn(phoneView); onView?.(phoneView) }")
  })
})

describe('The company drawer', () => {
  it('closes on Escape, and its close button has a name a screen reader can say', () => {
    expect(drawer).toContain("if (e.key === 'Escape') onClose()")
    expect(drawer).toContain('aria-label={`Close ${company.name}`}')
  })

  it('asks who the account manager is only for a customer, so a supplier’s drawer asks for nothing that does not apply', () => {
    expect(drawer).toContain("{!company.notLinked && company.positions.includes('CUSTOMER') && <AccountManagerPanel clientId={company.id} />}")
  })
})

describe('Adding the same person twice', () => {
  const existing = [{ id: 'c1', name: 'Dorian Vale', email: 'dorian@brightwater.example', phone: null, atCompanyId: 'bw' }]

  it('the same email is refused in a sentence that says nothing was saved and never says to update a contact, because none can be updated', () => {
    const v = alreadyOnFile({ name: 'Dorian Vale', email: 'dorian@brightwater.example', atCompanyId: 'bw' }, existing)
    expect(v.says).toBe('Dorian Vale is already in your Contacts at this company with that email, so nothing was saved. If this is somebody else, give their own email.')
    expect(duplicateSays('Dorian Vale', 'phone number')).not.toMatch(/update|twin/i)
  })

  it('the same name at the same company with a phone where the first had an email is asked about before it is saved', () => {
    const asked = sameNameOnFile({ name: '  dorian   VALE ', atCompanyId: 'bw' }, existing)
    expect(asked?.says).toBe('Somebody named Dorian Vale is already in your Contacts at this company. Is this the same person?')
    expect(sameNameOnFile({ name: 'Dorian Vale', atCompanyId: 'elsewhere' }, existing)).toBeNull()
    expect(sameNameOnFile({ name: 'Dora Vale', atCompanyId: 'bw' }, existing)).toBeNull()
  })

  it('one press adds anyway, so two people who share a name stay possible, on Contacts and in the company drawer', () => {
    expect(contactsRoute).toContain("const namesake = body?.addAnyway === true ? null : sameNameOnFile({ name: String(body.name), atCompanyId }, existing)")
    expect(contactsRoute).toContain("code: 'SAME_NAME'")
    expect(ADD_ANYWAY).toBe('Add anyway, this is somebody else')
    expect(addContact).toContain("if (body.error?.code === 'SAME_NAME') setNamesake(true)")
    expect(addContact).toContain('onClick={(e) => handleSubmit(e, true)}')
    expect(addContact).toContain('JSON.stringify(addAnyway ? { ...form, addAnyway: true } : form)')
    expect(companies).toContain('onClick={(e) => save(e, true)}>{ADD_ANYWAY}</button>')
  })
})

describe('Add contact', () => {
  it('the link to Candidates is drawn only for a seat that may add a consultant; anybody else reads which role adds a person the firm pays', () => {
    expect(addContact).toContain('mayOpen(ADD_CANDIDATE_HREF, permissions) && mayAddConsultant(permissions ?? [])')
    expect(addContact).toContain('{paysPeople && !mayAddCandidate && addsPeople.length > 0 && <> A person you pay is added under Candidates, by ')
    expect(desksHolding(ADDS_CONSULTANTS, 'VENDOR').length).toBeGreaterThan(0)
  })

  it('a colleague’s card and an Other card say what a person would say, and never suggest a note nobody can add', () => {
    expect(KINDS.MEMBER.callAbout).toBe('the work they do at your firm')
    expect(KINDS.OTHER.callAbout).toBe('whatever you saved them for')
    for (const k of Object.values(KINDS)) expect(k.callAbout).not.toMatch(/note|hold no role/i)
  })

  it('the email box’s example address is on a reserved domain', () => {
    expect(addContact).toContain("{field('email', 'Email', 'dana@client.example', 'email')}")
    expect(contactsPage).not.toContain('@client.com')
  })

  it('after Save she reads who is in her Contacts, at which company, and that nothing was sent to them', () => {
    expect(addContact).toContain('onCreated(`${form.name.trim()} is in your Contacts at ${')
    expect(addContact).toContain('Nothing was sent to them.`)')
    expect(contactsPage).toContain('{saved && <FormMessage tone="ok">{saved}</FormMessage>}')
  })
})
