import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  ITEM_ORDER, itemsFor, checklistFor, stateOf, reminderSentence, checkItemAnswer, sourceWords, bankWords, lastFour,
  bankStanding, ITEM_WORDS, NO_FACTS, CHECKLIST_HREF, type ChecklistFacts,
} from '@/lib/setup-checklist'
import {
  billingAddressGate, bankGate, mayJoinByDomain, paperChaseGate, NO_BILLING_ADDRESS,
} from '@/lib/setup-gate-rules'
import { readW9, readCoi, readPaperByRules, fromWorkEmail, splitCityLine, textOfUpload } from '@/lib/setup-fill'
import { readMissingWithModel, withoutTaxNumbers, MODEL_SAYS } from '@/lib/setup-fill-model'
import { defaultRequiredSets } from '@/lib/document-stages/required-sets'
import { decideEntry } from '@/lib/company-domains'
import { effectiveRequirements, defaultItemsFor } from '@/lib/document-requirements'

/**
 * The admin's setup checklist (founder, 2026-10-22; "Build it",
 * 2026-10-28): eleven items, every one skippable, the one line that comes
 * back until the list is empty, where each answer came from, and what a
 * skipped item refuses.
 */

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const facts = (over: Partial<ChecklistFacts> = {}): ChecklistFacts => ({ ...NO_FACTS, papersOwed: ['SUB_VENDORS', 'CORP_TO_CORP'], ...over })

/** The text layer of a filled W-9 (Rev. March 2024), as a PDF reader prints it. */
const W9 = `Form W-9
(Rev. March 2024)
Request for Taxpayer Identification Number and Certification
1 Name of entity/individual. An entry is required.
Tapin LLC
2 Business name/disregarded entity name, if different from above.
Tap In Staffing
3a Check the appropriate box for federal tax classification
5 Address (number, street, and apt. or suite no.). See instructions.
1200 Commerce Street, Suite 400
6 City, state, and ZIP code
Dallas, TX 75202
Part I Taxpayer Identification Number (TIN)
Employer identification number
12-3456789`

const COI = `CERTIFICATE OF LIABILITY INSURANCE   DATE (MM/DD/YYYY) 05/20/2026
ACORD 25
INSURER A : Granite Mutual Insurance Company 12345
COMMERCIAL GENERAL LIABILITY  GL-778812  06/01/2026  06/01/2027  EACH OCCURRENCE $1,000,000`

describe('the eleven items, in order', () => {
  it('reads Your company, Addresses, Sites, the people in charge, how you work, papers, bank details, your companies, your team, your domain and integrations, in that order', () => {
    expect(ITEM_ORDER.map((k) => ITEM_WORDS[k].label)).toEqual([
      'Your company', 'Addresses', 'Sites', 'The people in charge', 'How you work', 'Papers you require',
      'Bank details', 'Your companies', 'Your team', 'Your domain', 'Integrations',
    ])
  })

  it('a one-person firm’s checklist has no team, no sites and no papers for suppliers', () => {
    const mine = itemsFor('CONSULTANT_CORP')
    expect(mine).not.toContain('TEAM')
    expect(mine).not.toContain('SITES')
    expect(mine).toContain('PAPERS')
    expect(defaultRequiredSets('CONSULTANT_CORP').map((s) => s.party)).toEqual(['CUSTOMERS'])
    expect(checkItemAnswer('CONSULTANT_CORP', 'TEAM', 'SKIPPED')).toEqual({ ok: false, says: 'A one-person firm has no team to invite.' })
  })

  it('a client is never asked for bank details, because it pays and is not paid', () => {
    expect(itemsFor('CLIENT')).not.toContain('BANK')
    expect(itemsFor('VENDOR')).toEqual(ITEM_ORDER)
  })

  it('every item can be skipped and the company still works', () => {
    for (const kind of ['CLIENT', 'VENDOR', 'GSI', 'MSP', 'CONSULTANT_CORP']) {
      for (const item of itemsFor(kind)) {
        expect(checkItemAnswer(kind, item, 'SKIPPED'), `${kind} ${item}`).toMatchObject({ ok: true })
        // Each says what skipping stops, and nothing else.
        expect(ITEM_WORDS[item].skipStops).toMatch(/^If you skip: /)
      }
    }
    // Four skips refuse one act each, and say which; the rest stop nothing.
    expect(ITEM_WORDS.ADDRESSES.skipStops).toBe('If you skip: Etyme sends no bill until there is a billing address, and says so on the bill.')
    expect(ITEM_WORDS.BANK.skipStops).toBe('If you skip: nobody pays this company until its bank details are checked.')
    expect(ITEM_WORDS.DOMAIN.skipStops).toBe('If you skip: colleagues join by invitation until the domain is verified.')
    expect(ITEM_WORDS.PAPERS.skipStops).toMatch(/does not chase a paper for a party whose set you have not confirmed/)
    for (const k of ['PEOPLE_IN_CHARGE', 'COMPANIES', 'TEAM', 'INTEGRATIONS'] as const) expect(ITEM_WORDS[k].skipStops).toMatch(/nothing stops/)
  })

  it('says done, skipped and to do in words, never a percentage', () => {
    const c = checklistFor({ kind: 'CLIENT', record: { TEAM: { outcome: 'SKIPPED', byId: 'p', at: '2026-10-28T00:00:00Z' } }, facts: facts({ legalNameSet: true }) })
    expect(c.countLine).toBe('1 done · 1 skipped · 8 to do')
    expect(c.intro).toBe('Ten things. Skip any of them for now. This list stays on Today until it is done.')
    expect(c.rows.find((r) => r.key === 'TEAM')!.line).toBe('Skipped. Nothing stops. Invite people any time from Users & permissions.')
    const page = src('src/app/dashboard/settings/setup/page.tsx') + src('src/app/dashboard/settings/setup/items.tsx')
    expect(page).not.toMatch(/%|progress/i)
  })
})

describe('a skipped item comes back', () => {
  it('a skipped item comes back on Today until it is done', () => {
    const skipped = { ADDRESSES: { outcome: 'SKIPPED' as const, byId: 'p', at: '2026-10-28T00:00:00Z' } }
    expect(stateOf('ADDRESSES', skipped, facts())).toBe('SKIPPED')
    const c = checklistFor({ kind: 'VENDOR', record: skipped, facts: facts() })
    expect(reminderSentence(c.owed)).toBe('Finish setting up: your company, addresses, your sites and 8 more.')
    // At most three named, so it stays one short sentence; the page lists them all.
    expect(reminderSentence(['ADDRESSES', 'BANK'])).toBe('Finish setting up: addresses, bank details.')
    expect(reminderSentence(c.owed)!.split(' ').length).toBeLessThanOrEqual(20)
    // Done another way — the address saved on Settings — it leaves the line.
    const done = checklistFor({ kind: 'VENDOR', record: skipped, facts: facts({ legalAddress: true, billingAddress: true }) })
    expect(done.owed).not.toContain('ADDRESSES')
    expect(reminderSentence([])).toBeNull()
    expect(CHECKLIST_HREF).toBe('/dashboard/settings/setup')
  })

  it('is one line on the three consoles, with Complete setup, never a line per item', () => {
    const r = src('src/components/setup-reminder.tsx')
    expect(r).toContain("new Set(['/dashboard', '/dashboard/program', '/dashboard/my-work'])")
    expect(r).toContain("line.link ?? 'Complete setup'")
    expect(src('src/lib/setup-state.ts')).toContain('checklistReminder(companyId)')
  })
})

describe('where an answer came from', () => {
  it('an answer records who gave it, when, and where it came from', () => {
    expect(sourceWords({ source: 'PAPER', quote: 'Tapin LLC', by: 'Sharath Madavaram', at: '2026-10-28T12:00:00Z', paper: 'W-9' }))
      .toBe('From your W-9: “Tapin LLC”. Confirmed by Sharath Madavaram, Oct 28, 2026.')
    expect(sourceWords({ source: 'DOMAIN', quote: 'sharath@tapin.com', by: 'Sharath Madavaram', at: '2026-10-28T12:00:00Z' }))
      .toBe('Guessed from your work email: “sharath@tapin.com”. Confirmed by Sharath Madavaram, Oct 28, 2026.')
    expect(sourceWords({ source: 'PERSON', by: 'Sharath Madavaram', at: '2026-10-28T12:00:00Z' })).toBe('Typed by Sharath Madavaram, Oct 28, 2026.')
  })

  it('the work email gives the website, the country and the currency as guesses, and a personal or seeded address gives none', () => {
    expect(fromWorkEmail('sharath@tapin.co.uk')).toEqual({ domain: 'tapin.co.uk', website: 'https://tapin.co.uk', country: 'GB', currency: 'GBP', quote: 'sharath@tapin.co.uk' })
    expect(fromWorkEmail('ines.rocha@gmail.com')).toBeNull()
    expect(fromWorkEmail('sharath@etyme.com')).toBeNull()
    expect(fromWorkEmail('owner@northbend.example')).toBeNull()
  })

  it('a W-9 fills the legal name and address and is confirmed before it is recorded', () => {
    const got = Object.fromEntries(readW9(W9).map((v) => [v.field, v]))
    expect(got.legalName).toMatchObject({ value: 'Tapin LLC', quote: 'Tapin LLC', readBy: 'RULES' })
    expect(got.dba.value).toBe('Tap In Staffing')
    expect(got['legal.street'].value).toBe('1200 Commerce Street, Suite 400')
    expect(got['legal.city'].value).toBe('Dallas')
    expect(got['legal.state'].value).toBe('TX')
    expect(got['legal.postalCode'].value).toBe('75202')
    expect(got.taxId.value).toBe('12-3456789')
    expect(readPaperByRules(W9)).toMatchObject({ kind: 'W9', missing: [] })
    // The reader never writes: the route that reads holds no prisma write.
    const reader = src('src/app/api/settings/setup/read-paper/route.ts')
    expect(reader).not.toMatch(/prisma\.|recordAnswers|recordItem/)
  })

  it('a certificate of insurance gives the insurer and the two dates, each with the line it was read from', () => {
    const got = Object.fromEntries(readCoi(COI).map((v) => [v.field, v.value]))
    expect(got).toEqual({ insurer: 'Granite Mutual Insurance Company', coverFrom: '2026-06-01', coverUntil: '2027-06-01' })
    expect(splitCityLine('Dayton, OH 45402')).toEqual({ city: 'Dayton', state: 'OH', postalCode: '45402' })
  })

  it('reads the words of a text file as they are, and finds none in a scanned page', () => {
    expect(textOfUpload(Buffer.from(W9), 'text/plain', 'w9.txt')).toContain('Tapin LLC')
    expect(textOfUpload(Buffer.from('%PDF-1.4\n%binary scan with no text\n'), 'application/pdf', 'scan.pdf')).toBe('')
  })

  it('the model reads nothing where the company has not turned it on, and nothing is sent', async () => {
    let sent = 0
    const r = await readMissingWithModel(
      { companyId: 'c', personId: 'p', kind: 'W9', text: W9, missing: ['legalName'] },
      { modelOn: async () => false, readerSetUp: () => true, extract: async () => { sent++; return null }, record: async () => { sent++ }, vocab: async () => ({}) },
    )
    expect(r).toEqual({ values: [], says: MODEL_SAYS.off })
    expect(sent).toBe(0)
  })

  it('where the model is on, it is asked only what the rules missed, masked, never a tax number, and the prompt is logged', async () => {
    const logged: any[] = []
    let asked = ''
    const r = await readMissingWithModel(
      { companyId: 'c', personId: 'p', kind: 'W9', text: W9, missing: ['legal.city', 'taxId'] },
      {
        modelOn: async () => true, readerSetUp: () => true,
        extract: async (spec, masked) => {
          asked = masked
          expect(spec.fields.map((f) => f.key)).toEqual(['legal.city'])
          return { method: 'MODEL', note: '', unread: [], records: [{ rowNumber: 1, problems: [], fields: [{ field: 'legal.city', value: 'Dallas', confidence: 0.9, foundIn: 'Dallas, TX 75202', concern: null }] }] }
        },
        record: async (p) => { logged.push(p) },
        vocab: async () => ({ firms: ['Tapin LLC'] }),
      },
    )
    expect(asked).not.toContain('12-3456789')
    expect(asked).not.toContain('Tapin LLC')
    expect(logged).toHaveLength(1)
    expect(logged[0].purpose).toBe('SETUP_PAPER')
    expect(r.values).toEqual([{ field: 'legal.city', value: 'Dallas', quote: 'Dallas, TX 75202', readBy: 'MODEL' }])
    expect(withoutTaxNumbers('EIN 12-3456789, SSN 123-45-6789')).toBe('EIN [tax number], SSN [tax number]')
  })

  it('never offers to read the company’s website, because the guarded read is not built', () => {
    const page = src('src/app/dashboard/settings/setup/items.tsx')
    expect(page).not.toMatch(/Read from our website/i)
    expect(src('src/lib/setup-fill.ts')).not.toMatch(/\bfetch\(/)
  })
})

describe('bank details', () => {
  it('bank details are shown as the bank, the account name and four digits', () => {
    expect(lastFour('021000021 4455667788')).toBe('7788')
    expect(lastFour('12')).toBeNull()
    expect(bankWords({ bankName: 'Bellrock Bank', accountName: 'Tapin LLC', last4: '7788' })).toBe('Bellrock Bank · Tapin LLC · ending 7788')
    expect(bankStanding({ verifiedAt: null })).toBe('Not checked yet. Each client’s Finance team checks these before it pays you.')
    // No column holds more than four digits of an account.
    const schema = src('prisma/schema.prisma')
    const remit = schema.match(/^model RemitTo \{([\s\S]*?)^\}/m)![1]
    expect(remit).not.toMatch(/accountNumber|routingNumber/)
  })
})

describe('what a skipped item refuses', () => {
  it('a bill is refused without a billing address, and the refusal names the step', () => {
    const none = { billingSameAsLegal: true, legal: null, billing: null, remitAddressLines: [] }
    expect(billingAddressGate(none)).toEqual({ ok: false, says: 'Add a billing address under Setup → Addresses, then send the bill.', step: 'ADDRESSES' })
    expect(NO_BILLING_ADDRESS).toBe('Add a billing address under Setup → Addresses, then send the bill.')
    expect(billingAddressGate({ ...none, legal: { street: '1200 Commerce Street', city: 'Dallas' } })).toEqual({ ok: true })
    // A separate billing address is read only where it is not the legal one.
    expect(billingAddressGate({ ...none, billingSameAsLegal: false, legal: { street: '1 A St', city: 'Dallas' } }).ok).toBe(false)
    // A company set up before the checklist: its payment details' address, which its bills already printed.
    expect(billingAddressGate({ ...none, remitAddressLines: ['Dallas, TX'] })).toEqual({ ok: true })
  })

  it('no firm is paid until its bank details are checked, here or on the supplier’s walk', () => {
    expect(bankGate({ payee: 'Fenwick Staffing', remitVerified: false, walkBankState: 'PROVIDED' })).toEqual({
      ok: false, step: 'BANK',
      says: 'Pay Fenwick Staffing once its bank details are checked. Fenwick Staffing enters them under Setup → Bank details, and your Finance team checks them before anybody pays.',
    })
    expect(bankGate({ payee: 'Fenwick Staffing', remitVerified: false, walkBankState: 'HELD' })).toEqual({ ok: true })
    expect(bankGate({ payee: 'Fenwick Staffing', remitVerified: true, walkBankState: null })).toEqual({ ok: true })
  })

  it('a colleague joins by domain only once the domain is verified, and is told how to get in', () => {
    expect(mayJoinByDomain({ companyName: 'Tapin', domain: 'tapin.com', verified: true })).toEqual({ ok: true })
    const e = decideEntry('dev@tapin.com', [{ domain: 'tapin.com', companyId: 't', companyName: 'Tapin', verified: false, joinPolicy: 'AUTO' }])
    expect(e).toEqual({
      action: 'REFUSE',
      message: 'Tapin has not verified tapin.com yet, so colleagues join by invitation. Ask Tapin to invite you, or to verify tapin.com under Setup → Your domain.',
    })
    expect(decideEntry('dev@tapin.com', [{ domain: 'tapin.com', companyId: 't', companyName: 'Tapin', verified: true, joinPolicy: 'AUTO' }]).action).toBe('JOIN')
  })

  it('no paper is chased for a party whose set was never confirmed', () => {
    expect(paperChaseGate('WORKERS_W2', [])).toEqual({
      ok: false, step: 'PAPERS',
      says: 'Etyme does not chase your W2 employees for papers until you confirm what you require of them, under Setup → Papers you require.',
    })
    expect(paperChaseGate('WORKERS_W2', ['WORKERS_W2'])).toEqual({ ok: true })
  })
})

describe('papers you require, as every order’s floor', () => {
  const row = (key: string, over: Record<string, unknown> = {}) => ({
    id: `r-${key}`, documentTypeKey: key, required: true, owedBy: 'WORKER', blocks: null, inheritedFromId: null, note: null,
    waivedReason: null, waivedById: null, waivedAt: null, ...over,
  }) as any

  it('a set confirmed as shipped changes nothing a line says', () => {
    const floor = effectiveRequirements({ shape: 'W2' })
    const confirmed = effectiveRequirements({ shape: 'W2', companyRows: defaultItemsFor('W2').map((d) => row(d.key, { required: d.required, owedBy: d.owedBy ?? 'WORKER' })) })
    expect(confirmed.map((i) => [i.key, i.required, i.says])).toEqual(floor.map((i) => [i.key, i.required, i.says]))
  })

  it('what a company adds or waives at setup reaches every line, and work authorization is never waived', () => {
    const items = effectiveRequirements({
      shape: 'W2',
      companyRows: [row('DRUG_SCREEN'), row('I9_EVERIFY', { waivedReason: 'We never ask', waivedAt: new Date('2026-10-28') })],
      companySays: 'required by Tapin’s own papers, set at setup',
    })
    const drug = items.find((i) => i.key === 'DRUG_SCREEN')
    expect(drug).toMatchObject({ required: true, id: null, says: 'required by Tapin’s own papers, set at setup' })
    const i9 = items.find((i) => i.key === 'I9_EVERIFY')!
    expect(i9).toMatchObject({ required: true, waived: false, waiverRefused: true })
  })
})

describe('only the Owner or Admin', () => {
  it('only the Owner or Admin reads the checklist', () => {
    const door = src('src/app/api/settings/setup/door.ts')
    expect(door).toContain("hasPermission(caller.permissions, 'settings.manage')")
    for (const f of ['route.ts', '[item]/route.ts', 'read-paper/route.ts']) {
      expect(src(`src/app/api/settings/setup/${f}`), f).toContain('await setupDoor(request')
    }
  })
})
