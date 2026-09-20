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
 *
 * ── Rewritten 2026-09-20, with the page ──────────────────────────────
 *
 * Two sentences in this file pinned the positioning as it stood before
 * 2026-09-17 — "makes the tenure argument once, in a section of its own"
 * and "argues tenure before it describes how anything works". CLAUDE.md
 * reversed that: tenure is the moat, not the wedge, and "tenure is
 * nobody's problem — only you expect it to be solved". A test that pins
 * a decision the founder has reversed is worse than no test, because it
 * stops the page being corrected. Both are retired below and replaced by
 * the three that hold now: the four questions come first, tenure is one
 * of them rather than a section, and the exposure is the business case
 * that follows the hook.
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
    // A RISKY finding is allowed here — a worked example may name a role.
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

  it('keeps the live page clear even of the warning, because its example is a role anybody has', () => {
    // The hero's worked example was a Java developer, which was allowed
    // and made the one page that has to read horizontal read as IT
    // staffing to anybody skimming it. Quality validation is a job in a
    // plant, a hospital and a lab.
    expect(check(live).map((f) => f.rule)).not.toContain('horizontal-not-vertical')
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
    // Brightmoor Talent, Calder Manufacturing, Northbend Athletic and
    // the rest are inventions and have to stay — the door names three of
    // them and the seed builds all three.
    expect(namedCompanies(
      'Brightmoor Talent supplied Calder Manufacturing, and Northbend Athletic runs a program.'
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
// The order of the argument is the thing that keeps going wrong, and it
// is not visible in any single sentence. So these read the page's own
// section anchors as well as its words: what comes before what is a
// decision somebody made, and a rewrite that quietly reorders it fails
// here rather than in a week.

const body = words.slice(12).join(' ')
const all = words.join(' ')

const at = (anchor: string) => PAGE.indexOf(`id="${anchor}"`)

describe('Below the hero, the page says what the business is', () => {

  it('names the whole span once, so that no single station reads as the product', () => {
    // Naming one station makes the whole product read as that station,
    // which is how a screening headline made this a hiring tool. The
    // span is named in the hero, in the trade's order, once.
    expect(all).toContain(
      'Requisition, suppliers, submissions, screening, interviews, ' +
      'onboarding, timesheets, invoices, compliance'
    )
  })

  it('asks the four questions before it argues anything', () => {
    // The hook is the not-knowing, and it is section two. Everything
    // that follows — what it costs, how a hire moves, which screens
    // answer them — is an answer to a question the reader has already
    // been asked.
    expect(PAGE).toContain('const CANNOT_ANSWER')
    for (const q of [
      'How many contractors are on our sites right now?',
      'What are we spending on them this quarter, and with whom?',
      'Are we paying two suppliers different money for the same work?',
      'Who has been here longest?',
    ]) {
      expect(PAGE, q).toContain(q)
    }
    expect(at('gap')).toBeGreaterThan(0)
    for (const later of ['exposure', 'lifecycle', 'monday', 'alongside', 'who', 'why']) {
      expect(at('gap'), `#gap should come before #${later}`).toBeLessThan(at(later))
    }
  })

  it('keeps tenure to one question, not a section', () => {
    // Corrected 2026-09-17: "Tenure is nobody's problem — only you
    // expect it to be solved." It is the moat, not the wedge — nobody
    // wakes up worried about month nineteen, and every agent who read
    // "the sharpest wedge is tenure" built toward it. So the ledger
    // stays as one question of four, with the arithmetic in one line,
    // and it no longer has a section of its own above the product.
    expect(PAGE).not.toContain('id="tenure"')
    expect(body).toContain(
      'Fourteen months, then three, then two — nineteen on your site, ' +
      'and none of the three firms can see the other two.'
    )
    // It is still in the picture: one screen of four, named on the page,
    // and the word is used sparingly rather than argued.
    expect(PAGE).toContain("screen: 'Tenure'")
    const mentions = (all.toLowerCase().match(/tenure/g) ?? []).length
    expect(mentions, `the word "tenure" is on the page ${mentions} times`).toBeLessThanOrEqual(5)
  })

  it('puts the business case after the hook and never as the opening', () => {
    // Two sentences doing two jobs: the hook is the not-knowing, the
    // business case is what it costs when somebody finally asks. A page
    // that opens on the penalty sells a fear the buyer does not hold.
    expect(at('gap')).toBeLessThan(at('exposure'))
    expect(body).toContain('Nobody is fined on the day a contractor passes eighteen months')
    expect(body.toLowerCase()).toContain('co-employment')
    const hookAt = body.indexOf('Every contractor on your sites')
    const exposureAt = body.indexOf('Nobody is fined on the day')
    expect(hookAt).toBeGreaterThanOrEqual(0)
    expect(hookAt).toBeLessThan(exposureAt)
  })

  it('names the three things the exposure actually is, rather than gesturing at compliance', () => {
    expect(PAGE).toContain('const EXPOSURE')
    expect(body).toContain('Co-employment, on a number you never had')
    expect(body).toContain('A supplier whose cover lapsed in March')
    expect(body).toContain('A bill paid with no signed week behind it')
  })

  it('does not lead with a penalty, because nobody is fined at month nineteen', () => {
    // The page used to argue tenure as "an exposure rather than a
    // saving". A compliance pitch loses to "we have never been caught",
    // which is worse than losing to "we are managing fine" because it
    // is true.
    expect(body).not.toContain('exposure rather than a saving')
    expect(body).not.toContain('usually finds out about it from a lawyer')
  })

  it('says what the not-knowing costs today — three weeks and a number nobody trusts', () => {
    expect(body).toContain('let me come back to you')
    expect(body).toContain('three weeks')
    expect(body).toContain('nobody fully trusts')
  })

  it('says why no supplier can answer, which is why the record sits above them', () => {
    // A VMS sees inside one program. A supplier sees its own slice.
    // Neither can add them up, and the client cannot get it by asking.
    expect(body).toContain('No supplier can add that up')
    expect(body).toContain('A VMS sees inside')
    expect(body).toContain('nobody you could ask is holding all')
  })

  it('is written to the client’s desks by name — program manager, CFO, procurement', () => {
    // The client is the customer, decided 2026-09-10. Writing to "a
    // company" is writing to nobody; these are the three people in the
    // room when the question gets asked and the three who open the
    // screens that answer it.
    for (const desk of ['program manager', 'CFO', 'procurement']) {
      expect(body, desk).toContain(desk)
    }
  })

  it('is written to the client, with the chain read over its shoulder', () => {
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
    // — the questions, what they cost, how a hire moves, the screens —
    // all come before the section about the chain.
    for (const first of ['gap', 'exposure', 'lifecycle', 'monday']) {
      expect(at(first), `#${first} should come before #who`).toBeLessThan(at('who'))
    }
  })

  it('says prime, sub and bench are positions on a deal rather than kinds of company', () => {
    // The same firm is all three at once on different deals. Nobody
    // says it, it is true, and it is why this is one product and not
    // four.
    expect(body).toContain('positions on a deal, not kinds of company')
  })

  it('gives the supply side a line each, never a column each beside the client', () => {
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
    expect(PAGE.indexOf('SUPPLY.map')).toBeGreaterThan(at('monday'))
  })

  it('says what the chain costs the client, not what it costs the supplier', () => {
    expect(body).toContain('Your role goes further down than you think. So does your name.')
    expect(body).toContain('past the agreement that said they wouldn’t')
    expect(body).toContain('reaches you three times from three firms')
  })

  it('says where the guarantee stops, because a hop off the platform is a hop into an email client', () => {
    expect(body).toContain('Where a hop leaves the platform the record says so')
  })

  it('shows how a placement moves as the handful of milestones a person acts on', () => {
    // Eighteen numbered stages is the internal lifecycle printed on a
    // marketing page, and it breaks the product's own rule: three words,
    // not nineteen states.
    expect(PAGE).toContain('const LIFECYCLE')
    // Scoped to the array itself: the header nav's menus carry
    // `{ t: ..., d: ... }` items in the same shape for the same reason.
    const arrayText = PAGE.slice(PAGE.indexOf('const LIFECYCLE'), PAGE.indexOf('const MONDAY'))
    const stageCount = (arrayText.match(/\{ t: '[^']+', d: '[^']+'/g) ?? []).length
    expect(stageCount).toBe(6)
    expect(body).toContain('Six milestones, one record the whole way through')
  })

  it('walks the hire from every desk, so no one desk reads as the whole product', () => {
    expect(body).toContain('The hiring manager raises it, HR reads the role, procurement audits')
    expect(body).toContain('Nobody signs their own')
  })

  it('marks exactly the three gates — a milestone that can stop the deal, not only record it', () => {
    const arrayText = PAGE.slice(PAGE.indexOf('const LIFECYCLE'), PAGE.indexOf('const MONDAY'))
    const gateCount = (arrayText.match(/\{ t: '[^']+', d: '[^']+', gate: true \}/g) ?? []).length
    expect(gateCount).toBe(3)
    expect(body).toContain('The three in clay can stop the deal')
  })

  it('says the three gates in the words a refusal actually uses', () => {
    // A refusal says what is missing and what to do — never a code —
    // and a buyer who has only read a dashboard does not believe
    // software refuses anything until it is written down.
    expect(PAGE).toContain('const GATES')
    expect(body).toContain('No I-9, no start.')
    expect(body).toContain('Cover that lapsed in March stops the work in March.')
    expect(body).toContain('A bill with no signed week behind it is not paid.')
  })

  it('renders the lifecycle as a grid element, not a bulleted list of text', () => {
    expect(PAGE).toContain('LIFECYCLE.map')
    expect(PAGE).toMatch(/grid grid-cols-1[^"]*sm:grid-cols-2/)
  })

  it('says out loud that there are more states inside and nobody has to learn them', () => {
    expect(body).toContain('Nobody using it has to learn any of them')
  })

  it('answers the four questions with four screens a reader can go and open', () => {
    // A page describing a screen nobody built is the exact failure this
    // file was written to stop. The route is written beside the label so
    // this reads the page's own answer rather than guessing it.
    for (const screen of ['Program', 'Workforce', 'Tenure', 'Rates']) {
      expect(PAGE, screen).toContain(`screen: '${screen}'`)
    }
    const routes = [...PAGE.matchAll(/route: '([a-z-]+)',/g)].map((m) => m[1])
    expect(routes.length).toBe(4)
    for (const route of routes) {
      expect(
        existsSync(join(process.cwd(), 'src/app/dashboard', route, 'page.tsx')),
        `src/app/dashboard/${route}/page.tsx`
      ).toBe(true)
    }
    expect(body).toContain('phone call, a spreadsheet and a guess')
  })

  it('gives keeping your ATS, your VMS and your suppliers a headline rather than a footnote', () => {
    // It was the most useful sentence on the page and it was 13px gray
    // text under an arrow diagram.
    const headline = words.find((w) => /Keep your ATS/.test(w))
    expect(headline).toBeDefined()
    expect(body).toContain('sits in front of')
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
    expect(all).not.toContain('Stop reading bad submissions')
  })

  it('promises only the export that exists — every list to CSV, and a person’s own copy', () => {
    // "Your data exports in full, any time" was a promise nothing stood
    // behind. What is built: every list on the shared table exports to
    // CSV, and `/dashboard/my-data` gives a person a copy of what is
    // held about them or a way to ask to be forgotten. So the sentence
    // is what is true rather than nothing at all.
    expect(all).not.toContain('exports in full')
    expect(body).toContain('exports to CSV from the screen it is on')
    expect(body).toContain('ask for a copy of it')
    expect(existsSync(join(process.cwd(), 'src/app/dashboard/my-data/page.tsx'))).toBe(true)
  })

  it('claims no set-up time nobody has measured', () => {
    expect(all).not.toContain('Set-up takes an afternoon')
    expect(all).not.toContain('within an hour')
  })

  it('keeps the eyebrow and headline the founder said were fine', () => {
    // The subhead is not pinned word for word — it was rewritten once
    // already, in plainer English on the founder's own instruction, and
    // pinning prose expected to keep getting plainer is how a test
    // starts fighting the person it exists to serve.
    expect(words[1]).toBe('Contingent workforce management')
    expect(words[2]).toBe('Every contractor. Every supplier. One record.')
  })

  it('says the hero subhead in plain, spoken English — short sentences, no jargon', () => {
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

// ── The door ──────────────────────────────────────────────────────────
//
// The page hands a visitor to the demo, and until 2026-09-17 the demo
// behind the button was headed with three real enterprises. A name
// stripped off the page and left one click behind it is not stripped off
// anything, which is why the door is read here and not only the copy.

describe('The door is a client desk, in a company nobody can sue us over', () => {

  it('offers the demo seated at a client desk, with invented names only', () => {
    expect(PAGE).toContain('const PROGRAMS')
    expect(PAGE).toContain('href="/demo"')
    expect(PAGE).toContain('Pick a client desk')
    // The three named here are inventions, and the page says they are
    // inventions rather than leaving them to read as a customer list.
    for (const name of ['Northbend Athletic', 'Cavanaugh Glassworks', 'Talvern Medical']) {
      expect(body, name).toContain(name)
    }
    expect(body).toContain('The companies are invented')
    expect(namedCompanies(all)).toEqual([])
  })

  it('names the three programs the seed actually builds, so no door opens on nothing', () => {
    const seats = readFileSync(join(process.cwd(), 'src/app/demo/seats.ts'), 'utf8')
    const clientBlock = seats.slice(
      seats.indexOf('CLIENT_PROGRAMS'),
      seats.indexOf('SUPPLIER_SEATS')
    )
    const seeded = [...clientBlock.matchAll(/name: '([^']+)'/g)].map((m) => m[1])
    const onPage = [...PAGE.slice(PAGE.indexOf('const PROGRAMS')).matchAll(/name: '([^']+)'/g)]
      .map((m) => m[1]).slice(0, seeded.length)
    expect(onPage).toEqual(seeded)
  })

  it('keeps the contractor’s own door on the page, quieter than both company doors', () => {
    // A person who is the work is not an audience to drop off a page
    // written to the company hiring. It stays a text link in both places
    // the company doors are, never a button beside them, and
    // `__tests__/invariants/demo-candidate.test.ts` counts it too.
    expect((PAGE.match(/side="CANDIDATE"/g) ?? []).length).toBe(2)
    expect(PAGE).not.toMatch(/side="CANDIDATE"[\s\S]{0,240}bg-etyme-action/)
  })

  it('keeps the supplier door second and quieter than the client one', () => {
    // A supplier is welcome and is not who this page is written to.
    expect(PAGE).toContain('Supplying into one instead?')
    expect(PAGE).toContain('side="BENCH"')
    expect(PAGE.indexOf('Pick a client desk')).toBeLessThan(PAGE.indexOf('Supplying into one instead?'))
  })
})

// ── The number under the AI honesty ───────────────────────────────────
//
// The page said "About half of what looks like AI here is not." Nobody
// could check that, including us. `lib/autonomy` names every action this
// system takes and says of each whether a rule or a model decided it, so
// the page can say a number with its denominator attached — and this can
// recompute it rather than trust the words.

describe('The claim about how much of this is a model is computed, not asserted', () => {

  const acts = ALL_ACTIONS.map((name) => ACTIONS[name])
  const unprompted = acts.filter((a) => a.kind === 'UNPROMPTED')
  const byRule = unprompted.filter((a) => a.basis === 'RULE')

  const NUMBERS: Record<number, string> = {
    6: 'Six', 11: 'Eleven', 12: 'Twelve', 13: 'Thirteen', 14: 'Fourteen', 15: 'Fifteen',
    16: 'Sixteen', 17: 'Seventeen', 18: 'Eighteen', 19: 'Nineteen', 20: 'Twenty',
    21: 'Twenty-one', 22: 'Twenty-two',
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
    const notARule = unprompted.filter((a) => a.basis !== 'RULE')
    expect(notARule.length).toBe(1)
    expect(notARule[0].says.toLowerCase()).toContain('scored people against an open role')
    expect(body).toContain('scores a person against a role')
    expect(body).toContain('falls back to arithmetic')
  })

  it('states the denominator, because it is the automation log and not the whole product', () => {
    expect(body).toContain('without anybody asking for them')
    expect(body).not.toContain('About half of what looks like AI')
  })

  it('still never leads with the model, and still says what it may not decide', () => {
    expect(check(live).map((f) => f.rule)).not.toContain('never-lead-with-ai')
    expect(body).toContain('Never decides whether someone can legally work')
  })
})

// ── The header ────────────────────────────────────────────────────────

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

  it('opens one door into an example program rather than asking a visitor to classify itself', () => {
    // One company door, not a company door and a supplier door. The
    // split forked the front page on demand-vs-supply, which is a
    // position on a deal and not a property of a firm; the seats sit
    // behind one button.
    expect(PAGE).toContain('Open an example program')
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
    // "Horizontal, never vertical." Listing industries is fine as an
    // illustration of breadth; it would be wrong as a claim that a
    // different product exists per industry, so the menu says so itself.
    expect(PAGE).toContain('One product. No industry-specific version to buy.')
  })

  it('does not let the header text shift the pinned hero words', () => {
    // Every header label renders through {expr}, never as literal JSX
    // text, specifically so it stays invisible to copyFrom's tag-text
    // scan and the hero stays where it was pinned.
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

  it('leaves a 16px gutter at the edge of a phone screen', () => {
    // px-4 from zero, px-6 once there is room. A max-width container with
    // no padding puts the first letter of every line against the glass.
    const containers = [...PAGE.matchAll(/mx-auto max-w-[\w[\]-]+ ([^"]*)/g)].map((m) => m[1])
    expect(containers.length).toBeGreaterThan(5)
    for (const c of containers) {
      expect(c, `a container with no phone gutter: ${c}`).toMatch(/px-4|px-6/)
    }
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

// ── The palette ───────────────────────────────────────────────────────
//
// The home page is outside the chart-colors sweep, which reads
// src/app/dashboard and src/components. It is the one page a stranger
// sees, so it is held to the same bar here: the warm canvas, the ink,
// one blue and clay for attention, and nothing from Tailwind's own
// palette.

describe('The home page is drawn in the brand’s own colors', () => {

  it('reaches for no Tailwind color anywhere on it', () => {
    const offBrand = [...PAGE.matchAll(/\b(?:bg|text|border)-(red|blue|green|yellow|orange|purple|pink|indigo|teal|cyan|amber|lime|emerald|violet|fuchsia|rose|sky)-\d{2,3}\b/g)]
      .map((m) => m[0])
    expect(offBrand, offBrand.join(', ')).toEqual([])
  })

  it('uses only the design tokens where it names a color by hand', () => {
    const hexes = [...PAGE.matchAll(/#[0-9A-Fa-f]{6}\b/g)].map((m) => m[0].toUpperCase())
    const TOKENS = [
      '#F0EEE6', '#FBFAF7', '#FFFFFF', '#1F1E1D', '#6B6862',
      '#9C9891', '#E3DFD5', '#2B47E5', '#C0622E', '#4F6F52', '#B83A3A',
    ]
    for (const hex of hexes) expect(TOKENS, `${hex} is not a design token`).toContain(hex)
  })
})

// ── The footer ────────────────────────────────────────────────────────
//
// Three legal pages shipped and the home page had no link to any of
// them, so they were live and invisible — which, to the client security
// reviewer who goes looking in the footer, is the same as not having
// written them.

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

  it('offers the data processing addendum too, because that is the document a buyer’s counsel asks for', () => {
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

  it('lets the worked example carry a contractor rate and a bill, which are the product, not our price', () => {
    expect(priceClaims('Submitted 2 Sep · $78/hr · screened. Billed $11,856 on 45 day terms.'))
      .toEqual([])
  })

  it('lets the page say one record per contractor without reading it as a billing unit', () => {
    expect(priceClaims('One record per contractor, across every supplier they use.')).toEqual([])
  })

  it('says which words tripped it, so somebody can go and look', () => {
    expect(priceClaims('Etyme is $40 per seat.')[0]).toContain('per seat')
  })
})
