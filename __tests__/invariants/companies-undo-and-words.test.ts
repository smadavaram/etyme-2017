import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { historyUndoSays, CAN_BE_UNDONE, CANNOT_BE_UNDONE_NOW, CANNOT_BE_UNDONE } from '@/lib/counterparty'
import { wordFor, askerReads, readerReads } from '@/lib/trade-link'
import { onEtymeAskToLinkSays } from '@/lib/supplier-list'
import { contactKindOf, problems, sameNameOnFile } from '@/lib/contacts'

/**
 * The fix list of 2026-11-14, E3, and the small faults the press of
 * 2026-11-15 left on Companies and Contacts. Each sentence reads the pure
 * rule, or the screen's own code path.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const page = read('src/app/dashboard/companies/page.tsx')
const companiesRoute = read('src/app/api/companies/route.ts')
const contactsPage = read('src/app/dashboard/contacts/page.tsx')
const addCompany = page.slice(page.indexOf('function AddCompanyModal'), page.indexOf('// ── Company Detail Drawer'))
const contactsPanel = page.slice(page.indexOf('function CompanyContacts'), page.indexOf('function CompanyDrawer'))
const positionsPanel = page.slice(page.indexOf('function PositionsPanel'), page.indexOf('function CompanyContacts'))

const ext = (position: 'SUPPLIER' | 'CUSTOMER') => ({ action: 'COMPANY_EXTENDED', position })
const gone = (position: 'SUPPLIER' | 'CUSTOMER') => ({ action: 'COMPANY_POSITION_REMOVED', position })

describe('Whether a history row can be undone is read now', () => {
  it('the newest extension of a position held with nothing hanging off it reads "Can be undone"', () => {
    expect(historyUndoSays([ext('SUPPLIER')], { positions: ['SUPPLIER'], removable: { SUPPLIER: { ok: true } } })).toEqual([CAN_BE_UNDONE])
  })

  it('an extension with work hanging off it says it cannot be undone while that work is there', () => {
    expect(historyUndoSays([ext('SUPPLIER')], { positions: ['SUPPLIER'], removable: { SUPPLIER: { ok: false, code: 'STILL_IN_USE' } } })).toEqual([CANNOT_BE_UNDONE_NOW])
    expect(CANNOT_BE_UNDONE_NOW).toBe('Cannot be undone while work hangs off it')
  })

  it('an extension an agreement holds cannot be undone at all, and a reader who may not remove positions is told nothing either way', () => {
    expect(historyUndoSays([ext('CUSTOMER')], { positions: ['CUSTOMER'], removable: { CUSTOMER: { ok: false, code: 'HELD_BY_AGREEMENT' } } })).toEqual([CANNOT_BE_UNDONE])
    expect(historyUndoSays([ext('CUSTOMER')], { positions: ['CUSTOMER'], removable: { CUSTOMER: { ok: false, code: 'FORBIDDEN' } } })).toEqual([null])
  })

  it('an extension already taken back, and the removal itself, say nothing about undoing', () => {
    const rows = [gone('SUPPLIER'), ext('SUPPLIER')]
    expect(historyUndoSays(rows, { positions: [], removable: {} })).toEqual([null, null])
  })

  it('after extend, remove and extend again, only the newest extension can be undone', () => {
    const rows = [ext('SUPPLIER'), gone('SUPPLIER'), ext('SUPPLIER'), ext('CUSTOMER')]
    expect(historyUndoSays(rows, { positions: ['SUPPLIER', 'CUSTOMER'], removable: { SUPPLIER: { ok: true }, CUSTOMER: { ok: true } } }))
      .toEqual([CAN_BE_UNDONE, null, null, CAN_BE_UNDONE])
  })

  it('a company recorded, a Kind set, a record corrected and a contact added never say they can be undone', () => {
    const rows = ['COMPANY_CREATED', 'COMPANY_KIND_SET', 'COMPANY_RECORD_EDITED', 'CONTACT_RECORDED'].map((action) => ({ action, position: null }))
    expect(historyUndoSays(rows, { positions: ['SUPPLIER'], removable: { SUPPLIER: { ok: true } } })).toEqual([null, null, null, null])
  })

  it('the drawer prints the route’s reading, never the stored flag', () => {
    expect(positionsPanel).toContain('h.undoSays].filter(Boolean)')
    expect(positionsPanel).not.toContain("h.reversible ? 'Can be undone'")
  })

  it('a recorded company, a Kind set and a correction are written with an honest reversible flag of false', () => {
    expect(read('src/app/api/companies/[id]/kind/route.ts')).toMatch(/action: 'COMPANY_KIND_SET'[\s\S]*reversible: false/)
    expect(read('src/app/api/companies/[id]/record/route.ts')).toMatch(/action: 'COMPANY_RECORD_EDITED'[\s\S]*reversible: false/)
    expect(companiesRoute).not.toMatch(/action: 'COMPANY_CREATED'[^}]*\}[^}]*reversible: true/)
  })
})

describe('Extend on a Companies row', () => {
  it('keeps the route’s own sentence on the row where the press happened, with Undo beside it, and no confirm step', () => {
    expect(page).toContain('onDone(as, r.says)')
    expect(page).toContain("setPressed((p) => ({ ...p, [id]: { as, says, tone: 'ok', undo: true } }))")
    expect(page).toContain("{busy ? 'Undoing…' : 'Undo'}")
    expect(page).not.toMatch(/confirm\(/)
  })

  it('Undo calls the same remove the drawer uses, and shows its refusal in a sentence', () => {
    expect(page).toContain('fetch(`/api/companies/${encodeURIComponent(row.id)}/extend?as=${pressed.as}`, { method: \'DELETE\' })')
    expect(positionsPanel).toContain("act({ url: `${base}/extend?as=${p}`, method: 'DELETE' })")
    expect(page).toContain("onUndone({ ...pressed, tone: 'error', undo: false, says: refusalSentence(body.error?.message, { what: 'Undoing an extension' })")
  })

  it('says under Positions that Kind is set below and makes nobody a supplier or customer, only where the Kind box is offered', () => {
    expect(page).toContain("const KIND_IS_SET_BELOW = 'Kind is set below. It does not make them your supplier or customer.'")
    expect(positionsPanel).toContain('{read.may.setKind && <p className="mt-2 text-[12px] text-etyme-muted">{KIND_IS_SET_BELOW}</p>}')
  })

  it('opens the drawer of a company on the reader’s own list from ?open=, and opens nothing for any other id', () => {
    expect(page).toContain("const openId = searchParams.get('open')")
    expect(page).toContain('const c = companies.find((x) => x.id === openId)')
    expect(page).toContain('if (c) setSelected(c)')
  })
})

describe('Asking a firm to link calls one relationship one thing', () => {
  it('the ask, the answer and the waiting line use the Companies list’s own words: supplier and customer', () => {
    expect(wordFor('SUPPLIER', 'VENDOR')).toBe('supplier')
    expect(wordFor('SUPPLIER', 'CLIENT')).toBe('supplier')
    expect(wordFor('CLIENT', 'VENDOR')).toBe('customer')
    const sides = { asker: { name: 'Harborline Tech', kind: 'VENDOR' }, other: { name: 'Northwind Staffing', kind: 'VENDOR' }, relationship: 'SUPPLIER' as const }
    expect(askerReads(sides)).toBe('You asked Northwind Staffing to link as your supplier. Nothing is on either Companies list until they say yes.')
    expect(readerReads({ ...sides, askedBy: 'Dana Whitfield' }).title).toBe('Harborline Tech asks to link as your prime')
    expect(read('src/app/api/trade-links/[id]/route.ts')).not.toContain('on your companies')
  })

  it('a company not classified yet is asked about as your supplier or your customer, the two choices the box offers, never as a partner', () => {
    expect(companiesRoute).toContain("const EITHER_SIDE = 'supplier or your customer'")
    expect(companiesRoute).not.toContain("onEtymeAskToLinkSays('partner')")
    expect(onEtymeAskToLinkSays('supplier or your customer')).toContain('Ask them to link, as your supplier or your customer:')
    expect(addCompany).toContain('<option value="SUPPLIER">as your supplier</option>')
    expect(addCompany).toContain('<option value="CLIENT">as your customer</option>')
  })

  it('a name alone says which box to type the domain in, never "below", since the boxes are above the sentence', () => {
    expect(companiesRoute).toContain('and type it in the Domain box or the Etyme address box.')
    expect(companiesRoute).not.toContain('type it below')
  })
})

describe('Add a company and a company’s contacts', () => {
  it('every label on Add a company is tied to its box, so a screen reader can name it', () => {
    for (const id of ['add-company-name', 'add-company-kind', 'add-company-relationship', 'add-company-entity-type', 'add-company-contact', 'add-company-email', 'add-company-domain', 'add-company-address']) {
      expect(addCompany).toContain(`htmlFor="${id}"`)
      expect(addCompany).toContain(`id="${id}"`)
    }
  })

  it('Cancel on Add a contact in a company’s drawer clears what was typed, so the next try carries no stale email', () => {
    expect(contactsPanel).toContain("onClick={() => { setAdding(false); setForm({ name: '', email: '', phone: '', title: '' }); setNamesake(false); setMessage(null) }}>Cancel</button>")
  })

  it('the same-person question reads with any name and is asked once on Contacts', () => {
    const existing = [{ id: 'c1', name: 'Imani Osei', email: null, phone: null, atCompanyId: 'nw' }]
    expect(sameNameOnFile({ name: 'imani osei', atCompanyId: 'nw' }, existing)?.says).toBe('Somebody named Imani Osei is already in your Contacts at this company. Is this the same person?')
    expect(contactsPage).toContain("if (body.error?.code === 'SAME_NAME') setNamesake(true)\n        else if (body.error?.field) setFieldErrors(")
  })

  it('a contact’s role made only of spaces is no role, read as Other like an empty one', () => {
    expect(contactKindOf('   ')).toBeNull()
    expect(contactKindOf(' CLIENT_CONTACT ')).toBe('CLIENT_CONTACT')
    expect(problems({ name: 'Rowan Pike', email: 'rowan@northwind-staffing.example', kind: '   ' })).toEqual([])
  })
})
