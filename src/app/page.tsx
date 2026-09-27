import { EtymeLogo } from '@/components/logo'
import { TryDemo } from '@/components/try-demo'
import { Ask } from '@/app/site/ask'
import { ASK_COPY } from '@/lib/public-site/leads'
import { MODULES } from '@/lib/public-site/modules'
import Link from 'next/link'
// Typed routes widen a string in an array to `string`, which Link will not
// take. The footer's routes are literals below; the cast is at the render
// rather than on the data so the list stays readable.
import type { Route } from 'next'

/**
 * The front door.
 *
 * ── A product page, not an essay. Rewritten 2026-09-27 ───────────────
 *
 * The founder: the home page is too long and should read like a
 * Microsoft or SAP product page, not a long essay. Measured on
 * production that day it was 3,771 words in twelve bands. A product page
 * from either company is roughly six hundred to nine hundred words in
 * five or six bands, and it can be that short because every band links
 * to a page that goes deeper. The day before, those pages went live:
 * eight module pages, the documentation, the security position, About.
 *
 * So this was mostly moving, not deleting. What it argues now, in order:
 *
 *   1. what is this        the hero, unchanged — the category, the size, a screen
 *   2. what does it do     #steps — four steps, each one a real screen
 *   3. what is in it       #modules — eight tiles, each leading to its page
 *   4. why do I care       #gap — four questions, each answered in a line
 *   5. where can it reach  #join — the founder's line, quietly
 *   6. who runs it         #ways — your own program office, or Etyme's
 *   7. the door            #close — the demo, the census, one line on price, a person
 *
 * Where each section that left went, so nobody re-adds it here:
 *
 *   #exposure   what it costs when nobody can answer   → /compliance#cost
 *   #lifecycle  one hire, six milestones               → /about#hire
 *   gates       the three refusals, quoted             → each module's "What it refuses"
 *   #monday     four screens answer the four questions → merged into #gap, a line each
 *   #alongside  keep your ATS, your VMS, your suppliers → /about#alongside
 *   #who        the chain, and a line per supplier role → /chain#down-the-chain
 *   #compliance most of what runs is a rule            → /governance#rules
 *   #why        what is settled about the money        → /about#price, one line kept here
 *   #gap prose  why nobody can answer today            → /about#unanswered
 *
 * `positioning.test.ts` holds a word ceiling and a band ceiling on this
 * page, and finds each moved phrase where it went.
 *
 * ── A real buyer read it. Rewritten 2026-09-20 ───────────────────────
 *
 * The founder gave this page to the CTO of a two-billion-dollar company
 * with forty to fifty IT contractors bought through staffing firms —
 * the exact buyer. He said he did not understand what the app does, and
 * that it looked like an AI app. So: screens before sentences, and the
 * category and the size with no company named. Both are guarded in
 * `lib/positioning`. The comparison to the incumbents is a sentence the
 * founder says in a conversation, where he can answer the next question.
 *
 * ── Outcomes, benefits and methods. Rewritten 2026-09-20 ─────────────
 *
 * "The home page is filled with metaphors rather than outcomes, benefits
 * and methods." Every sentence here says an outcome, a benefit or a
 * method, or is a proof: a demo desk, a screen name. Sentences are about
 * twenty words, because the reader may be reading English as a second
 * language and reads it once.
 *
 * ── Tenure is the moat, not the wedge. Corrected 2026-09-17 ──────────
 *
 * Tenure is one question of four and gets one line. A page that leads
 * with it sells a fear the buyer does not hold.
 *
 * ── The program office is offered quietly. Decided 2026-09-20 ────────
 *
 * "MSP selling should be undercover selling and more as value addition
 * rather than fully pitching for the market. Remove the threat if any to
 * supply chain." The record is what this page sells. The service is one
 * quiet sentence in the hero and one card in #ways, in the founder's two
 * labels, and nothing sizes Etyme against anybody.
 *
 * ── Written to the client ────────────────────────────────────────────
 *
 * The client is the customer, decided 2026-09-10. Suppliers read over
 * its shoulder, and the one paragraph they must read — their rates and
 * their sub-vendors' names stay private, their client stays theirs —
 * sits beside the offer to run a program, which is where a supplier
 * would otherwise read a threat.
 *
 * ── Every claim here is checkable ────────────────────────────────────
 *
 * Numbers are what the seeded sandbox produces. Nothing here draws a
 * feature that does not exist. No real company is named; the three
 * programs named at the door are invented firms the seed builds.
 */

/**
 * The header nav — Products, Industries, Compliance, Why Etyme.
 *
 * The flat six-word module list it replaced named stations with nothing
 * organizing them. An enterprise buyer evaluating a system of record
 * expects this shape. Since 2026-09-26 the items lead to the module
 * pages, the security position and About, which exist; the menus are the
 * same as every other public page's (`lib/public-site/nav`), and a test
 * holds the two lists equal. A `#` link is a section on this page.
 *
 * Industries is deliberately not a set of vertical product pages — the
 * core stays horizontal, and the note under the menu says so. Its items
 * lead to the eight parts of the one product, which serve every
 * industry the same way.
 */
const NAV_MENUS: { label: string; items: { t: string; d?: string; href: string }[]; note?: string }[] = [
  {
    label: 'Products',
    items: [
      { t: 'Requisitions & suppliers', d: 'Raised, cleared by rule or by a desk, released to the suppliers Procurement named.', href: '/requisitions' },
      { t: 'Submissions & screening', d: 'Every supplier against the same role, on one screen, each at its own rate.', href: '/submissions' },
      { t: 'Contracts & onboarding', d: 'The award writes the contract. The papers are checked before day one.', href: '/contracts' },
      { t: 'Timesheets & expenses', d: 'Filed once, signed twice, flagged first. Nobody approves their own.', href: '/timesheets' },
      { t: 'Invoices & the three-way match', d: 'An invoice with no signed week behind it is not paid.', href: '/invoices' },
      { t: 'Compliance & tenure', d: 'Counted per person across suppliers, warned at three quarters, blocked at your cap.', href: '/compliance' },
      { t: 'The chain', d: 'Each firm sees its own level. Insurance and authorization are visible at every depth.', href: '/chain' },
      { t: 'Governance', d: 'Blocks where the law is behind it, warns everywhere else, records even a pass.', href: '/governance' },
    ],
  },
  {
    label: 'Industries',
    items: [
      { t: 'Manufacturing & quality', href: '#modules' },
      { t: 'Healthcare & clinical', href: '#modules' },
      { t: 'Skilled trades & field services', href: '#modules' },
      { t: 'Professional & corporate services', href: '#modules' },
    ],
    note: 'One product. No industry-specific version to buy.',
  },
  {
    label: 'Compliance',
    items: [
      { t: 'Work authorization', d: 'Blocked, not warned, where the law is behind it.', href: '/contracts' },
      { t: 'Co-employment & time on site', d: 'Counted per person across suppliers, not per assignment.', href: '/compliance' },
      { t: 'Insurance & good standing', d: 'A lapsed certificate of insurance or good standing stops a submission and a start.', href: '/governance' },
      { t: 'Security position', d: 'What is done, what is not, and when.', href: '/security' },
      { t: 'Data processing addendum', d: 'Retention by category, and who processes what.', href: '/dpa' },
    ],
  },
  {
    label: 'Why Etyme',
    items: [
      { t: 'About Etyme', d: 'What we build, how we work, where we are.', href: '/about' },
      { t: 'Never runs a bench, never places anybody', href: '/about#neutral' },
      { t: 'Governance is never a paid tier', href: '/governance' },
      { t: 'Free while we prove it out', href: '#why' },
      { t: 'Contact', d: 'Durham, North Carolina. A person answers.', href: '/contact' },
    ],
  },
]

/**
 * What it does, in four steps, each one a real screen.
 *
 * A CTO recognizes post, choose, approve, pay. Each step is one or two
 * sentences and one screenshot from the seeded demo, tightened on
 * 2026-09-27 when the page became a product page. `from` is the desk and
 * the route the image came from, so anybody can retake it: seat at
 * Northbend Athletic with `POST /api/demo {"as":"world-nike","desk":"..."}`
 * and screenshot the route at 1440×900.
 *
 * Nothing in a caption is a claim the image does not show. The numbers
 * in them are read off the screenshots themselves.
 */
const STEPS: {
  n: string
  t: string
  says: string
  img: string
  alt: string
  caption: string
  from: string
  /**
   * When the image was taken, UTC. Pinned because the seeded world it
   * was photographed from is renamed from time to time, and a PNG cannot
   * be read by a test. The date is what catches a stale shot.
   */
  capturedAt: string
}[] = [
  {
    n: '01',
    t: 'Post a role to the suppliers you cleared',
    says: 'Release a role to the suppliers procurement cleared. Every person arrives on one screen with their firm and its rate.',
    img: '/screens/submissions.png',
    alt: 'A Candidates screen: nine people from three suppliers, each row naming the consultant, the role, the supplier, the rate and the stage.',
    caption: 'Nine people from three suppliers, each at the rate asked.',
    from: '/dashboard/submissions as the hiring manager',
    capturedAt: '2026-09-21T15:15:10Z',
  },
  {
    n: '02',
    t: 'Interview, choose, and the paperwork is written',
    says: 'Interview on the record. The award writes the contract against the order that holds the ceiling.',
    img: '/screens/purchase-orders.png',
    alt: 'An orders screen: one order per supplier, what is left of what was authorized, and a line naming the person and their rate.',
    caption: 'One order per supplier, and the ceiling left to bill.',
    from: '/dashboard/purchase-orders as the program manager',
    capturedAt: '2026-09-21T15:15:16Z',
  },
  {
    n: '03',
    t: 'Contractors file their weeks and your manager approves them',
    says: 'Contractors file their own weeks and the manager who owns the work signs them. A week over the hours is flagged first.',
    img: '/screens/timesheets.png',
    alt: 'A timesheets screen: one week flagged at 168 hours with an overtime decision on it. The approved weeks sit under it, each row naming the person, the period, the hours, the bill rate and what the week is worth.',
    caption: 'One week flagged at 168 hours, above the approved ones.',
    from: '/dashboard/timesheets as the hiring manager',
    capturedAt: '2026-09-21T15:15:22Z',
  },
  {
    n: '04',
    t: 'Each supplier bills, and you pay what matched',
    says: 'Every supplier bills against hours your manager signed. A bill with no signed week behind it is not paid.',
    img: '/screens/invoices.png',
    alt: 'An invoices screen: the outstanding total, an aging breakdown, and a table of supplier bills with the period, the total and what is paid.',
    caption: 'Two supplier invoices open, none of it overdue.',
    from: '/dashboard/invoices, what we owe, as the AP clerk',
    capturedAt: '2026-09-21T15:15:28Z',
  },
]

/**
 * The eight parts of the record, one tile each.
 *
 * This replaced most of the long middle on 2026-09-27. A tile is the
 * part's name, one line and its own screen, and it leads to the page
 * that says the rest. The line is the header menu's own description of
 * the same page, so the menu and the tile cannot say two things; the
 * name and the screen are the module page's own (`lib/public-site/modules`).
 */
const TILES = MODULES.map((m) => ({
  route: m.route,
  title: m.title,
  line: NAV_MENUS[0].items.find((i) => { return i.href === m.route })?.d ?? '',
  img: m.screen.img,
  alt: m.screen.alt,
}))

/**
 * The four questions a client cannot answer about its own workforce,
 * each answered in a line that names the screen answering it.
 *
 * Not invented for the page. These arrive from a board member, an
 * auditor or a new CFO. Until 2026-09-27 each carried a "today" line
 * under it and a second section further down named the four screens
 * again; the page was saying one thing twice. Now the question, the
 * screen and the one-line answer are one row, and what happens today is
 * on /about#unanswered.
 *
 * `route` is the screen it opens, and the test checks the folder is
 * really there. Tenure is the fourth of four and gets one line: it is
 * the moat, not the wedge.
 */
const QUESTIONS: { q: string; screen: string; route: string; etyme: string }[] = [
  {
    q: 'How many contractors are on our sites right now?',
    screen: 'Workforce',
    route: 'people',
    etyme: 'The Workforce screen lists every contractor on site today, across every supplier.',
  },
  {
    q: 'What are we spending on them this quarter, and with whom?',
    screen: 'Program',
    route: 'program',
    etyme: 'The Program screen shows this month by supplier, and the Invoices screen what each one billed.',
  },
  {
    q: 'Are we paying two suppliers different money for the same work?',
    screen: 'Rates',
    route: 'rate-history',
    etyme: 'The Program screen puts two suppliers’ rates for one role side by side. The Rates screen keeps who agreed each.',
  },
  {
    q: 'Who has been here longest?',
    screen: 'Tenure',
    route: 'tenure',
    etyme: 'The Tenure screen counts each person’s days on your sites across every supplier, once per day.',
  },
]

/**
 * The one screen beside the four questions: every contractor, across
 * every supplier, on one list. It is the answer hardest to believe from
 * prose. The tenure screen that stood beside it until 2026-09-27 opens
 * the /compliance page instead.
 */
const ANSWER_SCREEN = {
  img: '/screens/contractors.png',
  alt: 'A contractors table: one row per person, with the supplier that sent them, their status, where they are and their months on site.',
  caption: 'Every contractor at Northbend Athletic, whichever supplier sent them.',
  from: '/dashboard/people, table view, as the program manager',
  capturedAt: '2026-09-21T15:17:41Z',
}

/**
 * The founder's line, in a quiet band. Added 2026-09-27.
 *
 * "Join forces with global teams around the world" — his words, exactly,
 * and he was clear it is subtle and not a hero. So it is a heading in a
 * band below the module tiles, with two sentences and a drawing, and no
 * button of its own.
 *
 * It has to read to both sides of the trade at once: a client reads
 * suppliers it can bring in from anywhere, a supplier reads clients it
 * can serve from anywhere. And it must not read as Etyme placing
 * anybody. The first sentence says both, with the supplier as the one
 * doing the serving.
 *
 * "Global" is where it could overreach, so the second sentence says the
 * one thing about other countries the record actually does: it asks for
 * each country's paperwork by that country's rules
 * (`lib/packet-derivation`, behind `/api/packets`). Each document it
 * names is listed in `backedBy` with the words in the source that ask
 * for it, and the test opens that file. What it deliberately does not
 * say, because the record does not do it: bill or pay in more than one
 * currency (a company carries one), run payroll in each country, or any
 * count of countries.
 */
const JOIN = {
  heading: 'Join forces with global teams around the world.',
  lines: [
    'A client can work with suppliers in other countries, and a supplier can serve clients outside its own, on one record.',
    'Each country’s paperwork is asked for by its own rules: a W-9 in the United States, GST and PAN in India, a VAT position in the United Kingdom.',
  ],
  backedBy: [
    { says: 'W-9', country: 'US', source: 'src/lib/packet-derivation.ts', proof: "label: 'W-9'" },
    { says: 'GST and PAN', country: 'IN', source: 'src/lib/packet-derivation.ts', proof: "label: 'GST registration'" },
    { says: 'VAT position', country: 'GB', source: 'src/lib/packet-derivation.ts', proof: "label: 'VAT registration'" },
  ],
}

/**
 * Who sits at the program office desks, in the buyer’s own two labels.
 *
 * Decided 2026-09-20: a client runs the program with its own people, or
 * Etyme runs it for them on the same record. The founder's own labels,
 * because a buyer knows them. Sold quietly, as a value added: the record
 * is the way, and the service is the second option. It argues with
 * nobody and it is sized against nobody.
 *
 * The supplier paragraph sits in this band on purpose. A supplier reads
 * "Etyme can run your client's program" as a threat unless the next
 * thing it reads is that its rates, its sub-vendors' names and its
 * client stay its own.
 */
const TWO_WAYS: { label: string; lines: string[] }[] = [
  {
    label: 'VMS software',
    lines: [
      'Your own program office runs the program on Etyme.',
      'Your people hold the seats. Etyme holds the record and the rules.',
    ],
  },
  {
    label: 'MSP provider',
    lines: [
      'You get a program office without hiring one.',
      'Etyme staff sit in seats your company grants them, work to your rules, and every read they make is logged.',
    ],
  },
]

/**
 * Whether the census door is open.
 *
 * The census is the first step for a client weighing the MSP provider
 * service: it sends what it already has on its contractors, and one
 * named person sends back a single page. `src/app/census/page.tsx`
 * exists, so the door is open, and the test reads both the constant and
 * the page file so the two cannot disagree.
 */
const CENSUS_IS_OPEN = true

/**
 * The three seeded programs named at the door.
 *
 * Invented companies, and the page says so where it names them. Three
 * real enterprises were named here until 2026-09-15.
 * `__tests__/invariants/demo-names.test.ts` refuses the old names coming
 * back anywhere; the positioning test holds these to the seed's own
 * list in `app/demo/seats.ts`, in order.
 */
const PROGRAMS = [
  { name: 'Northbend Athletic' },
  { name: 'Cavanaugh Glassworks' },
  { name: 'Talvern Medical' },
]

/**
 * The footer.
 *
 * Three legal pages shipped and nothing pointed at them, so they were
 * live and invisible. A client's security review finds a document by
 * looking in the footer. What is deliberately not here: no Careers, no
 * Blog, no status page, no social links, no support mailbox — each a
 * link to something that does not exist.
 *
 * "The product" leads to this page's bands and, since 2026-09-27, to
 * the pages the long middle moved to.
 */
const FOOTER: { heading: string; links: { label: string; href: string }[]; note?: string }[] = [
  {
    heading: 'The product',
    links: [
      { label: 'What it does, in four steps', href: '#steps' },
      { label: 'The eight parts of the record', href: '#modules' },
      { label: 'Four questions you cannot answer', href: '#gap' },
      { label: 'Who sits at the desks', href: '#ways' },
      { label: 'What it costs when nobody can answer', href: '/compliance#cost' },
      { label: 'One hire, from every desk', href: '/about#hire' },
      { label: 'The chain you buy through', href: '/chain#down-the-chain' },
      { label: 'What it costs', href: '#why' },
    ],
  },
  {
    heading: 'Start',
    links: [
      { label: 'Look around an example program', href: '/demo' },
      { label: 'Ask us something', href: '#contact' },
      { label: 'Sign in', href: '/login' },
    ],
    note: 'No card and no sign-up to look. A person reads what you send.',
  },
  {
    heading: 'Read',
    links: [
      { label: 'Documentation', href: '/docs' },
      { label: 'Security position', href: '/security' },
      { label: 'Free contractor spend audit', href: '/census' },
      { label: 'About Etyme', href: '/about' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Terms of service', href: '/terms' },
      { label: 'Privacy notice', href: '/privacy' },
      { label: 'Data processing addendum', href: '/dpa' },
    ],
    note: 'Drafts, written from the code itself and not yet reviewed by a lawyer. Each one says so on its face, and lists what counsel still has to decide.',
  },
]

/**
 * The drawing beside the founder's line.
 *
 * Supply on one side, demand on the other: thin lines from the left
 * edge gather into a violet stroke, thin lines from the right edge into
 * an orange one, and the two meet and continue as one green stroke —
 * the three strokes of the Y in the mark, which is the record between
 * them. Abstract on purpose: no globe, no map, no pins, no people.
 *
 * Drawn in the kit's own colors through its CSS variables rather than
 * by hand-typed hex, so a change to the kit's values moves the drawing
 * with everything else. The vivid logo green is not used; the stem is
 * the kit's deeper green. It does not move, so there is nothing for
 * `prefers-reduced-motion` to stop. It scales to its column and stacks
 * under the words on a phone.
 */
const LEFT = [36, 84, 132, 180, 228]
const RIGHT = [30, 78, 126, 174, 222]

function JoinArt() {
  return (
    <svg
      viewBox="0 0 520 260"
      role="img"
      aria-label="Thin lines from suppliers on the left and from clients on the right gather into two strokes, which meet and continue as one line: one record between them."
      className="h-auto w-full max-w-[520px]"
    >
      {LEFT.map((y) => (
        <g key={`l${y}`}>
          <path
            d={`M 26 ${y} C 120 ${y}, 150 56, 206 56`}
            fill="none"
            style={{ stroke: 'var(--violet)', strokeWidth: 1.5, opacity: 0.45 }}
          />
          <circle cx={26} cy={y} r={5} style={{ fill: 'var(--raised)', stroke: 'var(--violet-p)', strokeWidth: 1.5 }} />
        </g>
      ))}
      {RIGHT.map((y) => (
        <g key={`r${y}`}>
          <path
            d={`M 494 ${y} C 410 ${y}, 380 28, 322 28`}
            fill="none"
            style={{ stroke: 'var(--orange)', strokeWidth: 1.5, opacity: 0.45 }}
          />
          <circle cx={494} cy={y} r={5} style={{ fill: 'var(--raised)', stroke: 'var(--orange-p)', strokeWidth: 1.5 }} />
        </g>
      ))}
      <path d="M 206 56 L 262 150" style={{ stroke: 'var(--violet)', strokeWidth: 16, strokeLinecap: 'round' }} />
      <path d="M 322 28 L 262 150" style={{ stroke: 'var(--orange)', strokeWidth: 16, strokeLinecap: 'round' }} />
      <path d="M 262 150 L 240 236" style={{ stroke: 'var(--green-p)', strokeWidth: 16, strokeLinecap: 'round' }} />
      <text x={26} y={256} style={{ fill: 'var(--faint)', fontFamily: 'var(--mono)', fontSize: 11 }}>{'Suppliers'}</text>
      <text x={494} y={256} textAnchor="end" style={{ fill: 'var(--faint)', fontFamily: 'var(--mono)', fontSize: 11 }}>{'Clients'}</text>
    </svg>
  )
}

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-etyme-canvas">
      {/* ── The header ───────────────────────────────────────── */}
      {/* Every label below renders through {expr} rather than as literal
          JSX text, so the menu cannot shift the hero words the founder
          signed off — `lib/positioning` reads text nodes in source
          order, and "Sign in" is deliberately the first of them. */}
      <header className="border-b border-etyme-rule">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-3 px-4 py-4 sm:px-6">
          <Link href="/" aria-label="Etyme — home">
            <EtymeLogo size="md" />
          </Link>

          <ul className="ml-6 hidden items-center gap-1 text-sm lg:flex">
            {NAV_MENUS.map((menu) => (
              <li key={menu.label} className="group relative">
                <button
                  type="button"
                  className="rounded-md px-3 py-2 text-etyme-muted transition-colors
                             hover:text-etyme-ink focus-visible:text-etyme-ink focus-visible:outline-none
                             focus-visible:ring-2 focus-visible:ring-etyme-action/40"
                >
                  {menu.label}
                </button>
                <div
                  className="invisible absolute left-0 top-full z-20 w-72 -translate-y-1 pt-2
                             opacity-0 transition-all duration-100
                             group-hover:visible group-hover:translate-y-0 group-hover:opacity-100
                             group-focus-within:visible group-focus-within:translate-y-0
                             group-focus-within:opacity-100"
                >
                  <div className="rounded-xl border border-etyme-rule bg-etyme-raised p-2 shadow-xl">
                    {menu.items.map((item) => (
                      <a
                        key={item.t}
                        href={item.href}
                        className="block rounded-lg px-3 py-2.5 hover:bg-etyme-canvas"
                      >
                        <span className="block text-[13px] font-medium text-etyme-ink">
                          {item.t}
                        </span>
                        {item.d && (
                          <span className="mt-0.5 block text-[12px] leading-snug text-etyme-muted">
                            {item.d}
                          </span>
                        )}
                      </a>
                    ))}
                    {menu.note && (
                      <p className="mt-1 border-t border-etyme-rule px-3 pt-2 text-[11px] text-etyme-faint">
                        {menu.note}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            ))}
            <li>
              <a
                href="/docs"
                className="rounded-md px-3 py-2 text-etyme-muted transition-colors hover:text-etyme-ink"
              >
                {'Documentation'}
              </a>
            </li>
          </ul>

          <Link
            href="/login"
            className="ml-auto rounded-lg border border-etyme-rule px-4 py-2 text-sm font-medium
                       text-etyme-muted transition-colors hover:border-etyme-ink hover:text-etyme-ink"
          >
            Sign in
          </Link>
        </nav>
      </header>

      {/* ── Hero ─────────────────────────────────────────────── */}
      {/* Category first, the way Concur says travel and expense before
          it says anything clever — and then the product itself, before
          another sentence about it.

          Rebuilt 2026-09-20 after the CTO of a two-billion-dollar
          company with forty to fifty contractors read the old one and
          said he could not tell what the app does. Five sentences and
          then a screen: the eyebrow is the category in the words a
          buyer already uses, the headline is the line the founder
          signed off, the subhead is concrete nouns only, and the
          comparison names the two systems he would recognize, once,
          factually, with no claim about either.

          The screenshot under it is the program dashboard at Northbend
          Athletic, an invented company the seed builds, taken from
          /dashboard/program as the program manager. The worked-example
          card that stood beside the headline is gone: it said the same
          thing in invented rows, and invented rows are what a pitch
          deck is made of. */}
      <section className="border-b border-etyme-rule">
        <div className="mx-auto max-w-6xl px-4 pb-14 pt-12 sm:px-6 md:pb-20 md:pt-16">
          <p className="eyebrow mb-4">
            Vendor management system
          </p>
          <h1 className="mb-6 max-w-[18ch] text-balance font-serif text-[40px] font-normal
                         leading-[1.03] tracking-[-0.02em] text-etyme-ink md:text-[60px]">
            Every contractor. Every supplier. One record.
          </h1>
          <p className="mb-5 max-w-[62ch] text-[19px] leading-relaxed text-etyme-ink md:text-[21px]">
            See every contractor on your sites, which supplier sent them, what they
            cost, and how long they have been there. Approve their timesheets. Pay
            one matched invoice per supplier.
          </p>
          {/* The category and the size, and no company. This sentence
              named two incumbents for a few hours on 2026-09-20 and the
              founder struck it on his phone: "Invoking SAP Fieldglass
              and Beeline will trigger more questions than answers." A
              rival's name invites "how are you different", "are you
              certified like them", "who else uses you" — and a page
              cannot finish that argument. The comparison stays a
              sentence he says in a conversation, where he can answer
              the next question. `lib/positioning` refuses every named
              company again, with no exception. */}
          <p className="mb-9 max-w-[62ch] text-[16px] leading-relaxed text-etyme-muted">
            A vendor management system for companies with twenty to two hundred
            contractors, sized for a company with fifty contractors rather than
            five thousand.
          </p>

          <figure className="overflow-hidden rounded-xl border border-etyme-rule
                             bg-etyme-raised shadow-sm">
            {/* Taken from the seeded demo world on the date stamped on the
                image below, UTC — the same stamp the step screens carry
                beside `from`. A test cannot read a PNG, so the date is
                the only thing that can tell a shot taken before a rename
                in the demo world from one taken after it. */}
            <img
              src="/screens/program-dashboard.png"
              data-captured-at="2026-09-21T15:15:03Z"
              alt="The program dashboard: a sentence saying whether anything needs the reader today, then six numbers — on site, suppliers, this month, ending soon, the tenure cap and requirements — over a list of who is starting soon and which suppliers are on site."
              width={1440}
              height={900}
              className="block h-auto w-full border-b border-etyme-rule"
            />
            <figcaption className="px-5 py-3.5 text-[13px] leading-relaxed text-etyme-muted">
              The program manager’s desk at Northbend Athletic, an invented company in
              the example program. Three contractors on site through three suppliers,
              $60,000 this month, one person near the cap.
            </figcaption>
          </figure>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {/* One door for companies, not two. Demand and supply are
                positions on a deal, not properties of a firm — a prime
                is demand toward its sub and supply toward its client on
                the same placement — so a page that forked on it asked a
                question a third of the market cannot answer. */}
            <TryDemo
              side="HIRING"
              asks
              label="Open an example program →"
              className="rounded-lg bg-etyme-action px-6 py-3.5 text-sm font-semibold text-white
                         shadow-sm transition-opacity hover:opacity-90"
            />
            <a
              href="#steps"
              className="px-2 py-3.5 text-sm font-medium text-etyme-muted underline
                         underline-offset-4 transition-colors hover:text-etyme-ink"
            >
              What it does, in four steps →
            </a>
          </div>
          {/* The primary door is a client desk and everything else is a
              text link, because this page is written to the company
              hiring. The contractor's own door stays reachable all the
              same — a person who is the work is not an audience to drop,
              and `__tests__/invariants/demo-candidate.test.ts` holds it
              here and at the close. */}
          <p className="mt-5 max-w-[52ch] font-mono text-[12px] leading-relaxed text-etyme-muted">
            No card, no sign-up. You land at a program manager’s desk in an invented
            company with a full month of data in it.{' '}
            <TryDemo
              side="CANDIDATE"
              label="See it as a candidate →"
              className="text-etyme-muted underline underline-offset-2 hover:text-etyme-ink"
            />
          </p>

          {/* Now that the list has been shown, the page may use the word
              for it. The offer to run the program is the quiet sentence
              under it, once, and a reader may take it or leave it —
              "MSP selling should be undercover selling and more as value
              addition rather than fully pitching for the market." */}
          <div className="mt-10 grid gap-8 border-t border-etyme-rule pt-8 md:grid-cols-2">
            <div>
              <p className="text-[17px] leading-relaxed text-etyme-ink md:text-[19px]">
                Etyme keeps one record of every contractor across every staffing
                supplier you use.
              </p>
              <p className="mt-3 text-[16px] leading-relaxed text-etyme-muted">
                Your own program office runs it. If you would rather not staff one,
                Etyme can run it for you on the same record.
              </p>
            </div>
            <p className="border-l-2 border-etyme-rule pl-4 text-[15px] leading-relaxed
                          text-etyme-ink">
              Requisition, suppliers, submissions, screening, interviews, onboarding,
              timesheets, invoices, compliance. One record holds all of it, and each
              desk opens the part that is its own.
            </p>
          </div>
        </div>
      </section>


      {/* ── What it does, in four steps ───────────────────────────── */}
      {/* The answer to "I do not understand what the app does", and it
          is four screens rather than four claims. A two-by-two grid
          since 2026-09-27, so the four read as one band rather than four
          screens of scrolling. The documentation link is where the rest
          of each flow is drawn, desk by desk. */}
      <section id="steps" className="border-b border-etyme-rule bg-etyme-surface scroll-mt-6">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-20">
          <p className="eyebrow mb-3">What it does, in four steps</p>
          <h2 className="max-w-[30ch] text-balance font-serif text-3xl leading-tight
                         tracking-[-0.02em] text-etyme-ink md:text-[40px]">
            A role goes out, a person starts, a week is signed, a bill is paid
          </h2>

          <ol className="mt-10 grid gap-x-8 gap-y-12 md:grid-cols-2">
            {STEPS.map((s) => (
              <li key={s.n}>
                <figure className="overflow-hidden rounded-xl border border-etyme-rule
                                   bg-etyme-raised shadow-sm">
                  <img
                    src={s.img}
                    alt={s.alt}
                    width={1440}
                    height={900}
                    loading="lazy"
                    className="block h-auto w-full border-b border-etyme-rule"
                  />
                  <figcaption className="px-4 py-2.5 text-[12.5px] leading-relaxed text-etyme-muted">
                    {s.caption}
                  </figcaption>
                </figure>
                <span className="mt-5 block font-mono text-[11px] tabular-nums text-etyme-faint">
                  {s.n}
                </span>
                <h3 className="mt-1 text-balance font-serif text-[21px] leading-snug text-etyme-ink">
                  {s.t}
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed text-etyme-muted">{s.says}</p>
              </li>
            ))}
          </ol>

          <p className="mt-10 text-[15px]">
            <Link
              href={'/docs/client' as Route}
              className="font-medium text-etyme-action underline underline-offset-4 hover:opacity-80"
            >
              Every step, desk by desk, in the documentation →
            </Link>
          </p>
        </div>
      </section>

      {/* ── The eight parts ─────────────────────────────────────── */}
      {/* Added 2026-09-27, and it replaced most of the long middle. Each
          tile is a part's name, one line and its own screen, and the
          whole tile leads to the part's page. The order is the order a
          hire moves through them. */}
      <section id="modules" className="border-b border-etyme-rule scroll-mt-6">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-20">
          <p className="eyebrow mb-3">What is in it</p>
          <h2 className="max-w-[30ch] text-balance font-serif text-3xl leading-tight
                         tracking-[-0.02em] text-etyme-ink md:text-[40px]">
            Eight parts of one record, in the order a hire moves through them
          </h2>

          <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {TILES.map((m) => (
              <li key={m.route}>
                <Link
                  href={m.route as Route}
                  className="group block h-full overflow-hidden rounded-xl border border-etyme-rule
                             bg-etyme-raised transition-shadow hover:shadow-md"
                >
                  <figure>
                    <img
                      src={m.img}
                      alt={m.alt}
                      width={1440}
                      height={900}
                      loading="lazy"
                      className="block aspect-[16/10] h-auto w-full border-b border-etyme-rule
                                 object-cover object-left-top"
                    />
                    <figcaption className="px-4 pb-4 pt-3">
                      <span className="block text-[15px] font-semibold leading-snug text-etyme-ink
                                       group-hover:text-etyme-action">
                        {m.title}
                      </span>
                      <span className="mt-1 block text-[13px] leading-snug text-etyme-muted">
                        {m.line}
                      </span>
                    </figcaption>
                  </figure>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── The hook: four questions ─────────────────────────────── */}
      {/* Nobody is fined at month nineteen, and a page that opens on the
          penalty is selling a fear the buyer does not hold. Being asked
          how many contractors you have and not knowing happens monthly.
          One band since 2026-09-27: each question, and under it one
          line naming the screen that answers it. The long form of why
          nobody can answer today is on About; what it costs when
          somebody finally asks is on the compliance page.

          The sentence under the headline is what the client sees and
          where it stops. The headline once promised the client its
          suppliers' own subcontractors, which to a prime is a promise
          to break its NDA. The client sees the person and the standing
          of whoever employs them, and no more unless its own agreement
          says so. */}
      <section id="gap" className="border-b border-etyme-rule bg-etyme-surface scroll-mt-6">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-20">
          <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
            <div>
              <p className="eyebrow mb-3">Why this matters</p>
              <h2 className="max-w-[26ch] text-balance font-serif text-3xl leading-tight
                             tracking-[-0.02em] text-etyme-ink md:text-[40px]">
                Etyme shows every contractor on your sites, whoever placed them
              </h2>
              <p className="mt-4 max-w-[50ch] text-[16px] leading-relaxed text-etyme-muted">
                You see the person, and whether the firm that employs them is insured
                and authorized. What your supplier arranges below that stays its own,
                unless your agreement with it says otherwise.
              </p>
              <p className="mt-4 max-w-[50ch] text-[16px] leading-relaxed text-etyme-ink">
                A CFO asks how many contractors you have, and the program manager says:
                let me come back to you. Three weeks later the number is one nobody fully
                trusts.
              </p>
              <p className="mt-6 flex flex-col gap-2 text-[15px]">
                <Link
                  href={'/about#unanswered' as Route}
                  className="font-medium text-etyme-action underline underline-offset-4 hover:opacity-80"
                >
                  Why nobody can answer them today →
                </Link>
                <Link
                  href={'/compliance#cost' as Route}
                  className="font-medium text-etyme-action underline underline-offset-4 hover:opacity-80"
                >
                  What it costs when somebody finally asks →
                </Link>
              </p>
            </div>

            <ul className="space-y-px overflow-hidden rounded-xl border border-etyme-rule bg-etyme-rule">
              {QUESTIONS.map((item) => (
                <li key={item.q} className="bg-etyme-raised px-5 py-4">
                  <p className="text-balance font-serif text-[19px] leading-snug text-etyme-ink">
                    {item.q}
                  </p>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-etyme-muted">
                    {item.etyme}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <figure className="mt-10 overflow-hidden rounded-xl border border-etyme-rule
                             bg-etyme-raised shadow-sm">
            <img
              src={ANSWER_SCREEN.img}
              alt={ANSWER_SCREEN.alt}
              width={1440}
              height={900}
              loading="lazy"
              className="block h-auto w-full border-b border-etyme-rule"
            />
            <figcaption className="px-5 py-3 text-[13px] leading-relaxed text-etyme-muted">
              {ANSWER_SCREEN.caption}
            </figcaption>
          </figure>
        </div>
      </section>

      {/* ── Join forces ──────────────────────────────────────────── */}
      {/* The founder's line, 2026-09-27, and he was clear: subtle, not a
          hero. So it is a heading a size under the others, two sentences
          and a drawing, on the plain canvas, with no button of its own.
          What it may claim about other countries is in the note on JOIN
          above, and the test reads the source that backs it. */}
      <section id="join" className="border-b border-etyme-rule scroll-mt-6">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1fr_1fr] md:py-16">
          <div>
            <h2 className="max-w-[22ch] text-balance font-serif text-[26px] leading-snug
                           tracking-[-0.02em] text-etyme-ink md:text-[32px]">
              {JOIN.heading}
            </h2>
            {JOIN.lines.map((line) => (
              <p key={line} className="mt-4 max-w-[48ch] text-[16px] leading-relaxed text-etyme-muted">
                {line}
              </p>
            ))}
          </div>
          <div className="flex justify-center md:justify-end">
            <JoinArt />
          </div>
        </div>
      </section>

      {/* ── Who sits at the desks ────────────────────── */}
      {/* One short band, once, quietly. The record is the way, and the
          service is the second option, in the founder's two labels. The
          neutrality line and the supplier paragraph sit in the same band
          on purpose: this is where a supplier would otherwise read a
          threat. */}
      <section id="ways" className="border-b border-etyme-rule bg-etyme-surface scroll-mt-6">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-20">
          <p className="eyebrow mb-3">Who sits at the desks</p>
          <h2 className="max-w-[30ch] text-balance font-serif text-3xl leading-tight
                         tracking-[-0.02em] text-etyme-ink md:text-[40px]">
            The record is the product, and your own people run the program on it
          </h2>
          <p className="mt-4 max-w-[58ch] text-[16px] leading-relaxed text-etyme-muted">
            Most clients staff the program office themselves. The record is the same
            either way and it stays yours.
          </p>

          <div className="mt-8 grid gap-px overflow-hidden rounded-xl border border-etyme-rule
                          bg-etyme-rule md:grid-cols-2">
            {TWO_WAYS.map((w) => (
              <div key={w.label} className="bg-etyme-raised p-6">
                <h3 className="text-[15px] font-semibold text-etyme-ink">{w.label}</h3>
                {w.lines.map((line, i) => (
                  <p
                    key={line}
                    className={
                      i === 0
                        ? 'mt-2.5 text-[15.5px] leading-relaxed text-etyme-ink'
                        : 'mt-2 text-[14.5px] leading-relaxed text-etyme-muted'
                    }
                  >
                    {line}
                  </p>
                ))}
              </div>
            ))}
          </div>

          <div className="mt-8 grid gap-8 md:grid-cols-2">
            <p className="text-[15px] leading-relaxed text-etyme-ink">
              <span className="font-semibold">In either way,</span>{' '}
              Etyme never supplies a contractor and never runs a bench, so it has no
              reason to favor one supplier. Your people keep the decisions that are
              yours: which roles to open, who to hire, and what to approve.
            </p>
            <div>
              <p className="text-[15px] leading-relaxed text-etyme-ink">
                <span className="font-semibold">If you are a staffing supplier</span>{' '}
                you are on it because your client is. Your rates and your sub-vendors’
                names stay private, and your client stays your client.
              </p>
              <p className="mt-2 text-[15px] leading-relaxed text-etyme-muted">
                Where Etyme runs a client’s program, approvals come back faster and your
                bills are matched and paid without chasing.
              </p>
            </div>
          </div>

          <p className="mt-8 text-[15px]">
            <Link
              href={'/about#neutral' as Route}
              className="font-medium text-etyme-action underline underline-offset-4 hover:opacity-80"
            >
              Why Etyme never places anybody →
            </Link>
          </p>
        </div>
      </section>

      {/* ── The close ───────────────────────────────────────────── */}
      {/* The door, the census, one line about the price, and a person.
          One band since 2026-09-27. The client door is the button; the
          supplier's and the contractor's are quieter text links, because
          this page is written to the company hiring. The ask is quiet on
          purpose and last: a page that opens with a form wants something
          before it has given anything. Its words are in
          src/lib/public-site/leads.ts so a test can read them. */}
      <section id="close" className="scroll-mt-6">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-20">
          <div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
            <div>
              <h2 className="max-w-[24ch] text-balance font-serif text-3xl leading-tight
                             tracking-[-0.02em] text-etyme-ink md:text-[40px]">
                Sit at the program office desk and ask it the four questions
              </h2>
              <p className="mt-4 max-w-[54ch] text-[16px] leading-relaxed text-etyme-muted">
                The companies are invented, and everything under them behaves as it
                would with yours.
              </p>

              <ul className="mt-5 flex flex-wrap gap-2">
                {PROGRAMS.map((p) => (
                  <li
                    key={p.name}
                    className="rounded-md border border-etyme-rule bg-etyme-raised px-3 py-1.5
                               text-[13px] font-medium text-etyme-ink"
                  >
                    {p.name}
                  </li>
                ))}
              </ul>

              <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-3">
                <Link
                  href="/demo"
                  className="rounded-lg bg-etyme-action px-6 py-3.5 text-sm font-semibold text-white
                             shadow-sm transition-opacity hover:opacity-90"
                >
                  Pick a client desk →
                </Link>
                <span className="font-mono text-[12px] text-etyme-muted">
                  No card. No sign-up.
                </span>
              </div>

              <p className="mt-6 max-w-[54ch] text-[14px] leading-relaxed text-etyme-muted">
                <span className="font-semibold text-etyme-ink">If you supply into a program instead</span>{' '}
                <TryDemo
                  side="BENCH"
                  label="Sit at a supplier’s desk →"
                  className="text-etyme-action underline underline-offset-4 hover:opacity-80"
                />
              </p>
              <p className="mt-2 max-w-[54ch] text-[14px] leading-relaxed text-etyme-muted">
                <span className="font-semibold text-etyme-ink">If you are on a contract yourself</span>{' '}
                <TryDemo
                  side="CANDIDATE"
                  label="See it as a candidate →"
                  className="text-etyme-action underline underline-offset-4 hover:opacity-80"
                />
              </p>

              {CENSUS_IS_OPEN && (
                <p className="mt-6 max-w-[54ch] border-t border-etyme-rule pt-5 text-[14px]
                              leading-relaxed text-etyme-muted">
                  <span className="font-semibold text-etyme-ink">
                    If you are considering Etyme as your MSP provider
                  </span>{' '}
                  start with a census.{' '}
                  <Link
                    href={'/census' as Route}
                    className="text-etyme-action underline underline-offset-4 hover:opacity-80"
                  >
                    Start with a census →
                  </Link>
                </p>
              )}

              {/* The price, in one line. The section it replaced said what
                  is settled about the money at length; that is on
                  /about#price now. What must never leave this page is that
                  there is no price and that it is free while it is proved
                  out, because silence about money reads as enterprise
                  sales. */}
              <p id="why" className="mt-5 max-w-[54ch] scroll-mt-6 text-[14px] leading-relaxed text-etyme-muted">
                There is no price on this page because we have not settled one. Etyme
                is free while we prove it out with the first five firms.{' '}
                <Link
                  href={'/about#price' as Route}
                  className="text-etyme-action underline underline-offset-4 hover:opacity-80"
                >
                  What is settled →
                </Link>
              </p>
            </div>

            <div id="contact" className="scroll-mt-6 rounded-xl border border-etyme-rule bg-etyme-surface p-6 md:p-7">
              <p className="eyebrow mb-2">{ASK_COPY.eyebrow}</p>
              <h3 className="font-serif text-[24px] leading-snug tracking-[-0.02em] text-etyme-ink">
                {ASK_COPY.heading}
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-etyme-muted">
                {ASK_COPY.body}
              </p>
              <div className="mt-5">
                <Ask source="HOME_PAGE" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-etyme-rule bg-etyme-surface">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
            <div>
              <EtymeLogo size="md" />
              <p className="mt-4 max-w-[32ch] text-[14px] leading-relaxed text-etyme-muted">
                The system of record for contingent workers: the layer between a
                company and every staffing supplier it uses.
              </p>
              <p className="mt-3 max-w-[32ch] text-[13px] leading-relaxed text-etyme-faint">
                Etyme never runs a bench and never places anybody.
              </p>
            </div>

            {FOOTER.map((group) => (
              <div key={group.heading}>
                <p className="stat-label">{group.heading}</p>
                <ul className="mt-3 space-y-2">
                  {group.links.map((l) => (
                    <li key={l.href}>
                      {l.href.startsWith('#') ? (
                        <a
                          href={l.href}
                          className="text-[14px] leading-snug text-etyme-muted underline-offset-2
                                     transition-colors hover:text-etyme-ink hover:underline"
                        >
                          {l.label}
                        </a>
                      ) : (
                        <Link
                          href={l.href as Route}
                          className="text-[14px] leading-snug text-etyme-muted underline-offset-2
                                     transition-colors hover:text-etyme-ink hover:underline"
                        >
                          {l.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
                {group.note && (
                  <p className="mt-3 max-w-[30ch] text-[12px] leading-snug text-etyme-faint">
                    {group.note}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="mt-12 flex flex-wrap items-center justify-between gap-3
                          border-t border-etyme-rule pt-6">
            <p className="font-mono text-[11px] text-etyme-faint">
              © {new Date().getFullYear()} Etyme Inc.
            </p>
            <p className="font-mono text-[11px] text-etyme-faint">
              Requisition to invoice, across every supplier.
            </p>
          </div>
        </div>
      </footer>
    </main>
  )
}
