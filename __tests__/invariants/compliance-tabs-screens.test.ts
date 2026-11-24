import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rateWords, PROPOSED_NOTICE_WORKING_DAYS, PROPOSED_ACCESS_FILE_WORKING_DAYS, PROPOSED_PACK_LEAD_DAYS } from '@/lib/agents/checklist-rules'
import { rateWordsOf } from '@/app/dashboard/compliance/checklists/bodies'
import { kindWords, petitionWords, stageWords } from '@/app/dashboard/compliance/act-spec'
import { rolesFor } from '@/lib/company-defaults'
import { getNavForKind } from '@/lib/nav-table'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SavedLine } from '@/app/dashboard/compliance/act-form'
import { recordNoticeFields, timingChip, filingDayFields } from '@/app/dashboard/compliance/notices/bodies'

/**
 * The Checklists and Notices tabs of Contracts (record 112, chains 3 and 6):
 * the words on them, and that they draw nothing a phone cuts off.
 */

const root = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const SCREENS = [
  'src/app/dashboard/compliance/checklists/page.tsx', 'src/app/dashboard/compliance/notices/page.tsx',
  'src/app/dashboard/compliance/act-form.tsx', 'src/app/dashboard/compliance/act-spec.ts',
  'src/app/dashboard/compliance/checklists/bodies.ts', 'src/app/dashboard/compliance/notices/bodies.ts',
]
const GETS = ['checklist-items/route.ts', 'notice-postings/route.ts', 'access-files/route.ts']

describe('the Checklists and Notices tabs', () => {
  it('an agreed rate typed on the form is kept in the very words the contracts agent keeps a rate in', () => {
    for (const [dollars, currency] of [['95', 'USD'], ['112.5', 'USD'], ['80', 'CAD']] as const) {
      expect(rateWordsOf(dollars, currency)).toBe(rateWords(Math.round(Number(dollars) * 100), currency))
    }
  })

  it('every period that is only a proposal says so beside it: the notice period, the access file day and the five-day lead', () => {
    const notices = read('src/app/dashboard/compliance/notices/page.tsx')
    const checklists = read('src/app/dashboard/compliance/checklists/page.tsx')
    expect(notices.match(/\$\{PROPOSED\}/g)?.length).toBe(2)
    expect(notices).toContain("const PROPOSED = 'Proposed rule, not yet confirmed with its source.'")
    expect(checklists).toContain('Proposed rule, not yet confirmed with its source.')
    expect(checklists).toContain('packLeadDays')
  })

  it('the periods the screens print are read from the rules, not typed into the page', () => {
    for (const p of ['src/app/dashboard/compliance/checklists/page.tsx', 'src/app/dashboard/compliance/notices/page.tsx']) {
      const src = read(p)
      for (const n of [PROPOSED_NOTICE_WORKING_DAYS, PROPOSED_ACCESS_FILE_WORKING_DAYS, PROPOSED_PACK_LEAD_DAYS]) {
        expect(src, `${p} types ${n} days`).not.toMatch(new RegExp(`\\b${n} (working )?days?\\b`))
      }
    }
    for (const g of GETS) expect(read(`src/app/api/compliance/${g}`), g).toContain('confirmed: false')
  })

  it('the lists say that each rule warns and nothing here stops a start, a payment or work', () => {
    expect(read('src/app/dashboard/compliance/checklists/page.tsx')).toContain('nothing here stops a start or a payment')
    expect(read('src/app/dashboard/compliance/notices/page.tsx')).toContain('Nothing here stops work')
  })

  it('the screens never say desk or program office, and name no real company', () => {
    for (const p of SCREENS) {
      const src = read(p)
      expect(src, p).not.toMatch(/\bdesks?\b/i)
      expect(src, p).not.toMatch(/program office/i)
    }
  })

  it('no row is a table that scrolls sideways or a line that refuses to wrap, so nothing is cut off at 390 pixels', () => {
    for (const p of SCREENS.filter((s) => s.endsWith('.tsx'))) {
      const src = read(p)
      expect(src, p).not.toContain('<table')
      expect(src, p).not.toContain('whitespace-nowrap')
      expect(src, p).not.toContain('overflow-x')
    }
    const rows = read('src/app/dashboard/compliance/notices/page.tsx')
    expect(rows).toContain('flex flex-col gap-2 sm:flex-row')
    expect(read('src/app/dashboard/compliance/act-form.tsx')).toContain('grid-cols-1')
  })

  it('every refusal from a route is said on the form that sent it, in the route’s own words', () => {
    const form = read('src/app/dashboard/compliance/act-form.tsx')
    expect(form).toContain('saveForm')
    expect(form).toContain('<FormMessage tone="error">{error}</FormMessage>')
  })

  it('a petition paper offers no waiver, because the route offers none and a waiver would not complete a petition', () => {
    expect(read('src/app/dashboard/compliance/checklists/page.tsx')).not.toMatch(/label="Waive/i)
  })

  it('no screen here draws a verdict about a person: it records papers, dates and who signed', () => {
    for (const p of SCREENS) expect(read(p), p).not.toMatch(/cleared to place|overallVerdict|\bapproved to work\b/i)
  })

  it('the Notices tab is drawn only for a seat holding the permission HR and the compliance officer hold and the recruiter, account manager and contract manager do not', () => {
    const items = JSON.stringify(getNavForKind('VENDOR', false))
    const at = items.indexOf('"label":"Notices"')
    expect(items.slice(at, at + 400)).toContain('"needs":["governance.read"]')
    const holds = (role: string) => (rolesFor('VENDOR').find((r) => r.name === role)!.permissions as readonly string[]).includes('governance.read')
    expect(['HR', 'Compliance Officer'].map(holds)).toEqual([true, true])
    expect(['Recruiter', 'Account Manager', 'Contract Manager'].map(holds)).toEqual([false, false, false])
  })

  it('the Checklists page asks for petitions only after the contract list says this seat keeps them, so a contract manager sees no petition section and no refusal', () => {
    const src = read('src/app/dashboard/compliance/checklists/page.tsx')
    expect(src).toContain('c.data?.keepsPapers ?')
    expect(src).not.toContain('Promise.all([read<Contract>')
    expect(src).not.toContain('says.petitions')
  })

  it('a petition kind prints as written for people, a machine word becomes words, and a stage is a capitalized word', () => {
    expect(petitionWords('H-1B extension')).toBe('H-1B extension petition')
    expect(petitionWords('H-1B extension petition')).toBe('H-1B extension petition')
    expect(kindWords('SPECIALTY_OCCUPATION')).toBe('Specialty occupation')
    expect(kindWords('OPT')).toBe('OPT')
    expect(stageWords('FILED')).toBe('Filed')
  })

  it('both forms sit below the panel heading, never inside its header row, and stack one field per line on a phone', () => {
    for (const p of ['checklists', 'notices']) expect(read(`src/app/dashboard/compliance/${p}/page.tsx`), p).not.toMatch(/\baction=\{(petitions|notices)\.mayRecord/)
    const form = read('src/app/dashboard/compliance/act-form.tsx')
    expect(form).toContain('grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2')
    expect(form).toContain('w-full max-w-full')
    expect(read('src/app/dashboard/compliance/notices/page.tsx')).toContain('mb-4 min-w-0')
  })

  it('every act says what it saved on the page after its form closes, and the sentence goes away by itself', () => {
    const form = read('src/app/dashboard/compliance/act-form.tsx')
    expect(form).toContain('onDone(saved?.data?.message')
    expect(form).toContain('setTimeout(() => setSaved(null)')
    for (const p of ['checklists', 'notices']) {
      const src = read(`src/app/dashboard/compliance/${p}/page.tsx`)
      expect(src, p).toContain('<SavedLine says={saved} />')
      expect(src, p).not.toContain('onDone={load}')
    }
  })

  it('an act\u2019s saved sentence is drawn once on the page', () => {
    const html = renderToStaticMarkup(createElement(SavedLine, { says: 'Saved. Each paper is its own line.' }))
    expect(html.match(/Saved\. Each paper/g)?.length).toBe(1)
    expect(html.match(/role="status"/g)?.length).toBe(1)
    for (const p of ['checklists', 'notices']) expect(read(`src/app/dashboard/compliance/${p}/page.tsx`).match(/<SavedLine /g)?.length, p).toBe(1)
  })

  it('a petition\u2019s kind prints H-1B and never says petition twice', () => {
    expect(petitionWords('H-1b transfer')).toBe('H-1B transfer petition')
    expect(petitionWords('H1B_TRANSFER')).toBe('H-1B transfer petition')
    expect(petitionWords('h-1b transfer petition')).toBe('H-1B transfer petition')
    expect(petitionWords('L1A_EXTENSION')).toBe('L-1A extension petition')
    expect(petitionWords('o-1')).toBe('O-1 petition')
    expect(petitionWords('tn')).toBe('TN petition')
    expect(petitionWords('SPECIALTY_OCCUPATION')).toBe('Specialty occupation petition')
    expect(petitionWords('Green card petition')).toBe('Green card petition')
    const route = read('src/app/api/compliance/immigration-petitions/route.ts')
    expect(route).toContain('petitionWords(kind)')
    expect(route).not.toContain("toLowerCase().replace(/_/g, ' ')} petition")
  })

  it('a contract item with no signed paper reads No signed paper in a quiet chip, never a green one, and the statement of work line offers no paper to record', () => {
    const page = read('src/app/dashboard/compliance/checklists/page.tsx')
    expect(page).toContain("i.state === 'OPEN' ? 'No signed paper'")
    expect(page).toContain("i.state === 'MET' ? 'verified' : 'passive'")
    expect(page).toContain('contract.mayRecord && i.recordable')
  })

  it('a notice dated on its filing day is not called dated before it', () => {
    expect(timingChip('ON_TIME')).toEqual({ tone: 'passive', text: 'Dated on or before filing' })
  })

  it('the notices form offers the filing day field that the route accepts, and so does the row’s own act', () => {
    expect(recordNoticeFields([], []).map((f) => f.key)).toContain('measuredFromOn')
    expect(filingDayFields([]).map((f) => f.key)).toEqual(['measuredFromOn'])
    for (const r of ['notice-postings/route.ts', 'notice-postings/[id]/route.ts']) expect(read(`src/app/api/compliance/${r}`), r).toContain('measuredFromOn')
  })

  it('the notices screen shows no green chip for any timing, and no chip where there is no filing day', () => {
    expect(timingChip(null)).toBeNull()
    for (const t of ['ON_TIME', 'LATE', 'TOO_EARLY'] as const) expect(timingChip(t)!.tone).not.toBe('verified')
    expect(timingChip('ON_TIME')!.tone).toBe('passive')
    expect(timingChip('LATE')!.text).toBe('Dated after filing')
    expect(timingChip('TOO_EARLY')!.text).toBe('Dated early')
  })

  it('the notices screen says the timing rule is a proposal beside its chip', () => {
    expect(read('src/app/dashboard/compliance/notices/page.tsx')).toContain('timingChip(')
    expect(read('src/app/dashboard/compliance/notices/page.tsx')).toMatch(/Proposed rule, not yet confirmed with its source/)
  })
})
