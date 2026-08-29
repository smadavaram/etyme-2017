/**
 * What the home page says it is.
 *
 * The positioning was agreed in conversation and the page went on saying
 * something else for a week — "Stop reading bad submissions", one module
 * describing itself, over a hero showing a shortlist. It read as a hiring
 * tool. Nothing caught it, because positioning had no test.
 *
 * Every other class of mistake here gets caught by an invariant. This is
 * the one that did not, and it is the most expensive kind: a product that
 * works and is understood as something smaller than it is.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { check, verdict, copyFrom, type Copy } from '@/lib/positioning'

const PAGE = readFileSync(join(process.cwd(), 'src/app/page.tsx'), 'utf8')

/** The real page, split at roughly where a first screen ends. */
const words = copyFrom(PAGE)
const live: Copy = { hero: words.slice(0, 12), body: words.slice(12) }

describe('The live home page still says what we agreed it says', () => {

  it('reads as the category, not as one of its modules', () => {
    const v = verdict(live)
    // A RISKY finding is allowed here — the hero panel shows one worked
    // example, "Senior Java Developer, Dallas", and an example naming a
    // role is not the same as a headline claiming a market.
    expect(v.findings.filter((f) => f.severity === 'WRONG')).toEqual([])
    expect(v.ok).toBe(true)
  })

  it('names contractors or suppliers before it says anything clever', () => {
    // The way Concur says travel and expense first.
    expect(check(live).map((f) => f.rule)).not.toContain('category-first')
  })

  it('does not lead with AI', () => {
    expect(check(live).map((f) => f.rule)).not.toContain('never-lead-with-ai')
  })

  it('does not claim Etyme places anybody', () => {
    expect(check(live).map((f) => f.rule)).not.toContain('neutrality')
  })

  it('finds real words on the page rather than passing on an empty read', () => {
    // A guard that reads nothing passes everything.
    expect(words.length).toBeGreaterThan(20)
  })
})

// ── The rules themselves ────────────────────────────────────────────

const copy = (hero: string[], body: string[] = []): Copy => ({ hero, body })

describe('A page that leads with a module is caught', () => {

  it('catches the exact headline that shipped and was wrong', () => {
    const f = check(copy(['Stop reading bad submissions', 'See the four worth your time']))
    expect(f.map((x) => x.rule)).toContain('module-not-category')
    expect(f.find((x) => x.rule === 'module-not-category')!.says)
      .toContain('read as a hiring tool')
  })

  it('catches a timesheet product describing itself', () => {
    expect(check(copy(['Timesheets that approve themselves'])).map((x) => x.rule))
      .toContain('category-first')
  })

  it('lets a module be named once the category is', () => {
    // "Submissions" is fine next to "contractors". It is only wrong as
    // the whole of what the page claims to be.
    const f = check(copy([
      'Every contractor. Every supplier. One record.',
      'Submissions, timesheets and invoices in one place.',
    ]))
    expect(f.map((x) => x.rule)).not.toContain('module-not-category')
  })
})

describe('AI is in there and never leads', () => {

  it('catches an AI headline', () => {
    const f = check(copy(['AI-powered contingent workforce management']))
    expect(f.map((x) => x.rule)).toContain('never-lead-with-ai')
    expect(f.find((x) => x.rule === 'never-lead-with-ai')!.says)
      .toContain('half of what looks like AI is plain rules')
  })

  it('allows it further down, where it is describing something real', () => {
    const f = check(copy(
      ['Every contractor. Every supplier. One record.'],
      ['Rules run first. AI reads the CV and never decides work authorisation.']
    ))
    expect(f.map((x) => x.rule)).not.toContain('never-lead-with-ai')
  })
})

describe('Horizontal, never vertical', () => {

  it('flags a headline that assumes software staffing', () => {
    const f = check(copy(['Hire engineers faster', 'Contingent workforce management']))
    expect(f.map((x) => x.rule)).toContain('horizontal-not-vertical')
    expect(f.find((x) => x.rule === 'horizontal-not-vertical')!.says)
      .toContain('travel nurse')
  })

  it('is a warning, not a refusal, because an example may name a role', () => {
    // A screenshot showing "Senior Java Developer, Dallas" is plainly
    // one example. A headline saying it is a claim about the market.
    const v = verdict(copy(['Contingent workforce management'], ['Senior Java Developer, Dallas']))
    expect(v.ok).toBe(true)
    expect(v.findings.map((f) => f.severity)).toEqual(['RISKY'])
  })
})

describe('Neutrality is absolute and the page must not blur it', () => {

  it('refuses a page that says we supply people', () => {
    for (const claim of ['We place contractors fast', 'Our bench of contractors is ready']) {
      const f = check(copy([claim]))
      expect(f.map((x) => x.rule), claim).toContain('neutrality')
    }
  })

  it('says why, in terms of the network rather than of principle', () => {
    const f = check(copy(['We place contractors fast']))
    expect(f.find((x) => x.rule === 'neutrality')!.says)
      .toContain('the network stops growing')
  })
})

describe('The reader finds words that are actually on the page', () => {

  it('pulls prose out of a React file and leaves the code behind', () => {
    const found = copyFrom(`
      <p className="text-sm">Every contractor. Every supplier.</p>
      <span>{count}</span>
      <Head eyebrow="Sell" />
    `)
    expect(found).toContain('Every contractor. Every supplier.')
    expect(found.join(' ')).not.toContain('className')
  })
})
