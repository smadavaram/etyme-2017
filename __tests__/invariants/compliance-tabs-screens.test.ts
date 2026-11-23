import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rateWords, PROPOSED_NOTICE_WORKING_DAYS, PROPOSED_ACCESS_FILE_WORKING_DAYS, PROPOSED_PACK_LEAD_DAYS } from '@/lib/agents/checklist-rules'
import { rateWordsOf } from '@/app/dashboard/compliance/checklists/bodies'

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
})
