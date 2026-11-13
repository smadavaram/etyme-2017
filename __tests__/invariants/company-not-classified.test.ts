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

// ── The rules, pure ──────────────────────────────────────────────────

import {
  mayAddCompany, mayRecordCompany, positionsOf, isNotClassified, isMine, mayExtend, mayRemovePosition,
  maySetRecordedKind, mayInviteRecorded, mayClaimRecorded, sameNameAmong, sameNameRefused, firmNameKey,
  NEVER_EMAILS, notedDomain, type PositionWork,
} from '@/lib/counterparty'
import { mayNameCounterparty } from '@/lib/off-system'

const tapin = { id: 'tapin', name: 'Tapin' }
const owner = ['*']
const none: PositionWork = { orders: 0, lines: 0, bills: 0, signedAgreement: false, submissions: 0, openInvitations: 0, supplierRequests: 0 }
const rivermark = { id: 'rm', name: 'Rivermark Partners', claimedAt: null, listedById: 'tapin', slug: 'rivermark' }

describe('recording a company with no position', () => {
  it('a seated person who manages who the firm trades with may record a company with only its name and no relationship', () => {
    const v = mayAddCompany({ seatedAt: tapin, permissions: ['vendors.manage'], relationship: null, kind: 'UNCLASSIFIED' })
    expect(v.ok).toBe(true)
    expect(v.ownsIt).toBe(false)
    expect(v.says).toContain(NEVER_EMAILS)
  })

  it('a firm added from inside a seat, as a classified company, must still say what it is to us', () => {
    const v = mayAddCompany({ seatedAt: tapin, permissions: owner, relationship: null, kind: 'VENDOR' })
    expect(v.ok).toBe(false)
    expect(v.says).toContain('a client, a supplier, a prime or an MSP')
  })

  it('a seat that does not manage who the firm trades with cannot record one, and is told who can', () => {
    const v = mayRecordCompany({ seatedAt: tapin, permissions: ['timesheets.read'] })
    expect(v.ok).toBe(false)
    expect(v.says).toContain('whoever manages who you trade with')
  })

  it('somebody with no seat cannot found their own firm as not classified', () => {
    expect(mayAddCompany({ seatedAt: null, permissions: [], kind: 'UNCLASSIFIED' }).ok).toBe(false)
  })

  it('the same name twice, without case, spaces or punctuation, is refused in a sentence that names the one already there', () => {
    const mine = [{ id: 'rm', name: 'Rivermark Partners, LLC' }]
    expect(firmNameKey('rivermark partners llc')).toBe(firmNameKey('Rivermark Partners, LLC'))
    const hit = sameNameAmong('RIVERMARK  partners llc.', mine)
    expect(hit?.id).toBe('rm')
    expect(sameNameRefused(hit!)).toBe('Rivermark Partners, LLC is on your Companies list already. Open it there rather than record it twice.')
    expect(sameNameAmong('Rivermark Capital', mine)).toBeNull()
  })
})

describe('the domain typed for a recorded company is a note, never a claim', () => {
  it('a typed domain is kept bare and in lower case, with no scheme, no www and no path', () => {
    expect(notedDomain('https://www.Rivermark.example/about?x=1')).toBe('rivermark.example')
    expect(notedDomain('  talent.rivermark.example  ')).toBe('talent.rivermark.example')
  })

  it('something that does not read as a domain is not kept', () => {
    for (const typed of ['', '   ', 'rivermark', 'not a domain', 'dana@rivermark.example', '-bad.example', null, undefined, 42]) {
      expect(notedDomain(typed)).toBeNull()
    }
  })

  it('the record writes the note to the typed-website column and never to the domain a company is joined by', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/companies/route.ts'), 'utf8')
    const record = route.slice(route.indexOf('async function recordCompany('))
    expect(record).toContain('const noted = notedDomain(body?.domain)')
    expect(record).toContain('website: noted')
    expect(record).toMatch(/domain: null,/)
    expect(record).toContain('claimDomain: false')
    // And the list shows it only on the reader's own unclaimed record.
    expect(route).toContain('notedDomain: !c.domain && caller.company && isMine(c, caller.company.id) ? c.website : null')
  })
})

describe('a position lives on the relationship record, never on the Kind', () => {
  it('a company not classified yet holds a position only by its own register rows, never by an agreement alone', () => {
    expect(positionsOf({ kind: 'UNCLASSIFIED', stored: [], derived: [{ relationship: 'CLIENT' }] })).toEqual([])
    expect(positionsOf({ kind: 'UNCLASSIFIED', stored: [{ relationship: 'SUPPLIER' }], derived: [] })).toEqual(['SUPPLIER'])
  })

  it('every company that exists today keeps reading exactly as the register reads it', () => {
    expect(positionsOf({ kind: 'VENDOR', stored: [], derived: [{ relationship: 'SUPPLIER' }] })).toEqual(['SUPPLIER'])
    expect(positionsOf({ kind: 'CLIENT', stored: [{ relationship: 'CLIENT' }], derived: [{ relationship: 'CLIENT' }] })).toEqual(['CUSTOMER'])
  })

  it('one company can be a Customer and a Supplier at once', () => {
    expect(positionsOf({ kind: 'GSI', stored: [{ relationship: 'SUPPLIER' }, { relationship: 'CLIENT' }], derived: [] })).toEqual(['CUSTOMER', 'SUPPLIER'])
  })

  it('not classified means on my list because I recorded it, with no position with me', () => {
    expect(isMine(rivermark, 'tapin')).toBe(true)
    expect(isNotClassified({ mine: true, positions: [] })).toBe(true)
    expect(isNotClassified({ mine: true, positions: ['SUPPLIER'] })).toBe(false)
    // A firm reached only through work between us keeps reading as today.
    expect(isNotClassified({ mine: false, positions: [] })).toBe(false)
  })
})

describe('extending a company', () => {
  const ask = (as: string, over: Partial<Parameters<typeof mayExtend>[0]> = {}) =>
    mayExtend({ as, me: tapin, permissions: owner, other: rivermark, worksTogether: false, positions: [], ...over })

  it('extension does not read the company’s Kind: the rule is handed no Kind at all', () => {
    const src = read('src/lib/counterparty.ts')
    const body = src.slice(src.indexOf('export function mayExtend('), src.indexOf('function alreadyOnEtymeSays'))
    expect(body).not.toMatch(/\.kind\b/)
  })

  it('extending a company to Supplier writes the Supplier position and says its kind did not change', () => {
    const v = ask('SUPPLIER')
    expect(v.ok && v.relationship).toBe('SUPPLIER')
    expect(v.ok && v.says).toContain('What kind of company it is did not change')
  })

  it('extending a company to Customer writes the Customer position with no agreement signed yet', () => {
    const v = ask('customer')
    expect(v.ok && v.relationship).toBe('CLIENT')
    expect(v.ok && v.says).toContain('no agreement signed yet')
  })

  it('a GSI can be extended to Customer and then to Supplier, and the second does not touch the first', () => {
    expect(ask('CUSTOMER').ok).toBe(true)
    const second = ask('SUPPLIER', { positions: ['CUSTOMER'] })
    expect(second.ok && second.already).toBe(false)
  })

  it('extending to a position already held changes nothing and says so', () => {
    const v = ask('SUPPLIER', { positions: ['SUPPLIER'] })
    expect(v.ok && v.already).toBe(true)
    expect(v.ok && v.says).toBe('Rivermark Partners is already your supplier. Nothing changed.')
  })

  it('a company that is already on Etyme and does not work with you can only be extended by asking them to link', () => {
    const v = ask('SUPPLIER', { other: { ...rivermark, claimedAt: new Date(), listedById: null } })
    expect(v.ok).toBe(false)
    expect(!v.ok && v.code).toBe('ALREADY_ON_ETYME')
    expect(!v.ok && v.says).toContain('Ask them to link')
  })

  it('another firm’s record is not yours to extend', () => {
    const v = ask('CUSTOMER', { other: { ...rivermark, listedById: 'brightmoor' } })
    expect(!v.ok && v.says).toBe('Rivermark Partners is not on your Companies list. Add it there first, then extend it.')
  })

  it('only the seats that may add a company may extend one, and anything but Supplier or Customer is refused in a sentence', () => {
    expect(ask('SUPPLIER', { permissions: ['timesheets.read'] }).ok).toBe(false)
    const v = ask('PRIME')
    expect(!v.ok && v.says).toBe('Say whether to extend it to Supplier or to Customer.')
  })
})

describe('removing a position', () => {
  const take = (as: string, positions: any[], work: Partial<PositionWork> = {}) =>
    mayRemovePosition({ as, me: tapin, permissions: owner, other: rivermark, positions, work: { ...none, ...work } })

  it('removing the last position leaves the company on the Companies list, not classified, with its Kind unchanged', () => {
    const v = take('CUSTOMER', ['CUSTOMER'])
    expect(v.ok && v.notClassifiedAfter).toBe(true)
    expect(v.ok && v.says).toContain('It stays on your Companies list, not classified.')
    expect(v.ok && v.says).toContain('What kind of company it is did not change')
  })

  it('removing one of two positions leaves the other', () => {
    const v = take('SUPPLIER', ['CUSTOMER', 'SUPPLIER'])
    expect(v.ok && v.notClassifiedAfter).toBe(false)
    expect(v.ok && v.says).toContain('It is still your customer.')
  })

  it('a position with real work hanging off it is refused in one sentence that names the work', () => {
    const v = take('CUSTOMER', ['CUSTOMER'], { orders: 2, signedAgreement: true })
    expect(!v.ok && v.code).toBe('STILL_IN_USE')
    expect(!v.ok && v.says).toBe('Rivermark Partners stays your customer while 2 orders and a signed agreement hang off it. End or move that work first.')
    expect(!take('SUPPLIER', ['SUPPLIER'], { openInvitations: 1 }).ok).toBe(true)
    expect(!take('SUPPLIER', ['SUPPLIER'], { supplierRequests: 1 }).ok).toBe(true)
    expect(!take('CUSTOMER', ['CUSTOMER'], { submissions: 1 }).ok).toBe(true)
    expect(!take('CUSTOMER', ['CUSTOMER'], { bills: 1 }).ok).toBe(true)
    expect(!take('CUSTOMER', ['CUSTOMER'], { lines: 1 }).ok).toBe(true)
  })

  it('a position the company does not hold cannot be removed', () => {
    const v = take('SUPPLIER', ['CUSTOMER'])
    expect(!v.ok && v.says).toBe('Rivermark Partners is not your supplier, so there is nothing to remove.')
  })
})

describe('saying what kind of company a recorded firm is', () => {
  const set = (to: string, other: Partial<Parameters<typeof maySetRecordedKind>[0]['other']> = {}) =>
    maySetRecordedKind({ to, me: tapin, permissions: owner, other: { ...rivermark, kind: 'UNCLASSIFIED', seats: 0, ...other } })

  it('a company recorded here and still unclaimed can have its type set to Vendor, and setting it gives no position', () => {
    const v = set('VENDOR')
    expect(v.ok && v.to).toBe('VENDOR')
    expect(v.ok && v.says).toBe('Rivermark Partners is a supplier now. What it is to you did not change.')
  })

  it('a firm on Etyme never has its Kind set by anybody but its own Owner', () => {
    expect(!set('CLIENT', { claimedAt: new Date() }).ok).toBe(true)
    const v = set('CLIENT', { seats: 1 })
    expect(!v.ok && v.says).toBe('Rivermark Partners is on Etyme, so only its own Owner says what kind of company it is.')
  })

  it('another firm’s record and a kind outside the four are refused in a sentence', () => {
    expect(!set('VENDOR', { listedById: 'brightmoor' }).ok).toBe(true)
    const v = set('CONSULTANT_CORP')
    expect(!v.ok && v.says).toBe('Say what kind of company Rivermark Partners is: a supplier, a client, an MSP or an integrator.')
  })
})

describe('an invitation and a claim wait for the Kind', () => {
  it('a company not classified yet cannot be invited until somebody says what kind it is', () => {
    const v = mayInviteRecorded({ name: 'Rivermark Partners', kind: 'UNCLASSIFIED' })
    expect(!v.ok && v.says).toBe('Say what kind of company Rivermark Partners is before you invite them.')
    expect(mayInviteRecorded({ name: 'Rivermark Partners', kind: 'VENDOR' }).ok).toBe(true)
  })

  it('a claim link never seats anybody at a company with no roles, and never reads it as a supplier', () => {
    const v = mayClaimRecorded({ name: 'Rivermark Partners', kind: 'UNCLASSIFIED' })
    expect(v.ok).toBe(false)
    expect(!v.ok && v.says).not.toMatch(/supplier/i)
    expect(mayClaimRecorded({ name: 'Rivermark Partners', kind: 'CLIENT' }).ok).toBe(true)
  })
})

describe('a company not classified yet is never named on a contract or an order', () => {
  const name = (as: 'client' | 'supplier', positions?: any[], other: object = {}) =>
    mayNameCounterparty({ callerCompanyId: 'tapin', other: { ...rivermark, kind: 'UNCLASSIFIED', ...other }, relationshipExists: false, as, positions })

  it('my own recorded company with no position is refused as a client or a supplier, naming the step', () => {
    expect(name('client').says).toBe('Rivermark Partners is on your Companies list and is not classified yet. Extend it to Customer first.')
    expect(name('supplier').says).toBe('Rivermark Partners is on your Companies list and is not classified yet. Extend it to Supplier first.')
  })

  it('a company extended to Supplier is still not a client until it is extended to Customer', () => {
    expect(name('client', ['SUPPLIER']).says).toBe('Rivermark Partners is on your Companies list but is not your client yet. Extend it to Customer first.')
    expect(name('supplier', ['SUPPLIER']).ok).toBe(true)
    expect(name('client', ['CUSTOMER']).ok).toBe(true)
  })

  it('a company recorded the old way, classified, reads exactly as it did', () => {
    expect(mayNameCounterparty({ callerCompanyId: 'tapin', other: { ...rivermark, kind: 'CLIENT' }, relationshipExists: false, as: 'client' }).ok).toBe(true)
  })
  it('an order recorded for a client not classified yet is refused until it is extended to Customer', async () => {
    const { mayWriteOrder } = await import('@/lib/off-system')
    const buyer = { ...rivermark, kind: 'UNCLASSIFIED' }
    const seller = { id: 'tapin', name: 'Tapin', claimedAt: new Date() }
    const refused = mayWriteOrder({ callerCompanyId: 'tapin', buyer, seller })
    expect(refused.ok).toBe(false)
    expect(refused.says).toBe('Rivermark Partners is on your Companies list and is not classified yet. Extend it to Customer first.')
    expect(mayWriteOrder({ callerCompanyId: 'tapin', buyer, seller, buyerPositions: ['SUPPLIER'] }).ok).toBe(false)
    expect(mayWriteOrder({ callerCompanyId: 'tapin', buyer, seller, buyerPositions: ['CUSTOMER'] }).ok).toBe(true)
  })

  it('an order raised to a supplier not classified yet is refused until it is extended to Supplier', async () => {
    const { mayWriteOrder } = await import('@/lib/off-system')
    const seller = { ...rivermark, kind: 'UNCLASSIFIED' }
    const buyer = { id: 'tapin', name: 'Tapin', claimedAt: new Date() }
    expect(mayWriteOrder({ callerCompanyId: 'tapin', buyer, seller, sellerStanding: 'NONE' }).says)
      .toBe('Rivermark Partners is on your Companies list and is not classified yet. Extend it to Supplier first.')
    expect(mayWriteOrder({ callerCompanyId: 'tapin', buyer, seller, sellerStanding: 'SUPPLIER' }).ok).toBe(true)
  })

  it('an order to or from a classified company recorded the old way reads exactly as it did', async () => {
    const { mayWriteOrder } = await import('@/lib/off-system')
    const seller = { id: 'tapin', name: 'Tapin', claimedAt: new Date() }
    expect(mayWriteOrder({ callerCompanyId: 'tapin', buyer: { ...rivermark, kind: 'CLIENT' }, seller }).ok).toBe(true)
  })
})

describe('a position is read from the register, never from the Kind a recorded company was given', () => {
  const recordedVendor = { ...rivermark, kind: 'VENDOR' }
  const heldNothing = { positions: [], notClassified: true, recorded: true }

  it('a company recorded as not classified and then given a Kind reads no position from an agreement nobody extended', () => {
    expect(positionsOf({ kind: 'VENDOR', stored: [], derived: [{ relationship: 'CLIENT' }], recordedUnclassified: true })).toEqual([])
    expect(positionsOf({ kind: 'VENDOR', stored: [{ relationship: 'SUPPLIER' }], derived: [{ relationship: 'CLIENT' }], recordedUnclassified: true })).toEqual(['SUPPLIER'])
  })

  it('a recorded company given the Kind Vendor and no position is still refused as a client or a supplier on a contract line', () => {
    const v = (as: 'client' | 'supplier', held: any) =>
      mayNameCounterparty({ callerCompanyId: 'tapin', other: recordedVendor, relationshipExists: false, as, held })
    expect(v('client', heldNothing).says).toBe('Rivermark Partners is on your Companies list and is not classified yet. Extend it to Customer first.')
    expect(v('supplier', heldNothing).says).toBe('Rivermark Partners is on your Companies list and is not classified yet. Extend it to Supplier first.')
    expect(v('client', { positions: ['SUPPLIER'], notClassified: false, recorded: true }).says)
      .toBe('Rivermark Partners is on your Companies list but is not your client yet. Extend it to Customer first.')
    expect(v('supplier', { positions: ['SUPPLIER'], notClassified: false, recorded: true }).ok).toBe(true)
  })

  it('a recorded company given a Kind and no position cannot be named on an order either way', async () => {
    const { mayWriteOrder } = await import('@/lib/off-system')
    const tapinCo = { id: 'tapin', name: 'Tapin', claimedAt: new Date() }
    expect(mayWriteOrder({ callerCompanyId: 'tapin', buyer: recordedVendor, seller: tapinCo, buyerHeld: heldNothing }).ok).toBe(false)
    expect(mayWriteOrder({ callerCompanyId: 'tapin', buyer: tapinCo, seller: recordedVendor, sellerStanding: 'SUPPLIER', sellerHeld: heldNothing }).says)
      .toBe('Rivermark Partners is on your Companies list and is not classified yet. Extend it to Supplier first.')
  })

  it('a position an agreement gives is never offered for removal, because taking off a row would leave it in place', () => {
    const v = mayRemovePosition({ as: 'SUPPLIER', me: tapin, permissions: owner, other: { id: 'rm', name: 'Rivermark Partners' }, positions: ['SUPPLIER'], work: none, heldByAgreement: true })
    expect(v.ok).toBe(false)
    expect(!v.ok && v.code).toBe('HELD_BY_AGREEMENT')
    expect(v.says).toBe('Rivermark Partners is your supplier through the agreement between you, not by a choice made here, so it cannot be taken off. The agreement stays as it is.')
  })

  it('a record of your own given a Kind the old way, with no position at all, reads as not classified at every gate, and one holding a position reads as before', async () => {
    const { lacksPosition } = await import('@/lib/counterparty')
    expect(lacksPosition({ positions: [], notClassified: true, recorded: false }, 'VENDOR', ['SUPPLIER'])).toBe(true)
    expect(lacksPosition({ positions: ['SUPPLIER'], notClassified: false, recorded: false }, 'VENDOR', ['CUSTOMER'])).toBe(false)
    expect(lacksPosition(null, 'CLIENT', ['CUSTOMER'])).toBe(false)
    expect(lacksPosition(null, 'UNCLASSIFIED', ['CUSTOMER'])).toBe(true)
  })
})

describe('the Companies and Contacts screens draw the two facts apart', () => {
  const page = read('src/app/dashboard/companies/page.tsx')
  const contactsPage = read('src/app/dashboard/contacts/page.tsx')

  it('a refused Extend is said beside its button in the error tone until it is closed, never as a success toast, and offers Ask them to link where the firm is on Etyme', () => {
    const buttons = page.slice(page.indexOf('function ExtendButtons('), page.indexOf("function ExtendButtons(") + 4000)
    expect(buttons).toContain('<FormMessage tone="error">{refused.says}</FormMessage>')
    expect(buttons).toContain("if (r.ok) {")
    expect(buttons).toContain('Ask them to link')
    expect(buttons).toContain("fetch('/api/trade-links'")
    expect(buttons).not.toContain('onDone(r.says, r.ok)')
  })

  it('the ask to link from Add company names the firm by what was typed, never by an id the route handed back', () => {
    expect(page).toContain('body: JSON.stringify({ name: linkable.name, domain: linkable.domain, address: linkable.address,')
    expect(page).not.toContain('linkable.companyId')
  })

  it('Add a company offers "Company — not classified yet" first, and it is the choice already made', () => {
    const select = page.slice(page.indexOf('<label className="block text-xs font-semibold text-etyme-muted mb-1">Kind *</label>'))
    const options = [...select.matchAll(/<option value="([A-Z_]+)"/g)].map((m) => m[1])
    expect(options[0]).toBe('UNCLASSIFIED')
    expect(page).toContain("kind: 'UNCLASSIFIED' as Company['kind']")
    expect(page).toContain('{NOT_CLASSIFIED_KIND_LABEL}')
  })

  it('with a company not classified yet, "What are they to you?" is not asked and no relationship is sent', () => {
    expect(page).toMatch(/\{!recording && \(\s*<div>\s*<label[^>]*>What are they to you\? \*<\/label>/)
    expect(page).toContain('...(recording ? {} : { relationship: form.relationship })')
  })

  it('the Add a company form always says that saving a company never emails them', () => {
    expect(page).toContain('{NEVER_EMAILS}')
    // Not inside any condition: the line sits on its own paragraph.
    expect(page).toMatch(/<p className="text-sm text-etyme-ink">\s*\{NEVER_EMAILS\}/)
  })

  it('the same name twice is said beside the name with a way to open the one already there', () => {
    expect(page).toContain("e.code === 'SAME_NAME_ON_YOUR_LIST'")
    expect(page).toContain('onOpenExisting(twin.id)')
  })

  it('the Companies page reads the list with the recorded companies, and no picker reads it that way', () => {
    expect(page).toContain("fetch('/api/companies?records=1')")
  })

  it('every count, tile and filter on the Companies page is by position and never by Kind', () => {
    expect(page).not.toMatch(/c\.kind === '(VENDOR|CLIENT|MSP|GSI)'/)
    expect(page).toMatch(/holds\(c, 'SUPPLIER'\)/)
    expect(page).toMatch(/holds\(c, 'CUSTOMER'\)/)
    expect(page).toContain("{ key: 'NOT_CLASSIFIED', label: NOT_CLASSIFIED, count: notClassifiedCount }")
  })

  it('the Kind column says what a company is in words that are never a position', () => {
    const kinds = page.slice(page.indexOf('function kindOnList'), page.indexOf('function extendLine'))
    expect(kinds).not.toMatch(/return '(Supplier|Customer)'/)
    expect(kinds).toContain("case 'UNCLASSIFIED'")
  })

  it('Extend to Supplier and Extend to Customer are drawn only where the route would take the press, each with its line', () => {
    expect(page).toContain('row.may.extendToSupplier')
    expect(page).toContain('read.may.extend[as]')
    expect(page).toContain('Puts ${name} under Suppliers. It does not email them and does not change what kind of company they are.')
  })

  it('a position that real work hangs off is said in the route’s sentence, and Remove is drawn only where it would be taken', () => {
    expect(page).toContain('{r?.ok && (')
    expect(page).toContain('{r && !r.ok && <p')
  })

  it('the drawer shows the history of the company on this firm’s list with who and when, and its contacts with Add a contact', () => {
    expect(page).toContain('<p className="eyebrow mb-2">History</p>')
    expect(page).toContain('dayOfMomentFor(new Date(h.at), readerZone())')
    expect(page).toContain('Add a contact</button>')
    expect(page).toContain('`/api/contacts?at=${encodeURIComponent(company.id)}`')
  })

  it('Contacts’ Works at lists every firm on the register once and the companies recorded and not classified yet', async () => {
    const { worksAtChoices } = await import('@/lib/contacts')
    const choices = worksAtChoices({
      rows: [
        { otherCompanyId: 'b', otherCompanyName: 'Brightmoor Staffing' },
        { otherCompanyId: 'b', otherCompanyName: 'Brightmoor Staffing' },
      ],
      known: [{ id: 'r', name: 'Rivermark Partners' }],
    })
    expect(choices).toEqual([
      { id: 'b', name: 'Brightmoor Staffing' },
      { id: 'r', name: 'Rivermark Partners (not classified)' },
    ])
    expect(worksAtChoices(null)).toEqual([])
    expect(contactsPage).toContain('companies={worksAtChoices(reg)}')
  })
})
