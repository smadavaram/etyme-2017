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
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  check, verdict, copyFrom, gridsWithoutBreakpoint, priceClaims, namedCompanies,
  headlinesFrom, withoutVerb, longSentences, settingTheOfferAside,
  readsAsAimedAtSuppliers, offersTheProgramOffice, sizesAgainstIncumbents,
  sizesTheBuyer, unverifiableClaims,
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
import { MODULES, copyOfModule, spelled } from '@/lib/public-site/modules'
import { ABOUT, COMPANY_PAGES, FOUR_ANSWERS, TWO_WAYS, copyOfCompanyPage } from '@/lib/public-site/company'
import { copyOfDoc, copyOfDocsHome, docSlugs } from '@/lib/public-site/docs/index'
import { NAV_MENUS as SITE_MENUS, PRODUCT_ITEMS, PRODUCT_STAGES, ROLES as SITE_ROLES } from '@/lib/public-site/nav'
import { MODULE_ICON } from '@/lib/public-site/module-icons'
import { ASK_COPY } from '@/lib/public-site/leads'
import { CLOSE_BAND, SEE_IT, GET_THE_AUDIT, closeBandCopy } from '@/lib/public-site/funnel'
import { FOOTER as SITE_FOOTER, frameCopy } from '@/lib/public-site/nav'
import { DOCS_SLUGS } from '@/lib/public-site/pages'

const PAGE = readFileSync(join(process.cwd(), 'src/app/page.tsx'), 'utf8')
const ICONS_SRC = readFileSync(join(process.cwd(), 'src/lib/public-site/module-icons.tsx'), 'utf8')

/** Every word on a module page, as the public-pages guard reads it. */
const onModule = (slug: string): string => {
  const c = copyOfModule(MODULES.find((m) => m.slug === slug)!)
  return [...c.hero, ...c.body].join(' ')
}
const COMPLIANCE_PAGE = onModule('compliance')
const CHAIN_PAGE = onModule('chain')
const GOVERNANCE_PAGE = onModule('governance')
const ABOUT_PAGE = (() => {
  const c = copyOfCompanyPage(ABOUT)
  return [...c.hero, ...c.body].join(' ')
})()
/** The anchor of a block on About, or of the section a module page carried over. */
const aboutBlock = (id: string) => ABOUT.blocks.find((b) => b.id === id)
const moreOn = (slug: string) => MODULES.find((m) => m.slug === slug)!.more

/**
 * The real page, split at roughly where a first screen ends. The header is
 * a shared component since 2026-09-27 and none of its words are in this
 * file. The first screen is the hero: the headline, the category, the
 * one line saying what the software does, and the caption under the
 * dashboard — four pieces since 2026-09-28, when the founder asked for a
 * hero that reads in five seconds with "less theory there".
 */
const words = copyFrom(PAGE)
const FOLD = 4
const live: Copy = { hero: words.slice(0, FOLD), body: words.slice(FOLD) }

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
 * Everything a reader reads on the home page below the fold. The close is
 * drawn from the funnel every page ends in, so its words are read from
 * that data and added here, where the page's own guards can see them.
 * The eight parts are drawn from the Product menu's own data, and came
 * back to the page on 2026-09-28 after a day away, so their names and
 * lines are read here too.
 */
const TILE_COPY = PRODUCT_STAGES.flatMap((g) => [g.heading, ...g.items.flatMap((i) => [i.t, i.d ?? ''])])
const DRAWN = [
  ...closeBandCopy(),
  GET_THE_AUDIT.d,
  ...TILE_COPY,
]
const body = [...words.slice(FOLD), ...DRAWN].join(' ')
const all = [...words, ...DRAWN].join(' ')
/** The shared frame — header and footer — which the home page draws too. */
const FRAME_SRC = readFileSync(join(process.cwd(), 'src/lib/public-site/frame.tsx'), 'utf8')
const CLOSE_SRC = readFileSync(join(process.cwd(), 'src/lib/public-site/close-band.tsx'), 'utf8')
const aboutAt = (id: string) => ABOUT.blocks.findIndex((b) => b.id === id)
/** Everything above the fold, as one string, for the guards that read it. */
const hero = live.hero.join(' ')

const at = (anchor: string) => PAGE.indexOf(`id="${anchor}"`)

describe('Below the hero, the page says what the business is', () => {

  it('names the whole span once, so that no single station reads as the product', () => {
    // Naming one station makes the whole product read as that station,
    // which is how a screening headline made this a hiring tool. The span
    // was a line in the hero until 2026-09-27; the hero is the headline,
    // the category and the hook now, and the span is said on About. The
    // header's Product menu teaches it as four stages, on every page.
    expect(ABOUT_PAGE).toContain(
      'Requisition, suppliers, submissions, screening, interviews, ' +
      'onboarding, timesheets, invoices, compliance'
    )
    expect(PRODUCT_STAGES.map((g) => g.heading)).toEqual(['Source', 'Start', 'Work and pay', 'Govern'])
  })

  it('asks the four questions on About before it argues anything, and leaves the hero to say what the software is', () => {
    // The hook is the not-knowing. It was one line in the hero until
    // 2026-09-28, when the founder asked for "less theory there"; the
    // four questions with their answers were already on About, with why
    // nobody can answer them first.
    expect(hero).not.toContain('How many contractors are on your sites')
    expect(ABOUT_PAGE).toContain('You can name every employee on your payroll')
    expect(FOUR_ANSWERS.map((a) => a.q)).toEqual([
      'How many contractors are on our sites right now?',
      'What are we spending on them this quarter, and with whom?',
      'Are we paying two suppliers different money for the same work?',
      'Who has been here longest?',
    ])
    // On About, why nobody can answer comes first, then the answers.
    expect(aboutAt('unanswered')).toBeGreaterThanOrEqual(0)
    expect(aboutAt('answered')).toBe(aboutAt('unanswered') + 1)
    expect(PAGE).not.toContain('id="gap"')
  })

  it('keeps tenure to one question, not a section', () => {
    // Corrected 2026-09-17: "Tenure is nobody's problem — only you
    // expect it to be solved." It is the moat, not the wedge. The ledger
    // stays one question of four, answered in a line, and has no section
    // of its own anywhere.
    expect(PAGE).not.toContain('id="tenure"')
    expect(ABOUT.blocks.map((b) => b.id)).not.toContain('tenure')
    expect(FOUR_ANSWERS.filter((a) => a.screen === 'Tenure')).toHaveLength(1)
    const mentions = (all.toLowerCase().match(/tenure/g) ?? []).length
    expect(mentions, `the word "tenure" is on the page ${mentions} times`).toBeLessThanOrEqual(5)
    // The arithmetic, in numbers a reader can add, is on the compliance
    // page, where the number is the whole point.
    expect(body).not.toContain('One person worked 14 months')
    expect(COMPLIANCE_PAGE).toContain(
      'One person worked fourteen months through one supplier, three through a second and two through a third. ' +
      'That is nineteen months on site, and none of the three suppliers can see the other two.'
    )
  })

  it('keeps the business case off the front door and one click from the hook', () => {
    // Two sentences doing two jobs: the hook is the not-knowing, the
    // business case is what it costs when somebody finally asks. The hook
    // is in the hero; the business case is on the compliance page, one
    // click from any page through the Product menu.
    expect(PAGE).not.toContain('id="exposure"')
    expect(body).not.toContain('Nobody is fined on the day')
    expect(PRODUCT_ITEMS.map((i) => i.href)).toContain('/compliance')
    expect(moreOn('compliance')?.id).toBe('cost')
    expect(COMPLIANCE_PAGE).toContain('Nobody is fined on the day a contractor passes eighteen months')
    expect(COMPLIANCE_PAGE.toLowerCase()).toContain('co-employment')
  })

  it('names the three things the exposure actually is, rather than gesturing at compliance', () => {
    const items = (moreOn('compliance')?.items ?? []).map((i) => i.t)
    expect(items).toEqual([
      'A co-employment claim counts every supplier together',
      'A supplier whose insurance lapsed keeps working',
      'A bill is paid with no signed timesheet behind it',
    ])
  })

  it('does not lead with a penalty, because nobody is fined at month nineteen', () => {
    // The page used to argue tenure as "an exposure rather than a
    // saving". A compliance pitch loses to "we have never been caught",
    // which is worse than losing to "we are managing fine" because it
    // is true.
    for (const text of [body, COMPLIANCE_PAGE]) {
      expect(text).not.toContain('exposure rather than a saving')
      expect(text).not.toContain('usually finds out about it from a lawyer')
    }
  })

  it('says what the not-knowing costs today — three weeks and a number nobody trusts — on About', () => {
    // In full on About. It left the hero on 2026-09-28: "most companies
    // cannot answer" is a claim about other people's companies that a
    // reader cannot check, and the hero now says only what the software
    // is and does.
    expect(hero).not.toContain('Most companies cannot answer without three weeks of asking.')
    expect(ABOUT_PAGE).toContain('let me come back to you')
    expect(ABOUT_PAGE).toContain('three weeks of asking every supplier')
  })

  it('says why no supplier can answer, one click from the questions, on About', () => {
    // The long form of the hook, directly above the answers on About.
    expect(aboutBlock('unanswered')).toBeDefined()
    expect(ABOUT_PAGE).toContain('No supplier can add that up')
    expect(ABOUT_PAGE).toContain('A VMS sees inside')
    expect(ABOUT_PAGE).toContain('nobody you could ask is holding all')
  })

  it('is written to the client’s desks by name — program manager, CFO, procurement', () => {
    // The client is the customer, decided 2026-09-10. Writing to "a
    // company" is writing to nobody. The home page names the program
    // manager's desk under its first screen; the header names each desk
    // as a way in; About names the CFO who asks.
    expect(PAGE).toContain('The program manager’s desk')
    expect(SITE_ROLES.map((r) => r.t)).toEqual(expect.arrayContaining(['The program office', 'Procurement', 'Finance', 'Hiring managers']))
    for (const desk of ['program manager', 'CFO', 'procurement']) {
      expect(ABOUT_PAGE, desk).toContain(desk)
    }
  })

  it('is written to the client, with the supplier reading over its shoulder', () => {
    // Addressing hiring companies, primes, subs and bench operators as
    // four equals is the plan from before the client became the customer
    // on 2026-09-10. The home page gives a supplier one quiet door in its
    // close; the paragraph written to a supplier is on About beside the
    // two ways to run it, and prime, sub and bench on the chain page.
    expect(ABOUT_PAGE).toContain('you are on it because your client is')
    expect(PAGE).toContain('Supply people to a program instead?')
    for (const position of ['prime', 'sub', 'bench']) {
      expect(CHAIN_PAGE.toLowerCase(), position).toContain(position)
    }
  })

  it('writes to the client before it writes to anybody who supplies the client', () => {
    // On the home page, the client's doors come before the supplier's.
    // On About, the client's answers come before the supplier's paragraph.
    expect(PAGE.indexOf('withForm')).toBeLessThan(PAGE.indexOf('Supply people to a program instead?'))
    for (const first of ['steps', 'join']) {
      expect(at(first), `#${first} should come before the supplier's door`).toBeLessThan(PAGE.indexOf('Supply people to a program instead?'))
    }
    expect(aboutAt('answered')).toBeLessThan(aboutAt('ways'))
  })

  it('says prime, sub and bench are positions on a deal rather than kinds of company', () => {
    // The same firm is all three at once on different deals. Nobody
    // says it, it is true, and it is why this is one product and not
    // four. On the chain page since 2026-09-27.
    expect(CHAIN_PAGE).toContain('positions on a deal, not kinds of company')
  })

  it('gives the supply side a line each, never a column each beside the client', () => {
    // On the chain page, under the story of the chain, and never on the
    // front door as three audiences beside the client.
    const items = (moreOn('chain')?.items ?? []).map((i) => i.t)
    expect(items).toEqual(['A prime', 'A sub', 'A bench vendor'])
    expect(PAGE).not.toContain('const SUPPLY')
    expect(PAGE).not.toContain("who: 'The company hiring'")
  })

  it('tells a supplier it is welcome under a plain sub-heading, never a rhetorical question', () => {
    // Subtle is not absent. The network only works because suppliers are
    // on it. It is said beside the two ways to run the program, because
    // that is where a supplier would otherwise read a threat.
    const ways = [...(aboutBlock('ways')?.paragraphs ?? [])].join(' ')
    expect(ways).toContain('If you are a staffing supplier')
    expect(ways).toContain('Your rates and your sub-vendors’ names stay private')
    expect(ways).toContain('your client stays your client')
    expect(`${PAGE} ${ways}`).not.toMatch(/supplier\?/)
  })

  it('says what the chain costs the client, in outcomes rather than in a warning', () => {
    // On the chain page, as its own section, and the header's Suppliers
    // role leads straight to it.
    expect(moreOn('chain')?.title).toBe('Etyme sends your role down the chain and records what each supplier sees')
    expect(CHAIN_PAGE).toContain('past the agreement that covers them')
    expect(CHAIN_PAGE).toContain('The same resume reaches you from more than one supplier')
    expect(CHAIN_PAGE).toContain('Etyme describes the end client where the agreement forbids naming it')
    expect(CHAIN_PAGE).toContain('A blind key lets two competing suppliers')
    expect(SITE_ROLES.map((r) => r.href)).toContain('/chain#down-the-chain')
  })

  it('says where the guarantee stops, because a company that is not on Etyme is not covered by it', () => {
    // A control that stops working where the chain leaves the product is
    // a comfort unless the page says where it stops. On About, beside
    // the promise that suppliers need not sign up first.
    expect(ABOUT_PAGE).toContain('A hop to a company that is not on Etyme leaves the record')
    expect(ABOUT_PAGE).toContain('the screen says so')
  })

  it('shows how a placement moves as the handful of milestones a person acts on', () => {
    // Six milestones, not the internal lifecycle, on About. The header's
    // program office role leads to the documentation's own walk of one
    // hire from every desk.
    const hire = aboutBlock('hire')!
    expect(hire.title).toBe('One hire moves through six milestones, and three of them can stop it')
    expect((hire.items ?? []).map((i) => i.t)).toEqual(['Raised', 'Released', 'Awarded', 'Cleared', 'Working', 'Ended'])
    expect(SITE_ROLES.find((r) => r.t === 'The program office')?.href).toBe('/docs/client#one-hire')
    expect(PAGE).not.toContain('const LIFECYCLE')
  })

  it('walks the hire from every desk, so no one desk reads as the whole product', () => {
    expect(ABOUT_PAGE).toContain('The hiring manager raises it, HR reads the role, procurement audits')
    expect(ABOUT_PAGE).toContain('Nobody signs their own')
  })

  it('marks exactly the three gates — a milestone that can stop the deal, not only record it', () => {
    const stops = (aboutBlock('hire')!.items ?? []).filter((i) => /It can stop here\./.test(i.d)).map((i) => i.t)
    expect(stops).toEqual(['Raised', 'Awarded', 'Cleared'])
    expect(ABOUT_PAGE).toContain('Raised, awarded and cleared can stop the deal')
  })

  it('shows each gate as the sentence the software actually says, on the page for its station', () => {
    // The three refusals the home page quoted are each on the module
    // page for the station that refuses, in "What it refuses", and the
    // public-pages guard opens the source file for every one. What is
    // held here is that all three are still quoted somewhere public.
    const refusals = MODULES.flatMap((m) => m.refuses.map((r) => ({ slug: m.slug, ...r })))
    const find = (phrase: string) => refusals.find((r) => r.phrase === phrase || r.says.includes(phrase))
    expect(find('cannot start without')?.slug).toBe('contracts')
    expect(find('No line on this invoice is backed by an approved timesheet or expense')?.slug).toBe('invoices')
    expect(refusals.some((r) => r.slug === 'governance' && /insurance/.test(r.says))).toBe(true)
    expect(PAGE).not.toContain('const GATES')
  })

  it('says out loud that there are more states inside and nobody has to learn them', () => {
    expect(ABOUT_PAGE).toContain('Nobody using it has to learn any of them')
  })

  it('answers the four questions with four screens a reader can go and open', () => {
    // A page describing a screen nobody built is the exact failure this
    // file was written to stop. The route is written beside the label so
    // this reads the page's own answer rather than guessing it.
    expect(FOUR_ANSWERS.map((a) => a.screen)).toEqual(['Workforce', 'Program', 'Rates', 'Tenure'])
    for (const a of FOUR_ANSWERS) {
      expect(
        existsSync(join(process.cwd(), 'src/app/dashboard', a.route, 'page.tsx')),
        `src/app/dashboard/${a.route}/page.tsx`
      ).toBe(true)
      expect(ABOUT_PAGE, a.q).toContain(a.etyme)
    }
  })

  it('gives keeping your ATS, your VMS and your suppliers a headline on About rather than a footnote', () => {
    expect(aboutBlock('alongside')?.title).toBe('Keep your ATS, your VMS and every supplier you already use')
    expect(ABOUT_PAGE).toContain('sits in front of')
  })

  it('says the enforcement blocks where the law is behind it and warns everywhere else', () => {
    // The governance page opens on exactly this, and always did; the
    // home page's paragraph repeating it moved nowhere, because it was
    // already there.
    expect(GOVERNANCE_PAGE).toContain('blocks and says why')
    expect(GOVERNANCE_PAGE.toLowerCase()).toContain('lets you proceed')
  })

  it('says plainly that the price is not settled, rather than saying nothing about money', () => {
    // A page with no price makes a reader assume enterprise sales and
    // leave. Silence is worse than "we are still deciding". One short
    // line near the close since 2026-09-27, and the rest on About.
    expect(body).toContain('There is no price on this page because we have not settled one')
    expect(body).toContain('Etyme is free while we prove it out with the first five firms')
    expect(at('why')).toBeGreaterThan(at('ways'))
  })

  it('says the things about the commercials that are settled, on About', () => {
    expect(aboutBlock('price')).toBeDefined()
    expect(ABOUT_PAGE).toContain('Governance is never a paid tier')
    expect(ABOUT_PAGE).toContain('Etyme never runs a bench and never places anybody')
    expect(ABOUT_PAGE).toContain('Looking around costs nothing and needs no card')
    expect(PAGE).toContain("'/about#price'")
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
    // On About since 2026-09-27, with the rest of what it sits beside.
    expect(all).not.toContain('exports in full')
    expect(ABOUT_PAGE).not.toContain('exports in full')
    expect(ABOUT_PAGE).toContain('exports to CSV from the screen it is on')
    expect(ABOUT_PAGE).toContain('ask for a copy of it')
    expect(existsSync(join(process.cwd(), 'src/app/dashboard/my-data/page.tsx'))).toBe(true)
  })

  it('claims no set-up time nobody has measured', () => {
    expect(all).not.toContain('Set-up takes an afternoon')
    expect(all).not.toContain('within an hour')
  })

  it('declares the category as enterprise contingent workforce management, straight under the founder’s headline', () => {
    // The founder's line first, then the category he declared on
    // 2026-09-28: "Enterprise contingent workforce management", with no
    // size after it — "keep the business open for all". It names the
    // whole span; "vendor management system" is said once further down,
    // over the eight parts, as the word procurement searches for.
    expect(words[0]).toBe('Every contractor. Every supplier. One record.')
    expect(words[1]).toBe('Enterprise contingent workforce management.')
  })

  it('says what the software does straight after the category, as a description a reader can try rather than a promise', () => {
    // A buyer-side review, 2026-09-27, asked for the outcome under the
    // category: the reader is an operations leader or a CFO with a dozen
    // suppliers and nobody to watch them. On 2026-09-28 the founder said
    // who actually reads it — "well-versed IT people; they rarely buy
    // anything because of claims" — so the line stopped promising "a
    // procurement team's control" and says what the client's people do
    // in it, each verb a screen in the demo under the buttons. It comes
    // after the category, because category first is the first rule; it
    // is about the client's own people, so it never reads as the program
    // office offered quietly in the close; and nothing in it is aimed at
    // a supplier.
    const outcome = words[2]
    expect(outcome).toBe(
      'Your own people approve the roles, sign the timesheets and pay only matched invoices, across every supplier.'
    )
    expect(words[1]).toBe('Enterprise contingent workforce management.')
    expect(outcome).toMatch(/\byour own people\b/i)
    for (const verb of ['approve', 'sign', 'pay']) expect(outcome, verb).toMatch(new RegExp(`\\b${verb}\\b`))
    expect(unverifiableClaims(outcome)).toEqual([])
    expect(outcome).not.toMatch(/outsourc|for you\b|on your behalf|we run|Etyme runs/i)
    expect(offersTheProgramOffice(outcome)).toEqual([])
    expect(readsAsAimedAtSuppliers(outcome)).toEqual([])
    expect(withoutVerb([outcome])).toEqual([])
    expect(longSentences(outcome, 30)).toEqual([])
    expect(check({ hero: [words[0], words[1], outcome], body: [] }).map((f) => f.rule))
      .not.toContain('category-first')
  })

  it('keeps the hero to the headline, the category, one line, the two ways in and the screen', () => {
    // "Hero section can still be compact and impactful. Less theory
    // there." — the founder, 2026-09-28. The hook line about three weeks
    // of asking left for About, where it was already said in full. What
    // is left reads in five seconds, in nouns a reader can picture —
    // roles, timesheets, invoices, suppliers — and nothing about a
    // record, which is abstract until the list is seen.
    expect(live.hero).toHaveLength(4)
    const outcome = words[2]
    for (const noun of ['roles', 'timesheets', 'invoices', 'supplier']) expect(outcome, noun).toContain(noun)
    expect(outcome).not.toMatch(/\brecord\b/i)
    expect(hero).not.toContain('How many contractors are on your sites')
    expect(hero).not.toContain('three weeks')
    // The two ways in are the only buttons, and the screen is the last
    // thing in the hero.
    const top = PAGE.slice(PAGE.indexOf('Every contractor. Every supplier. One record.'), PAGE.indexOf('id="steps"'))
    expect((top.match(/<Link/g) ?? []).length).toBe(2)
    expect(top).toContain('href={SEE_IT.href as Route}')
    expect(top).toContain('href={GET_THE_AUDIT.href as Route}')
    expect(top.indexOf('<figure')).toBeGreaterThan(top.lastIndexOf('<Link'))
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

  it('writes every headline as a sentence with a verb, not a slogan', () => {
    // A slogan is a claim nobody can agree or disagree with. The hero
    // line is the one exception and the founder signed it off: it is
    // three noun phrases, it is meant to be remembered rather than
    // acted on, and the sentence directly under it says what it means.
    const signed = 'Every contractor. Every supplier. One record.'
    const heads = headlinesFrom(PAGE)
    expect(heads, 'the page has headlines to read').toContain(signed)
    // Four bands since 2026-09-27. Two headlines are written as text —
    // the hero's and the steps'; the founder's line about teams around
    // the world and the close are drawn from data, and are checked here too.
    expect(heads.length).toBeGreaterThanOrEqual(2)
    const joinHeading = /heading: '([^']+)'/.exec(PAGE.slice(PAGE.indexOf('const JOIN')))?.[1] ?? ''
    expect(joinHeading).toBe('Join forces with global teams around the world.')
    const slogans = withoutVerb([...heads, joinHeading, CLOSE_BAND.heading], [signed])
    expect(slogans, `these headlines have no verb in them:\n  ${slogans.join('\n  ')}`).toEqual([])
  })

  it('answers each of the four questions in one line that names a screen a reader can open', () => {
    // A question with no answer under it is a complaint. The question,
    // the screen and one line are one row, on About since 2026-09-27,
    // directly under what happens today.
    const answers = FOUR_ANSWERS.map((a) => a.etyme)
    expect(answers.length).toBe(4)
    const screens = ['Workforce', 'Program', 'Rates', 'Tenure']
    for (const line of answers) {
      expect(screens.some((screen) => line.includes(`${screen} screen`)), `names no screen: ${line}`).toBe(true)
      // "In a line" is a number: about the length of the question itself.
      const count = line.split(/\s+/).length
      expect(count, `${count} words is not one line: ${line}`).toBeLessThanOrEqual(22)
    }
    expect((aboutBlock('answered')?.items ?? []).map((i) => i.d)).toEqual(answers)
    // And what happens today is still said, directly above.
    const today = (aboutBlock('unanswered')?.items ?? []).map((i) => i.t)
    expect(today).toEqual(FOUR_ANSWERS.map((a) => a.q))
  })

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

    // The claim sat under a Compliance menu until 2026-09-27; it is the
    // HR and compliance role's line in the shared header now.
    const hr = SITE_ROLES.find((r) => r.t === 'HR and compliance')!
    // Sentence by sentence, because the claim is only a claim when the
    // standing and the refusal are in the same one: "a lapsed insurance
    // certificate stops a start" beside "good standing is read on the
    // compliance screen" says nothing about good standing stopping
    // anything, and read as one string it would look as though it did.
    const said = hr.d ?? ''
    const saysStandingStopsWork = said
      .split(/(?<=[.!?])\s+/)
      .some((sentence) => /good standing/i.test(sentence) && /\bstops?\b/i.test(sentence))
    expect(
      saysStandingStopsWork,
      startReadsStanding && submissionReadsStanding
        ? 'both doors refuse a lapsed good standing; the page owes that sentence'
        : 'the page says a lapsed good standing stops work; a door that stops work does not read it'
    ).toBe(doorsReadStanding)

    // And it says which two stations, because those are the two that
    // refuse: `supplierCoverGate` at the submission, the same gate
    // through `contractClearance` at the start.
    if (saysStandingStopsWork) {
      expect(said).toMatch(/\bsubmission\b/i)
      expect(said).toMatch(/\bstart\b/i)
    }
  })

  it('says the program dashboard shows this month from rates, and names the invoices screen for what was billed', () => {
    // The dashboard's spend is a forward estimate — a bill rate times a
    // flat 160-hour month — and `lib/program-spend` says so out loud
    // beside the number. A page claiming that figure came off matched
    // bills is a page a buyer disproves by opening the screen.
    const spend = readFileSync(join(process.cwd(), 'src/lib/program-spend.ts'), 'utf8')
    expect(spend).toContain('It is an estimate, not signed time.')
    const spendAnswer = FOUR_ANSWERS.map((a) => a.etyme).find((line) => /spend|month|billed/i.test(line))
    expect(spendAnswer, 'the page answers the spend question').toBeTruthy()
    expect(spendAnswer).toContain('Program screen')
    expect(spendAnswer).toContain('Invoices screen')
    // And it does not put the match behind the dashboard's figure.
    expect(spendAnswer, 'the dashboard figure is not from matched bills').not.toMatch(/matched/i)
  })

  it('sends the comparison of two suppliers to the screen that draws it', () => {
    // "Same role, two suppliers" is a panel on the Program screen's
    // suppliers tab. The Rates screen is the history of what a rate was
    // and who agreed it, one contract at a time.
    const dashboard = readFileSync(
      join(process.cwd(), 'src/app/dashboard/program/page.tsx'), 'utf8'
    )
    expect(dashboard).toContain('Same role, two suppliers')
    const rateAnswer = FOUR_ANSWERS.map((a) => a.etyme).find((line) => /side by side/i.test(line))
    expect(rateAnswer).toContain('Program screen')
  })

  it('the page never tells a client it will see a supplier’s subcontractors by name', () => {
    // 2026-09-21. The headline read "Etyme shows every contractor on
    // your sites, including contractors your suppliers' subcontractors
    // placed", and every guard in the file passed it. To a prime that
    // sentence is a promise to show its client the firm it buys from.
    //
    // What the record does is narrower and is what the site says now,
    // on About since 2026-09-27: the person, and whether whoever employs
    // them is insured and authorized, because that is the client's own
    // exposure. The name below follows the client's own agreement.
    const answered = aboutBlock('answered')!
    expect(answered.title).toBe('Etyme shows every contractor on your sites, whoever placed them')
    expect(answered.paragraphs?.join(' ')).toContain('whether the firm that employs them is insured')
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
    // The exposure moved to the compliance page on 2026-09-27; the claim
    // is held there now, against the same code.
    const exposure = (moreOn('compliance')?.items ?? []).map((i) => i.d).join(' ')
    expect(exposure).toContain('blocks the award at your limit')
    expect(exposure).not.toContain('blocks a new submission')
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

describe('The record is the product, and the program office is offered quietly', () => {

  it('leads with the record and offers the program office in one quiet sentence under it', () => {
    // Since 2026-09-27 the hero is the headline, the category and the hook,
    // and the offer is one quiet sentence in the close, after the three
    // ways forward — never in the hero.
    const offer = 'If you would rather not staff a program office, Etyme can run it for you on the same record.'
    expect(all).toContain(offer)
    expect(offersTheProgramOffice(hero)).toEqual([])
    expect(PAGE.indexOf(offer)).toBeGreaterThan(at('close'))
    // And the sentence it replaced is gone. "You choose how to use it"
    // made the choice the thing being sold.
    expect(all).not.toContain('You choose how to use it')
  })

  it('mentions the program office service once as a quiet option, never as a headline', () => {
    // Once on the whole page, in the close. Anywhere else it has stopped
    // being a second option and become the pitch.
    const offers = offersTheProgramOffice(all)
    expect(offers, offers.join(' | ')).toHaveLength(1)
    for (const heading of [...headlinesFrom(PAGE), CLOSE_BAND.heading]) {
      expect(offersTheProgramOffice(heading), heading).toEqual([])
    }
    expect(offersTheProgramOffice(`${words[0]} ${words[1]} ${words[2]}`)).toEqual([])
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

  it('keeps the two labels the founder named, as sub-headings rather than the headline', () => {
    // A program manager has already evaluated things called both of
    // those, and inventing a third word costs the recognition. They are
    // sub-headings under About's #ways since 2026-09-27, and the section
    // headline is about the record.
    expect(TWO_WAYS.map((w) => w.label)).toEqual(['VMS software', 'MSP provider'])
    const ways = aboutBlock('ways')!
    expect((ways.items ?? []).map((i) => i.t)).toEqual(['VMS software', 'MSP provider'])
    expect(ways.title).toBe('The record is the product, and your own people run the program on it')
    for (const heading of [...headlinesFrom(PAGE), CLOSE_BAND.heading, ...ABOUT.blocks.map((b) => b.title)]) {
      expect(heading, heading).not.toContain('MSP')
    }
    // The home page's close links to it.
    expect(PAGE).toContain("'/about#ways'")
  })

  it('says the program office is the second option and most clients take the first', () => {
    expect(ABOUT_PAGE).toContain('Most clients staff the program office themselves.')
    expect(ABOUT_PAGE).toContain('The record is the same either way and it stays yours.')
  })

  it('says what a client gets from the service in plain sentences, and that the record stays theirs', () => {
    // Value added, said as outcomes: seats the client grants, its rules,
    // every read logged — and the record the client's either way. "You
    // get a program office without hiring one" was the home page's second
    // offer; About already offers once, under #neutral, so the card says
    // what the client gets rather than offering again.
    expect(ABOUT_PAGE).toContain(
      'Etyme staff sit in seats your company grants them, work to your rules, and every read they make is logged.'
    )
    expect(ABOUT_PAGE).toContain('The record is the same either way and it stays yours.')
  })

  it('says what Etyme never does in either way', () => {
    // Neutrality is absolute and this is the place a reader is weighing
    // whether to hand Etyme the program, so it is said there and not
    // only in the footer.
    const ways = (aboutBlock('ways')?.paragraphs ?? []).join(' ')
    expect(ways).toContain(
      'In either way, Etyme never supplies a contractor and never runs a bench, so it has no reason to favor one supplier.'
    )
    expect(check(live).map((f) => f.rule)).not.toContain('neutrality')
    expect(check(copyOfCompanyPage(ABOUT)).map((f) => f.rule)).not.toContain('neutrality')
  })

  it('leaves the client the decisions that are the client’s', () => {
    // A program office that takes the hiring manager's decisions is not
    // neutral and is not this. The client is sold control, never
    // outsourcing, so this stays beside the offer.
    expect(ABOUT_PAGE).toContain(
      'Your people keep the decisions that are yours: which roles to open, who to hire, and what to approve.'
    )
  })

  it('puts the choice after the four questions and the line about teams around the world', () => {
    // A reader who has just been shown what they cannot answer asks who
    // is going to do something about it. On the home page the offer is in
    // the close, after the line about teams; on About the two ways come
    // after the answers.
    const offer = PAGE.indexOf('If you would rather not staff a program office')
    expect(offer).toBeGreaterThan(at('join'))
    expect(aboutAt('ways')).toBeGreaterThan(aboutAt('answered'))
  })

  it('says how a program Etyme runs is paid for, once and plainly, without a number', () => {
    // Supplier-funded, a percentage on billings, disclosed when a
    // supplier joins rather than discovered later. Said once, on About
    // since 2026-09-27, where the rest of what is settled about the
    // money went. The home page keeps one line: no price, and free while
    // we prove it out.
    const sentence =
      'Where Etyme runs the program, it is paid the way program offices are paid: a percentage the suppliers pay on their billings, disclosed to every supplier when they join.'
    expect(ABOUT_PAGE).toContain(sentence)
    expect(ABOUT_PAGE.split('a percentage the suppliers pay on their billings')).toHaveLength(2)
    expect(all).not.toContain('a percentage the suppliers pay on their billings')
    for (const text of [all, ABOUT_PAGE]) {
      const found = priceClaims(text)
      expect(found, found.join('; ')).toEqual([])
    }
    expect(body).toContain('There is no price on this page because we have not settled one')
  })

  it('tells a supplier what a program Etyme runs changes for them, in outcomes', () => {
    // Reassurance first — rates, sub-vendors' names, the client stays
    // theirs — and then what is actually better for them. Never a
    // sentence about being watched or compared.
    expect(ABOUT_PAGE).toContain('Your rates and your sub-vendors’ names stay private, and your client stays your client.')
    expect(ABOUT_PAGE).toContain(
      'Where Etyme runs a client’s program, approvals come back faster and your bills are matched and paid without chasing.'
    )
    expect(readsAsAimedAtSuppliers(ABOUT_PAGE)).toEqual([])
  })

  it('opens the census door now that the page exists', () => {
    // The census is the spend audit, the second rung of the ladder every
    // page ends in, and the first step for a client weighing the service.
    // It is a button in the hero and in the close, and the page is there.
    expect(GET_THE_AUDIT.href).toBe('/census')
    expect(PAGE).toContain('{GET_THE_AUDIT.t}')
    expect(CLOSE_SRC).toContain('{GET_THE_AUDIT.t}')
    expect(existsSync(join(process.cwd(), 'src/app/census/page.tsx'))).toBe(true)
  })

  it('says VMS software without the page reading as software staffing', () => {
    // Horizontal, never vertical. The label is a product category a
    // buyer names, and the rule that guards the industry assumption has
    // to tell it apart from a page about engineers.
    expect(ABOUT_PAGE).toContain('VMS software')
    expect(check(copyOfCompanyPage(ABOUT)).map((f) => f.rule)).not.toContain('horizontal-not-vertical')
    expect(all).toContain('vendor management system')
    expect(check(live).map((f) => f.rule)).not.toContain('horizontal-not-vertical')
  })

})

// ── Screens before sentences ─────────────────────────────────────────
//
// Added 2026-09-20. The founder gave this page to the CTO of a
// two-billion-dollar company with forty to fifty IT contractors bought
// through staffing firms — the exact buyer. He said he did not
// understand what the app does, and that it looked like an AI app.
// "We are SAP Fieldglass" connected at once.
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
// The comparison itself lasted one evening. The page said "If you know
// SAP Fieldglass or Beeline, it is the same job, sized for a company
// with fifty contractors rather than five thousand" and the founder
// read it on his phone and struck it: "Invoking SAP Fieldglass and
// Beeline will trigger more questions than answers." It is a sentence
// he says in a conversation, where he can answer the next question.

/** Every screenshot the page draws, in source order. */
const SCREENS = [...PAGE.matchAll(/\/screens\/[\w-]+\.png/g)].map((m) => m[0])

describe('The page shows the product before it describes it', () => {

  it('shows the product before it describes it: a real screen sits under the hero', () => {
    // The first thing under the headline and the five sentences is a
    // photograph of the thing, taken from the seeded demo, and it comes
    // before the argument starts at #gap.
    const firstImage = PAGE.indexOf('<img')
    const headline = PAGE.indexOf('Every contractor. Every supplier. One record.')
    expect(firstImage, 'there is a screenshot on the page at all').toBeGreaterThan(0)
    expect(firstImage, 'the screen sits under the hero headline').toBeGreaterThan(headline)
    expect(firstImage, 'and before the four steps').toBeLessThan(at('steps'))
    // And it is the client's own dashboard, which is the screen that
    // answers "what is this" in one look. Read off the rendered tag
    // rather than off the data, because the step images are declared at
    // the top of the file and drawn further down.
    const firstDrawn = /src="(\/screens\/[\w-]+\.png)"/.exec(PAGE)?.[1]
    expect(firstDrawn).toBe('/screens/program-dashboard.png')
    expect(
      existsSync(join(process.cwd(), 'public/screens/program-dashboard.png')),
      'public/screens/program-dashboard.png'
    ).toBe(true)
  })

  it('every screenshot on the page is a file that exists under public/screens', () => {
    // A marketing page with a broken image is worse than a page with no
    // image. These are checked in as files, not hotlinked, and a
    // rename that misses one fails here rather than in front of a buyer.
    // Two, since 2026-09-27: the hero's, and one beside the four steps. A
    // CRO read four step screens under the hero screen as "too much data";
    // the other three open their own module pages. Two is also the floor,
    // because screens before sentences still holds.
    expect(new Set(SCREENS).size, 'the page draws two screens').toBe(2)
    for (const src of SCREENS) {
      const file = join(process.cwd(), 'public', src)
      expect(existsSync(file), `${src} is not in public/screens`).toBe(true)
    }
    // Every one carries alternative text and a caption, because the
    // screenshot is the argument and a reader who cannot see it is owed
    // the same argument in words.
    const tags = PAGE.split('<img').slice(1).map((t) => t.slice(0, 700))
    // Two places draw screens since 2026-09-27: the hero, and the one
    // screen beside the four steps.
    expect(tags.length, 'an img tag per place a screen is drawn').toBe(2)
    for (const tag of tags) expect(tag.slice(0, 200), tag.slice(0, 80)).toMatch(/alt=/)
    expect((PAGE.match(/<figcaption/g) ?? []).length).toBe(tags.length)
    // And each image declares a width and a height, so nothing on the
    // page jumps while the screenshots load.
    for (const tag of tags) expect(tag, tag.slice(0, 80)).toMatch(/width=\{1440\}/)
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

  it('the top of the page has at most three sentences before the first screen', () => {
    // Three is the refusal line, since 2026-09-28: the founder asked for a
    // hero that reads in five seconds, and it carries two — the category
    // and the one line saying what the software does. The headline is
    // the line the founder signed off and is not counted; what is counted
    // is everything a reader actually reads between the headline and the
    // first screenshot. It was six while the hook line and a second
    // category sentence sat here.
    const headline = 'Every contractor. Every supplier. One record.'
    const top = PAGE.slice(PAGE.indexOf(headline), PAGE.indexOf('<img'))
    const prose = copyFrom(top).filter((t) => t !== headline)
    const sentences = prose
      .join(' ')
      .split(/(?<=[.!?])\s+/)
      .map((x) => x.trim())
      .filter((x) => /[a-zA-Z]/.test(x))
    expect(sentences.length, sentences.join('\n')).toBeLessThanOrEqual(3)
    // And it is really reading the page, rather than passing on nothing.
    expect(sentences.length).toBeGreaterThanOrEqual(2)
  })

  it('says what it does in four numbered steps a CTO recognizes', () => {
    // Post a role, choose somebody, approve the week, pay the bill.
    // Four is what a buyer can hold; the ten stations of a placement
    // are further down, where somebody who wants them will look.
    expect(PAGE).toContain('const STEPS')
    const steps = PAGE.slice(PAGE.indexOf('const STEPS'), PAGE.indexOf('const JOIN'))
    const numbers = [...steps.matchAll(/n: '(\d\d)'/g)].map((m) => m[1])
    expect(numbers).toEqual(['01', '02', '03', '04'])
    // Each step is one line that leads to its part's page, and the four
    // share one screen, since a buyer's review on 2026-09-27 — a file
    // somebody can open.
    const shots = [...steps.matchAll(/img: '([^']+)'/g)].map((m) => m[1])
    expect(shots).toEqual(['/screens/invoices.png'])
    for (const shot of shots) {
      expect(existsSync(join(process.cwd(), 'public', shot)), shot).toBe(true)
    }
    const leads = [...steps.matchAll(/href: '([^']+)'/g)].map((m) => m[1])
    expect(leads).toEqual(['/requisitions', '/contracts', '/timesheets', '/invoices'])
    for (const route of leads) expect(MODULES.map((m) => m.route), route).toContain(route)
    // The four verbs, in the order the work happens in.
    const said = copyFrom(steps).join(' ')
    expect(said).toContain('Post a role to the suppliers you cleared')
    expect(said).toContain('Interview, choose, and the paperwork is written')
    expect(said).toContain('Contractors file their weeks and your manager approves them')
    expect(said).toContain('Each supplier bills, and you pay what matched')
    // And the section is on the page, before the argument.
    expect(at('steps')).toBeGreaterThan(0)
    expect(at('steps')).toBeLessThan(at('join'))
    // One line each: the step, and nothing under it.
    expect(steps).not.toMatch(/\n    says: '/)
    expect(body).toContain('A role goes out, a person starts, a week is signed, a bill is paid')
    // Every image says where it was taken, so it can be retaken after a
    // redesign rather than quietly going stale.
    expect([...steps.matchAll(/from: '([^']+)'/g)].length).toBe(1)
  })

  it('names the category, no size of company, and no company at all', () => {
    // The subhead named SAP Fieldglass and Beeline for one evening, and
    // the founder struck it: a rival's name invites "how are you
    // different" and "who else uses you", and a page cannot finish that
    // argument. For a day after that it named a size — "for companies
    // with 20 to 200 contractors … sized for fifty contractors rather
    // than five thousand" — and on 2026-09-28 he struck that too: "Don't
    // limit to 50–500 consultants — keep the business open for all." So
    // the reader is told what kind of thing it is, and nothing about who
    // may buy it.
    const category = 'Enterprise contingent workforce management.'
    expect(words[1]).toBe(category)
    expect(sizesTheBuyer(all), sizesTheBuyer(all).join('; ')).toEqual([])
    expect(words.filter((w) => /20 to 200|sized for|rather than five thousand/.test(w))).toEqual([])
    // Nobody is named anywhere, with nothing set aside — no customer,
    // no logo, no comparison.
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

  it('shows the hardest answer to believe as the screen that gives it', () => {
    // Every contractor across every supplier, on one list. It is the
    // claim a reader has least reason to believe from prose, so it is the
    // screen beside the four answers — on About since 2026-09-27.
    const shot = aboutBlock('answered')?.screen
    expect(shot?.img).toBe('/screens/contractors.png')
    expect(existsSync(join(process.cwd(), 'public/screens/contractors.png'))).toBe(true)
    expect(Date.parse(shot!.capturedAt)).toBeGreaterThan(Date.parse('2026-09-20T22:00:00Z'))
    expect(readFileSync(join(process.cwd(), 'src/lib/public-site/company-page.tsx'), 'utf8')).toContain('src={b.screen.img}')
    expect(MODULES.find((m) => m.slug === 'compliance')!.screen.from).toContain('/dashboard/tenure')
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
    // The primary button everywhere leads to the example program's door,
    // where a visitor picks a client desk, and every line that names a
    // company says it is invented.
    expect(SEE_IT.href).toBe('/demo')
    expect(PAGE).toContain('href={SEE_IT.href as Route}')
    expect(CLOSE_BAND.line).toContain('a demo company — not a customer')
    expect(PAGE).toContain('Northbend Athletic; every firm on this screen is a demo company — not a customer.')
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

  it('keeps the contractor’s own door on the page, quieter than both company doors', () => {
    // A person who is the work is not an audience to drop off a page
    // written to the company hiring. It stays a text link, never a button,
    // and `__tests__/invariants/demo-candidate.test.ts` holds it too.
    expect((PAGE.match(/side="CANDIDATE"/g) ?? []).length).toBeGreaterThanOrEqual(1)
    expect(PAGE).not.toMatch(/side="CANDIDATE"[\s\S]{0,240}bg-etyme-action/)
  })

  it('says each quieter door as a whole question, so a reader who never sees the button still reads a finished sentence', () => {
    // A buyer-side review, 2026-09-27: "If you supply into a program
    // instead" had no verb, and the two buttons after it are skipped by a
    // reader mode or a text extract, so the page read as if it had broken.
    const door = (side: string) => {
      const i = PAGE.indexOf(`side="${side}"`)
      const para = PAGE.lastIndexOf('<p ', i)
      return copyFrom(PAGE.slice(para, i)).join(' ')
    }
    expect(door('BENCH')).toBe('Supply people to a program instead?')
    expect(door('CANDIDATE')).toBe('Work in a program as a contractor?')
    for (const side of ['BENCH', 'CANDIDATE']) {
      expect(withoutVerb([door(side).replace(/\?$/, '')]), side).toEqual([])
    }
    expect(copyFrom(PAGE).join(' ')).not.toContain('If you supply into a program instead')
  })

  it('keeps the supplier door second and quieter than the client one', () => {
    // A supplier is welcome and is not who this page is written to.
    expect(PAGE).toContain('Supply people to a program instead?')
    expect(PAGE).toContain('side="BENCH"')
    expect(PAGE.indexOf('{`${SEE_IT.t} →`}'))
      .toBeLessThan(PAGE.indexOf('Supply people to a program instead?'))
    expect(PAGE).not.toMatch(/side="BENCH"[\s\S]{0,240}bg-etyme-action/)
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
    21: 'Twenty-one', 22: 'Twenty-two', 23: 'Twenty-three', 24: 'Twenty-four',
    25: 'Twenty-five', 26: 'Twenty-six',
  }

  it('counts the things that happen without anybody asking, and says that number on the page', () => {
    expect(unprompted.length).toBeGreaterThan(0)
    expect(
      GOVERNANCE_PAGE,
      `the automation ladder now has ${unprompted.length} unprompted actions`
    ).toContain(`${NUMBERS[unprompted.length]} things in here happen without anybody asking`)
    // On the governance page since 2026-09-27, and computed there from
    // the same ladder rather than typed, so it cannot go stale. This
    // test still reads it against the ladder with its own table of words.
    expect(spelled(unprompted.length)).toBe(NUMBERS[unprompted.length].toLowerCase())
    expect(body).not.toContain('things in here happen without anybody asking')
  })

  it('says how many of those are a plain rule rather than a model', () => {
    expect(
      GOVERNANCE_PAGE,
      `${byRule.length} of ${unprompted.length} unprompted actions are decided by a rule`
    ).toContain(`${NUMBERS[byRule.length]} of the ${NUMBERS[unprompted.length].toLowerCase()} are a date, a threshold or a count`)
  })

  it('says what the one that is not a rule does, rather than leaving it to the imagination', () => {
    const notARule = unprompted.filter((a) => a.basis !== 'RULE')
    expect(notARule.length).toBe(1)
    expect(notARule[0].says.toLowerCase()).toContain('scored people against an open role')
    expect(GOVERNANCE_PAGE).toContain('scores a person against a role')
    expect(GOVERNANCE_PAGE).toContain('falls back to arithmetic')
  })

  it('states the denominator, because it is the automation log and not the whole product', () => {
    expect(GOVERNANCE_PAGE).toContain('without anybody asking for them')
    expect(GOVERNANCE_PAGE).not.toContain('About half of what looks like AI')
    expect(all).not.toContain('About half of what looks like AI')
  })

  it('still never leads with the model, and still says what it may not decide', () => {
    expect(check(live).map((f) => f.rule)).not.toContain('never-lead-with-ai')
    const governance = copyOfModule(MODULES.find((m) => m.slug === 'governance')!)
    expect(check(governance).map((f) => f.rule)).not.toContain('never-lead-with-ai')
    expect(GOVERNANCE_PAGE).toContain('Never decides whether someone can legally work')
  })
})

// ── The header ────────────────────────────────────────────────────────

describe('The header reads as an enterprise product, not a job board', () => {

  it('is the shared header, organized as Product, Solutions, Resources and Company', () => {
    // Decided 2026-09-27, from the marketing thread's structure. The home
    // page draws the one header every public page draws, so the two can
    // no longer say different things; `public-pages.test.ts` holds the
    // groups inside each menu.
    expect(PAGE).toContain('<SiteHeader />')
    expect(SITE_MENUS.map((m) => m.label)).toEqual(['Product', 'Solutions', 'Resources', 'Company'])
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
    // position on a deal and not a property of a firm.
    expect(SEE_IT.t).toBe('See it with a month of data')
    expect(PAGE).toContain('{`${SEE_IT.t} →`}')
    expect(PAGE).not.toContain('See it as the supplier')
    expect(PAGE).not.toContain('See it as the company')
  })

  it('sends every header link to a page that exists, or a section that exists on it', () => {
    // The thread's roles led to anchors on its home page that were never
    // written. Every header link here is a route with a file behind it.
    for (const m of SITE_MENUS) {
      for (const g of m.groups) {
        for (const i of g.items) {
          const path = i.href.split('#')[0]
          const candidates = ['', '(site)'].map((group) => join(process.cwd(), 'src/app', group, path.slice(1), 'page.tsx'))
          const docs = path.startsWith('/docs/') && existsSync(join(process.cwd(), 'src/app/(site)/docs/[slug]/page.tsx'))
          expect(candidates.some(existsSync) || docs, i.href).toBe(true)
        }
      }
    }
  })

  it('names industries as one product used across them, never a vertical feature', () => {
    // "Horizontal, never vertical." The Industries menu went on
    // 2026-09-27 — four items leading to one place — and the sentence
    // under it is said on About, where it is a fact about the company.
    expect(SITE_MENUS.map((m) => m.label)).not.toContain('Industries')
    expect(ABOUT_PAGE).toContain('One product serves every industry. There is no industry-specific version to buy.')
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
    // Four bands are written here; the close and the frame are held to
    // the same rule in their own files.
    for (const src of [PAGE, CLOSE_SRC, FRAME_SRC]) {
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

describe('The footer is where a company keeps its papers', () => {

  it('a visitor can reach the terms and the privacy notice from the home page', () => {
    expect(FOOTER_LINKS).toContain('/terms')
    expect(FOOTER_LINKS).toContain('/privacy')
    // And the home page draws that footer, and the footer draws the list,
    // rather than it sitting in a file as data nothing renders.
    expect(PAGE).toContain('<SiteFooter />')
    expect(FOOTER_JSX).toContain('FOOTER.map')
  })

  it('offers the data processing addendum too, because that is the document a buyer’s counsel asks for', () => {
    expect(FOOTER_LINKS).toContain('/dpa')
  })

  it('says the legal documents are drafts before somebody clicks one, not after', () => {
    expect(FOOTER_WORDS).toContain('not yet reviewed by a lawyer')
    expect(FOOTER_JSX).toContain('group.note')
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
        const isDoc = docsSlug !== null && (DOCS_SLUGS as readonly string[]).includes(docsSlug)
        expect(candidates.some(existsSync) || isDoc, `no page for ${href}`).toBe(true)
      }
    }
  })

  it('gives a visitor a way to reach a person, and it is the one channel that exists', () => {
    // Alerts go out to staff and nothing came in from a prospect except
    // this box, which somebody reads and answers. It sits beside the
    // home page's close, and the footer leads to the contact page, which
    // carries the same box.
    expect(FOOTER_LINKS).toContain('/contact')
    expect(PAGE).toContain('<CloseBand id="close" withForm>')
    expect(CLOSE_SRC).toContain('id="contact"')
    expect(CLOSE_SRC).toContain('<Ask source="HOME_PAGE" />')
  })

  it('invents no support mailbox, no office and no social account', () => {
    // The one mailbox the footer shows is the one Contact already names.
    expect(FOOTER_WORDS.toLowerCase()).not.toMatch(/linkedin|twitter|x\.com|facebook|status\.|careers|\babout us\b/)
    expect([...FOOTER_JSX.matchAll(/mailto:/g)].length).toBeLessThanOrEqual(1)
    expect(FOOTER_JSX).toContain('mailto:${ADDRESS.email}')
  })

  it('names the company and the year rather than a hardcoded copyright that goes stale', () => {
    expect(FOOTER_JSX).toContain('ADDRESS.company')
    expect(FOOTER_JSX).toContain('new Date().getFullYear()')
  })

  it('says what Etyme is in the footer, in the words from CLAUDE.md', () => {
    // Somebody who scrolled past the hero and read nothing else still
    // leaves knowing the category.
    expect(FOOTER_JSX).toContain('The system of record for contingent workers')
  })

  it('repeats the neutrality commitment where a supplier reading the page will see it', () => {
    expect(FOOTER_JSX).toContain('never runs a bench and never places anybody')
  })

})

// ── The four sentences the founder reads ──────────────────────────────

describe('The public page still says the four things it may not stop saying', () => {

  it('the home page names what Etyme is before it names anything it does', () => {
    expect(words[1]).toBe('Enterprise contingent workforce management.')
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
    expect(FOOTER_JSX).toContain('never runs a bench and never places anybody')
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
// read like a Microsoft or SAP product page, not a long essay. Measured
// on production that day it was 3,771 words in twelve bands and the file
// was 1,709 lines. A product page from either company is roughly six
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
 * test: the JSX between the header and the footer, the data it draws
 * (without alt text, capture stamps and routes, which a sighted reader
 * never sees), the two quiet doors' labels, the close band's words from
 * the funnel, the ask form's own words, and the eight tiles' stage
 * headings, names and lines, which are drawn from the header's Product
 * menu data — they left the page on 2026-09-27 and came back on
 * 2026-09-28.
 */
function readerWords(): number {
  const count = (t: string) => t.split(/\s+/).filter((x) => /[A-Za-z0-9]/.test(x)).length
  const noComments = (t: string) =>
    t.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const jsx = noComments(PAGE.slice(PAGE.indexOf('<SiteHeader />'), PAGE.indexOf('<SiteFooter />')))
  const data = noComments(PAGE.slice(PAGE.indexOf('const STEPS'), PAGE.indexOf('export default function')))
    .split('\n')
    .filter((l) => !/^\s*(alt|from|capturedAt|proof|source|img|route):/.test(l))
    .filter((l) => !/says: '(W-9|GST and PAN|VAT position)'/.test(l))
    .join('\n')
  const labels = [...jsx.matchAll(/label="([^"]+)"/g)].map((m) => m[1])
  const hero = [SEE_IT.t, GET_THE_AUDIT.t]
  const close = [...closeBandCopy(), GET_THE_AUDIT.d]
  const ask = [ASK_COPY.eyebrow, ASK_COPY.heading, ASK_COPY.body,
    ASK_COPY.emailLabel, ASK_COPY.emailHint, ASK_COPY.askLabel, ASK_COPY.askHint, ASK_COPY.button]
  return [copyFrom(jsx), copyFrom(data), labels, hero, close, ask, TILE_COPY].reduce((n, part) => n + count(part.join(' ')), 0)
}

/** The most words the home page may carry between its header and footer. */
const CEILING = 555

/** The source of one band, from its anchor to the next band's. */
function band(id: string): string {
  const start = at(id)
  const ends = ['<section', '<CloseBand', '<SiteFooter']
    .map((tag) => PAGE.indexOf(tag, start + 1))
    .filter((i) => i > 0)
  return PAGE.slice(start, Math.min(...ends))
}

describe('The home page reads as a product page, and every band leads deeper', () => {

  it('the home page is five bands and under 560 words, and the eight parts are one band of tiles a line each', () => {
    // The ceiling is 555 words between the header and the footer, and
    // this is the arithmetic. On 2026-09-27 the founder said the page was
    // still too big at 1,280 words in seven bands, and the target he was
    // given is about five hundred. It went to five bands at 582 words the
    // same afternoon. That evening a CRO he showed it to said it was "too
    // much data", so the eight-part tile band — about ninety words of names
    // and lines the header's Product menu already carries — left the page,
    // and so did three of the four step screens and their captions: 434.
    // Then one outcome line, the price link saying what it answers, and a
    // caption on each screen saying every firm on it is a demo company —
    // not a customer: 463.
    //
    // On 2026-09-28 the founder brought the tiles back — "it was one
    // section that was nice and also made quick sense" — and paid for them
    // in the hero: "less theory there". The hook line (twenty-two words)
    // and the second category sentence (twelve) left, the category became
    // four words, and the outcome became a description. The tiles cost
    // 122 words as they stood in the menu, so every tile line was cut to
    // one sentence of at most eleven words (the menu's lines with them),
    // and they cost about a hundred. A line pointing a skeptical reader at
    // the public documentation and the security position was added to the
    // close, fifteen words. 549, against 582 the last time the tiles were
    // on the page.
    //
    // The CRO's "too much data" still binds: the tiles carry no
    // screenshots, and each is a name and one line.
    //
    // About sixty of those are the ask form's own labels and promise beside
    // the close ("your email", "what do you need", "nothing you send starts
    // a sequence"), which are the form rather than prose to cut. The
    // ceiling sits a few words above the count and no more: room to
    // fix a line, never room for a band. A band that needs more words than
    // this needs a page of its own.
    const words = readerWords()
    expect(words, `${words} words between the header and the footer`).toBeLessThanOrEqual(CEILING)
    // And the reader is really reading the page, not passing on nothing.
    expect(words).toBeGreaterThan(400)

    // Five bands: the hero, the steps, the eight parts, the line about
    // teams around the world, and the close every public page ends in.
    const sections = (PAGE.match(/<section/g) ?? []).length
    const closes = (PAGE.match(/<CloseBand/g) ?? []).length
    expect(sections + closes, 'five bands').toBe(5)
    expect(closes, 'the page ends in the shared close').toBe(1)
    expect(PAGE.lastIndexOf('<section')).toBeLessThan(PAGE.indexOf('<CloseBand'))
    expect((PAGE.match(/<h2/g) ?? []).length, 'one headline per band under the hero').toBe(3)
    for (const gone of ['gap', 'ways']) expect(PAGE, `#${gone} is still on the home page`).not.toContain(`id="${gone}"`)
    // Each tile is one line: one sentence of description under its name.
    for (const item of PRODUCT_ITEMS) {
      expect(item.d, item.t).toBeTruthy()
      expect(item.d!.split(/(?<=[.!?])\s+/).length, item.d).toBe(1)
      expect(longSentences(item.d!, 11), item.d).toEqual([])
    }

    // Every band leads to a page that goes deeper, except the quiet one,
    // which the founder asked to carry no button of its own.
    const deeper = /href=\{?\s*['"`(]*\/[a-z]|href=\{s\.href/
    expect(band('steps'), '#steps links to no page').toMatch(deeper)
    expect(band('modules'), '#modules links to no page').toMatch(/href=\{m\.href as Route\}/)
    expect(CLOSE_SRC).toContain('href={SEE_IT.href}')

    // The eight parts on the page are the header's Product menu, drawn
    // from the same data: the same four stages, the same eight names.
    expect(band('modules')).toContain('PRODUCT_STAGES.map')
    expect(SITE_MENUS[0].label).toBe('Product')
    expect(SITE_MENUS[0].groups).toBe(PRODUCT_STAGES)
  })

  it('every section taken off the home page lives on a public page', () => {
    // Moved, not deleted. Each row is a section that was on the home page
    // until 2026-09-27, the anchor it had, the page and anchor it went
    // to, and a phrase from it that must be found there.
    const MOVED: { was: string; to: string; anchor: string | undefined; text: string; phrase: string }[] = [
      { was: 'exposure', to: '/compliance', anchor: moreOn('compliance')?.id, text: COMPLIANCE_PAGE,
        phrase: 'A co-employment claim counts every supplier together' },
      { was: 'lifecycle', to: '/about', anchor: aboutBlock('hire')?.id, text: ABOUT_PAGE,
        phrase: 'One hire moves through six milestones, and three of them can stop it' },
      { was: 'alongside', to: '/about', anchor: aboutBlock('alongside')?.id, text: ABOUT_PAGE,
        phrase: 'Keep your ATS, your VMS and every supplier you already use' },
      { was: 'who', to: '/chain', anchor: moreOn('chain')?.id, text: CHAIN_PAGE,
        phrase: 'A blind key lets two competing suppliers' },
      { was: 'compliance', to: '/governance', anchor: moreOn('governance')?.id, text: GOVERNANCE_PAGE,
        phrase: 'Most of what runs without being asked is a rule, not a model' },
      { was: 'why', to: '/about', anchor: aboutBlock('price')?.id, text: ABOUT_PAGE,
        phrase: 'Looking around costs nothing and needs no card' },
      { was: 'gap (the long form)', to: '/about', anchor: aboutBlock('unanswered')?.id, text: ABOUT_PAGE,
        phrase: 'You can name every employee on your payroll' },
      // The second move, 2026-09-27 afternoon: five bands.
      { was: 'gap', to: '/about', anchor: aboutBlock('answered')?.id, text: ABOUT_PAGE,
        phrase: 'The Workforce screen lists every contractor on site today, across every supplier.' },
      { was: 'ways', to: '/about', anchor: aboutBlock('ways')?.id, text: ABOUT_PAGE,
        phrase: 'Most clients staff the program office themselves.' },
      { was: 'the hero’s span line', to: '/about', anchor: aboutBlock('build')?.id, text: ABOUT_PAGE,
        phrase: 'One record holds all of it, and each desk opens the part that is its own.' },
      // The third move, 2026-09-28: the hook line left the hero for About,
      // where the not-knowing was already said in full.
      { was: 'the hero’s hook line', to: '/about', anchor: aboutBlock('unanswered')?.id, text: ABOUT_PAGE,
        phrase: 'three weeks of asking every supplier' },
    ]
    for (const m of MOVED) {
      expect(m.anchor, `#${m.was} has no section on ${m.to}`).toBeTruthy()
      expect(m.text, `#${m.was} on ${m.to}`).toContain(m.phrase)
    }
    // The sections that left have no anchor here any more — except #why,
    // which is the one line on price the close still carries, and
    // #modules, which left on 2026-09-27 and came back the next day.
    expect(SITE_MENUS[0].groups).toBe(PRODUCT_STAGES)
    expect(PRODUCT_STAGES.flatMap((g) => g.items)).toHaveLength(8)
    for (const gone of ['exposure', 'lifecycle', 'monday', 'alongside', 'who', 'compliance', 'gap', 'ways']) {
      expect(PAGE, `#${gone} is still on the home page`).not.toContain(`id="${gone}"`)
    }
    // Each destination is a registered public page, so the guard reads it.
    for (const route of ['/compliance', '/about', '/chain', '/governance']) {
      expect(existsSync(join(process.cwd(), 'src/app/(site)', route.slice(1), 'page.tsx')), route).toBe(true)
    }
    // And the three gates that were quoted here are each quoted on the
    // page for their station, which the public-pages guard reads against
    // the source file.
    expect(MODULES.find((m) => m.slug === 'contracts')!.refuses.some((r) => r.phrase === 'cannot start without')).toBe(true)
  })

  it('the eight parts are back on the home page as one band of tiles, grouped the way the Product menu groups them, with no screenshot in any tile', () => {
    // "Sections — it was one section that was nice and also made quick
    // sense." The founder, 2026-09-28, the day after the band left for the
    // header's Product menu. It is drawn from that menu's own data, so the
    // two cannot group or name a part differently.
    expect(PAGE).not.toContain('const TILES')
    const tiles = band('modules')
    expect(at('modules')).toBeGreaterThan(at('steps'))
    expect(at('modules')).toBeLessThan(at('join'))
    expect(tiles).toContain('PRODUCT_STAGES.map')
    expect(tiles).toContain('{stage.heading}')
    expect(tiles).toContain('{m.t}')
    expect(tiles).toContain('{m.d}')
    expect(PRODUCT_STAGES.map((g) => g.heading)).toEqual(['Source', 'Start', 'Work and pay', 'Govern'])
    // No screenshots in the tiles — the CRO's "too many screens" — and the
    // only picture is the kit's icon, one per part, hidden from a screen
    // reader because the name beside it says the same thing.
    expect(tiles).not.toMatch(/<img|\/screens\//)
    expect(tiles).toContain('<ModuleIcon href={m.href}')
    for (const m of PRODUCT_ITEMS) expect(Object.keys(MODULE_ICON), m.href).toContain(m.href)
    expect(ICONS_SRC).toContain('aria-hidden="true"')
    expect(ICONS_SRC).toContain('stroke="currentColor"')
    expect(ICONS_SRC).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/)
    // Each tile opens its part's page.
    expect(MODULES).toHaveLength(8)
    expect(PRODUCT_ITEMS.map((i) => i.href)).toEqual(MODULES.map((m) => m.route))
    for (const m of MODULES) {
      const item = PRODUCT_ITEMS.find((i) => i.href === m.route)
      expect(item?.t, m.route).toBe(m.title)
      expect(item?.d, `${m.route} has no line`).toBeTruthy()
      expect(existsSync(join(process.cwd(), 'public', m.screen.img)), m.screen.img).toBe(true)
    }
    // And the page still leads into them: each of the four steps is a
    // link to the part it names, drawn inside the steps band.
    expect(PAGE).toContain('href={s.href as Route}')
    expect(PAGE.indexOf('STEPS.map')).toBeGreaterThan(at('steps'))
    expect(PAGE.indexOf('STEPS.map')).toBeLessThan(at('join'))
    // The three step screens that left the page are each the screen their
    // own module page opens on.
    for (const shot of ['/screens/submissions.png', '/screens/timesheets.png']) {
      expect(MODULES.map((m) => m.screen.img), shot).toContain(shot)
    }
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

  it('the line about teams around the world claims nothing the record cannot do', () => {
    const said = JOIN_LINES.join(' ')
    expect(JOIN_LINES.length, 'one or two sentences under the line').toBeGreaterThanOrEqual(1)
    expect(JOIN_LINES.length).toBeLessThanOrEqual(2)

    // Every document it names is one the record asks for, by that
    // country, in the file that decides it — which `/api/packets` uses.
    const backed = [...JOIN_SRC.matchAll(
      /says: '([^']+)', country: '([A-Z]{2})', source: '([^']+)', proof: "([^"]+)"/g
    )]
    expect(backed.length, 'each named document is backed by the source').toBe(3)
    for (const [, says, country, source, proof] of backed) {
      expect(said, `the page names ${says}`).toContain(says)
      const src = readFileSync(join(process.cwd(), source), 'utf8')
      expect(src, `${source} asks for ${says}`).toContain(proof)
      expect(src, `${source} has rules for ${country}`).toContain(`c.country === '${country}'`)
    }
    expect(existsSync(join(process.cwd(), 'src/app/api/packets/route.ts'))).toBe(true)
    expect(readFileSync(join(process.cwd(), 'src/app/api/packets/route.ts'), 'utf8')).toContain('packet-derivation')

    // And what the record does not do is not said: a company carries one
    // currency, nothing runs payroll per country, and nobody has counted
    // the countries.
    expect(said).not.toMatch(/currenc|payroll|\b\d+\s+countries|every country|all countries|any country|worldwide|localized|local entit/i)
    // Nor does it read as Etyme placing anybody, or as aimed at a supplier.
    expect(check(copy(['Contingent workforce management'], JOIN_LINES)).map((f) => f.rule)).not.toContain('neutrality')
    expect(readsAsAimedAtSuppliers(said)).toEqual([])
    expect(offersTheProgramOffice(said)).toEqual([])
    // It reads to both sides at once: a client working with suppliers
    // elsewhere, and a supplier serving clients elsewhere.
    expect(said).toMatch(/A client can work with suppliers/)
    expect(said).toMatch(/a supplier can serve clients/)
  })

  it('the band carries the founder’s line exactly, quietly, below the module tiles and with no button of its own', () => {
    expect(at('join')).toBeGreaterThan(at('modules'))
    expect(JOIN_SRC).toContain("heading: 'Join forces with global teams around the world.'")
    const join = band('join')
    // A headline in a band, never the page's h1 and never the hero.
    expect(join).toContain('<h2')
    expect(join).toContain('{JOIN.heading}')
    expect(join).not.toContain('<h1')
    // Quieter than the other bands: a size under their headlines.
    expect(join).not.toMatch(/md:text-\[40px\]/)
    // No button, no link and no demo door of its own.
    expect(join).not.toMatch(/<Link|href=|<button|<TryDemo|bg-etyme-action/)
    // Below the tiles, above the two ways.
    expect(at('join')).toBeGreaterThan(at('steps'))
    expect(at('join')).toBeLessThan(at('close'))
    // The heading and its two sentences sit side by side on a wide
    // screen and stack on a phone.
    expect(join).toMatch(/md:grid-cols-/)
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
    // mural moves with the kit: ink line work on the canvas, and at most
    // a violet touch and an orange one. Never the logo's vivid green,
    // never the navy the kit removed from its tokens.
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
    // Only the ink color is ever a fill or stroke by name: everything else
    // is currentColor off the root, which is set to the ink variable.
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

  it('the mural runs the full width of the band, the way the kit’s mural does', () => {
    const join = band('join')
    expect(join).toContain('<JoinMural />')
    // The mural is not inside the page's max-width column: its wrapper is
    // the band's own full width, after the column that holds the words.
    const wrapper = join.slice(0, join.indexOf('<JoinMural />'))
    const last = wrapper.lastIndexOf('<div')
    expect(wrapper.slice(last)).toMatch(/w-full/)
    expect(wrapper.slice(last)).not.toMatch(/max-w-/)
    const column = wrapper.lastIndexOf('max-w-6xl')
    expect(column, 'the words keep their column').toBeGreaterThan(-1)
    expect(wrapper.slice(column).split('</div>').length - 1, 'the column is closed before the mural').toBeGreaterThanOrEqual(2)
    // And the drawing itself fills the width it is given.
    expect(ART_SRC).toMatch(/className="[^"]*\bw-full\b/)
    // Nothing sideways: the wrapper clips rather than scrolling the page.
    expect(wrapper.slice(last)).toMatch(/overflow-hidden/)
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

// ── The mural, where the founder looks for it ─────────────────────────
//
// 2026-09-28: "Add mural back near join with global teams." It had never
// left the code. Measured on `next start` it drew at 1440 by 384 and at
// 390 by 210, directly under the heading and its two sentences — so these
// hold where it is and that it has a size of its own, rather than a
// browser's guess from a viewBox.

describe('The mural sits under the founder’s line', () => {

  it('the mural is drawn directly under the heading and its two sentences, with nothing between them', () => {
    const join = band('join')
    const heading = join.indexOf('{JOIN.heading}')
    const lines = join.indexOf('JOIN.lines.map')
    const mural = join.indexOf('<JoinMural />')
    expect(heading).toBeGreaterThan(0)
    expect(lines).toBeGreaterThan(heading)
    expect(mural).toBeGreaterThan(lines)
    // Nothing a reader sees between the sentences and the drawing.
    const between = join.slice(join.indexOf('</div>', lines), mural)
    expect(copyFrom(between.replace(/\{\/\*[\s\S]*?\*\/\}/g, ''))).toEqual([])
    expect(between).not.toMatch(/<img|<Link|<p |<h\d/)
    // His heading, exactly.
    expect(JOIN_SRC).toContain("heading: 'Join forces with global teams around the world.'")
  })

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
  for (const slug of docSlugs()) {
    const c = copyOfDoc(slug)
    if (c) out.push([`/docs/${slug}`, [...c.hero, ...c.body].join(' ')])
  }
  out.push(['the header and footer', frameCopy().join(' ')])
  out.push(['the close band', [...closeBandCopy(), SEE_IT.d, GET_THE_AUDIT.d].join(' ')])
  out.push(['/census', JSON.stringify(CENSUS_COPY)])
  return out
}

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
    // every flow in public documentation, and a security position that
    // says what is not done yet. No certification, no uptime, no customer
    // count, and never /ready, which is the operator's page.
    const close = PAGE.slice(PAGE.indexOf('<CloseBand'))
    expect(close).toContain("href={'/docs' as Route}")
    expect(close).toContain("href={'/security' as Route}")
    expect(all).toContain('the security position says what is not built yet')
    expect(existsSync(join(process.cwd(), 'src/app/(site)/security/page.tsx'))).toBe(true)
    expect(existsSync(join(process.cwd(), 'src/app/(site)/docs/page.tsx'))).toBe(true)
    expect(PAGE).not.toMatch(/href=\{?['"]\/ready/)
    expect(all).not.toMatch(/\b(?:SOC ?2|ISO ?27001|certified|uptime|99\.\d+%|customers? (?:trust|use))\b/i)
    expect(all).toContain('No card. No sign-up.')
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
