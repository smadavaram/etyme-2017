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
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  check, verdict, copyFrom, gridsWithoutBreakpoint, type Copy,
} from '@/lib/positioning'

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

// ── What the page says the business is ──────────────────────────────
//
// The founder read the live page on a phone and said the hero was fine
// and everything below it was not. He was right for a specific reason:
// every section below the fold addressed a client with eleven
// suppliers, and Phase 1 ships to paying staffing firms. The page sold
// to the people who are not the customers yet, in front of the people
// who are — and nowhere said who pays, what it costs, what it sits
// beside, or what anybody does differently on Monday.
//
// These are the things that were agreed about the page below the hero.
// A rewrite that quietly drops one of them fails here rather than in a
// week.

const body = words.slice(12).join(' ')
const all = words.join(' ')

describe('Below the hero, the page says what the business is', () => {

  it('says who it is for, and names the client, the prime, the sub and the bench operator', () => {
    for (const position of ['prime', 'sub', 'bench']) {
      expect(body.toLowerCase(), position).toContain(position)
    }
    expect(body.toLowerCase()).toMatch(/client|company hiring/)
  })

  it('says prime, sub and bench are positions on a deal rather than kinds of company', () => {
    // The same firm is all three at once on different deals. Nobody
    // says it, it is true, and it is why this is one product and not
    // four.
    expect(body).toContain('positions on a deal, not kinds of company')
  })

  it('gives keeping your ATS, your VMS and your suppliers a headline rather than a footnote', () => {
    // It was the most useful sentence on the page and it was 13px grey
    // text under an arrow diagram.
    const headline = words.find((w) => /Keep your ATS/.test(w))
    expect(headline).toBeDefined()
    expect(body).toContain('sits in front of')
  })

  it('tells a supplier firm what changes on Monday rather than listing features', () => {
    expect(body).toContain('What changes on Monday')
    // Four questions somebody answers today with a phone call and a guess.
    expect(body).toContain('phone call, a spreadsheet and a guess')
  })

  it('names four screens that a reader can go and open', () => {
    // The labels are rendered from data rather than written into the
    // markup, so the source is where they are checked.
    for (const screen of ['Leads', 'Bench', 'Profitability', 'Payables']) {
      expect(PAGE, screen).toContain(`screen: '${screen}'`)
    }
    // And each one exists. A page describing a screen nobody built is
    // the exact failure this file was written to stop.
    for (const route of ['leads', 'bench', 'profitability', 'ap']) {
      expect(
        existsSync(join(process.cwd(), 'src/app/dashboard', route, 'page.tsx')),
        `src/app/dashboard/${route}/page.tsx`
      ).toBe(true)
    }
  })

  it('makes the tenure argument once, in a section of its own', () => {
    // It was the second of three bullets in a grid. It is the sharpest
    // wedge in the product.
    expect(body).toContain('Nobody can tell you how long a contractor has actually been on site')
  })

  it('puts tenure as a legal exposure rather than as a saving', () => {
    // Efficiency pitches lose to "we are managing fine". Exposure does not.
    expect(body).toContain('exposure rather than a saving')
  })

  it('says the enforcement blocks where the law is behind it and warns everywhere else', () => {
    expect(body).toContain('blocks and says why')
    expect(body.toLowerCase()).toContain('let you proceed')
  })

  it('says plainly that the price is not settled, rather than saying nothing about money', () => {
    // A page with no price makes a reader assume enterprise sales and
    // leave. Silence is worse than "we are still deciding".
    expect(body).toContain('There is no price on this page because we have not settled one')
  })

  it('says the three things about the commercials that are settled', () => {
    expect(body).toContain('Governance is never a paid tier')
    expect(body).toContain('Etyme never runs a bench and never places anybody')
    expect(body).toContain('Looking around costs nothing and needs no card')
  })

  it('no longer heads a section with one module describing itself', () => {
    // "Stop reading bad submissions" was demoted from the hero to a
    // section heading, where it was still the weakest thing on the page.
    expect(all).not.toContain('Stop reading bad submissions')
  })

  it('promises no export nobody has built', () => {
    // Eighteen lists export to CSV. "Your data exports in full, any
    // time" is a different and larger promise, and nothing stands
    // behind it.
    expect(all).not.toContain('exports in full')
  })

  it('claims no set-up time nobody has measured', () => {
    expect(all).not.toContain('Set-up takes an afternoon')
    expect(all).not.toContain('within an hour')
  })

  it('keeps the eyebrow and headline the founder said were fine', () => {
    // The subhead under the headline is not pinned word for word — it
    // was rewritten once already, in plainer English on the founder's
    // own instruction, and pinning prose that is expected to keep
    // getting plainer is how a test starts fighting the person it
    // exists to serve. The eyebrow and the headline are the two lines
    // that were explicitly signed off and are pinned exactly.
    expect(words[1]).toBe('Contingent workforce management')
    expect(words[2]).toBe('Every contractor. Every supplier. One record.')
  })

  it('says the hero subhead in plain, spoken English — short sentences, no jargon', () => {
    // "the system of record for the people you employ through somebody
    // else" was the Oxford-professor version. This is the plain one:
    // short sentences, the reader addressed as "you", no throat-clearing.
    const sub = words[3]
    expect(sub).toContain('You hire contractors through staffing firms')
    expect(sub).toContain('Nobody has one record')
    // Plain means short sentences. A subhead built from one 44-word
    // sentence is not what "bring it down to earth" asked for.
    const longestSentence = Math.max(...sub.split(/[.!?]/).map((s: string) => s.trim().split(/\s+/).filter(Boolean).length))
    expect(longestSentence).toBeLessThanOrEqual(24)
  })

  it('still passes the four positioning rules after the rewrite', () => {
    expect(verdict(live).ok).toBe(true)
  })
})

// ── It is read on a phone ────────────────────────────────────────────
//
// Tailwind is mobile-first, so an unprefixed column count applies from
// zero width up. `grid-cols-2` with no `sm:` is two columns on a 375px
// screen, which is the class of bug that put half a surname into an
// email field on another screen the same day.

describe('The home page is read on a phone', () => {

  it('every multi-column grid on the home page stacks by default', () => {
    const bad = gridsWithoutBreakpoint(PAGE)
    expect(
      bad,
      `these apply at every width, phone included — add a sm:/md:/lg: prefix:\n  ${bad.join('\n  ')}`
    ).toEqual([])
  })

  it('catches two columns declared with no breakpoint at all', () => {
    expect(gridsWithoutBreakpoint('<div className="grid grid-cols-2 gap-4">'))
      .toEqual(['grid-cols-2'])
  })

  it('passes a grid that stacks by default and splits when there is room', () => {
    expect(gridsWithoutBreakpoint('<div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">'))
      .toEqual([])
  })

  it('passes a single column, which is stacked already', () => {
    expect(gridsWithoutBreakpoint('<div className="grid grid-cols-1 md:grid-cols-3">')).toEqual([])
  })

  it('catches an unbreakpointed column template written by hand', () => {
    expect(gridsWithoutBreakpoint('<div className="grid grid-cols-[1fr_0.85fr]">'))
      .toEqual(['grid-cols-[1fr_0.85fr]'])
  })
})
