import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sectionOfHref } from '@/lib/page-framing'

/**
 * Round four of the sign-up walk, 2026-10-08, on the buying side's pages
 * (docs/results/2026-10-08-signup-round-4.md). Each sentence is one fix
 * the walk asked for, numbered as the walk numbered it. Problem 1 — the
 * routes a desk-less Member reaches by URL — is the architect's shared
 * door in lib/api-context and is not tested here.
 */

const read = (p: string) => readFileSync(join(process.cwd(), 'src/app/dashboard', p, 'page.tsx'), 'utf8')

/** The page keeps the door's own sentence on a 403, and returns it alone. */
const REFUSED_HELD = /res\.status === 403\)[\s\S]{0,200}setRefused\(/
const REFUSED_ALONE = /if \(refused\) \{\s*return <p className="[^"]*">\{refused\}<\/p>\s*\}/

const REFUSING_PAGES = [
  'timesheets', 'program', 'requirements', 'submissions', 'requisitions', 'people',
  'decisions', 'suppliers', 'program/budget', 'program/org',
]

describe('3: a page the door refused draws the refusal sentence and nothing else', () => {
  it('every buying-side page that reads a list keeps the refusal sentence the door sent when it answers 403', () => {
    const missing = REFUSING_PAGES.filter((p) => !REFUSED_HELD.test(read(p)))
    expect(missing).toEqual([])
  })

  it('every one of those pages returns that sentence alone when refused, with no heading, tile or zero beside it', () => {
    const missing = REFUSING_PAGES.filter((p) => !REFUSED_ALONE.test(read(p)))
    expect(missing).toEqual([])
  })

  it('a refused Timesheets page never shows "Pending approval 0 all clear" or "$0" above the refusal', () => {
    const src = read('timesheets')
    const gate = src.search(REFUSED_ALONE)
    expect(gate).toBeGreaterThan(-1)
    expect(gate).toBeLessThan(src.indexOf('<p className="stat-label">Pending approval</p>'))
    expect(gate).toBeLessThan(src.indexOf('<p className="stat-label">Approved value</p>'))
  })

  it('the Timesheets tiles are drawn only after a read that answered, never beside a failure', () => {
    expect(read('timesheets')).toMatch(/\{company\?\.kind && readOnce && !error && \(/)
  })

  it('on the program dashboard a refused tenure read says why under Tenure to watch instead of "Reading…" for ever', () => {
    const src = read('program')
    expect(src).toMatch(/\.catch\(\(err: any\) => \{\s*setTenure\(null\)\s*setTenureSays\(/)
    expect(src).toMatch(/tenure === null && tenureSays && <p[^>]*>\{tenureSays\}<\/p>/)
    expect(src).toMatch(/tenure === null && !tenureSays && <p[^>]*>Reading…<\/p>/)
  })

  it('on the program dashboard the Tenure tile is not drawn at all when tenure was refused', () => {
    expect(read('program')).toMatch(/\{!tenureSays && <Stat label="Tenure"/)
  })

  it('on the program dashboard a refused queue says why, and never reads "Nothing needs you today."', () => {
    const src = read('program')
    expect(src).toMatch(/queueSays \? 'Your queue could not be read\.' : said\.says/)
    expect(src).toMatch(/queueLoaded && queueSays && <p[^>]*>\{queueSays\}<\/p>/)
    expect(src).toMatch(/queueLoaded && !queueSays && queue\.length === 0/)
  })
})

describe('15: an eyebrow names the section the page sits under on the reader’s own menu', () => {
  it('Suppliers reads its section from the menu and no longer types "Network"', () => {
    const src = read('suppliers')
    expect(src).toMatch(/usePageSection\('\/dashboard\/suppliers'\)/)
    expect(src).not.toMatch(/<p className="eyebrow">Network<\/p>/)
  })

  it('a program office reads Suppliers under Supply, and a client under Network', () => {
    expect(sectionOfHref('MSP', '/dashboard/suppliers')).toBe('Supply')
    expect(sectionOfHref('CLIENT', '/dashboard/suppliers')).toBe('Network')
  })

  it('Budget reads its section from the menu and no longer types "Governance"', () => {
    const src = read('program/budget')
    expect(src).toMatch(/usePageSection\('\/dashboard\/program\/budget'\)/)
    expect(src).not.toMatch(/<p className="eyebrow">Governance<\/p>/)
    expect(sectionOfHref('CLIENT', '/dashboard/program/budget')).toBe('Workforce')
  })

  it('Program team heads with a section from the menu, never the company’s name', () => {
    const src = read('program/team')
    expect(src).toMatch(/usePageSection\('\/dashboard\/program\/team'\)/)
    expect(src).not.toMatch(/eyebrow">\{team\.company\.name\}/)
    expect(sectionOfHref('CLIENT', '/dashboard/program/team')).toBe('Governance')
  })

  it('a program office in a client’s seat reads Program team under the client’s Governance, not its own firm’s name', () => {
    expect(sectionOfHref('MSP', '/dashboard/program/team', { seated: true, clientName: 'Cavanaugh Glassworks' } as any)).toBe('Governance')
  })

  it('all three draw no eyebrow at all while the reader’s menu is not known', () => {
    for (const p of ['suppliers', 'program/budget', 'program/team']) {
      expect(read(p), p).toMatch(/\{section && <(p|div) className="eyebrow">\{section\}<\/(p|div)>\}/)
    }
  })
})

describe('21: a count is drawn only after the first read has answered', () => {
  it('Submissions draws "Total", "Pending", "In process" and "Placed" only once the first read is back', () => {
    const src = read('submissions')
    expect(src).toMatch(/setReadOnce\(true\)/)
    const gate = src.indexOf('{readOnce && !error && (')
    expect(gate).toBeGreaterThan(-1)
    expect(gate).toBeLessThan(src.indexOf('<p className="stat-label">Total</p>'))
  })

  it('Job requests draws no number on its All, Draft and Awaiting approval tabs until the first read is back', () => {
    const src = read('requisitions')
    expect(src).toMatch(/\{label\}\{summary && <> <span className="tabular-nums opacity-60">\{n\}<\/span><\/>\}/)
    expect(src).not.toMatch(/\{label\} <span className="tabular-nums opacity-60">\{n\}<\/span>/)
  })

  it('Contractors draws "Everyone" and "On site now" counts only once the first read has answered', () => {
    const src = read('people')
    expect(src).toMatch(/setReadOnce\(true\)/)
    expect(src).toMatch(/\{readOnce && !error && \(\s*<FilterBar/)
  })

  it('a supplier’s Job requests list and Needs attention draw their counts only once the first read is back', () => {
    expect(read('requirements')).toMatch(/\{readOnce && !error && \(\s*<div className="flex gap-3 mb-6 flex-wrap">/)
    expect(read('decisions')).toMatch(/\{readOnce && !error && \(\s*<div className="flex gap-3 mb-6 flex-wrap">/)
  })
})
