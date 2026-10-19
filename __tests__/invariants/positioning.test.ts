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
 *
 * ── Rewritten again 2026-09-20, for metaphors ────────────────────────
 *
 * The founder read the rebuilt page: "The home page is filled with
 * metaphors rather than outcomes, benefits and methods."
 *
 * Several sentences in here pinned a metaphor word for word — "Your role
 * goes further down than you think", "a hop off the platform is a hop
 * into an email client", "Fourteen months, then three, then two". A test
 * that pins the phrasing of a line the founder has asked to be rewritten
 * holds the page still. So each of those now pins the *fact* the line was
 * standing for: the arithmetic, the screen, the refusal sentence. What a
 * test may pin is what must remain true, never how prettily it is said.
 *
 * Four sentences are new, and each catches a way the page went clever:
 * a headline with no verb in it, a question with no answer under it, a
 * gate quoted in words the software does not use, and a sentence long
 * enough that a reader has to start it twice.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  check, verdict, copyFrom, gridsWithoutBreakpoint, priceClaims, namedCompanies,
  headlinesFrom, withoutVerb, longSentences, settingTheOfferAside,
  readsAsAimedAtSuppliers, offersTheProgramOffice, sizesAgainstIncumbents,
  sizesTheBuyer, unverifiableClaims, vendorManagementSystem, promisesAnAccount,
  incumbentComparison,
  type Copy,
} from '@/lib/positioning'
import { ACTIONS, ALL_ACTIONS } from '@/lib/autonomy'
import { CENSUS_COPY } from '@/lib/census-copy'
// Read rather than described: the page may say a certificate stops work
// only while this list holds the key it is talking about.
import { COVER_THAT_STOPS_WORK } from '@/lib/document-stages'
// Where the home page's long middle went on 2026-09-27, when it became a
// product page. A fact that moved is pinned where it now lives, so a
// section cannot fall off both pages at once.
import { MODULES, RULE_COUNT_LINE, WHAT_IS_LEFT, copyOfModule, spelled } from '@/lib/public-site/modules'
import { STORY, storyCopy } from '@/lib/public-site/story'
import { BAND, OPEN_DEMO, copyOfSkeleton, countWords, MOST_WORDS, DOORS as HOME_DOORS, FOOTER_LINKS as SKELETON_FOOTER_LINKS } from '@/lib/public-site/skeleton-words'
import { ABOUT, COMPANY_PAGES, TWO_WAYS, copyOfCompanyPage } from '@/lib/public-site/company'
import { copyOfDoc, copyOfDocsHome, docRoutes, TIME_AND_MONEY } from '@/lib/public-site/docs/index'
import { HEADER, everyFrameLink } from '@/lib/public-site/nav'
import { STEPS } from '@/lib/public-site/steps'
import { deriveSupplierPacket, deriveStartPacket } from '@/lib/packet-derivation'
import { CLOSE_BAND, SEE_IT, GET_THE_AUDIT, closeBandCopy } from '@/lib/public-site/funnel'
import { FOOTER as SITE_FOOTER, frameCopy } from '@/lib/public-site/nav'
import { DOCS_SLUGS, PUBLIC_PAGES } from '@/lib/public-site/pages'
import { copyOfPartyPage, everyDoorView, partyAt } from '@/lib/public-site/parties'
import { settleTarget, AHEAD, BEHIND } from '@/lib/public-site/settle'
import { EMBED_STEPS, embedStep } from '@/lib/sample-seat'
import { STEP_PAGES } from '@/lib/public-site/docs/process'
import { TOPICS } from '@/lib/public-site/docs/topics'

/**
 * The home page as a reader meets it: the page's own question and
 * category, then the shared skeleton it draws — the frame, the chips,
 * the sign-up band, the security line and the footer — which every
 * product page and party door draws too (founder, 2026-10-14).
 */
const PAGE = ['src/app/page.tsx', 'src/lib/public-site/skeleton-words.ts', 'src/lib/public-site/skeleton.tsx']
  .map((f) => readFileSync(join(process.cwd(), f), 'utf8')).join('\n')

/**
 * The three-way check, defined in the founder's words on his go-to-market
 * list, 2026-09-28. Said once, where a reader first meets the term.
 */
const THREE_WAY_CHECK = 'The three-way check: the hours, the invoice receipt, and the contract rate must all agree.'

/** Every word on a module page, as the public-pages guard reads it. */
const onModule = (slug: string): string => {
  const c = copyOfModule(MODULES.find((m) => m.slug === slug)!)
  return [...c.hero, ...c.body].join(' ')
}
/**
 * The four step pages, since 2026-10-15. Governance, contracts,
 * compliance and the chain folded into them that day; what those pages
 * said is pinned below where it lives now, mostly the documentation.
 */
const STEP_PAGES_TEXT = MODULES.map((m) => onModule(m.slug))
const CANDIDATES_PAGE = onModule('submissions')
const INVOICES_PAGE = onModule('invoices')
/**
 * Where the facts the product pages carried until 2026-10-14 live now: the
 * documentation page of the step each belongs to (coordinator, the same
 * day: "the facts that left the public pages must not leave the site").
 */
const onDoc = (path: string): string => {
  const c = copyOfDoc(path)!
  return [...c.hero, ...c.body].join(' ')
}
const TIME_ON_SITE_DOC = onDoc('when-work-ends')
const SUPPLIERS_DOC = onDoc('master-data/suppliers')
const ABOUT_PAGE = (() => {
  const c = copyOfCompanyPage(ABOUT)
  return [...c.hero, ...c.body].join(' ')
})()

/**
 * The real page, split at roughly where a first screen ends. The header is
 * a shared component since 2026-09-27 and none of its words are in this
 * file. The first screen is the hero: the category, the headline, the
 * one line saying what the software does, and the caption under the
 * dashboard — four pieces since 2026-09-28, when the founder asked for a
 * hero that reads in five seconds with "less theory there".
 */
const words = copyFrom(PAGE)
// Two since 2026-10-14: the founder's question and the category under
// it, and since 2026-10-19 the category above it as the hero's eyebrow
// ("the category be on top over hero text"). His support line of 2026-10-10 was cut with the home page he
// approved that day, as a sentence nothing on the page let a reader check.
// Three since his drawing of 2026-10-19: one line under the question,
// "Most companies cannot answer this without three weeks and a
// spreadsheet nobody trusts."
const FOLD = 3
const live: Copy = { hero: words.slice(0, FOLD), body: words.slice(FOLD) }

describe('The live home page still says what we agreed it says', () => {

  it('reads as the category, not as one of its modules', () => {
    const v = verdict(live)
    // A RISKY finding is allowed here — a worked example may name a role.
    expect(v.findings.filter((f) => f.severity === 'WRONG')).toEqual([])
    expect(v.ok).toBe(true)
  })

  it('names contractors or suppliers before it says anything clever', () => {
    // The category first, before anything clever.
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
    // A guard that reads nothing passes everything. The page is about a
    // hundred words since 2026-10-14, so the floor is lower than it was,
    // and still well above an empty read.
    expect(words.length).toBeGreaterThan(10)
    expect(words.join(' ').split(/\s+/).length).toBeGreaterThan(60)
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

  it('reads running a client’s program as neutral and supplying contractors as not', () => {
    // Widened 2026-09-20, when Etyme began offering to run the program.
    // The two sentences differ by one verb and the rule has to tell them
    // apart, or it either refuses the offer or lets the master-vendor
    // model through. Running a program means deciding who may supply and
    // at what band. Supplying people means having a bench.
    const runs = copy(
      ['Contingent workforce management'],
      ['Etyme’s program office runs the program for you, on the same record.'],
    )
    expect(check(runs).map((f) => f.rule)).not.toContain('neutrality')

    const supplies = copy(
      ['Contingent workforce management'],
      ['Etyme runs the program, and we supply the contractors on it.'],
    )
    expect(check(supplies).map((f) => f.rule)).toContain('neutrality')
  })

  it('does not let the offer’s own words hide a supply claim beside them', () => {
    // The strip is a phrase list, not a licence. A page that says both
    // things is still refused, and the refusal names the words.
    const f = check(copy(
      ['Contingent workforce management'],
      ['As your MSP provider we place contractors from our bench.'],
    ))
    const neutrality = f.find((x) => x.rule === 'neutrality')
    expect(neutrality).toBeDefined()
    expect(neutrality!.found).toContain('we place')
  })

  it('leaves the two labels a buyer knows readable as what they are', () => {
    // "VMS software" carries the word software and the vertical rule is
    // looking for software staffing — a page about developers and
    // engineers. A product category a buyer names is not a claim about
    // which industry this serves.
    const aside = settingTheOfferAside('You choose VMS software or an MSP provider.')
    expect(aside).not.toContain('software')
    expect(settingTheOfferAside('We staff software engineers')).toContain('software engineers')
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

/**
 * What the home page draws from data outside its own file. Until
 * 2026-10-14 that was the close every page ends in, the four step cards'
 * titles, three screenshot captions and the audit form, and all of it was
 * read here. The page the founder approved that day draws none of them:
 * every word it shows is in `src/app/page.tsx`, beside the header and its
 * own footer, so nothing is added.
 */
const DRAWN: string[] = []
const body = [...words.slice(FOLD), ...DRAWN].join(' ')
const all = [...words, ...DRAWN].join(' ')
/** The shared frame — header and footer — which the home page draws too. */
const FRAME_SRC = readFileSync(join(process.cwd(), 'src/lib/public-site/frame.tsx'), 'utf8')
const CLOSE_SRC = readFileSync(join(process.cwd(), 'src/lib/public-site/close-band.tsx'), 'utf8')
/** Everything above the fold, as one string, for the guards that read it. */
const hero = live.hero.join(' ')

const at = (anchor: string) => PAGE.indexOf(`id="${anchor}"`)

describe('Below the hero, the page says what the business is', () => {

  it('names the four steps once on About, so that no single station reads as the product', () => {
    // Naming one station makes the whole product read as that station,
    // which is how a screening headline made this a hiring tool. Until
    // 2026-10-15 About said the whole span in nine stations; the founder's
    // drawing cut About to five lines, and the first says the four steps
    // in the trade's words. The documentation's spine carries the same four
    // in order (the header's menu sheet carried them until 2026-10-19).
    expect(ABOUT_PAGE).toContain('manage contractors from all its suppliers: jobs, candidates, timesheets and invoices.')
    expect(STEPS.map((s) => s.name)).toEqual(['Job', 'Candidates', 'Timesheets', 'Invoices'])
  })

  it('leaves the hero to say what the software is, and argues nothing about other people’s companies anywhere', () => {
    // The hook is the not-knowing, said as the founder's one question in
    // the hero. Until 2026-10-15 About carried the four questions, why
    // nobody can answer them and the four screens that do; the drawing
    // cut About to five lines, and the panel under the hero answers the
    // questions by showing them rather than by arguing.
    expect(hero).not.toContain('How many contractors are on your sites')
    expect(PAGE).not.toContain('id="gap"')
    expect(ABOUT_PAGE).not.toContain('Most companies cannot answer')
  })

  it('keeps tenure to one line, not a section', () => {
    // Corrected 2026-09-17: "Tenure is nobody's problem — only you
    // expect it to be solved." It is the moat, not the wedge. No page
    // gives it a section; the end-of-work page says it in one line.
    expect(PAGE).not.toContain('id="tenure"')
    expect(ABOUT.blocks.map((b) => b.id)).not.toContain('tenure')
    const mentions = (all.toLowerCase().match(/tenure/g) ?? []).length
    expect(mentions, `the word "tenure" is on the page ${mentions} times`).toBeLessThanOrEqual(5)
    expect(body).not.toContain('One person worked 14 months')
    // The compliance page said it until it folded into Candidates on
    // 2026-10-15; the documentation's end-of-work page says the rule in one line.
    expect(TIME_ON_SITE_DOC).toContain('Time on site is the person’s, across every supplier. A day counts once.')
  })

  it('keeps the business case off the front door, and the time limit on the documentation page a reader can check', () => {
    // The hook is in the hero. What it costs when somebody finally asks —
    // co-employment, lapsed insurance, a bill with no signed week — was
    // argued on the documentation's time-limit page until 2026-10-15; the
    // founder's drawing kept each as the rule that stops it, on the step
    // where it happens, rather than as an argument.
    expect(PAGE).not.toContain('id="exposure"')
    expect(body).not.toContain('Nobody is fined on the day')
    expect(TIME_ON_SITE_DOC).toContain('time limit')
    for (const text of STEP_PAGES_TEXT) expect(text).not.toMatch(/co-employment|you will be fined|lawsuit/i)
  })

  it('stops each of the three exposures with a rule, on the documentation page of the step where it happens', () => {
    expect(onDoc('when-work-ends')).toContain('At the limit it is blocked.')
    expect(onDoc('candidates')).toContain('This supplier has no current insurance verification on file.')
    expect(onDoc('invoices')).toContain('A line with no approved week behind it is never paid.')
  })

  it('says prime, sub and bench are positions on a deal rather than kinds of company, on the suppliers page of your records', () => {
    expect(SUPPLIERS_DOC).toContain('Prime, sub and bench are positions on a deal, not kinds of company.')
  })

  it('does not lead with a penalty, because nobody is fined at month nineteen', () => {
    // The page used to argue tenure as "an exposure rather than a
    // saving". A compliance pitch loses to "we have never been caught",
    // which is worse than losing to "we are managing fine" because it
    // is true.
    for (const text of [body, ...STEP_PAGES_TEXT, ABOUT_PAGE]) {
      expect(text).not.toContain('exposure rather than a saving')
      expect(text).not.toContain('usually finds out about it from a lawyer')
    }
  })

  it('is written to the client’s people by job title — program manager, Procurement, hiring manager, HR, AP clerk', () => {
    // The client is the customer, decided 2026-09-10. Writing to "a
    // company" is writing to nobody. The line under the home page's panel
    // names the three people it plays by job title (2026-10-19); each
    // step page says who is involved by job title (2026-10-15).
    expect(PAGE).toContain("const ON_SCREEN = 'Three people at Northbend Athletic on one morning: a hiring manager, a contractor, an AP clerk.")
    const involved = MODULES.map((m) => m.lines[1]).join(' ')
    for (const job of ['hiring manager', 'Procurement', 'budget owner', 'HR', 'AP clerk']) expect(involved, job).toContain(job)
  })

  it('is written to the client, with the supplier reading over its shoulder', () => {
    // Addressing hiring companies, primes, subs and bench operators as
    // four equals is the plan from before the client became the customer
    // on 2026-09-10. A supplier's door on the home page is one word in the
    // sign-up band's small line of doors, after the client's own; the
    // sub-vendor and the firm with workers waiting for a project are on
    // the suppliers' own door.
    expect(PAGE).toContain("{ t: 'Suppliers', href: '/for/suppliers' }")
    // Since 2026-10-16 the suppliers' door has a tab for each: the prime
    // vendor first, then the sub-vendor and the bench vendor, each at its
    // own address.
    const door = partyAt('suppliers')!
    const says = (tab: string) => { const c = copyOfPartyPage(door, tab); return [...c.hero, ...c.body].join(' ') }
    expect(door.tabs!.map((t) => t.label)).toEqual(['Prime vendor', 'Sub-vendor', 'Bench vendor'])
    expect(says('prime')).toContain('Each sub-vendor sees its own rate. Your client’s name is yours to share.')
    expect(says('sub')).toContain('Your rates and your people stay yours.')
    expect(says('bench')).toContain('Each person by their own consent.')
  })

  it('writes to the client before it writes to anybody who supplies the client', () => {
    // On the home page the client's sign-up comes first and its door
    // leads the line of doors; the supplier's door comes after. On About,
    // what the client gets comes before what Etyme never does to a supplier.
    expect(at('sign-up')).toBeGreaterThan(at('demo'))
    expect(PAGE.indexOf("{ t: 'Clients', href: '/signup' }")).toBeGreaterThan(0)
    expect(PAGE.indexOf("{ t: 'Clients', href: '/signup' }")).toBeLessThan(PAGE.indexOf("{ t: 'Suppliers', href: '/for/suppliers' }"))
    expect(ABOUT_PAGE.indexOf('What we build.')).toBeLessThan(ABOUT_PAGE.indexOf('What we never do.'))
  })

  it('never gives the supply side a column beside the client on the front door', () => {
    // The chain page's line each for a prime, a sub and a bench vendor,
    // and its sentence that the three are positions on a deal, were cut
    // with the founder's skeleton of 2026-10-14; the suppliers' own door
    // speaks to them now. What stays held is the front door.
    expect(PAGE).not.toContain('const SUPPLY')
    expect(PAGE).not.toContain("who: 'The company hiring'")
  })

  it('tells a supplier why it is safe here in a plain line, never a rhetorical question', () => {
    // Subtle is not absent. The network only works because suppliers are
    // on it. About says in one line that Etyme has no reason to favor any
    // supplier, because it supplies nobody.
    expect(ABOUT_PAGE).toContain('Etyme never supplies workers and never runs a bench. So it has no reason to favor any supplier.')
    expect(ABOUT_PAGE).not.toMatch(/supplier\?/)
    // The home page asks the client four questions since 2026-10-09; none
    // of them is a question put to a supplier.
    expect(PAGE).not.toMatch(/(?:are you|a) (?:staffing )?supplier\?/i)
  })

  it('says a sub-vendor learns the client’s name only where the prime may share it, and claims no blind key until a screen uses one', () => {
    // The chain page said both until it folded into Invoices on
    // 2026-10-15. The first is a row of the documentation's table of who
    // does what. The second, a blind key that shows two suppliers a
    // collision and nothing else, is built (`lib/distribution`) and no
    // route or screen calls it yet, so a reader could not check it: no
    // public page may say it until one does.
    expect(onDoc('who-does-what')).toContain('The client’s name only where the prime may share it.')
    const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
      .flatMap((d) => (d.isDirectory() ? files(join(dir, d.name)) : /\.tsx?$/.test(d.name) ? [join(dir, d.name)] : []))
    const callers = files(join(process.cwd(), 'src/app')).filter((f) => readFileSync(f, 'utf8').includes('lib/distribution'))
    if (callers.length === 0) {
      for (const [route, text] of everyPublicPage()) expect(text, route).not.toMatch(/blind key/i)
      expect(frameCopy().join(' ')).not.toMatch(/blind key/i)
    }
  })

  it('says where the guarantee stops, because a company that is not on Etyme is not covered by it', () => {
    // A control that stops working where the chain leaves the product is
    // a comfort unless the page says where it stops. About said it until
    // 2026-10-15 with "and the screen says so"; no screen says so
    // (`beyond` in lib/distribution has no caller yet), so the suppliers
    // page says only what is true.
    expect(SUPPLIERS_DOC).toContain('A firm that is not on Etyme is outside the record. What it forwards by email, Etyme cannot see.')
    expect(ABOUT_PAGE).not.toContain('the screen says so')
  })

  it('walks the hire through every role on the step pages, so no one role reads as the whole product', () => {
    // About walked one hire in six milestones until 2026-10-15. The
    // documentation's five step pages walk it now, each box saying who.
    expect(SKELETON_FOOTER_LINKS.find((l) => l.t === 'Documentation')?.href).toBe('/docs')
    const roles = new Set(STEP_PAGES.flatMap((p) => p.flow.map((b) => b.role)))
    for (const r of ['Hiring manager', 'Supplier', 'Worker', 'AP clerk', 'Compliance officer', 'Program manager']) {
      expect(roles.has(r), r).toBe(true)
    }
    expect(onDoc('job')).toContain('Nobody approves their own job request.')
    expect(PAGE).not.toContain('const LIFECYCLE')
  })

  it('says each gate in a line on the step page where it happens', () => {
    // Until 2026-10-14 each product page quoted the software's own
    // refusal under "What it refuses". Since the founder's drawing of
    // 2026-10-15 each gate is a line of its step page's "With Etyme", and
    // the panel shows the screen it happens on. The lapsed insurance
    // certificate is on the documentation's Candidates page, above.
    expect(CANDIDATES_PAGE).toContain('Nobody starts without a US work form (I-9).')
    expect(onModule('timesheets')).toContain('Nobody approves their own hours.')
    expect(INVOICES_PAGE).toContain('The hours, the invoice and the contract rate must agree. If they do, pay. If not, it says why.')
    expect(PAGE).not.toContain('const GATES')
  })

  it('says the enforcement blocks where the law is behind it and warns everywhere else', () => {
    // The governance page opened on this until it folded into Job on
    // 2026-10-15. The documentation shows it on each step page: what it
    // stops, marked as a block, and what it lets through with a reason.
    const kinds = new Set(STEP_PAGES.flatMap((p) => p.stops.map((r) => r.kind)))
    expect(kinds.has('BLOCK')).toBe(true)
    expect(kinds.has('WARN')).toBe(true)
    expect(onDoc('when-work-ends')).toContain('At the limit it is blocked.')
  })

  it('says plainly that the price is not settled, rather than saying nothing about money', () => {
    // A page with no price makes a reader assume enterprise sales and
    // leave. Silence is worse than "we are still deciding". Since
    // 2026-10-14 the home page says it in four words in the sign-up band,
    // "Free while we are testing.", with no number; About says it in one line.
    expect(body).toContain('Free while we are testing.')
    expect(priceClaims(all)).toEqual([])
    expect(ABOUT_PAGE).toContain('Price. Free while we test with our first companies. No number until we have one.')
    expect(priceClaims(ABOUT_PAGE)).toEqual([])
  })

  it('says what is settled about Etyme on About: it supplies nobody, it is free while testing, and where it is', () => {
    expect(ABOUT_PAGE).toContain('Etyme never supplies workers and never runs a bench')
    expect(ABOUT_PAGE).toContain('Free while we test')
    expect(ABOUT_PAGE).toContain('Durham, NC 27713')
    // The footer every public page draws, the home page's included, links
    // to the top of About — no link lands in the middle of a page (2026-09-30).
    // It moved there from the header's menu sheet on 2026-10-19.
    expect(SKELETON_FOOTER_LINKS.map((l) => l.href)).toContain('/about')
    expect(PAGE).not.toMatch(/'\/about#/)
  })

  it('no longer heads a section with one module describing itself', () => {
    expect(all).not.toContain('Stop reading bad submissions')
  })

  it('promises only the export that exists — every list to CSV', () => {
    // "Your data exports in full, any time" was a promise nothing stood
    // behind. What is built: every list on the shared table exports to
    // CSV, and `/dashboard/my-data` gives a person a copy of what is held
    // about them. Integrations says the first; Security the second.
    expect(all).not.toContain('exports in full')
    expect(ABOUT_PAGE).not.toContain('exports in full')
    expect(onDoc('integrations')).toContain('Every list exports to CSV.')
    expect(copyOfCompanyPage(COMPANY_PAGES.find((c) => c.route === '/security')!).body.join(' ')).toContain('A person can download or erase their own data.')
    expect(existsSync(join(process.cwd(), 'src/app/dashboard/my-data/page.tsx'))).toBe(true)
  })

  it('claims no set-up time nobody has measured', () => {
    expect(all).not.toContain('Set-up takes an afternoon')
    expect(all).not.toContain('within an hour')
  })

  it('says the category straight above the founder’s headline, as its eyebrow, never as the headline', () => {
    // The founder's brief, 2026-10-09: the hero is "Know what every
    // contractor costs, across every supplier.", and the category
    // ("Enterprise contingent workforce management", no size after it —
    // "keep the business open for all") moves into the supporting
    // message. From 2026-10-14 it was the line straight under the
    // question; since 2026-10-19 it sits on top, as the hero's eyebrow
    // (founder: "the category be on top over hero text").
    expect(words[0]).toBe('Enterprise contingent workforce management.')
    expect(words[1]).toBe('Know what every contractor costs, across every supplier.')
    expect(headlinesFrom(PAGE)[0]).toBe('Know what every contractor costs, across every supplier.')
    // Small, uppercase and muted, the way the step pages set "Step 1 of 4".
    const top = PAGE.slice(PAGE.indexOf('id="top"'), PAGE.indexOf('<h1'))
    expect(top).toContain('<p className="mb-2 text-[12px] font-medium uppercase tracking-[0.08em] text-etyme-muted">')
    expect(copyFrom(top)).toEqual(['Enterprise contingent workforce management.'])
  })
  it('carries no support line between the category and the question, because nothing in it could be checked by clicking', () => {
    // The founder's support line of 2026-10-10 ("Bring contractor records,
    // supplier activity, tenure, approvals …") was cut on 2026-10-14 with
    // every adjective on the page: the test for a word is whether the
    // reader can check it by clicking something on this page, and the live
    // product under the hero is what the line was describing.
    expect(words[0]).toBe('Enterprise contingent workforce management.')
    expect(words[1]).toBe('Know what every contractor costs, across every supplier.')
    expect(all).not.toContain('Bring contractor records')
    expect(all).not.toContain('trusted control layer')
    expect(unverifiableClaims(all)).toEqual([])
  })
  it('keeps the hero to the category and the question, with the live product straight under them', () => {
    // The page the founder approved on 2026-10-14: the question, the
    // category line, and then the product itself. No buttons in the hero,
    // no screenshot beside it: the one button is under the product. Since
    // the founder's drawing of 2026-10-19, one line under the question
    // says what not knowing costs today, and the category sits on top.
    expect(live.hero).toHaveLength(3)
    expect(live.hero[2]).toBe('Most companies cannot answer this without three weeks and a spreadsheet nobody trusts.')
    const top = PAGE.slice(PAGE.indexOf('id="top"'), PAGE.indexOf('<LiveDemo'))
    expect(copyFrom(top)).toEqual([
      'Enterprise contingent workforce management.', 'Know what every contractor costs, across every supplier.',
      'Most companies cannot answer this without three weeks and a spreadsheet nobody trusts.',
    ])
    expect(top).not.toContain('<CountedLink')
    expect(at('demo')).toBeGreaterThan(at('top'))
    expect(PAGE).not.toContain('const GLANCE')
    // "Three weeks" left the hero on 2026-09-28 as a claim a reader could
    // not check; the founder drew it back on 2026-10-19 as the one line
    // under the question, and it is held to that one line, word for word.
    expect(hero.split('three weeks').length - 1).toBe(1)
  })
  it('still passes the four positioning rules after the rewrite', () => {
    expect(verdict(live).ok).toBe(true)
  })
})

// ── Outcomes, benefits and methods ───────────────────────────────────
//
// Added 2026-09-20, on the founder reading the page: "The home page is
// filled with metaphors rather than outcomes, benefits and methods."
//
// The four rules above could not see it. A page can name the category,
// keep AI out of the hero, place nobody and stay horizontal, and still
// say "that’s the gap" over a headline that is three noun phrases.
// These four are the mechanical part of what he asked for.

describe('Every line says an outcome, a benefit or a method', () => {

  it('writes every headline as a sentence with a verb, not a slogan, and takes a door’s headline as the statement the founder chose for it on 2026-10-16', () => {
    // Two headlines since 2026-10-14: the question, and the sign-up band's
    // "Seen enough? Set up your company.", drawn from the skeleton every
    // product page and party door shares. Each of those pages' questions
    // carries a verb too, and so does the close the other pages end in.
    const heads = [...headlinesFrom(PAGE), BAND.heading]
    expect(heads).toEqual(['Know what every contractor costs, across every supplier.', 'Seen enough? Set up your company.'])
    const slogans = withoutVerb([...heads, CLOSE_BAND.heading, ...MODULES.map((m) => m.headline), ...everyDoorView().map((p) => p.headline)])
    expect(slogans, `these headlines have no verb in them:\n  ${slogans.join('\n  ')}`).toEqual([])
  })
  // "Answers each of the four questions in one line that names a screen"
  // held About's four answers until 2026-10-15, when the founder's drawing
  // cut About to five lines. The panel under the home page's question
  // answers them by showing the screens (story-panel.test.ts).

  it('keeps every sentence short enough to read once', () => {
    // Thirty is the refusal line and about twenty is the target. The
    // reader is a program manager who may be reading English as a second
    // language, and a forty-word sentence is two sentences with the full
    // stop missing.
    const long = words.flatMap((w) => longSentences(w, 30))
    expect(long, `split these:\n  ${long.join('\n  ')}`).toEqual([])
  })

  it('has retired the lines that were clever rather than clear', () => {
    // Each of these was on the page and each was standing in for
    // something plainer, which is now what the page says instead.
    for (const metaphor of [
      'That’s the gap',
      'Including the ones you didn’t hire',
      'read over the shoulder',
      'is not a control',
      'the week somebody stops accepting the caveat',
      'Your role goes further down than you think',
      'before lunch instead of by Thursday',
      'yours to break',
      'Fourteen months, then three, then two',
      'What no one system holds',
    ]) {
      expect(all, metaphor).not.toContain(metaphor)
    }
  })
})

// ── A claim about a screen names the screen that does it ─────────────
//
// Added 2026-09-21, on the founder: "Fix the two sentences."
//
// Both sentences were true of the product and wrong about the screen.
// One said a lapsed certificate stops a start, on a day when the
// arithmetic had just learned to refuse a lapsed certificate of good
// standing and the two doors that stop somebody had not. The other said
// the Program screen shows the quarter from bills that matched a signed
// timesheet, when what that screen shows is a forward estimate at the
// rates on the contracts, and the matched bills are on the Invoices
// screen.
//
// Neither is the kind of mistake the four rules above can see. A page
// can name the category, keep AI out of the hero, place nobody and stay
// horizontal, and still tell a buyer that a screen does something it
// does not — which is the one claim a buyer checks on the first day and
// the one that costs the deal. So each is read against the code that
// would have to be true.

describe('Every claim about a screen is a thing that screen does', () => {

  it('the page claims good standing blocks only while the code blocks on it', () => {
    // The arithmetic refuses it. `GOOD_STANDING` joined the two
    // insurances in what stops work on 2026-09-21, so a certificate on
    // file and out of date is a BLOCK rather than a green row.
    expect([...COVER_THAT_STOPS_WORK]).toContain('GOOD_STANDING')

    // And the page may say only as much as the doors do. Both doors
    // that actually stop somebody read the firm's whole file now — the
    // start since money passed `lineExtras` into the clearance, the
    // submission since demand stopped narrowing what it hands the gate
    // to the keys beginning INSURANCE_. For one day they did not, and
    // the page said the narrower true thing: insurance stops a start,
    // good standing is read on the compliance screen. This is the
    // equivalence rather than the assertion, so the sentence and the
    // doors cannot drift apart in either direction — a door that goes
    // back to reading insurance alone fails here with the sentence
    // still on the page, which is the same bug facing the other way.
    //
    // The two doors are built differently, so what proves each is
    // different, and a single keyword would pass on a comment:
    //
    //   the start      spreads `lineExtras`, which returns the whole
    //                  FIRM_STANDING set, good standing included
    //   the submission passes the rows it read, unfiltered, so what
    //                  proves it is the absence of the narrowing that
    //                  went stale
    const START = 'src/app/api/contracts/[id]/activate/route.ts'
    const SUBMISSION = 'src/app/api/submissions/route.ts'
    /** The code, with the comments about the code taken out. */
    const code = (file: string): string =>
      readFileSync(join(process.cwd(), file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ')
    const startReadsStanding = /lineExtras\(/.test(code(START))
    const submissionReadsStanding = !/startsWith\('INSURANCE_'\)/.test(code(SUBMISSION))
    const doorsReadStanding = startReadsStanding && submissionReadsStanding

    // The claim sat under a Compliance menu until 2026-09-27, and was the
    // HR and compliance role's line in the shared header until the menu
    // became the four steps on 2026-10-15. No public page says it now; if
    // one does again, the doors must read it. Read across every public
    // page, the header and the footer.
    // Sentence by sentence, because the claim is only a claim when the
    // standing and the refusal are in the same one: "a lapsed insurance
    // certificate stops a start" beside "good standing is read on the
    // compliance screen" says nothing about good standing stopping
    // anything, and read as one string it would look as though it did.
    const said = [...everyPublicPage().map(([, t]) => t), frameCopy().join(' ')]
      .flatMap((t) => t.split(/(?<=[.!?])\s+/))
      .filter((sentence) => /good standing/i.test(sentence) && /\bstops?\b/i.test(sentence))
      .join(' ')
    const saysStandingStopsWork = said.length > 0
    if (saysStandingStopsWork) {
      expect(doorsReadStanding, 'a page says a lapsed good standing stops work; a door that stops work does not read it').toBe(true)
    }

    // And it says which two stations, because those are the two that
    // refuse: `supplierCoverGate` at the submission, the same gate
    // through `contractClearance` at the start.
    if (saysStandingStopsWork) {
      expect(said).toMatch(/\bsubmission\b/i)
      expect(said).toMatch(/\bstart\b/i)
    }
  })

  it('no public page says the program dashboard’s spend came from matched bills, because it is an estimate from rates', () => {
    // The dashboard's spend is a forward estimate — a bill rate times a
    // flat 160-hour month — and `lib/program-spend` says so out loud
    // beside the number. About named the screen for it until 2026-10-15;
    // no page names it now, and none may say the figure is matched.
    const spend = readFileSync(join(process.cwd(), 'src/lib/program-spend.ts'), 'utf8')
    expect(spend).toContain('It is an estimate, not signed time.')
    for (const text of [all, ABOUT_PAGE, ...docRoutes().slice(1).map((r) => onDoc(r.slice('/docs/'.length)))]) {
      expect(text).not.toMatch(/(?:dashboard|spend)[^.]*\bmatched\b/i)
    }
  })

  // "Sends the comparison of two suppliers to the screen that draws it"
  // held About's answer naming the Program screen, which left with About's
  // four answers on 2026-10-15.

  it('the page never tells a client it will see a supplier’s subcontractors by name', () => {
    // 2026-09-21. The headline read "Etyme shows every contractor on
    // your sites, including contractors your suppliers' subcontractors
    // placed", and every guard in the file passed it. To a prime that
    // sentence is a promise to show its client the firm it buys from.
    //
    // What the record does is narrower and is what the site says now:
    // the person, and whether whoever employs
    // them is insured and authorized, because that is the client's own
    // exposure. The name below follows the client's own agreement.
    // On the customers page of the documentation since 2026-10-15.
    const customers = onDoc('master-data/customers')
    expect(customers).toContain('It sees the supplier it pays and the rate it pays, and nothing below.')
    expect(customers).toContain('It always sees whether the firm employing a person on its site is insured.')
    expect(ABOUT_PAGE).not.toContain('subcontractors placed')

    // And the guard refuses the sentence that shipped, so it cannot
    // come back by another route.
    const caught = readsAsAimedAtSuppliers(
      'Etyme shows every contractor on your sites, including contractors your ' +
      'suppliers’ subcontractors placed.'
    )
    expect(caught, 'the old headline is refused now').not.toEqual([])
    expect(caught.join(' ')).toContain('subcontractor')
    // The live page and About, read whole, say nothing aimed at a supplier.
    expect(readsAsAimedAtSuppliers(all)).toEqual([])
    expect(readsAsAimedAtSuppliers(ABOUT_PAGE)).toEqual([])
  })

  it('stops the award where the ledger stops it, rather than the submission', () => {
    // A tenure cap is evaluated at the award and at the start, and the
    // award is where a BLOCK is never overridable. Nothing refuses a
    // submission on tenure, and the page said it did.
    const award = readFileSync(
      join(process.cwd(), 'src/lib/award.ts'), 'utf8'
    )
    expect(award).toContain('f.governance.blocks.length > 0')
    // The documentation says an extension is checked against the time
    // limit and blocked at it, and no public page says a submission is
    // refused on it (the compliance page said so until it folded into
    // Candidates on 2026-10-15).
    expect(TIME_ON_SITE_DOC).toContain('At the limit it is blocked.')
    for (const text of [...STEP_PAGES_TEXT, TIME_ON_SITE_DOC]) expect(text).not.toMatch(/blocks a new submission|submission is refused/)
  })
})

// ── Who sits at the desks, and how quietly it is offered ──────
//
// Decided 2026-09-20, and corrected the same day. Etyme offers to run a
// client's program itself, as a vendor-neutral program office. The page
// led with that as a choice until the founder read it: "MSP selling
// should be undercover selling and more as value addition rather than
// fully pitching for the market. Remove the threat if any to supply
// chain."
//
// So the record is what the page sells, the service is one quiet
// sentence after the record sentence, and the section that explains it
// argues with nobody. Three sentences in this file used to pin the page
// as it was for those few hours — the hero's "You choose how to use
// it", the section headline, and the sizing sentence against an MSP.
// They pinned copy the founder has since asked to be taken off, and a
// test that pins a reversed decision stops the page being corrected. So
// they are rewritten below into what must stay true: the offer appears
// once, quietly, never in a headline, and nothing on the page measures
// Etyme against anybody.
//
// The neutrality commitment is load-bearing in a way it was not before,
// because a supplier reading this page is being asked to trust a firm
// that runs its client's program. It stays in the section rather than
// only in the footer.

describe('The record is the product, and Etyme running the program is offered quietly', () => {

  it('leads with the record and leaves the offer to run the program to About, where it is said once and quietly', () => {
    // Until 2026-10-14 the offer was one row of the home page's close.
    // The page the founder approved that day has no close and makes no
    // offer: the live product is the record, and the service is a second
    // way to use it, explained on About. "MSPs" on the home page is the
    // door for a firm that runs programs, not an offer.
    expect(offersTheProgramOffice(all)).toEqual([])
    expect(all).not.toContain('Have Etyme run your program office')
    expect(offersTheProgramOffice(ABOUT_PAGE)).toHaveLength(1)
    expect(all).not.toContain('You choose how to use it')
  })

  it('never offers to run the program in a headline or in the hero', () => {
    for (const heading of [...headlinesFrom(PAGE), CLOSE_BAND.heading]) {
      expect(offersTheProgramOffice(heading), heading).toEqual([])
    }
    expect(offersTheProgramOffice(`${words[0]} ${words[1]}`)).toEqual([])
  })

  it('does not size Etyme against the incumbents', () => {
    // "An MSP normally wants a program of hundreds of contractors.
    // Etyme's program office takes programs with five to fifteen
    // suppliers." Both halves may be true and together they are a
    // competitive claim about firms nobody here has spoken to, on
    // behalf of a service nobody has delivered. It also tells the
    // reader they are the client the real ones would not take.
    const sized = sizesAgainstIncumbents(all)
    expect(sized, sized.join('; ')).toEqual([])
    expect(all).not.toContain('An MSP normally wants a program of hundreds of contractors')
    expect(all).not.toContain('five to fifteen suppliers')
  })

  it('no sentence on the page reads as a threat to a supplier', () => {
    // The network only works because suppliers put their consultants in
    // the system. A page that keeps every neutrality promise and still
    // reads as a tool bought to catch them costs the network. The rate
    // questions stay on the client's side: what the client itself
    // cannot answer, never what a supplier is hiding.
    const aimed = readsAsAimedAtSuppliers(all)
    expect(aimed, aimed.join('\n')).toEqual([])
  })

  it('no sentence on the census page reads as a threat to a supplier either', () => {
    // The census is the door to the program office service, so it is
    // the page most likely to reach for "find out what your suppliers
    // are really charging". What it may say is what the client cannot
    // answer about its own workforce: the lowest rate, the highest
    // rate and the gap, which is the client's own knowledge of its own
    // spend. The agreement it links to already promises we never
    // approach a supplier; the page above it must not undo that.
    const census = readFileSync(join(process.cwd(), 'src/app/census/page.tsx'), 'utf8')
    const said = [...copyFrom(census), JSON.stringify(CENSUS_COPY)].join(' ')
    const aimed = readsAsAimedAtSuppliers(said)
    expect(aimed, aimed.join('\n')).toEqual([])
    // And the guard is reading something, rather than passing on an
    // empty page.
    expect(said).toContain('across every supplier')
  })

  it('keeps the two labels the founder named, in one line of About, never in a headline', () => {
    // A program manager has already evaluated things called both of
    // those, and inventing a third word costs the recognition. Since
    // 2026-10-15 About says them in one of its five lines.
    expect(TWO_WAYS.map((w) => w.label)).toEqual(['VMS software', 'MSP provider'])
    expect(ABOUT_PAGE).toContain('Two ways to use it. Your team runs it: Etyme as VMS software. Or Etyme runs it for you: Etyme as MSP provider.')
    for (const heading of [...headlinesFrom(PAGE), CLOSE_BAND.heading, ABOUT.title, ABOUT.lede]) {
      expect(heading, heading).not.toContain('MSP')
    }
    // Every public footer links to the top of About, never into it.
    expect(SKELETON_FOOTER_LINKS.map((l) => l.href)).toContain('/about')
  })

  it('says your own team running it first, and Etyme running it second', () => {
    expect(ABOUT_PAGE.indexOf('Your team runs it')).toBeGreaterThan(0)
    expect(ABOUT_PAGE.indexOf('Your team runs it')).toBeLessThan(ABOUT_PAGE.indexOf('Or Etyme runs it for you'))
  })

  it('says what Etyme never does, whichever way it is used', () => {
    // Neutrality is absolute, and About says it in its second line, right
    // before the two ways a reader may weigh handing Etyme the program.
    expect(ABOUT_PAGE).toContain('Etyme never supplies workers and never runs a bench. So it has no reason to favor any supplier.')
    expect(ABOUT_PAGE.indexOf('What we never do.')).toBeLessThan(ABOUT_PAGE.indexOf('Two ways to use it.'))
    expect(check(live).map((f) => f.rule)).not.toContain('neutrality')
    expect(check(copyOfCompanyPage(ABOUT)).map((f) => f.rule)).not.toContain('neutrality')
  })

  // Four sentences held About's longer case for the service until
  // 2026-10-15 — what a client gets from it, the decisions the client
  // keeps, the choice coming after the four answers, and what changes for
  // a supplier — and they left with it when the founder's drawing cut
  // About to five lines.

  it('names no price anywhere, and no longer says how a program Etyme runs would be paid for', () => {
    // Until 2026-10-15 About said once that Etyme, running a program, is
    // paid a percentage the suppliers pay on their billings. The founder's
    // drawing cut About to five lines and the sentence left the site; the
    // price line says only that there is no number yet.
    expect(all).not.toContain('a percentage the suppliers pay on their billings')
    expect(ABOUT_PAGE).not.toContain('a percentage the suppliers pay on their billings')
    for (const text of [all, ABOUT_PAGE]) {
      const found = priceClaims(text)
      expect(found, found.join('; ')).toEqual([])
    }
    expect(body).toContain('Free while we are testing.')
    expect(readsAsAimedAtSuppliers(ABOUT_PAGE)).toEqual([])
  })

  it('links the census from nowhere, now that the audit is deleted from every page', () => {
    // The census was the spend audit, the primary call from 2026-10-09 and
    // the second call from the morning of 2026-10-14. The founder deleted
    // it the same day; the page stays reachable for thirty days, linked
    // from nowhere (public-funnel.test.ts holds every public page to it).
    expect(PAGE).not.toContain('GET_THE_AUDIT')
    expect(PAGE).not.toMatch(/spend audit/i)
    expect(CLOSE_SRC).not.toContain('GET_THE_AUDIT')
    expect(existsSync(join(process.cwd(), 'src/app/census/page.tsx'))).toBe(true)
  })

  it('says VMS software without the page reading as software staffing', () => {
    // Horizontal, never vertical. The label is a product category a
    // buyer names, and the rule that guards the industry assumption has
    // to tell it apart from a page about engineers.
    expect(ABOUT_PAGE).toContain('VMS software')
    expect(check(copyOfCompanyPage(ABOUT)).map((f) => f.rule)).not.toContain('horizontal-not-vertical')
    // "Vendor management system" itself left the home page on 2026-09-28;
    // the founder's label "VMS software" is kept on About.
    expect(vendorManagementSystem(all)).toEqual([])
    expect(check(live).map((f) => f.rule)).not.toContain('horizontal-not-vertical')
  })

})

// ── Screens before sentences ─────────────────────────────────────────
//
// Added 2026-09-20. The founder gave this page to the CTO of a
// two-billion-dollar company with forty to fifty IT contractors bought
// through staffing firms — the exact buyer. He said he did not
// understand what the app does, and that it looked like an AI app.
// Naming the category by comparison, in conversation, connected at once.
//
// Nothing in this file could have caught that. The page named the
// category, kept AI out of the hero, placed nobody and stayed
// horizontal, and a buyer still could not tell what it was. What was
// missing was the product: a dense screen with numbers on it reads as
// enterprise software, and three paragraphs about a record read as a
// pitch deck.
//
// So these five hold the shape of the answer rather than its wording:
// a real screen before the argument, every image on disk, a hard limit
// on the prose above it, four steps a CTO recognizes, and a subhead
// that names the category and the size.
//
// The comparison itself lasted one evening. The page named two
// enterprise VMS products and said it was the same job, sized for a
// company with fifty contractors rather than five thousand, and the
// founder read it on his phone and struck it: naming them "will trigger
// more questions than answers." It is a sentence he says in a
// conversation, where he can answer the next question.

/** Every screenshot the page draws, in source order. None since 2026-10-14. */
const SCREENS = [...PAGE.matchAll(/\/screens\/[\w-]+\.png/g)].map((m) => m[0])
/** The panel that shows the product working, since it replaced the frame (2026-10-14). */
const PANEL = readFileSync(join(process.cwd(), 'src/lib/public-site/story-panel.tsx'), 'utf8')

describe('The page shows the product before it describes it', () => {

  it('shows the product before it describes it: the panel showing it working sits straight under the question', () => {
    // Screens before sentences (2026-09-20) still holds. Since the
    // founder's "Build it" later on 2026-10-14 the product is shown working
    // in one compact panel, from the seeded demo's own names and figures,
    // in place of the live frame he found blank or a wall of tables.
    expect(PAGE).toContain('<LiveDemo>')
    expect(PAGE).toContain('<StoryPanel start={storyIndex(step)} story={story}>')
    expect(PAGE.indexOf('<LiveDemo')).toBeGreaterThan(PAGE.indexOf('<h1'))
    expect(PAGE.indexOf('<LiveDemo')).toBeLessThan(PAGE.indexOf('<SignUpBand'))
    expect(PAGE).not.toContain('<SampleDesk')
  })
  it('draws no screenshot and no frame: the panel is the product shown working, written into the page', () => {
    // The three screenshots and "Screen 1 of 3" were cut on 2026-10-14,
    // and the frame that replaced them the same evening.
    expect(SCREENS).toEqual([])
    expect(PAGE).not.toContain('<img')
    expect(PAGE).not.toContain('Screen ${n} of')
    expect(PAGE).not.toMatch(/<iframe|HomeDemo/)
    expect(PANEL).not.toContain('<iframe')
    expect(PANEL).toContain('aria-label={`Etyme shown working on ${story.bar.company}, a sample company`}')
  })
  it('walks the four steps as four chips — Job, Candidates, Timesheets, Invoices — each playing its own step in the same panel', () => {
    // The founder, 2026-10-14: the four nouns a buyer already has on their
    // own desk. Each chip is the step's own, and the machine names of the
    // sample screens (source, submit, approve, pay) do not move.
    expect(STORY.map((s) => s.chip)).toEqual(['Job', 'Candidates', 'Timesheets', 'Invoices'])
    expect(EMBED_STEPS).toEqual(['overview', ...STORY.map((s) => s.embed)])
    for (const s of STORY) expect(embedStep(s.embed), s.chip).not.toBeNull()
    expect(PANEL).toContain('onClick={() => playStep(i)}')
    expect(PAGE).not.toContain('const SHOWCASE')
  })
  it('every screenshot was captured after the town and title renames', () => {
    // The seeded world is renamed from time to time — a town on
    // 2026-09-17, four job titles and a handful of skill chips on
    // 2026-09-20 — and a screenshot taken before a rename goes on
    // showing a name that exists nowhere else in the product. Nothing
    // can catch that by reading the file: a PNG is opaque to a test,
    // and the founder is the only reader who would notice "Beaverton"
    // on a page that says Tualatin everywhere else.
    //
    // So each shot carries the date it was taken, beside the desk it
    // was taken from, and the date has to be later than the last
    // rename. Retaking a screen means restamping it, which is the one
    // moment somebody is looking at the image anyway.
    const RENAMES_DONE = Date.parse('2026-09-20T22:00:00Z')

    const stamps = [
      ...[...PAGE.matchAll(/capturedAt: '([^']+)'/g)].map((m) => m[1]),
      ...[...PAGE.matchAll(/data-captured-at="([^"]+)"/g)].map((m) => m[1]),
    ]

    // One stamp per screen the page draws, hero included.
    const drawn = [...new Set(SCREENS)]
    expect(stamps.length, 'a capture date for every screenshot on the page').toBe(drawn.length)

    for (const stamp of stamps) {
      const when = Date.parse(stamp)
      expect(Number.isNaN(when), `${stamp} is not a date`).toBe(false)
      expect(when, `${stamp} is older than the last rename of the demo world`).toBeGreaterThan(RENAMES_DONE)
    }
  })

  it('the top of the page reads in seconds: the category on top, the question, and then the product', () => {
    // Since 2026-10-19 the category sits above the question, and between
    // the question and the live product a reader meets one line: the
    // founder's line on what not knowing costs today. Nothing else.
    const top = PAGE.slice(PAGE.indexOf('id="top"'), PAGE.indexOf('<LiveDemo'))
    expect(copyFrom(top)).toEqual([
      'Enterprise contingent workforce management.',
      'Know what every contractor costs, across every supplier.',
      'Most companies cannot answer this without three weeks and a spreadsheet nobody trusts.',
    ])
  })
  it('names the category, no size of company, and no company at all', () => {
    // The subhead named two enterprise VMS products for one evening, and
    // the founder struck it: a rival's name invites "how are you
    // different" and "who else uses you", and a page cannot finish that
    // argument. For a day after that it named a size — "for companies
    // with 20 to 200 contractors … sized for fifty contractors rather
    // than five thousand" — and on 2026-09-28 he struck that too: "Don't
    // limit to 50–500 consultants — keep the business open for all." So
    // the reader is told what kind of thing it is, and nothing about who
    // may buy it.
    const category = 'Enterprise contingent workforce management.'
    expect(words[0]).toBe(category)
    expect(sizesTheBuyer(all), sizesTheBuyer(all).join('; ')).toEqual([])
    expect(words.filter((w) => /20 to 200|sized for|rather than five thousand/.test(w))).toEqual([])
    // Nobody is named anywhere, with nothing set aside — no customer,
    // no logo, no comparison. The second sentence below is the one that was
    // struck, kept as a fixture so the guard is seen to refuse it.
    expect(namedCompanies(all)).toEqual([])
    expect(namedCompanies(
      'If you know SAP Fieldglass or Beeline, it is the same job.'
    ).length).toBeGreaterThan(0)
    // "Rather than five thousand" is a size, not a rival: it measures
    // the company reading the page, and nothing else on the page
    // measures Etyme against anybody.
    const sized = sizesAgainstIncumbents(all)
    expect(sized, sized.join('; ')).toEqual([])
    expect(sizesAgainstIncumbents(category)).toEqual([])
    // And the page's own title says the same thing. Its description is
    // the layout's, inherited — see site-description.test.ts.
    expect(PAGE).toContain("title: { absolute: 'Etyme | Enterprise contingent workforce management' }")
  })

  it('shows the hardest answer to believe as the screen that gives it, live in the demo rather than as a picture', () => {
    // Every contractor across every supplier, on one list. It is the
    // claim a reader has least reason to believe from prose. About showed
    // it as a screenshot until 2026-10-15; no company or documentation
    // page draws a picture now, and the demo opens the screen itself.
    expect(readFileSync(join(process.cwd(), 'src/lib/public-site/company-page.tsx'), 'utf8')).not.toContain('<img')
    expect(readFileSync(join(process.cwd(), 'src/lib/public-site/docs-page.tsx'), 'utf8')).not.toContain('<img')
    // The customers page of the documentation opens the program screen, and
    // the end-of-work page seats the reader at the time-limit screen.
    expect(STEP_PAGES.find((p) => p.slug === 'when-work-ends')!.demo.screen).toBe('/dashboard/tenure')
    expect(TOPICS.find((t) => t.slug === 'customers')!.demo!.screen).toBe('/dashboard/program')
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
    // The one button under the product leads to the example program's
    // door, where a visitor picks a client desk, and every line that names
    // a company says it is a demo company and not a customer. The frame
    // above it names its one company in the chrome strip, and the line
    // under it says every firm on the screen is a demo company, not a
    // customer.
    expect(SEE_IT.href).toBe('/demo')
    expect(PAGE).toContain('href={SEE_IT.href}')
    expect(PAGE).toContain('Open the demo, no account')
    expect(CLOSE_BAND.cards.see).toContain('a demo company — not a customer')
    expect(PAGE).toContain("const ON_SCREEN = 'Three people at Northbend Athletic on one morning: a hiring manager, a contractor, an AP clerk. Every firm on this screen is a demo company, not a customer.'")
    expect(namedCompanies(all)).toEqual([])
  })
  it('names the three programs the seed actually builds, so no door opens on nothing', () => {
    // The page names one program now, under its first screen, and it is
    // one the seed builds. The three doors are on /demo, which reads them
    // from the same list.
    const seats = readFileSync(join(process.cwd(), 'src/app/demo/seats.ts'), 'utf8')
    const clientBlock = seats.slice(seats.indexOf('CLIENT_PROGRAMS'), seats.indexOf('SUPPLIER_SEATS'))
    const seeded = [...clientBlock.matchAll(/name: '([^']+)'/g)].map((m) => m[1])
    expect(seeded).toContain('Northbend Athletic')
    for (const name of ['Northbend Athletic', 'Cavanaugh Glassworks', 'Talvern Medical']) {
      if (all.includes(name)) expect(seeded, name).toContain(name)
    }
    expect(PAGE).not.toContain('const PROGRAMS')
  })

  it('keeps the worker’s own door on the page, quieter than the company’s sign-up', () => {
    // A person who is the work is not an audience to drop off a page
    // written to the company hiring. Since 2026-10-14 it is "Workers" in
    // the sign-up band's line of doors, to the contractors' own page: a
    // text link, never a button.
    expect(PAGE).toContain("{ t: 'Workers', href: '/for/contractors' }")
    const band = PAGE.slice(PAGE.indexOf('export function SignUpBand'))
    const doors = band.slice(band.indexOf('DOORS.map'), band.indexOf('</p>', band.indexOf('DOORS.map')))
    expect(doors).toContain('className={TEXT_LINK}')
    expect(doors).not.toContain('bg-etyme-action')
  })

  it('says what the quieter doors are before them, so a reader who never follows one still reads what they were for', () => {
    // A buyer-side review, 2026-09-27: a door with no words before it read
    // as if the page had broken. Since 2026-10-14 the doors are one line,
    // "Your door:" and then each party by the name it calls itself.
    expect(BAND.doorsLead).toBe('Your door:')
    const band = PAGE.slice(PAGE.indexOf('export function SignUpBand'))
    const line = band.slice(band.indexOf('{BAND.doorsLead}'), band.indexOf('</p>', band.indexOf('{BAND.doorsLead}')))
    expect(line).toContain('DOORS.map')
    // "MSPs", never "program offices" (the founder, 2026-10-14).
    expect(HOME_DOORS.map((d) => d.t)).toEqual(['Clients', 'MSPs', 'Integrators', 'Suppliers', 'Workers'])
    expect(copyFrom(PAGE).join(' ')).not.toContain('If you supply into a program instead')
  })

  it('keeps the supplier door after the client’s, and quieter than the sign-up button', () => {
    // A supplier is welcome and is not who this page is written to.
    expect(PAGE.indexOf("{ t: 'Suppliers', href: '/for/suppliers' }")).toBeGreaterThan(PAGE.indexOf("{ t: 'Clients', href: '/signup' }"))
    expect(PAGE.indexOf('{SEE_IT.href}')).toBeLessThan(PAGE.indexOf('Your door:'))
    expect(PAGE).not.toMatch(/\/for\/suppliers[\s\S]{0,120}bg-etyme-action/)
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

  // Spelled by the page's own helper and checked here against a table
  // written out by hand, so the helper is tested and not just trusted.
  const NUMBERS: Record<number, string> = {
    1: 'One', 2: 'Two', 3: 'Three', 6: 'Six', 11: 'Eleven', 12: 'Twelve', 13: 'Thirteen', 14: 'Fourteen', 15: 'Fifteen',
    16: 'Sixteen', 17: 'Seventeen', 18: 'Eighteen', 19: 'Nineteen', 20: 'Twenty',
    21: 'Twenty-one', 22: 'Twenty-two', 23: 'Twenty-three', 24: 'Twenty-four',
    25: 'Twenty-five', 26: 'Twenty-six', 27: 'Twenty-seven', 28: 'Twenty-eight', 29: 'Twenty-nine', 30: 'Thirty',
    31: 'Thirty-one', 32: 'Thirty-two', 33: 'Thirty-three', 34: 'Thirty-four', 35: 'Thirty-five',
    36: 'Thirty-six', 37: 'Thirty-seven', 38: 'Thirty-eight', 39: 'Thirty-nine', 40: 'Forty',
  }

  it('counts the things that happen without anybody asking, and says that number on the page', () => {
    expect(unprompted.length).toBeGreaterThan(0)
    expect(
      TIME_ON_SITE_DOC,
      `the automation ladder now has ${unprompted.length} unprompted actions`
    ).toContain(`of the ${NUMBERS[unprompted.length].toLowerCase()} things that run without anybody asking`)
    // On the governance page from 2026-09-27 until it folded into Job on
    // 2026-10-15; on the documentation's end-of-work page now, computed
    // from the same ladder rather than typed, so it cannot go stale. This
    // test still reads it against the ladder with its own table of words.
    expect(spelled(unprompted.length)).toBe(NUMBERS[unprompted.length].toLowerCase())
    expect(body).not.toContain('things that run without anybody asking')
  })

  it('says how many of those are a plain rule rather than a model', () => {
    expect(
      TIME_ON_SITE_DOC,
      `${byRule.length} of ${unprompted.length} unprompted actions are decided by a rule`
    ).toContain(`${NUMBERS[byRule.length]} of the ${NUMBERS[unprompted.length].toLowerCase()} things that run without anybody asking are a date, a threshold or a count.`)
    expect(TIME_ON_SITE_DOC).toContain(RULE_COUNT_LINE)
  })

  it('names every unprompted act that is not a plain rule, and they are proactive matching and the twin’s two recorded acts', () => {
    const notARule = ALL_ACTIONS.filter((n) => ACTIONS[n].kind === 'UNPROMPTED' && ACTIONS[n].basis !== 'RULE')
    expect(notARule.sort()).toEqual(['PROACTIVE_MATCH', 'TWIN_DREW_UP', 'TWIN_TOLD'])
    expect(byRule.length).toBe(unprompted.length - notARule.length)
  })

  it('says how many are left that are not a rule, and says what each of them does, on the documentation’s page on the end of the work', () => {
    // The acts that are not a plain rule are named on the documentation's
    // page on the end of the work and time on site (since 2026-10-15). The
    // governance page that linked to it folded into Job the same day.
    const notARule = ALL_ACTIONS.filter((n) => ACTIONS[n].kind === 'UNPROMPTED' && ACTIONS[n].basis !== 'RULE')
    expect(TIME_ON_SITE_DOC).toContain(`${NUMBERS[notARule.length]} are not a plain rule.`)
    for (const name of notARule) {
      expect(WHAT_IS_LEFT[name], `${name} has no plain clause`).toBeTruthy()
      expect(TIME_ON_SITE_DOC, `${name} is not described in the documentation`).toContain(WHAT_IS_LEFT[name])
    }
    expect(TIME_ON_SITE_DOC).toContain(RULE_COUNT_LINE)
    expect(DOCS_SLUGS as readonly string[]).toContain('when-work-ends')
  })

  it('says matching scores a person against a job and falls back to arithmetic when there is no model', () => {
    expect((ACTIONS.PROACTIVE_MATCH as { says: string }).says.toLowerCase()).toContain('scored people against an open job')
    expect(TIME_ON_SITE_DOC).toContain('scores a person against a job')
    expect(TIME_ON_SITE_DOC).toContain('falls back to arithmetic')
  })

  it('says the twin tells a person what a rule found and drafts a summary a person reads, and nothing more', () => {
    expect(TIME_ON_SITE_DOC).toContain('The twin tells a person what a rule found.')
    expect(TIME_ON_SITE_DOC).toContain('The twin drafts a summary that a person reads.')
    expect(TIME_ON_SITE_DOC).toContain('None of them decides whether someone can legally work.')
  })

  it('states the denominator, because it is the automation log and not the whole product', () => {
    expect(TIME_ON_SITE_DOC).toContain('things that run without anybody asking')
    expect(TIME_ON_SITE_DOC).not.toContain('About half of what looks like AI')
    expect(all).not.toContain('About half of what looks like AI')
  })

  it('still never leads with the model, and still says what it may not decide', () => {
    expect(check(live).map((f) => f.rule)).not.toContain('never-lead-with-ai')
    for (const m of MODULES) expect(check(copyOfModule(m)).map((f) => f.rule), m.route).not.toContain('never-lead-with-ai')
  })
})

// ── The header ────────────────────────────────────────────────────────

describe('The header reads as an enterprise product, not a job board', () => {

  it('is the shared header, the logo and Sign in, with no menu of feature names, roles or anything else', () => {
    // Platform, Solutions, How It Works and Security (2026-10-09) became
    // the four steps on a menu sheet on 2026-10-15, and the sheet left on
    // 2026-10-19 (founder: "Even the menu has very [little] value, it can
    // be on the footer"). The home page draws the same header every
    // public page draws, and the four steps are the documentation's spine.
    expect(PAGE).toContain('<SiteHeader />')
    expect(Object.keys(HEADER)).toEqual(['signIn'])
    expect(FRAME_SRC).not.toContain('<details')
    expect(STEPS.map((s) => s.name)).toEqual(['Job', 'Candidates', 'Timesheets', 'Invoices'])
    expect(frameCopy().join(' ')).not.toMatch(/\b(?:Platform|Solutions|How It Works)\b/)
  })
  it('never says "I\'m hiring" — that is job-board language, not an enterprise layer', () => {
    // The CTA text lives in a `label` prop, invisible to copyFrom — this
    // has to read the raw source to be a real guard against it coming back.
    expect(PAGE).not.toContain("I'm hiring")
    expect(PAGE).not.toContain('I have a bench')
  })

  it('opens one door into an example program rather than asking a visitor to classify itself', () => {
    // One demo button, not a company door and a supplier door. The split
    // forked the front page on demand-vs-supply, which is a position on a
    // deal and not a property of a firm. The line of doors in the sign-up
    // band is where a firm that has seen enough signs up, after the demo.
    expect((PAGE.match(/href=\{SEE_IT\.href\}/g) ?? []).length).toBe(1)
    expect(PAGE).not.toContain('See it as the supplier')
    expect(PAGE).not.toContain('See it as the company')
  })
  it('sends every header link to a page that exists, or a section that exists on it', () => {
    // The thread's roles led to anchors on its home page that were never
    // written. Every header link here is a route with a file behind it.
    for (const href of everyFrameLink()) {
      const path = href.split('#')[0]
      const candidates = ['', '(site)', '(auth)'].map((group) => join(process.cwd(), 'src/app', group, path.slice(1), 'page.tsx'))
      const docs = path.startsWith('/docs/') && docRoutes().includes(path)
      expect(candidates.some(existsSync) || docs, href).toBe(true)
    }
  })

  it('names no industry in a menu or on About, never a vertical feature', () => {
    // "Horizontal, never vertical." The Industries menu went on
    // 2026-09-27 — four items leading to one place. About said "One
    // product serves every industry" until its five lines of 2026-10-15;
    // what stays held is that nothing names one.
    expect(frameCopy()).not.toContain('Industries')
    expect(check(copyOfCompanyPage(ABOUT)).map((f) => f.rule)).not.toContain('horizontal-not-vertical')
  })

  it('does not let the header text shift the pinned hero words', () => {
    // The header is a component now, so none of its words are in this
    // file and the first words read here are the hero's own.
    expect(words[0]).not.toBe('Sign in')
    expect(PAGE).not.toMatch(/>\s*Sign in\s*</)
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
    // The home page's one column is px-4 on a phone, and so are the
    // header and every footer.
    expect(PAGE).toContain('mx-auto max-w-6xl px-4 sm:px-6')
    expect(FRAME_SRC).toMatch(/max-w-6xl items-center gap-x-1 px-4/)
    for (const src of [CLOSE_SRC, FRAME_SRC]) {
      const containers = [...src.matchAll(/mx-auto max-w-[\w[\]-]+ ([^"]*)/g)].map((m) => m[1])
      expect(containers.length).toBeGreaterThan(0)
      for (const c of containers) {
        expect(c, `a container with no phone gutter: ${c}`).toMatch(/px-4|px-6/)
      }
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

// Since 2026-09-27 the home page draws the one footer every public page
// draws, so its links are read from that footer's data and its words from
// the component that renders it.
const FOOTER_LINKS = SITE_FOOTER.flatMap((g) => g.links.map((l) => l.href))
const FOOTER_WORDS = SITE_FOOTER.flatMap((g) => [g.heading, ...g.links.map((l) => l.label), g.note ?? '']).join(' ')
const FOOTER_JSX = FRAME_SRC.slice(FRAME_SRC.indexOf('export function SiteFooter'), FRAME_SRC.indexOf('export function SiteFrame'))
const SUPPLIER_DOOR_SRC = readFileSync(join(process.cwd(), 'src/lib/public-site/parties.ts'), 'utf8')
const LEGAL_SRC = readFileSync(join(process.cwd(), 'src/lib/legal.ts'), 'utf8')
// The home page's own footer since 2026-10-14: one row of links, as the
// founder approved it, drawn by `HomeFooter` from the skeleton every
// product page and party door shares.
const HOME_FOOTER_LINKS = SKELETON_FOOTER_LINKS
const HOME_FOOTER_JSX = FRAME_SRC.slice(FRAME_SRC.indexOf('export function HomeFooter'))

describe('The footer is where a company keeps its papers', () => {

  it('a visitor can reach the terms and the privacy notice from the home page', () => {
    // Every other page draws the shared footer. The home page draws its
    // own one-row footer since 2026-10-14, and both carry the legal pages.
    expect(FOOTER_LINKS).toContain('/terms')
    expect(FOOTER_LINKS).toContain('/privacy')
    // The demo and About joined the row on 2026-10-19, when the header's
    // menu left and the footer took what it carried.
    expect(HOME_FOOTER_LINKS.map((l) => l.t)).toEqual([
      'Clients', 'MSPs', 'Integrators', 'Suppliers', 'Workers', 'Demo', 'Documentation', 'About', 'Security', 'Privacy', 'Terms', 'DPA', 'Contact',
    ])
    expect(HOME_FOOTER_LINKS.find((l) => l.t === 'Clients')?.href).toBe('/')
    expect(HOME_FOOTER_LINKS.map((l) => l.href)).toEqual(expect.arrayContaining(['/terms', '/privacy', '/dpa', '/contact', '/docs', '/security']))
    // And each page draws its footer, and the footer draws the list,
    // rather than it sitting in a file as data nothing renders.
    expect(PAGE).toContain('<SkeletonFooter />')
    expect(PAGE).toContain('<HomeFooter links={FOOTER_LINKS} />')
    expect(HOME_FOOTER_JSX).toContain('links.map')
    // One footer on every public page since 2026-10-15: the frame's
    // pages — documentation, security, the legal pages — draw the home
    // page's row, never a footer of their own.
    expect(FOOTER_JSX).toContain('<HomeFooter links={FOOTER_LINKS} />')
    for (const { href } of HOME_FOOTER_LINKS) {
      const candidates = ['', '(auth)', '(site)'].map((group) => join(process.cwd(), 'src/app', group, href.slice(1), 'page.tsx'))
      expect(candidates.some(existsSync), `no page for ${href}`).toBe(true)
    }
  })

  it('offers the data processing addendum too, because that is the document a buyer’s counsel asks for', () => {
    expect(FOOTER_LINKS).toContain('/dpa')
  })

  it('says the legal documents are drafts at the top of each one', () => {
    // The footer note left with the four-column footer on 2026-10-15; each
    // legal page says it in its own headline, before a word of the terms.
    expect(LEGAL_SRC).toContain('not yet reviewed by a lawyer')
  })

  it('every page the footer points at exists, so none of it is a dead link', () => {
    for (const href of FOOTER_LINKS) {
      if (href.startsWith('#')) {
        expect(PAGE, `${href} has no section on the page`).toContain(`id="${href.slice(1)}"`)
      } else {
        // A route may sit inside a route group — /login is
        // src/app/(auth)/login, /docs is src/app/(site)/docs — and a group
        // folder is not part of the URL.
        // And a section on another page is that page: /compliance#cost
        // is src/app/(site)/compliance, whose own anchors the public-pages
        // guard and this file's other sentences hold.
        const path = href.split('#')[0]
        const candidates = ['', '(auth)', '(site)'].map((group) =>
          join(process.cwd(), 'src/app', group, path.slice(1), 'page.tsx')
        )
        // A documentation page is one route file for every slug, and the
        // slug must be one the documentation registers.
        const docsSlug = path.startsWith('/docs/') ? path.slice('/docs/'.length) : null
        // Since 2026-10-10 the footer also carries the Solutions desks,
        // some of which are process pages a level down (/docs/process/…).
        const isDoc = docsSlug !== null && ((DOCS_SLUGS as readonly string[]).includes(docsSlug) || docRoutes().includes(path))
        expect(candidates.some(existsSync) || isDoc, `no page for ${href}`).toBe(true)
      }
    }
  })

  it('gives a visitor a way to reach a person, and it is the one channel that exists', () => {
    // Alerts go out to staff and nothing came in from a prospect except
    // the ask box, which somebody reads and answers. It is on the contact
    // page; every footer leads there, the home page's included, and every
    // other page's close has a button to it.
    expect(FOOTER_LINKS).toContain('/contact')
    expect(HOME_FOOTER_LINKS.map((l) => l.href)).toContain('/contact')
    expect(readFileSync(join(process.cwd(), 'src/lib/public-site/company-page.tsx'), 'utf8')).toContain('<Ask source="HOME_PAGE" />')
    expect(CLOSE_SRC).toContain('href={ask.href}')
  })

  it('invents no support mailbox, no office and no social account', () => {
    // The one mailbox each footer shows is the one Contact already names.
    expect(FOOTER_WORDS.toLowerCase()).not.toMatch(/linkedin|twitter|x\.com|facebook|status\.|careers|\babout us\b/)
    expect(HOME_FOOTER_LINKS.map((l) => l.t).join(' ').toLowerCase()).not.toMatch(/linkedin|twitter|facebook|status|careers/)
    for (const jsx of [HOME_FOOTER_JSX]) {
      expect([...jsx.matchAll(/mailto:/g)].length).toBeLessThanOrEqual(1)
      expect(jsx).toContain('mailto:${ADDRESS.email}')
    }
  })

  it('names the company and the year rather than a hardcoded copyright that goes stale', () => {
    expect(HOME_FOOTER_JSX).toContain('ADDRESS.company')
    expect(HOME_FOOTER_JSX).toContain('new Date().getFullYear()')
  })

  it('keeps the neutrality commitment on About, now that the founder’s doors of 2026-10-16 carry no line for it', () => {
    // On the supplier's and the worker's own doors from 2026-10-15 until
    // the founder's drawing of 2026-10-16, which has no line for it; his
    // words are used as drawn and the gap is reported to him. No door
    // claims the opposite (public-pages.test.ts reads every tab).
    expect(SUPPLIER_DOOR_SRC).not.toMatch(/Etyme (?:places|supplies) (?:people|workers|anybody)/)
    expect(ABOUT_PAGE).toContain('Etyme never supplies workers and never runs a bench.')
  })

})

// ── The four sentences the founder reads ──────────────────────────────

describe('The public page still says the four things it may not stop saying', () => {

  it('the home page names what Etyme is before it names anything it does', () => {
    // The category sentence is the first line, above the headline, since
    // 2026-10-19; the headline under it names contractors and suppliers —
    // the category's own nouns — before any part of the product is named.
    expect(words[0]).toBe('Enterprise contingent workforce management.')
    expect(words[1]).toBe('Know what every contractor costs, across every supplier.')
    expect(check(live).map((f) => f.rule)).not.toContain('category-first')
    expect(check(live).map((f) => f.rule)).not.toContain('module-not-category')
  })
  it('nothing on the public page states a price', () => {
    // Free while it is proved out with the first five firms, and the
    // number is settled after that. A figure invented for a landing page
    // is a figure we have to walk back.
    const found = priceClaims(all)
    expect(found, found.join('; ')).toEqual([])
    expect(body).toContain('Free while we are testing.')
  })

  it('nothing on the public page claims Etyme places anybody', () => {
    expect(check(live).map((f) => f.rule)).not.toContain('neutrality')
    for (const v of everyDoorView()) {
      const c = copyOfPartyPage(v, v.tab?.key)
      expect(check(c).map((f) => f.rule), v.href).not.toContain('neutrality')
    }
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

// ── A product page, not an essay ──────────────────────────────────────
//
// Added 2026-09-27. The founder: the home page is too long and should
// read like a large software company's product page, not a long essay.
// Measured on production that day it was 3,771 words in twelve bands and
// the file was 1,709 lines. Such a product page is roughly six
// hundred to nine hundred words in five or six bands, and it can be that
// short because every band links to a page that goes deeper — which, on
// this site, went live the day before.
//
// So the page was mostly moved, not cut, and these sentences hold the
// shape: how long it may be, how many bands it may have, that every band
// leads somewhere deeper, and that each section that left arrived.

/**
 * The words a reader reads between the header and the footer.
 *
 * Read from the source, because a page file cannot be rendered in a unit
 * test: the JSX between the header and the footer, and the data it draws
 * — the chrome strip, the line under the frame, the chips and the doors.
 * Not the frame's title, which a screen reader announces instead of the
 * picture, not the line shown only when the frame fails, and not the
 * screens inside the frame, which are the product rather than the page.
 */
function readerWords(): number {
  const own = copyFrom(PAGE.slice(PAGE.indexOf('id="top"'), PAGE.indexOf('<LiveDemo')))
  return countWords([...own, ...copyOfSkeleton({ button: OPEN_DEMO })])
}

/** The most words the home page may carry between its header and footer. */
// 2026-10-14: 1,385 → 110. The founder approved a page of three sections
// and about a hundred and ten words ("Build it", on the drawing he
// corrected three times). Measured at 102 the same day; the ceiling is the
// drawing's own count, so a fixed line fits and a new section does not.
// The history of the old ceilings is in git.
// 2026-10-19: 110 → 125, for the founder's drawing of that day: one line
// under the category and the line under the panel naming its three people.
const CEILING = 125

/** The source of one band, from its anchor to the next band's. */
function band(id: string): string {
  const start = at(id)
  const ends = ['<section', '<CloseBand', '<SiteFooter']
    .map((tag) => PAGE.indexOf(tag, start + 1))
    .filter((i) => i > 0)
  return PAGE.slice(start, Math.min(...ends))
}

describe('The home page reads as a product page, and every band leads deeper', () => {

  it('the home page is three sections and about a hundred words: the question, the live product, and the sign-up band', () => {
    // The founder's page of 2026-10-14. Every band that left is listed in
    // the page's own header comment with where it went, and the sentences
    // below this one hold that each is gone.
    const words = readerWords()
    expect(words, `${words} words between the header and the footer`).toBeLessThanOrEqual(CEILING)
    expect(words).toBeGreaterThan(90)
    const ids = [...PAGE.matchAll(/<section\s+id="([\w-]+)"/g)].map((m) => m[1])
    expect(ids).toEqual(['top', 'demo', 'sign-up'])
    expect(readFileSync(join(process.cwd(), 'src/app/page.tsx'), 'utf8')).toMatch(/<LiveDemo>[\s\S]*<SignUpBand \/>[\s\S]*<SecurityLine \/>/)
    expect((PAGE.match(/<h2/g) ?? []).length, 'one headline under the hero, the sign-up band’s').toBe(1)
    expect(PAGE).not.toContain('<CloseBand')
    for (const gone of ['problem', 'platform', 'specialist-teams', 'solutions', 'how-it-works', 'audit', 'close', 'gap', 'ways', 'join', 'steps']) {
      expect(PAGE, `#${gone} is still on the home page`).not.toContain(`id="${gone}"`)
    }
    // Security is one line after the band, linking the page that says it all.
    expect(PAGE.indexOf('id="security"')).toBeGreaterThan(at('sign-up'))
    expect(PAGE).toMatch(/<p id="security"/)
    // The spine carries the four steps, and only them (the header's menu
    // sheet carried them from 2026-10-15 until it left on 2026-10-19).
    expect(STEPS).toHaveLength(4)
  })
  it('every section taken off the home page lives on a public page', () => {
    // Moved, not deleted. Each row is a section that was on the home page
    // until 2026-09-27, the anchor it had, the page and anchor it went
    // to, and a phrase from it that must be found there. The row for the
    // exposure section is gone: it moved to the compliance page, whose
    // section on what it costs was cut with the founder's skeleton of
    // 2026-10-14.
    //
    // The rows that moved to About — the lifecycle, what it sits beside,
    // why, the gap and its long form, the two ways, the span line and the
    // hook line — left the site on 2026-10-15, when the founder's drawing
    // cut About to five lines ("no one is reading large content"). Cut on
    // purpose, not lost: the two that keep a line elsewhere are below.
    const MOVED: { was: string; to: string; anchor: string | undefined; text: string; phrase: string }[] = [
      // Cut again on 2026-10-14 to the chain and governance pages' three
      // lines, and on 2026-10-15 both folded into the steps. The count of
      // what is a rule kept its line on the documentation's end-of-work
      // page. The blind key left with the chain page: no screen calls it
      // yet, so no page may claim it (held above).
      { was: 'compliance', to: '/docs/when-work-ends', anchor: '/docs/when-work-ends', text: TIME_ON_SITE_DOC,
        phrase: 'things that run without anybody asking are a date, a threshold or a count' },
      { was: 'ways', to: '/about', anchor: '/about', text: ABOUT_PAGE,
        phrase: 'Etyme as VMS software' },
      { was: 'the hero’s span line', to: '/about', anchor: '/about', text: ABOUT_PAGE,
        phrase: 'jobs, candidates, timesheets and invoices' },
    ]
    for (const m of MOVED) {
      expect(m.anchor, `#${m.was} has no section on ${m.to}`).toBeTruthy()
      expect(m.text, `#${m.was} on ${m.to}`).toContain(m.phrase)
    }
    // The sections that left have no anchor here any more — except #why,
    // which is the one line on price the close still carries, and
    // #modules, which left on 2026-09-27 and came back the next day.
    expect(STEPS.map((s) => s.route)).toEqual(MODULES.map((m) => m.route))
    for (const gone of ['exposure', 'lifecycle', 'monday', 'alongside', 'who', 'compliance', 'gap', 'ways']) {
      expect(PAGE, `#${gone} is still on the home page`).not.toContain(`id="${gone}"`)
    }
    // Each destination is a registered public page, so the guard reads it.
    for (const route of ['/about', '/docs/when-work-ends']) {
      expect(PUBLIC_PAGES.some((p) => p.route === route), route).toBe(true)
    }
    // And the gate that was quoted here is a line on the Candidates page.
    expect(CANDIDATES_PAGE).toContain('Nobody starts without a US work form (I-9)')
  })

  it('the four steps live on the spine, each with its line and its page, and the home page walks them as chips rather than cards', () => {
    // The step cards left the home page on 2026-10-14 for the four chips
    // under the live product. From 2026-10-15 the menu sheet carried the
    // four steps, one line each, each opening its own page; the sheet left
    // on 2026-10-19, and the spine keeps the lines it drew.
    expect(PAGE).not.toContain('const TILES')
    expect(PAGE).not.toContain('const STEP_LINE')
    expect(PAGE).not.toContain('STEPS.map')
    expect(STEPS.map((s) => [s.name, s.menu])).toEqual([
      ['Job', 'Send it once. Every approved supplier gets it.'],
      ['Candidates', 'Everyone who applied, on one screen.'],
      ['Timesheets', 'Approve the week in one tap.'],
      ['Invoices', 'Pay only what you approved.'],
    ])
    expect(PAGE).not.toContain("from '@/lib/public-site/module-icons'")
    expect(MODULES).toHaveLength(4)
    for (const m of MODULES) expect(STEPS.find((s) => s.route === m.route)?.name, m.route).toBe(m.title)
  })
})

// ── Join forces with global teams around the world ────────────────────
//
// Added 2026-09-27, in the founder's words. He was clear it is subtle,
// not a hero, and that the drawing should speak to supply and demand at
// the same time. "Global" is where a sentence could claim more than the
// record does, so the claim is read against the code that would have to
// be true.

const JOIN_SRC = PAGE.slice(PAGE.indexOf('const JOIN'), PAGE.indexOf('const TWO_WAYS'))
const JOIN_LINES = [...JOIN_SRC.slice(JOIN_SRC.indexOf('lines:'), JOIN_SRC.indexOf('backedBy:'))
  .matchAll(/'([^']+)'/g)].map((m) => m[1])
// The mural lives in its own file under the market's public-site folder.
const ART_SRC = readFileSync(join(process.cwd(), 'src/lib/public-site/join-mural.tsx'), 'utf8')

describe('The line about teams around the world', () => {

  it('the founder’s line about teams around the world is off the home page by his brief of 2026-10-09, and its mural is kept for him to place', () => {
    // The brief lists the page part by part and the line is not among
    // them. It is not deleted from the product: the mural's drawing stays
    // in lib/public-site/join-mural, held by the tests below, for the
    // founder to put on About or bring back.
    expect(PAGE).not.toContain('const JOIN')
    expect(PAGE).not.toContain('<JoinMural')
    expect(existsSync(join(process.cwd(), 'src/lib/public-site/join-mural.tsx'))).toBe(true)
  })

  it('the mural is in the kit’s own colors, stands still, and says what it shows to a screen reader', () => {
    expect(ART_SRC).toContain('role="img"')
    // A real description, naming what is drawn: firms and people on both
    // sides, and the one record they pass through.
    const label = ART_SRC.match(/aria-label="([^"]+)"/)?.[1] ?? ''
    expect(label.length).toBeGreaterThan(120)
    expect(label).toMatch(/firms/i)
    expect(label).toMatch(/people/i)
    expect(label).toMatch(/one shared record/i)
    // Colors come through the kit's variables, never hand-typed, so the
    // mural moves with the kit: canvas line work on the ink since the band
    // went dark on 2026-09-28, and at most a violet touch and an orange
    // one. Never the logo's vivid green, never the navy the kit removed
    // from its tokens.
    expect(ART_SRC).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/)
    expect(ART_SRC).not.toMatch(/00C800|0D1426/i)
    const vars = [...ART_SRC.matchAll(/var\(--([a-z-]+)\)/g)].map((m) => m[1])
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')
    const KIT = ['ink', 'canvas', 'violet', 'violet-p', 'orange', 'orange-p']
    for (const v of new Set(vars)) {
      expect(KIT, `--${v} is not one of the mural's colors`).toContain(v)
      expect(css, `--${v} is not defined in globals.css`).toContain(`--${v}:`)
    }
    expect(vars).toContain('ink')
    expect(vars).toContain('canvas')
    const accents = new Set(vars.filter((v) => v !== 'ink' && v !== 'canvas'))
    expect(accents.size, 'at most two accent colors').toBeLessThanOrEqual(2)
    expect([...accents].some((v) => v.startsWith('violet')), 'a violet touch on the supply side').toBe(true)
    expect([...accents].some((v) => v.startsWith('orange')), 'an orange touch on the demand side').toBe(true)
    // No color is ever a fill or stroke attribute by name: everything is
    // currentColor off the root, which is set to the canvas variable.
    expect(ART_SRC).not.toMatch(/(fill|stroke)="(?!currentColor|none)[a-z#]/i)
    // It does not move, so there is nothing for reduced motion to stop.
    expect(ART_SRC).not.toMatch(/<animate|animation|transition|@keyframes/)
    // No globe, no map, no flags: lines, firms, figures and one record.
    expect(ART_SRC).not.toMatch(/globe|map pin|\bflag/i)
    // And it is a mural: much wider than it is tall.
    const [, w, h] = ART_SRC.match(/const W = (\d+)\s+const H = (\d+)/)!.map(Number)
    expect(ART_SRC).toContain('viewBox={`0 0 ${W} ${H}`}')
    expect(w / h).toBeGreaterThanOrEqual(3)
  })

  it('on a phone the mural keeps its middle rather than shrinking to a sliver', () => {
    // Cropped to its centre at a fixed height on a small screen, and only
    // from the small breakpoint up does it take its natural proportion.
    expect(ART_SRC).toContain('preserveAspectRatio="xMidYMid slice"')
    const cls = ART_SRC.match(/className="([^"]+)"/)?.[1] ?? ''
    const phone = Number(cls.match(/(?:^|\s)h-\[(\d+)px\]/)?.[1])
    expect(phone, 'a fixed height on a phone').toBeGreaterThanOrEqual(160)
    expect(cls).toMatch(/sm:h-auto/)
    // At 390 wide and that height the crop shows the record whole: the
    // visible span of the drawing is centred and wider than the record.
    const W = Number(ART_SRC.match(/const W = (\d+)/)![1])
    const H = Number(ART_SRC.match(/const H = (\d+)/)![1])
    const rec = ART_SRC.match(/const REC = \{ x: (\d+), y: \d+, w: (\d+)/)!.slice(1).map(Number)
    const visible = 390 / (phone / H)
    const from = (W - visible) / 2
    expect(from).toBeLessThan(rec[0])
    expect(from + visible).toBeGreaterThan(rec[0] + rec[1])
    // And the record is drawn at a readable size, not a sliver: at least
    // a third of the phone's width.
    expect(rec[1] * (phone / H)).toBeGreaterThan(390 / 3)
  })
})

// ── Specialist teams around the world. Added 2026-10-12 ─────────────
//
// The founder approved a prototype of the home page with one new band and
// said "Build it". The words are his, held here word for word so a
// rewrite is a decision rather than a drift. "Global" is where a sentence
// can claim more than the record does, so the one claim the record
// already backs is read against the code that makes it true.

// The band left the home page on 2026-10-14 with the page the founder
// approved that day ("a fourth idea on a page that carries one"). The
// sentences that held its words went with it; the two below hold what is
// still true without it — the one claim it made that the code backs, and
// the guard's reading of "the best people for the job".

describe('Specialist teams around the world, after the band left the home page', () => {

  it('is off the home page and out of the header and footer, so no link lands on a band that is gone', () => {
    expect(PAGE).not.toContain('id="specialist-teams"')
    expect(PAGE).not.toContain('const WORLD')
    expect(everyFrameLink()).not.toContain('#specialist-teams')
    expect(STEPS).toHaveLength(4)
  })

  it('asks each country for its own paperwork, which is the one claim of the band the code already makes true', () => {
    // "The visa, permit or form each country needs": the supplier's packet
    // differs by the country the work is in.
    const keys = (country: string) => deriveSupplierPacket({ country }).items.map((i) => i.key)
    expect(keys('US')).toContain('W9')
    expect(keys('GB')).toContain('VAT_REG')
    expect(keys('IN')).toContain('GST_REG')
    expect(keys('GB')).not.toContain('W9')
    expect(deriveStartPacket({ country: 'US', onSite: true }).items.length).toBeGreaterThan(0)
  })

  it('does not refuse “the best people for the job” as a superlative, because it ranks the client’s choice of people, and still refuses “the best platform”', () => {
    expect(unverifiableClaims('Work with the best people for the job, wherever they are.')).toEqual([])
    expect(unverifiableClaims('The best platform for contractors.')).not.toEqual([])
    expect(unverifiableClaims('Best practice, kept.')).toEqual([])
  })

})

// ── The mural, where the founder looks for it ─────────────────────────
//
// 2026-09-28: "Add mural back near join with global teams." It had never
// left the code. Measured on `next start` it drew at 1440 by 384 and at
// 390 by 210, directly under the heading and its two sentences — so these
// hold where it is and that it has a size of its own, rather than a
// browser's guess from a viewBox.

describe('The mural sits under the founder’s line', () => {

  it('the mural carries its own proportions, so every browser draws it at full width and a real height', () => {
    // A bare viewBox leaves the height to the browser. The width and
    // height attributes give it the drawing's own ratio under h-auto, and
    // the class still sets the size it is drawn at.
    const W = Number(ART_SRC.match(/const W = (\d+)/)![1])
    const H = Number(ART_SRC.match(/const H = (\d+)/)![1])
    expect(ART_SRC).toContain('width={W}')
    expect(ART_SRC).toContain('height={H}')
    expect(W / H).toBeGreaterThanOrEqual(3)
    const cls = ART_SRC.match(/className="([^"]+)"/)?.[1] ?? ''
    expect(cls).toMatch(/\bw-full\b/)
    expect(cls).toMatch(/\bblock\b/)
    // Never hidden at any width.
    expect(cls).not.toMatch(/(?:^|\s)(?:[a-z]+:)?(?:hidden|invisible|opacity-0|h-0)(?:\s|$)/)
    expect(band('join')).not.toMatch(/(?<![-\w])(?:[a-z]+:)?hidden\b/)
  })
})

// ── Show, don't claim. Decided 2026-09-28 ─────────────────────────────
//
// The founder: "You are targeting well-versed IT people; they rarely buy
// anything because of claims. Our main goal is registering as a
// trustworthy brand." And on the same day: "Don't limit to 50–500
// consultants — keep the business open for all."

/** Every word on every public page a stranger can open, by route. */
function everyPublicPage(): [string, string][] {
  const out: [string, string][] = [['/', all]]
  for (const m of MODULES) {
    const c = copyOfModule(m)
    out.push([m.route, [...c.hero, ...c.body].join(' ')])
  }
  out.push(['/about', ABOUT_PAGE])
  for (const route of ['/security', '/contact']) {
    const page = COMPANY_PAGES.find((c) => c.route === route)!
    const c = copyOfCompanyPage(page)
    out.push([route, [...c.hero, ...c.body].join(' ')])
  }
  out.push(['/docs', [...copyOfDocsHome().hero, ...copyOfDocsHome().body].join(' ')])
  // Every page under /docs: since 2026-10-15 the five step pages, who does
  // what, the two references, and the record and recruiting pages.
  for (const route of docRoutes().filter((r) => r !== '/docs')) {
    const c = copyOfDoc(route.slice('/docs/'.length))
    if (c) out.push([route, [...c.hero, ...c.body].join(' ')])
  }
  // The four party doors, since 2026-10-13: every guard on this list
  // reads them as it reads every other public page.
  // Each tab of a door at its own address, since 2026-10-16.
  for (const v of everyDoorView()) {
    const c = copyOfPartyPage(v, v.tab?.key)
    out.push([v.href, [...c.hero, ...c.body].join(' ')])
  }
  out.push(['the header and footer', frameCopy().join(' ')])
  out.push(['the close band', [...closeBandCopy(), SEE_IT.d].join(' ')])
  // The panel that shows the product working, on every page above (2026-10-14).
  out.push(['the panel', storyCopy().join(' ')])
  out.push(['/census', JSON.stringify(CENSUS_COPY)])
  return out
}

describe('Two words nobody uses (the founder, 2026-10-14)', () => {

  it('no public page says program office or desk', () => {
    // "Never use desk and program office — nobody uses those in the real
    // world." The firm that runs a client's program is an MSP; the
    // client's own person is the program manager; a desk is the person's
    // job title, or "team". Read on every public page a stranger can open,
    // the header, the sheet and the footer, the doors' lines, the census
    // while it stays, and the words a screen reader hears on the
    // documentation's flow charts. Routes and keys (/for/program-offices,
    // desk: 'ap') are addresses and are not read.
    const two = /\b(?:program(?:me)?[ -]offices?|desks?)\b/i
    const said = [
      ...everyPublicPage().filter(([route]) => route !== '/census'),
      ['the census', [...Object.values(CENSUS_COPY.form), ...CENSUS_COPY.desks.map((d) => d.label)].join(' ')],
      ['the doors', JSON.stringify([...HOME_DOORS, ...SKELETON_FOOTER_LINKS].map((d) => d.t))],
      ['the party doors and their tabs', everyDoorView().flatMap((p) => [p.demoLabel, p.signUp.t, p.caption ?? '', p.tab?.label ?? '']).join(' ')],
      // The documentation drew pictures until 2026-10-15; its flow charts are words now, each box naming who.
      ['the documentation’s flow charts', STEP_PAGES.flatMap((p) => p.flow.flatMap((b) => [b.role ?? '', b.t])).join(' ')],
    ] as [string, string][]
    for (const [where, text] of said) {
      const found = text.match(new RegExp(`.{0,40}${two.source}.{0,30}`, 'gi')) ?? []
      expect(found, where).toEqual([])
    }
  })
})

describe('The site says what it does and shows it, and claims nothing a reader cannot check', () => {

  it('the home page makes no claim a reader cannot check on the site', () => {
    // No hype adjective, no superlative, no badge nobody awarded, no speed
    // or saving nobody measured, no exclamation — on the home page and on
    // every public page it leads to. Each hit names the words and why.
    for (const [route, text] of everyPublicPage()) {
      const found = unverifiableClaims(text)
      expect(found, `${route}: ${found.join('; ')}`).toEqual([])
    }
  })

  it('catches the hype a skeptical engineer discounts, and leaves plain descriptions alone', () => {
    for (const hype of [
      'A seamless experience for your whole program.',
      'The most powerful contingent workforce platform.',
      'Enterprise-grade security, trusted by leading companies.',
      'Set up in days, not months.',
      'Onboard every supplier in minutes.',
      'Cut contractor spend by 20%.',
      'Never miss a timesheet again!',
    ]) {
      expect(unverifiableClaims(hype), hype).not.toEqual([])
    }
    for (const plain of [
      'An invoice with no signed week behind it is not paid.',
      'More than twelve hours in a day, sixty in a week, is flagged and shown first.',
      'Say where the guarantee stops.',
      'A named person sends back one page inside five working days.',
      'The client signs the week and pays only matched invoices.',
    ]) {
      expect(unverifiableClaims(plain), plain).toEqual([])
    }
  })

  it('points a reader who checks before trusting at the public documentation and the security position, and at nothing it cannot show', () => {
    // The trust signals are the ones that exist: the demo with no account,
    // every flow in public documentation, and the security page that says
    // what is done and what is next, in order. Since 2026-10-14 the home
    // page says it in one line with the two links, and its footer carries
    // the DPA. A certification may be named only to say it is not held. No
    // uptime, no customer count, no customer proof of any kind, and never
    // /ready.
    const security = PAGE.slice(PAGE.indexOf('id="security"'), PAGE.indexOf('</p>', PAGE.indexOf('id="security"')))
    expect(security).toContain('href="/security"')
    expect(security).toContain('href="/docs"')
    expect(HOME_FOOTER_LINKS.map((l) => l.href)).toContain('/dpa')
    for (const sentence of all.split(/(?<=[.!?])\s+/).filter((x) => /SOC ?2|ISO ?27001/.test(x))) {
      expect(sentence, 'a certification may be named only to say it is not held').toMatch(/No SOC 2 report|penetration test comes first, then SOC 2|not (?:yet )?held/)
    }
    expect(existsSync(join(process.cwd(), 'src/app/(site)/security/page.tsx'))).toBe(true)
    expect(existsSync(join(process.cwd(), 'src/app/(site)/docs/page.tsx'))).toBe(true)
    expect(PAGE).not.toMatch(/href=\{?['"]\/ready/)
    expect(all).not.toMatch(/\b(?:certified|uptime|99\.\d+%|customers? (?:trust|use)|trusted by|testimonial)\b/i)
    expect(all).toContain('Open the demo, no account')
  })
  it('the home page says security in one line, and sends the reader to the security page for what is done and what is next, in order', () => {
    // The honest-security sentence, kept in its newest shape: the four
    // cards were cut on 2026-10-14 for one line and the link, because the
    // reader who cares clicks it, and the security page stays whole.
    expect(all).toContain('Security: what is done, and what is next in order.')
    expect(all).toContain('Read the security position')
    expect(PAGE).not.toContain('const SECURITY_DONE')
    const page = COMPANY_PAGES.find((c) => c.route === '/security')!
    // As drawn on 2026-10-15: a numbered list, the penetration test first.
    const next = page.blocks.find((b) => b.id === 'next')!
    expect(next.title).toBe('Next, in this order')
    expect(next.ordered).toEqual(['Penetration test', 'SOC 2 Type I', 'SOC 2 Type II, then ISO 27001'])
    const words = copyOfCompanyPage(page)
    expect([...words.hero, ...words.body].join(' ')).toContain('No dates yet, because none is contracted.')
  })

  it('no public page says the application has no rate limiting or firewall rules; that stays in the internal posture document', () => {
    for (const [route, text] of everyPublicPage()) {
      expect(text, route).not.toMatch(/rate limiting|firewall/i)
    }
    expect(readFileSync(join(process.cwd(), 'docs/security-posture.md'), 'utf8')).toMatch(/No rate limiting/i)
  })

  it('no public page limits who may buy by how many contractors they have', () => {
    for (const [route, text] of everyPublicPage()) {
      const found = sizesTheBuyer(text)
      expect(found, `${route}: ${found.join('; ')}`).toEqual([])
    }
  })

  it('catches the size line the founder struck, and a range in consultants too, and leaves a worked example alone', () => {
    for (const sized of [
      'Contingent workforce management for companies with 20 to 200 contractors.',
      'The vendor management system, sized for fifty contractors rather than five thousand.',
      'Built for programs of 50–500 consultants.',
      'Too small for the enterprise vendors and too big for a spreadsheet.',
    ]) {
      expect(sizesTheBuyer(sized), sized).not.toEqual([])
    }
    for (const open of [
      'Enterprise contingent workforce management.',
      'A company with a dozen suppliers and nobody to watch them.',
      'One person worked fourteen months through one supplier.',
    ]) {
      expect(sizesTheBuyer(open), open).toEqual([])
    }
  })
})

// ── Plain words on public pages, defined once. Decided 2026-09-28 ─────
//
// The founder's go-to-market edit list. "Vendor management system" is
// banned on public pages; the page says job, not role or requisition; job
// request where the object is meant; bill, never invoice, with the
// three-way check defined where it is first named; time limit, not tenure
// cap. Extended the same day to the product screens and so to the
// documentation that describes them: on a screen and in the docs, bill is
// what a firm sends its customer, and what a supplier sends stays its
// invoice, received as an invoice receipt — the party who issues a
// document names it. A product sentence quoted on a public page, or a
// product screen named by its own title, keeps the screen's word and is
// set aside here rather than rewritten into a sentence the screen does
// not say.

/** The canvas and the ink, read from the kit's variables rather than retyped. */
const cssVar = (name: string): string => {
  const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')
  return css.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`))![1]
}
const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const luminance = (rgb: number[]) => {
  const [r, g, b] = rgb.map((c) => {
    const x = c / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: number[], b: number[]) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
/** A color at some opacity over a ground, the way the browser blends it. */
const over = (fg: number[], alpha: number, ground: number[]) => fg.map((c, i) => c * alpha + ground[i] * (1 - alpha))

/** A public page's words with the product's own sentences set aside. */
function inOurWords(text: string): string {
  let t = text
  // A refusal quoted in the documentation is the product's own sentence,
  // verbatim from the file that says it (`stops` in docs/process).
  for (const p of STEP_PAGES) for (const r of p.stops) t = t.split(r.says).join(' ')
  // A product screen named by its own title is the product's word. The
  // client's own screen for what its suppliers send is titled "Invoice
  // receipts": what a firm receives from below (lib/page-framing).
  t = t.replace(/\bthe Invoice receipts screen\b/g, ' ')
  // "By role" is the reader's own job, heading the Solutions menu.
  t = t.replace(/\bBy role\b/g, ' ')
  // "A role for every seat" is an access role, on the security page.
  t = t.replace(/\bA role for every seat\b/g, ' ')
  // "Invoices" is the fourth step's name, the founder's of 2026-10-14
  // (Job, Candidates, Timesheets, Invoices): the step is paying what the
  // suppliers sent, so its noun is theirs. Set aside as the chips and as
  // "Step 4 · Invoices", and since 2026-10-15 as the documentation's step
  // page ("Step 4 of 4 Invoices") and About's list of the four steps.
  t = t.replace(/\bJob Candidates Timesheets Invoices\b/g, ' ').replace(/\bStep 4 · Invoices\b/g, ' ')
    .replace(/\bStep 4 of 4 Invoices\b/g, ' ').replace(/\bjobs, candidates, timesheets and invoices\b/g, ' ')
  // And since 2026-10-15 as a step page's Previous and Next, which name
  // the steps either side: Timesheets' Next is "Invoices".
  for (const m of MODULES) t = t.split(`${m.prev.t} ${m.next.t}`).join(' ')
  t = t.replace(/\bStep 4 of 4 · Invoices\b/g, ' ')
  // And as the fourth step on the spine, its name over its line.
  for (const c of STEPS) t = t.split(`${c.name} ${c.menu}`).join(` ${c.menu}`)
  // Two lines of the Invoices step page, word for word as the founder
  // approved them on 2026-10-15, in which "invoice" is what a supplier
  // sends: the invoices AP matches by hand today, and the invoice the
  // check holds against the hours and the rate. Set aside by the exact
  // sentence, so no other use of the word is excused.
  for (const said of ['AP matches invoices to timesheets by hand.', 'The hours, the invoice and the contract rate must agree.']) {
    t = t.split(said).join(' ')
  }
  return t
}

/**
 * A public page's words with what a supplier sends set aside. The rule
 * the founder adopted for every page and screen on 2026-09-28: the
 * party who issues a document names it, so a supplier sends its invoice
 * and the firm paying it takes an invoice receipt. Everything left is
 * the page's own voice, where "bill" is what a firm sends its customer
 * and "invoice" is refused.
 */
/**
 * What a supplier sends, named as a document by anything but "invoice
 * receipt": "supplier bill" or "supplier invoice". Not "a supplier
 * bills", the verb, and not "the supplier's invoice" or "its invoice",
 * which a sentence may still say (CLAUDE.md, 2026-09-28: what a firm
 * receives from below is an invoice receipt; what it issues upward is a
 * bill).
 */
const SUPPLIER_DOCUMENT_MISNAMED = /\bsupplier(?:’s|'s) bills?\b|\bsuppliers’ bills\b|\bsupplier bill\b|\bsupplier bills (?:you hold|and|open|with|a client)\b|\bsupplier invoices?\b/gi

function supplierSide(text: string): string {
  let t = inOurWords(text)
  for (const kept of [
    /\binvoice[- ]receipts?\b/gi,
    /\b(?:its|its own|its matched|the sub’s|a sub-vendor’s own|the sub-vendor’s own)\s+invoice\b/gi,
    /\bsupplier’s\s+invoice\b/gi,
    /\bthe invoice a supplier is paid on\b/gi,
    /\bnever invoiced\b/gi,
    // A named supplier's own document, as the panel says it in the trade's
    // words (2026-10-14): "Pinnacle Resourcing’s invoices", "invoice
    // PR-2026-0441" — the number is the supplier's, so the invoice is.
    /\b(?:[A-Z][\w]+ )*[A-Z][\w]+(?:’s|'s) invoices?\b/g,
    /\binvoice [A-Z]{2}-\d{4}-\d{4}\b/g,
    // The founder's doors of 2026-10-16. Each is what a supplier sends:
    // the MSP reads the invoices the client's suppliers send it, and the
    // sub-vendor's own invoice to its prime is the supplier's document.
    /\bevery supplier, every worker, every invoice\b/gi,
    /\bevery week and invoice across the client’s suppliers\b/gi,
    /\bYour invoice is checked against the same approved hours\b/g,
  ]) t = t.replace(kept, ' ')
  return t
}

/**
 * A documentation page's words with what a supplier sends set aside.
 * Everything left is the page's own voice, and holds to the same plain
 * words as the rest of the site. Until 2026-09-28 this also set aside the
 * words in a column saying what an ERP calls each thing; the column is
 * gone (see `incumbentComparison`), so nothing else is excused.
 */
function supplierSideSetAside(text: string): string {
  return supplierSide(text)
}

describe('Plain words on public pages, defined once', () => {

  it('no public page says “vendor management system”, and the guard catches it in any case, hyphenated or plural', () => {
    for (const [route, text] of everyPublicPage()) {
      expect(vendorManagementSystem(text), route).toEqual([])
    }
    for (const said of [
      'One vendor management system, in the order a hire moves through it',
      'The Vendor Management System for every supplier.',
      'Unlike other vendor-management systems, it is sized for you.',
    ]) {
      expect(vendorManagementSystem(said), said).not.toEqual([])
    }
    // The acronym is not the phrase: a buyer's own VMS, and the founder's
    // label for the first way to run a program, are left alone.
    for (const said of ['Keep your ATS, your VMS and every supplier you already use', 'VMS software']) {
      expect(vendorManagementSystem(said), said).toEqual([])
    }
  })

  it('the home page, the header, the footer and every product and company page say job, job request and bill, never role or requisition, and invoice only for what a supplier sends', () => {
    const pages = everyPublicPage().filter(([route]) => !route.startsWith('/docs') && route !== '/census')
    expect(pages.length).toBeGreaterThan(10)
    for (const [route, text] of pages) {
      const found = supplierSide(text).match(/\b(?:roles?|requisitions?|invoic\w*)\b/gi) ?? []
      expect(found, route).toEqual([])
    }
    // The home page is read with the rest (it is one of the pages above),
    // and since 2026-10-14 it says none of the three words at all.
    expect(pages.map(([route]) => route)).toContain('/')
    expect(supplierSide(all).match(/\b(?:roles?|requisitions?|invoic\w*)\b/gi) ?? []).toEqual([])
    expect(STEPS.map((s) => s.name)).toEqual(expect.arrayContaining(['Job', 'Invoices']))
    // The addresses stay: an address is not a word anybody reads.
    expect(STEPS.map((s) => s.route)).toEqual(expect.arrayContaining(['/requisitions', '/invoices']))
  })

  it('the documentation says job, job request and bill, and keeps “invoice” only for what a supplier sends', () => {
    // The founder extended the plain words to the product screens on
    // 2026-09-28, so the documentation that describes them follows.
    // What a supplier sends is its invoice and what the firm paying it
    // does is an invoice receipt — the party who issues a document
    // names it — so those survive, and nothing else does.
    const docs = everyPublicPage().filter(([route]) => route.startsWith('/docs'))
    expect(docs.length).toBe(docRoutes().length)
    for (const [route, text] of docs) {
      const found = supplierSideSetAside(text).match(/\b(?:roles?|requisitions?|requirements?|invoic\w*)\b/gi) ?? []
      expect(found, route).toEqual([])
    }
  })

  it('the documentation calls it the three-way check, as the screens do, and never “three-way match”', () => {
    for (const [route, text] of everyPublicPage().filter(([r]) => r.startsWith('/docs'))) {
      expect(text, route).not.toMatch(/three-way match/i)
    }
    expect(onDoc('invoices')).toContain('The three-way check: the hours, the invoice receipt, and the contract rate must all agree.')
    // The census template's column is job now, and the page says so.
    expect(CENSUS_COPY.send.optionA.says).toContain('supplier, job, site')
  })

  it('the set-aside for a supplier’s invoice is narrow: a bill to a customer called an invoice is still caught', () => {
    for (const kept of [
      'Issues its invoice', 'Invoice receipt', 'the supplier’s invoice, received and matched',
      'order ↔ receipt ↔ invoice receipt', 'payroll, or the sub’s invoice',
      'A supplier is paid against its matched invoice.', '6 · The supplier’s invoice is matched',
    ]) {
      expect(supplierSideSetAside(kept), kept).not.toMatch(/invoic/i)
    }
    for (const caught of [
      'Approve to invoice', 'The firm invoices its customer.', 'Generate invoice', 'A check that fails on an invoice',
      'One requisition becomes one award.', 'HR reads the role',
    ]) {
      expect(supplierSideSetAside(caught), caught).toMatch(/\b(?:roles?|requisitions?|invoic\w*)\b/i)
    }
  })

  // "Every party page names the fourth value stream Approve to bill" held
  // the ten party pages, which became one table on 2026-10-15; the value
  // streams' names are no longer said on any public page.

  it('the time-and-money page says only the person who worked the week files it, and the signed week goes down the chain', () => {
    // Founder, 2026-09-28: the worker files their own week only; no
    // supplier files on their behalf (lib/timesheet-authority, mayEnter).
    expect(TIME_AND_MONEY.lines[0]).toBe('Only the person who worked the week files it. Nobody else may.')
    expect(TIME_AND_MONEY.lines[1]).toBe('The client approves it first. Then each firm below accepts the same week, in turn.')
    expect(onDoc('timesheets')).toContain('Only the worker files the week. Nobody else may.')
    for (const [route, text] of everyPublicPage()) expect(text, route).not.toMatch(/may enter on their behalf/)
  })

  // "The legend under every drawing ends on a whole sentence" held the
  // party pages' drawings, which left the site on 2026-10-15.

  it('the census asks for the invoice receipts a client holds, what it received from its suppliers', () => {
    for (const said of [GET_THE_AUDIT.d, JSON.stringify(CENSUS_COPY)]) {
      expect(said).toContain('invoice receipts')
      expect(supplierSide(said), said.slice(0, 60)).not.toMatch(/\binvoic/i)
    }
  })

  it('what a supplier sends is an invoice receipt on every public page, never a supplier bill or a supplier invoice', () => {
    // CLAUDE.md, 2026-09-28: what a firm receives from below is an
    // invoice receipt; what it issues upward is a bill. A sentence may
    // still say the supplier sends its invoice.
    for (const [route, text] of everyPublicPage()) {
      expect(text.match(SUPPLIER_DOCUMENT_MISNAMED) ?? [], route).toEqual([])
    }
    for (const noun of ['the supplier bills you hold', 'A supplier’s bill is paid', 'a row per supplier bill',
      'Two supplier invoices open', 'the supplier invoices you hold']) {
      expect(noun.match(SUPPLIER_DOCUMENT_MISNAMED), noun).not.toBeNull()
    }
    for (const said of ['Each supplier bills, and you pay what matched', 'A supplier bills only from weeks the client already signed.',
      'A supplier sends its invoice', 'Every supplier’s invoice is right by its own lights.', 'Two invoice receipts open']) {
      expect(said.match(SUPPLIER_DOCUMENT_MISNAMED), said).toBeNull()
    }
  })

  it('the three-way check is defined in the founder’s words where the site names it, and the Invoices page says it plainly without the term', () => {
    // The menu line and the bills page that defined it until 2026-10-15
    // are the four steps now. The Invoices page says the check in plain
    // words, as drawn, and never uses the term undefined; the
    // documentation's Invoices page names it and defines it.
    expect(INVOICES_PAGE).not.toMatch(/three-way/i)
    expect(INVOICES_PAGE).toContain('The hours, the invoice and the contract rate must agree.')
    expect(onDoc('invoices')).toContain(THREE_WAY_CHECK)
    const everywhere = everyPublicPage().filter(([r]) => !r.startsWith('/docs')).map(([, t]) => t).join(' ')
    expect(everywhere).not.toMatch(/three-way/i)
    expect(frameCopy().join(' ')).not.toMatch(/three-way/i)
    expect(everywhere).not.toMatch(/three-way match/i)
  })

  it('a time limit is defined where it is first named, and no public page calls it a tenure cap', () => {
    for (const [route, text] of everyPublicPage()) {
      expect(text, route).not.toMatch(/\btenure caps?\b/i)
    }
    // The compliance page named it in its question until it folded into
    // Candidates on 2026-10-15. The end-of-work page names the limit
    // beside what it counts and what it does.
    expect(TIME_ON_SITE_DOC).toContain('Time on site is the person’s, across every supplier. A day counts once.')
    expect(TIME_ON_SITE_DOC).toContain('An extension is checked against the time limit first. At the limit it is blocked.')
  })

  it('a trade word a buyer may not know is glossed on the page that uses it', () => {
    // The I-9 on the Candidates page (2026-10-15). As drawn, its "Today"
    // names the I-9 one line before "With Etyme" glosses it; reported to
    // the founder rather than reworded, because the words are his.
    expect(CANDIDATES_PAGE).toContain('a US work form (I-9)')
    // The bench was glossed in the header's Solutions menu until the menu
    // became the four steps; no page that every reader sees says "bench" now.
    expect(frameCopy().join(' ')).not.toMatch(/\bbench\b/i)
    // The suppliers' own door says the bench in the same plain words, and
    // never says "bench" before it has.
    // The suppliers' door's Bench vendor tab says "bench" in its label and
    // headline as the founder drew it on 2026-10-16, with no gloss; the
    // gloss "workers waiting for a project" left with the old line under
    // the headline. Reported to him rather than reworded. The word is
    // held to that one tab: no other door or tab says it.
    for (const v of everyDoorView().filter((x) => x.tab?.key !== 'bench')) {
      expect(`${v.headline} ${v.purpose} ${v.lines.join(' ')}`, v.href).not.toMatch(/\bbench\b/i)
    }
  })
})

describe('The header stays, and one scroll lands on one band', () => {

  it('the header stays on screen as the page scrolls, and lands a link to an anchor under itself rather than behind it', () => {
    const header = FRAME_SRC.slice(FRAME_SRC.indexOf('export function SiteHeader'))
    const cls = header.match(/<header\s+className="([^"]+)"/)![1]
    expect(cls).toMatch(/\bsticky\b/)
    expect(cls).toMatch(/\btop-0\b/)
    expect(cls).toMatch(/\bz-\d+\b/)
    // Opaque, so the page does not read through it.
    expect(cls).toMatch(/\bbg-etyme-canvas\b/)
    // The scroll padding is the header's own height, at both widths.
    expect(cls).toMatch(/\[html:has\(&\)\]:scroll-pt-\[\d+px\]/)
    expect(cls).toMatch(/lg:\[html:has\(&\)\]:scroll-pt-\[\d+px\]/)
    // 69 pixels: 12 above and below Sign in's 44-pixel target, and the rule.
    expect(cls).toContain('[html:has(&)]:scroll-pt-[69px]')
    expect(FRAME_SRC).toContain("const TAP = 'inline-flex h-11")
  })

  it('the header is one row at every width: the logo and Sign in, and no menu', () => {
    // The founder, 2026-09-28, on his phone: Sign in is never hidden at
    // any width. Since 2026-10-14 the menu was an icon, and on 2026-10-19
    // it left ("Even the menu has very [little] value, it can be on the
    // footer"): the header is the logo and Sign in, a 44-pixel target.
    const header = FRAME_SRC.slice(FRAME_SRC.indexOf('export function SiteHeader'), FRAME_SRC.indexOf('export function SiteFooter'))
    const signIn = header.match(/<a\s+href=\{HEADER\.signIn\.href\}\s+className=\{`([^`]+)`\}/)![1]
    expect(signIn).not.toMatch(/(?:^|\s)hidden\b/)
    expect(signIn).toContain('${TAP}')
    expect(header).not.toContain('PRIMARY')
    const nav = header.match(/<nav\s+aria-label="Main"\s+className="([^"]+)"/)![1]
    expect(nav).not.toMatch(/flex-wrap/)
    expect(header).not.toMatch(/<details|<summary|SheetCloser|HEADER\.menu/)
    expect((header.match(/<a\s/g) ?? []).length, 'the logo and Sign in').toBe(2)
  })
  it('a reader who stops within a third of a screen of the next band glides to it, and anywhere else nothing moves', () => {
    // The home page at 390 by 844, as measured: the hero, the steps, the
    // tiles, the dark band and the close, each start under the header.
    const starts = [0, 916, 1940, 3231, 3841]
    const view = 844
    const max = 5283
    expect(settleTarget(starts, 700, 1, view, max)).toBe(916)
    expect(settleTarget(starts, 3000, 1, view, max)).toBe(3231)
    // In the middle of a band taller than the screen: free.
    expect(settleTarget(starts, 1300, 1, view, max)).toBeNull()
    expect(settleTarget(starts, 250, 1, view, max)).toBeNull()
    // Scrolling up, the band above is the one ahead.
    expect(settleTarget(starts, 1100, -1, view, max)).toBe(916)
    // Only just past a band's start: back to it, never further.
    expect(settleTarget(starts, 960, 1, view, max)).toBe(916)
    expect(settleTarget(starts, 916 + view * BEHIND + 5, 1, view, max)).toBeNull()
    expect(AHEAD).toBeLessThanOrEqual(1 / 3)
  })

  it('never holds a reader: nothing moves at the top, at the end of the page, or in the footer', () => {
    const starts = [0, 916, 1940, 3231, 3841]
    expect(settleTarget(starts, 0, 1, 844, 5283)).toBeNull()
    expect(settleTarget(starts, 5283, 1, 844, 5283)).toBeNull()
    // The footer starts at 4675 and is not a band: below the close's
    // reach, the reader scrolls on to the end untouched.
    expect(settleTarget(starts, 4800, 1, 844, 5283)).toBeNull()
    expect(settleTarget(starts, 4800, -1, 844, 5283)).toBeNull()
  })
})

describe('The line about teams around the world, on a dark band', () => {

  it('the mural is redrawn for the dark ground, not the light drawing placed on it', () => {
    // The line work is the canvas color on the ink, and every shape drawn
    // hollow is filled with the ink, so no card glares off the band.
    expect(ART_SRC).toContain("style={{ color: 'var(--canvas)', background: 'var(--ink)' }}")
    expect(ART_SRC).not.toMatch(/fill:\s*'var\(--canvas\)'/)
    expect(ART_SRC).toMatch(/fill:\s*'var\(--ink\)'/)
    // The two touches are the kit's own, and they are seen on the ink:
    // the orange as a graphic should be, at least three to one; the
    // violet is the kit's brighter one, which reads better on the dark
    // than the deeper text violet does, and the lane it colors is
    // decoration the label describes.
    const ink = channels(cssVar('ink'))
    expect(ART_SRC).toContain("'var(--orange)'")
    expect(contrast(channels(cssVar('orange')), ink)).toBeGreaterThanOrEqual(3)
    expect(ART_SRC).toContain("'var(--violet)'")
    expect(ART_SRC).not.toContain("'var(--violet-p)'")
    expect(contrast(channels(cssVar('violet')), ink)).toBeGreaterThan(contrast(channels(cssVar('violet-p')), ink))
  })
})

// ── Never name the incumbents, and never translate from them ─────────
//
// The founder, 2026-09-28: naming the enterprise ERP and VMS vendors in
// documentation or content "makes it sound like we copied them". Every
// party page in the documentation carried a column saying what an ERP
// calls each thing, and captions explaining a term by another system's
// word. Those are gone; each term says what it is and why, in Etyme's
// own words. "ERP" stays only as a place a document crosses to the books
// a client already keeps.

/**
 * Every page a reader reaches without signing in, as words: the pages the
 * rest of this file reads, and also the legal pages, the demo's door and
 * its seats, the layout's description, and each party page's raw HTML so
 * a table cell or a caption cannot slip past a text extractor.
 */
function everyPublicWord(): [string, string][] {
  const out = everyPublicPage()
  for (const page of PUBLIC_PAGES.filter((p) => p.kind === 'LEGAL' || p.route === '/demo')) {
    const file = join(process.cwd(), page.routeFile)
    if (existsSync(file)) out.push([page.route, copyFrom(readFileSync(file, 'utf8')).join(' ')])
  }
  out.push(['/demo seats', copyFrom(readFileSync(join(process.cwd(), 'src/app/demo/seats.ts'), 'utf8')).join(' ')])
  out.push(['the layout', copyFrom(readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf8')).join(' ')])
  // The ten party pages' HTML was read here until 2026-10-15, when they
  // became one table; every documentation page is in everyPublicPage().
  return out
}

describe('Etyme names no enterprise incumbent, and explains its words by their own reason', () => {

  it('no public page or documentation page names SAP, Fieldglass, Beeline, Magnit, Ariba, Oracle or Workday, or says what an ERP calls a thing', () => {
    const pages = everyPublicWord()
    expect(pages.length).toBeGreaterThan(30)
    for (const [route, text] of pages) {
      const found = incumbentComparison(text)
      expect(found, `${route}: ${found.join('; ')}`).toEqual([])
    }
  })

  it('catches every incumbent written as a name, and every way of saying what another system calls a thing', () => {
    for (const said of [
      'Etyme is the same job as SAP Fieldglass.',
      'If you know Beeline, this will feel familiar.',
      'Unlike Magnit, we are sized for you.',
      'The order goes to Ariba.',
      'Export to Oracle or to WORKDAY.',
      'Etyme says · what an ERP calls it',
      'An ERP calls it a service entry sheet.',
      'The firm bills its customer — an ERP’s process is called billing.',
      'In an ERP the award is the order.',
      'Not a commercial document; nobody signs one — same in an ERP.',
      'No ERP word. A firm holding back against bench time.',
      'The term is the ERP’s own.',
      'Small-business accounting packages say Invoice for the customer document.',
      'What a VMS would call a worker profile.',
    ]) {
      expect(incumbentComparison(said), said).not.toEqual([])
    }
  })

  it('leaves ERP alone where it is a plain fact about integration: a station where a document crosses to the books the client already keeps', () => {
    for (const said of [
      'A marked station is where a document would cross to a system you already run: your ERP, your HCM or your expense system.',
      '3 Purchase order → ERP',
      'Etyme keeps the record for contractors and suppliers, and your ERP, HCM and expense systems keep theirs.',
      'No named connector to a particular ERP, HCM, payroll, expense, signature or background-check product is built.',
      'Every posting becomes a balanced journal entry, exported once to the accounting system you already run.',
      'Keep your ATS, your VMS and every supplier you already use.',
      'Apparel · ERP finance lead',
      // Ordinary words are not the name: a sapling, an oracle, a workday.
      'The sapling and the oracles of Delphi at the workday’s end.',
    ]) {
      expect(incumbentComparison(said), said).toEqual([])
    }
  })

  // "Every party page keeps its glossary under each drawing" held the
  // glossaries, stations tables and integration points, which the
  // founder's drawing of 2026-10-15 took off every documentation page.

  it('names the three-way check by what it checks, and the bill by who issues it, never by what another system calls them', () => {
    expect(onDoc('invoices')).toContain('The three-way check: the hours, the invoice receipt, and the contract rate must all agree.')
    for (const [route, text] of everyPublicPage()) expect(text, route).not.toMatch(/goods receipt|service entry sheet/)
  })

})
