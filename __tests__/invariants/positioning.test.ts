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
  check, verdict, copyFrom, gridsWithoutBreakpoint, priceClaims, namedCompanies,
  type Copy,
} from '@/lib/positioning'
import { ACTIONS, ALL_ACTIONS } from '@/lib/autonomy'

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

  it('names no real company anywhere in its copy', () => {
    // "Or sit at a running program — Nike, Corning, Terumo BCT — from
    // whichever desk is yours." Three trademarked enterprises, on a
    // public page, framed as three live programs. They were the seeded
    // demo tenants and nobody at any of them has heard of us.
    expect(namedCompanies(words.join(' '))).toEqual([])
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
      ['Rules run first. AI reads the CV and never decides work authorization.']
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

describe('A real company on a public page is caught by its name', () => {

  it('catches the three companies that were live on the page this morning', () => {
    const f = check(copy(
      ['Contingent workforce management'],
      ['Or sit at a running program — Nike, Corning, Terumo BCT — from whichever desk is yours.']
    ))
    const found = f.find((x) => x.rule === 'names-a-real-company')
    expect(found).toBeDefined()
    expect(found!.severity).toBe('WRONG')
    expect(found!.found).toContain('nike')
    expect(found!.found).toContain('corning')
  })

  it('refuses the page outright rather than warning about it', () => {
    // A logo of a company that has not agreed is not a style question.
    expect(verdict(copy(['Contingent workforce management'], ['Trusted at Pfizer.'])).ok).toBe(false)
  })

  it('catches a comparison as well as a customer, because neither has been agreed', () => {
    const f = check(copy(['Contingent workforce management'], ['Unlike Fieldglass, we keep one record.']))
    expect(f.map((x) => x.rule)).toContain('names-a-real-company')
  })

  it('names the company the page named, so somebody can go and find the sentence', () => {
    // "Terumo BCT" also matches "terumo"; the longer form is the one
    // reported, because that is the string to search the file for.
    expect(namedCompanies('A program at Terumo BCT.')).toEqual(['terumo bct'])
  })

  it('leaves the invented firms in the worked examples alone', () => {
    // Cloudepa Systems, Brightmoor Talent, Vertex Group and Calder
    // Manufacturing are inventions and have to stay — the ledger is the
    // whole tenure argument and it needs three supplier names.
    expect(namedCompanies(
      'Cloudepa Systems, Brightmoor Talent and Vertex Group supplied Calder Manufacturing.'
    )).toEqual([])
  })

  it('does not fire on an ordinary word that happens to sit inside a company name', () => {
    expect(namedCompanies('An apple is not Apple Inc unless it is named.')).toContain('apple')
    expect(namedCompanies('Electric vehicles and general maintenance.')).toEqual([])
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

  it('reads a sentence that ends in an expression, which is where the company names hid', () => {
    // The line naming three real enterprises ended in `{' '}` before a
    // link. The old pattern required a closing `<`, so not one word of
    // that sentence was ever inside any rule in this file — it was live
    // for as long as it was there and no guard could see it.
    const found = copyFrom(`
      <p>Or sit at a running program — Nike, Corning, Terumo BCT — from whichever desk is yours.{' '}
        <a href="/demo">Pick a desk</a>
      </p>
    `)
    expect(found.join(' ')).toContain('Nike, Corning, Terumo BCT')
    expect(namedCompanies(found.join(' ')).length).toBeGreaterThan(0)
  })

  it('reads a sentence that starts after an expression, such as a bold lead-in', () => {
    const found = copyFrom(`
      <p><span className="font-semibold">Supplying into a program like this?</span>{' '}
        You are on it because your client is, and nothing about it competes with you.
      </p>
    `)
    expect(found.join(' ')).toContain('nothing about it competes with you')
  })

  it('leaves the code after a closing brace out of the copy', () => {
    // A `}` closes a block of code as often as it closes an expression,
    // and a guard that reads imports as prose reports findings nobody
    // can act on — and gets switched off.
    const found = copyFrom(`
      import { EtymeLogo } from '@/components/logo'
      const ROWS = [{ t: 'One' }, { t: 'Two' }]
      export default function Page() { return <p>Real words on the page</p> }
    `)
    expect(found.join(' ')).toContain('Real words on the page')
    expect(found.join(' ')).not.toContain('components/logo')
    expect(found.join(' ')).not.toContain('export default')
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

  it('is written to the company hiring, with the chain read over its shoulder', () => {
    // Addressing hiring companies, primes, subs and bench operators as
    // four equals is the plan from before the client became the customer
    // on 2026-09-10. A hiring manager who reads "primes, subs, bench
    // operators" concludes this is software for staffing firms.
    expect(body).toContain('You are on it because your client is')
    for (const position of ['prime', 'sub', 'bench']) {
      expect(body.toLowerCase(), position).toContain(position)
    }
  })

  it('writes to the client before it writes to anybody who supplies the client', () => {
    // The order on the page, not only the words: the client's own case
    // — the question they cannot answer, the tenure ledger, their four
    // screens — comes before the section about the chain.
    expect(PAGE.indexOf('id="gap"')).toBeLessThan(PAGE.indexOf('id="who"'))
    expect(PAGE.indexOf('id="monday"')).toBeLessThan(PAGE.indexOf('id="who"'))
  })

  it('says prime, sub and bench are positions on a deal rather than kinds of company', () => {
    // The same firm is all three at once on different deals. Nobody
    // says it, it is true, and it is why this is one product and not
    // four.
    expect(body).toContain('positions on a deal, not kinds of company')
  })

  it('gives keeping your ATS, your VMS and your suppliers a headline rather than a footnote', () => {
    // It was the most useful sentence on the page and it was 13px gray
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

  it('asks the four questions a client cannot answer, not the four a staffing firm asks', () => {
    // These were Leads, Bench, Profitability and Payables — a staffing
    // firm's questions, on a page whose customer is the company hiring.
    for (const screen of ['Program', 'Workforce', 'Tenure', 'Rates']) {
      expect(PAGE, screen).toContain(`screen: '${screen}'`)
    }
    expect(body).toContain('How many contractors do we have, and whose are they?')
    expect(body).toContain('Who has been here longest?')
    expect(body).toContain('Are we paying two suppliers differently for the same work?')
  })

  it('names four screens that a reader can go and open', () => {
    // A page describing a screen nobody built is the exact failure this
    // file was written to stop. The route is written beside the label
    // so this reads the page's own answer rather than guessing it from
    // the words.
    const routes = [...PAGE.matchAll(/route: '([a-z-]+)',/g)].map((m) => m[1])
    expect(routes.length).toBe(4)
    for (const route of routes) {
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

  it('argues tenure before it describes how anything works', () => {
    // The worked example — nineteen months across three suppliers — is
    // the whole argument, and it was in section seven of nine. Almost
    // nobody reads that far.
    expect(PAGE.indexOf('id="tenure"')).toBeLessThan(PAGE.indexOf('id="lifecycle"'))
    expect(PAGE.indexOf('id="tenure"')).toBeLessThan(PAGE.indexOf('id="monday"'))
  })

  it('shows how a placement moves as the handful of milestones a person acts on', () => {
    // Eighteen numbered stages is the internal lifecycle printed on a
    // marketing page, and it breaks the product's own rule: three words,
    // not nineteen states. The 2017 timeline made that mistake on users
    // who had signed up; this was making it on strangers.
    expect(PAGE).toContain('const LIFECYCLE')
    // Scoped to the array itself: the header nav's Products/Compliance
    // menus carry `{ t: ..., d: ... }` items in the same shape for the
    // same reason (a label and a one-line description), and a bare
    // whole-file match would count those too.
    const arrayText = PAGE.slice(PAGE.indexOf('const LIFECYCLE'), PAGE.indexOf('const MONDAY'))
    const stageCount = (arrayText.match(/\{ t: '[^']+', d: '[^']+'/g) ?? []).length
    expect(stageCount).toBe(6)
    expect(body).toContain('Six milestones, one record the whole way through')
  })

  it('says out loud that there are more states inside and nobody has to learn them', () => {
    expect(body).toContain('Nobody using it has to learn any of them')
  })

  it('marks exactly the three gates — a milestone that can stop the deal, not only record it', () => {
    // Matched only inside an actual LIFECYCLE row, not the doc comment
    // above it that also says the words "gate: true" while explaining
    // what the field means — and not any other array with the same
    // `{ t, d }` shape, such as the header nav's menu items.
    const arrayText = PAGE.slice(PAGE.indexOf('const LIFECYCLE'), PAGE.indexOf('const MONDAY'))
    const gateCount = (arrayText.match(/\{ t: '[^']+', d: '[^']+', gate: true \}/g) ?? []).length
    expect(gateCount).toBe(3)
    expect(body).toContain('The three in clay can stop the deal')
  })

  it('renders the lifecycle as a grid element, not a bulleted list of text', () => {
    expect(PAGE).toContain('LIFECYCLE.map')
    expect(PAGE).toMatch(/grid grid-cols-1[^"]*sm:grid-cols-2/)
  })

  it('gives the supply side a line each, never a column each beside the client', () => {
    // There were four cards of three lines each, one per audience, with
    // the company hiring as one of four. The client is the customer; a
    // supplier is on it because its client is. So: three short lines,
    // inside a section written to the client.
    expect(PAGE).toContain('const SUPPLY')
    expect(PAGE).toContain('SUPPLY.map')
    for (const who of ['A prime', 'A sub', 'A bench operator']) {
      expect(PAGE, who).toContain(`who: '${who}'`)
    }
    expect(PAGE).not.toContain("who: 'The company hiring'")
    expect((PAGE.match(/\n    line:/g) ?? []).length).toBe(3)
  })

  it('tells a supplier it is welcome without ever turning to address it', () => {
    // Subtle is not absent. The network only works because suppliers are
    // on it, and a supplier who reads this as hostile does not join.
    expect(body).toContain('Supplying into a program like this?')
    expect(body).toContain('nothing about it competes with you')
    // And it arrives after the client's own case, never beside it.
    const clientCase = Math.max(PAGE.indexOf('id="monday"'), PAGE.indexOf('id="alongside"'))
    expect(PAGE.indexOf('const SUPPLY')).toBeGreaterThan(0)
    expect(PAGE.indexOf('SUPPLY.map')).toBeGreaterThan(clientCase)
  })

  it('says what the chain costs the client, not what it costs the supplier', () => {
    // "Who this is for" listed each party's pain in its own words. This
    // section is one reader's: the name that traveled further than the
    // agreement, the same person arriving three times, a rate you cannot
    // read because the chain is in the way.
    expect(body).toContain('Your role goes further down than you think. So does your name.')
    expect(body).toContain('past the agreement that said they wouldn’t')
    expect(body).toContain('reaches you three times from three firms')
  })

  it('does not lead with a penalty, because nobody is fined at month nineteen', () => {
    // The page used to argue tenure as "an exposure rather than a
    // saving". A compliance pitch loses to "we have never been caught",
    // which is worse than losing to "we are managing fine" because it
    // is true. Corrected in CLAUDE.md on 2026-09-15.
    expect(body).not.toContain('exposure rather than a saving')
    expect(body).not.toContain('usually finds out about it from a lawyer')
  })

  it('argues tenure as the number nobody can produce, which is what makes it defensible', () => {
    // A VMS sees inside one program. A supplier sees its own slice.
    // Neither can add them up, and the client cannot get it by asking.
    expect(body).toContain('No supplier can add that up')
    expect(body).toContain('A VMS sees inside')
    expect(body).toContain('nobody you could ask is holding all')
  })

  it('opens the argument on the question a client cannot answer about its own workforce', () => {
    // The hook is the not-knowing. It happens monthly; the penalty is
    // hypothetical. So this is section two and the exposure is not.
    expect(body).toContain('Every contractor on your sites. Including the ones you didn’t hire.')
    expect(PAGE).toContain('const CANNOT_ANSWER')
    for (const q of [
      'How many contractors are on our sites right now?',
      'What are we spending on them this quarter?',
      'Who has been here longest?',
    ]) {
      expect(PAGE, q).toContain(q)
    }
  })

  it('says what the not-knowing costs today — three weeks and a number nobody trusts', () => {
    expect(body).toContain('let me come back to you')
    expect(body).toContain('three weeks')
    expect(body).toContain('nobody fully trusts')
  })

  it('keeps the exposure as the business case, after the hook and never as the opening', () => {
    // Two sentences doing two jobs: the hook is the not-knowing, the
    // business case is what it costs when somebody finally asks.
    expect(body).toContain('Nobody is fined on the day a contractor passes eighteen months')
    expect(body).toContain('co-employment claim')
    const hookAt = body.indexOf('Every contractor on your sites')
    const exposureAt = body.indexOf('Nobody is fined on the day')
    expect(hookAt).toBeGreaterThanOrEqual(0)
    expect(hookAt).toBeLessThan(exposureAt)
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

// ── The number under the AI honesty ───────────────────────────────────
//
// The page said "About half of what looks like AI here is not." Nobody
// could check that, including us. `lib/autonomy` names every action this
// system takes and says of each whether a rule or a model decided it, so
// the page can say a number with its denominator attached — and this can
// recompute it rather than trust the words.
//
// If somebody adds a fourteenth unprompted action, this fails and the
// sentence on the page is one edit away from true again. That is the
// cheapest moment it will ever be to fix.

describe('The claim about how much of this is a model is computed, not asserted', () => {

  const acts = ALL_ACTIONS.map((name) => ACTIONS[name])
  const unprompted = acts.filter((a) => a.kind === 'UNPROMPTED')
  const byRule = unprompted.filter((a) => a.basis === 'RULE')

  const NUMBERS: Record<number, string> = {
    6: 'Six', 11: 'Eleven', 12: 'Twelve', 13: 'Thirteen', 14: 'Fourteen', 15: 'Fifteen',
  }

  it('counts the things that happen without anybody asking, and says that number on the page', () => {
    expect(unprompted.length).toBeGreaterThan(0)
    expect(
      body,
      `the automation ladder now has ${unprompted.length} unprompted actions`
    ).toContain(`${NUMBERS[unprompted.length]} things in here happen without anybody asking`)
  })

  it('says how many of those are a plain rule rather than a model', () => {
    expect(
      body,
      `${byRule.length} of ${unprompted.length} unprompted actions are decided by a rule`
    ).toContain(`${NUMBERS[byRule.length]} of the ${NUMBERS[unprompted.length].toLowerCase()} are a date, a threshold or a count`)
  })

  it('says what the one that is not a rule does, rather than leaving it to the imagination', () => {
    // The single unprompted action decided by anything other than a rule
    // scores people against an open role nobody has matched yet — and
    // falls back to arithmetic when there is no model to call.
    const notARule = unprompted.filter((a) => a.basis !== 'RULE')
    expect(notARule.length).toBe(1)
    expect(notARule[0].says.toLowerCase()).toContain('scored people against an open role')
    expect(body).toContain('scores a person against a role')
    expect(body).toContain('falls back to arithmetic')
  })

  it('states the denominator, because it is the automation log and not the whole product', () => {
    // "About half of what looks like AI here is not" was a claim about
    // the product with nothing behind it. This is a claim about the
    // things the system does on its own, which is a thing we count.
    expect(body).toContain('without anybody asking for them')
    expect(body).not.toContain('About half of what looks like AI')
  })

  it('still never leads with the model, and still says what it may not decide', () => {
    expect(check(live).map((f) => f.rule)).not.toContain('never-lead-with-ai')
    expect(body).toContain('Never decides whether someone can legally work')
  })
})

// ── The header ────────────────────────────────────────────────────────
//
// "Organized by products, industries, compliance and why etyme" — a
// founder instruction, not a guess. The header used to be a flat list of
// six module names with nothing organizing them; a company evaluating a
// system of record expects the shape below.

describe('The header reads as an enterprise product, not a job board', () => {

  it('is organized into exactly Products, Industries, Compliance and Why Etyme', () => {
    const menuStart = PAGE.indexOf('const NAV_MENUS')
    const menuEnd = PAGE.indexOf('const RECORD')
    const menus = PAGE.slice(menuStart, menuEnd)
    for (const label of ['Products', 'Industries', 'Compliance', 'Why Etyme']) {
      expect(menus, label).toContain(`label: '${label}'`)
    }
  })

  it('never says "I\'m hiring" — that is job-board language, not an enterprise layer', () => {
    // The CTA text lives in a `label` prop, invisible to copyFrom — this
    // has to read the raw source to be a real guard against it coming back.
    expect(PAGE).not.toContain("I'm hiring")
    expect(PAGE).not.toContain('I have a bench')
  })

  it('lets a visitor pick a seat in the chain rather than announce a job to fill', () => {
    // A TryDemo `label` prop, not JSX text — invisible to copyFrom, which
    // only reads text nodes and single-quoted string literals. Checked
    // against the raw source instead.
    // One company door, not a company door and a supplier door. The
    // split forked the front page on demand-vs-supply, which is a
    // position on a deal and not a property of a firm; the five seats
    // now sit behind one button. A supplier is a company.
    expect(PAGE).toContain('See it as a company')
    expect(PAGE).not.toContain('See it as the supplier')
    expect(PAGE).not.toContain('See it as the company')
  })

  it('sends every header link to a section that actually exists on the page', () => {
    const menuStart = PAGE.indexOf('const NAV_MENUS')
    const menuEnd = PAGE.indexOf('const RECORD')
    const menus = PAGE.slice(menuStart, menuEnd)
    const hrefs = [...menus.matchAll(/href: '#([a-z]+)'/g)].map((m) => m[1])
    expect(hrefs.length).toBeGreaterThan(0)
    for (const anchor of new Set(hrefs)) {
      expect(PAGE, `#${anchor}`).toContain(`id="${anchor}"`)
    }
  })

  it('names industries as one product used across them, never a vertical feature', () => {
    // CLAUDE.md: "Horizontal, never vertical." Listing industries is fine
    // as an illustration of breadth; it would be wrong as a claim that a
    // different product exists per industry, so the menu says so itself.
    expect(PAGE).toContain('One product. No industry-specific version to buy.')
  })

  it('does not let the new header text shift the pinned hero words', () => {
    // Every header/menu label above is rendered through {expr}, never as
    // literal JSX text, specifically so it stays invisible to copyFrom's
    // tag-text scan and the hero stays where it was pinned. This is the
    // regression that scan would show: "Sign in" stops being first.
    expect(words[0]).toBe('Sign in')
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

// ── The footer ────────────────────────────────────────────────────────
//
// Three legal pages shipped and the home page had no link to any of
// them, so they were live and invisible — which, to the client security
// reviewer who goes looking in the footer, is the same as not having
// written them. The footer was a logo and a tagline: the end of a page
// rather than a company.

const FOOTER_SRC = PAGE.slice(PAGE.indexOf('const FOOTER'), PAGE.indexOf('export default function'))
const FOOTER_LINKS = [...FOOTER_SRC.matchAll(/href: '([^']+)'/g)].map((m) => m[1])

describe('The footer is where a company keeps its papers', () => {

  it('a visitor can reach the terms and the privacy notice from the home page', () => {
    expect(FOOTER_LINKS).toContain('/terms')
    expect(FOOTER_LINKS).toContain('/privacy')
    // And the list is actually rendered, rather than sitting in the file
    // as data nothing draws — which is how it was invisible in the first
    // place, one level up.
    expect(PAGE).toContain('FOOTER.map')
  })

  it('offers the data processing addendum too, because that is the document a buyer\u2019s counsel asks for', () => {
    expect(FOOTER_LINKS).toContain('/dpa')
  })

  it('says the legal documents are drafts before somebody clicks one, not after', () => {
    expect(FOOTER_SRC).toContain('not yet reviewed by a lawyer')
  })

  it('every page the footer points at exists, so none of it is a dead link', () => {
    for (const href of FOOTER_LINKS) {
      if (href.startsWith('#')) {
        expect(PAGE, `${href} has no section on the page`).toContain(`id="${href.slice(1)}"`)
      } else {
        // A route may sit inside a route group — /login is
        // src/app/(auth)/login — and a group folder is not part of the URL.
        const candidates = ['', '(auth)'].map((group) =>
          join(process.cwd(), 'src/app', group, href.slice(1), 'page.tsx')
        )
        expect(candidates.some(existsSync), `no page for ${href}`).toBe(true)
      }
    }
  })

  it('gives a visitor a way to reach a person, and it is the one channel that exists', () => {
    // Alerts go out to staff and nothing came in from a prospect except
    // this box, which somebody reads and answers.
    expect(FOOTER_LINKS).toContain('#contact')
    expect(PAGE).toContain('id="contact"')
    expect(PAGE).toContain('<Ask source="HOME_PAGE" />')
  })

  it('invents no support mailbox, no office and no social account', () => {
    // A footer full of links to things that do not exist costs more
    // trust than a short one. Nothing here may be furniture.
    expect(FOOTER_SRC).not.toMatch(/mailto:/)
    expect(FOOTER_SRC.toLowerCase()).not.toMatch(/linkedin|twitter|x\.com|facebook|status\.|careers|\babout us\b/)
  })

  it('names the company and the year rather than a hardcoded copyright that goes stale', () => {
    expect(PAGE).toContain('Etyme Inc.')
    expect(PAGE).toContain('new Date().getFullYear()')
  })

  it('says what Etyme is in the footer, in the words from CLAUDE.md', () => {
    // Somebody who scrolled past the hero and read nothing else still
    // leaves knowing the category.
    expect(PAGE).toContain('The system of record for contingent workers')
  })

  it('repeats the neutrality commitment where a supplier reading the page will see it', () => {
    const footerJsx = PAGE.slice(PAGE.indexOf('<footer'))
    expect(footerJsx).toContain('never runs a bench and never places anybody')
  })
})

// ── The four sentences the founder reads ──────────────────────────────

describe('The public page still says the four things it may not stop saying', () => {

  it('the home page names what Etyme is before it names anything it does', () => {
    // The eyebrow is the category and it sits above the headline. A
    // visitor knows what kind of thing this is before they know what is
    // good about it — the Concur move.
    expect(words[1]).toBe('Contingent workforce management')
    expect(check(live).map((f) => f.rule)).not.toContain('category-first')
    expect(check(live).map((f) => f.rule)).not.toContain('module-not-category')
  })

  it('nothing on the public page states a price', () => {
    // Free while it is proved out with the first five firms, and the
    // number is settled after that. A figure invented for a landing page
    // is a figure we have to walk back.
    const found = priceClaims(all)
    expect(found, found.join('; ')).toEqual([])
    expect(body).toContain('There is no price on this page because we have not settled one')
  })

  it('nothing on the public page claims Etyme places anybody', () => {
    expect(check(live).map((f) => f.rule)).not.toContain('neutrality')
    expect(all).toContain('never runs a bench and never places anybody')
  })

  it('claims no paying customers, because there are none yet', () => {
    // "they are why firms keep paying after month one" was on the page
    // under four screens, three sections above a section explaining that
    // Etyme is free and nobody has been charged anything.
    expect(all).not.toContain('keep paying')
    expect(all).not.toMatch(/\bcustomers (?:say|trust|love)\b/)
  })
})

// ── The price rule itself ─────────────────────────────────────────────

describe('A price on a page is caught by its unit, not by its dollar sign', () => {

  it('catches a price per seat', () => {
    expect(priceClaims('Etyme is $40 per user, per month.').length).toBeGreaterThan(0)
  })

  it('catches a cut of spend, which is a price without a dollar sign', () => {
    expect(priceClaims('We take 2% of spend under management.').length).toBeGreaterThan(0)
  })

  it('catches "starting at", and "contact us for pricing", which is a price with the number hidden', () => {
    expect(priceClaims('Plans starting at $199.').length).toBeGreaterThan(0)
    expect(priceClaims('Contact us for pricing.').length).toBeGreaterThan(0)
  })

  it('lets the worked example carry a contractor rate and an invoice, which are the product, not the bill', () => {
    expect(priceClaims('Submitted 2 Sep · $78/hr · screened. Invoiced $11,856 on 45 day terms.'))
      .toEqual([])
  })

  it('lets the page say one record per contractor without reading it as a billing unit', () => {
    expect(priceClaims('One record per contractor, across every supplier they use.')).toEqual([])
  })

  it('says which words tripped it, so somebody can go and look', () => {
    expect(priceClaims('Etyme is $40 per seat.')[0]).toContain('per seat')
  })
})
