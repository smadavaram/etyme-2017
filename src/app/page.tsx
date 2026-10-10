import type { Metadata } from 'next'
import Link from 'next/link'
// Typed routes widen a string in an array to `string`, which Link will not
// take. The cast is at the render rather than on the data so the lists
// stay readable.
import type { Route } from 'next'
import { TryDemo } from '@/components/try-demo'
import { SiteHeader, SiteFooter } from '@/lib/public-site/frame'
import { CloseBand } from '@/lib/public-site/close-band'
import { SettleOnBands } from '@/lib/public-site/settle'
import { SEE_IT, GET_THE_AUDIT } from '@/lib/public-site/funnel'
import { PRODUCT_STAGES } from '@/lib/public-site/nav'
import { ModuleIcon } from '@/lib/public-site/module-icons'
import { SampleDesk, SAMPLE_LABEL } from '@/lib/public-site/sample-desk-view'
import { AuditForm } from '@/lib/public-site/audit-form'
import { CountedLink } from '@/lib/public-site/counted-link'
import { DemoLink } from '@/lib/public-site/demo-link'
import type { DemoTarget } from '@/lib/public-site/flow'
import { SCREEN, EDGE, BAND, H2, UNDER_HEADING } from '@/lib/public-site/rhythm'

/**
 * The front door.
 *
 * ── The founder's brief of 2026-10-09 ────────────────────────────────
 *
 * The page is rebuilt to a brief the founder wrote for the public site,
 * which replaces the four-step spine on the home page only — the step
 * pages and the documentation keep the four steps. In this order:
 *
 *   hero          "Know what every contractor costs, across every
 *                 supplier." Then the founder's support line (2026-10-10),
 *                 the category, the audit (primary) and the demo
 *                 (secondary), problem · outcome · next step in three
 *                 short lines, and a sample program drawn with the
 *                 product's own list, labeled "Sample data from the demo"
 *   #problem      contractor data split four ways, and the four
 *                 questions nobody can answer; the business case is one
 *                 click away, never a penalty
 *   #platform     one record, the eight parts by step, and the three
 *                 trade words defined once
 *   #product      three real screens from the seeded demo
 *   #solutions    four desks: what each cannot answer, what the record
 *                 answers, and the screen, opened in the demo as that desk
 *   #how-it-works Connect. Control. Reconcile. A line each, who does what
 *   #audit        what the audit delivers, needs, takes and leads to,
 *                 then four short fields posting a real lead
 *   #security     what is done and what is not, from the security page
 *   #close        the three ways forward, and the quiet rows: the
 *                 program office once, the price, the supplier's and the
 *                 contractor's doors
 *
 * What left the page, said so nobody re-adds it here by accident: the
 * four steps beside the bills screen (on the step pages, and in the
 * Platform menu), and the founder's line "Join forces with global teams
 * around the world" with its mural, which the brief does not list. The
 * mural's file is kept (`lib/public-site/join-mural`) for the founder to
 * place.
 *
 * ── Rules that still bind ────────────────────────────────────────────
 *
 * Category first, never one module, never AI, never a supply claim, no
 * named company, no size of buyer, no claim a reader cannot check, plain
 * words defined once, written to the client. `lib/positioning` holds each
 * and `positioning.test.ts` reads this file against them. The sample
 * under the hero is computed from the world seed (`lib/public-site/
 * sample-desk`), and the test holds every row to it.
 */

/**
 * The title only. The description is the layout's, inherited, so the home
 * page and every other page say one sentence in a search result and a
 * link preview and cannot disagree. `site-description.test.ts` holds that
 * the home page declares none of its own.
 */
export const metadata: Metadata = {
  title: { absolute: 'Etyme | Enterprise contingent workforce management' },
}

/** Problem, outcome, next step, under the hero. */
const GLANCE: { t: string; d: string }[] = [
  { t: 'The problem', d: 'Contractor data is split across suppliers, spreadsheets and email.' },
  { t: 'The outcome', d: 'One consistent record, with approvals governed and spend seen by supplier.' },
  { t: 'The next step', d: 'Explore the demo with no sign-up, or ask for the audit.' },
]

/** The four places contractor data sits today. */
const SPLIT: { t: string; d: string }[] = [
  { t: 'Suppliers', d: 'Each supplier keeps its own list of your contractors, and sees only its own.' },
  { t: 'Spreadsheets', d: 'Your program office keeps another list by hand.' },
  { t: 'Email', d: 'Job requests and weeks are approved in email threads.' },
  { t: 'Invoice receipts', d: 'Each supplier’s invoice arrives on its own, with nothing to check it against.' },
]

/** The four questions a company cannot answer. CLAUDE.md, "What Etyme is". */
const QUESTIONS: string[] = [
  'How many contractors do we have today?',
  'What are we spending on them?',
  'Who has been here longest, across all suppliers?',
  'Are two suppliers paid differently for one skill?',
]

/** The three trade words the page uses, each defined once, here. */
const TERMS: { t: string; d: string }[] = [
  { t: 'Invoice receipt', d: 'Each supplier’s invoice, received and checked before it is paid.' },
  { t: 'Three-way check', d: 'The hours, the invoice receipt, and the contract rate must all agree.' },
  { t: 'Time limit', d: 'The most months one person may work at your company, counted across every supplier.' },
]

/**
 * Three real screens from the seeded demo. `from` is the desk and the
 * route each was taken from, so anybody can retake it; `capturedAt` is
 * when, UTC, because a PNG cannot be read by a test and the date is what
 * catches a shot taken before a rename in the demo world.
 */
const SHOWCASE = [
  {
    img: '/screens/program-dashboard.png',
    alt: 'The program dashboard. A sentence says whether anything needs the reader today. Six numbers follow: on site, suppliers, this month, ending soon, the time limit and job requests. Under them, who is starting soon and which suppliers are on site.',
    caption: 'The program manager’s desk. Every firm on this screen is a demo company — not a customer.',
    from: '/dashboard/program as the program manager',
    capturedAt: '2026-09-28T19:09:17Z',
  },
  {
    img: '/screens/timesheets.png',
    alt: 'A timesheets screen with weeks waiting for a signature and weeks approved. Each shows the person, the period, the hours, the bill rate and the value. One is a 44-hour week, over the hours.',
    caption: 'The hiring manager signs each week. Every firm on this screen is a demo company — not a customer.',
    from: '/dashboard/timesheets as the hiring manager',
    capturedAt: '2026-09-28T19:09:34Z',
  },
  {
    img: '/screens/invoices.png',
    alt: 'An invoice receipts screen: the outstanding total, an aging breakdown, and a table of invoice receipts with the period, the total and what is paid.',
    caption: 'A bill with no signed week behind it is not paid. Every firm on this screen is a demo company — not a customer.',
    from: '/dashboard/invoices, what we owe, as the AP clerk',
    capturedAt: '2026-09-28T19:09:20Z',
  },
]

/**
 * The four desks the page is written to (the founder's feedback,
 * 2026-10-10): what each cannot answer today, what the record answers,
 * and the screen that answers it, opened in the demo as that desk.
 */
const DESKS: { t: string; cannot: string; answers: string; screen: string; demo: DemoTarget }[] = [
  {
    t: 'Contingent Workforce Director',
    cannot: 'How many contractors are on our sites today, and through which suppliers?',
    answers: 'Every contractor, the supplier behind them and months on site, on one list.',
    screen: 'the program dashboard',
    demo: { as: 'world-nike', desk: 'programme', screen: '/dashboard/program', seat: 'the program manager' },
  },
  {
    t: 'Procurement',
    cannot: 'Which suppliers are cleared to work for us, and who cleared them?',
    answers: 'Each supplier’s standing and who cleared it. A job goes only to cleared suppliers.',
    screen: 'Suppliers',
    demo: { as: 'world-nike', desk: 'procurement', screen: '/dashboard/suppliers', seat: 'the procurement lead' },
  },
  {
    t: 'HR Operations',
    cannot: 'Who on site is missing paperwork, or close to the time limit?',
    answers: 'Nobody starts without the US work form (I-9), and the time limit counts every supplier.',
    screen: 'Compliance',
    demo: { as: 'world-nike', desk: 'hr', screen: '/dashboard/compliance', seat: 'the HR partner' },
  },
  {
    t: 'Finance',
    cannot: 'Did we pay for hours that nobody signed?',
    answers: 'Each invoice receipt is checked against signed hours and the contract rate.',
    screen: 'Invoice receipts',
    demo: { as: 'world-nike', desk: 'ap', screen: '/dashboard/invoices', seat: 'the AP clerk' },
  },
]

/** Connect. Control. Reconcile. One line each, who does what. */
const HOW: { n: string; t: string; d: string }[] = [
  { n: '01', t: 'Connect', d: 'Your program office invites each supplier. Each supplier puts its people on your sites on the record.' },
  { n: '02', t: 'Control', d: 'Your managers approve job requests and sign weeks. Rules block a start without an I-9 and warn on the rest.' },
  { n: '03', t: 'Reconcile', d: 'Each supplier sends its invoice. Finance pays what matches the signed hours and the contract rate.' },
]

/**
 * What the audit is, before the form asks anything (the founder's
 * feedback, 2026-10-10). Every line is what the census page promises
 * (lib/census-copy): the page, what it reads, the five working days.
 */
const AUDIT_STEPS: { t: string; d: string }[] = [
  { t: 'What you get', d: 'One page: how many contractors you have, what they cost, who has been here longest, and where two suppliers are paid differently for one skill.' },
  { t: 'Also, if your data shows it', d: 'Duplicate rows, and every gap we hit, such as hours nobody recorded.' },
  { t: 'What we need', d: 'Your contractor list and the latest invoice receipts from each supplier, in whatever form you have them.' },
  { t: 'How long', d: 'One page back inside five working days of your files arriving.' },
  { t: 'Next step', d: 'A named person at Etyme walks you through the page.' },
]

/** What is done and what is not, from the security position (lib/public-site/company, SECURITY). */
const SECURITY_DONE: string[] = [
  'Every read of a person’s record is logged: who read it, why, and whether it was allowed.',
  'A refused read is logged before the refusal is sent.',
  'Each kind of record is kept for a set period, with the rule that requires it cited.',
  'A breach is recorded the day it is noticed, and each notice names the person who sends it.',
]
const SECURITY_NOT_YET: string[] = [
  'No SOC 2 report and no ISO 27001 certificate.',
  'No third-party penetration test.',
  'No rate limiting or firewall rules in the application.',
]

const FIGURE = 'overflow-hidden rounded-r-lg border border-etyme-rule bg-etyme-raised shadow-lift'
const CAPTION = 'px-4 py-3 text-[13px] leading-relaxed text-etyme-muted md:px-5'
const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-etyme-action/40 focus-visible:ring-offset-2'
const PRIMARY_BUTTON =
  `rounded-lg bg-etyme-action px-6 py-3.5 text-center text-[15px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90 ${FOCUS}`
const SECOND_BUTTON =
  `rounded-lg border border-etyme-rule bg-etyme-raised px-6 py-3.5 text-center text-[15px] font-semibold text-etyme-ink transition-colors hover:border-etyme-ink ${FOCUS}`
const TEXT_LINK = `font-medium text-etyme-action underline-offset-4 hover:underline ${FOCUS} rounded-sm`
/** A link in the close's quick-links table: a text link, never a button. */
const QUICK_LINK = 'text-etyme-action underline underline-offset-4 hover:opacity-80'

/**
 * Every band has the same column and the same padding (lib/public-site/
 * rhythm), alternating plain and tinted down to the close, with one
 * hairline between two bands. The page settles on a band when the reader
 * stops near one (lib/public-site/settle), and never for a reader who
 * asked for reduced motion.
 */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-etyme-canvas">
      <SiteHeader onHome />
      <SettleOnBands />

      <main>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section id="top" className={`${SCREEN} ${EDGE} overflow-hidden`}>
        <div className={BAND}>
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-balance font-serif text-[40px] font-normal leading-[1.05] tracking-[-0.02em] text-etyme-ink
                           md:text-[60px]">
              Know what every contractor costs, across every supplier.
            </h1>
            {/* The founder's support line, 2026-10-10, then the category. */}
            <p className="mx-auto mt-6 max-w-[58ch] text-pretty text-[17px] leading-relaxed text-etyme-muted md:text-[19px]">
              Bring contractor records, supplier activity, tenure, approvals and the check of every invoice receipt into one trusted control layer, without replacing your existing workforce systems.
            </p>
            <p className="mt-3 text-[15px] font-medium leading-snug text-etyme-ink md:text-[16px]">
              Enterprise contingent workforce management.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <CountedLink href={GET_THE_AUDIT.href} event="audit_cta_clicked" className={PRIMARY_BUTTON}>
                {GET_THE_AUDIT.t}
              </CountedLink>
              <CountedLink href={SEE_IT.href} event="demo_cta_clicked" className={SECOND_BUTTON}>
                {`${SEE_IT.t} →`}
              </CountedLink>
            </div>
          </div>

          {/* Problem, outcome, next step: three short lines a buyer reads
              in order, in seconds (the founder's feedback, 2026-10-10). */}
          <dl className="mx-auto mt-10 grid max-w-4xl gap-px overflow-hidden rounded-panel border border-etyme-rule bg-etyme-rule text-left md:grid-cols-3">
            {GLANCE.map((g) => (
              <div key={g.t} className="bg-etyme-surface px-4 py-3.5">
                <dt className="stat-label">{g.t}</dt>
                <dd className="mt-1 text-[15px] leading-snug text-etyme-ink">{g.d}</dd>
              </div>
            ))}
          </dl>

          {/* The product, drawn with the product's own list and fed the
              world seed's rows for one demo program. Labeled on its frame
              and under it. */}
          <figure className="mx-auto mt-12 max-w-5xl md:mt-16" aria-label={SAMPLE_LABEL}>
            <SampleDesk />
            <figcaption className="mt-3 text-center text-[13px] leading-relaxed text-etyme-muted">
              Northbend Athletic and every firm on this sample is a demo company — not a customer.
              {' '}<CountedLink href={SEE_IT.href} event="demo_cta_clicked" className={TEXT_LINK}>Open it in the demo</CountedLink>. No card. No sign-up.
            </figcaption>
          </figure>
        </div>
      </section>

      {/* ── The problem ──────────────────────────────────────── */}
      {/* The hook is the not-knowing (CLAUDE.md, "What Etyme is"). The
          business case is one click away, at /compliance, never a penalty
          on this page. */}
      <section id="problem" className={`${SCREEN} ${EDGE} bg-etyme-surface`}>
        <div className={BAND}>
          <p className="eyebrow mb-3">The problem</p>
          <h2 className={H2}>Your contractor data sits in four places that do not agree</h2>

          <ul className={`${UNDER_HEADING} grid gap-3 sm:grid-cols-2 lg:grid-cols-4`}>
            {SPLIT.map((s) => (
              <li key={s.t} className="rounded-panel border border-etyme-rule bg-etyme-raised p-4">
                <p className="text-[15px] font-semibold text-etyme-ink">{s.t}</p>
                <p className="mt-1 text-[14px] leading-snug text-etyme-muted">{s.d}</p>
              </li>
            ))}
          </ul>

          <div className="mt-10 grid gap-6 lg:grid-cols-12 lg:gap-x-6">
            <p className="text-balance font-serif text-[24px] leading-snug text-etyme-ink lg:col-span-6">
              So four plain questions have no quick answer.
            </p>
            <div className="lg:col-span-6">
              <ol className="divide-y divide-etyme-rule border-y border-etyme-rule">
                {QUESTIONS.map((q, i) => (
                  <li key={q} className="flex items-baseline gap-4 py-3.5">
                    <span className="font-mono text-[12px] tabular-nums text-etyme-faint">{`0${i + 1}`}</span>
                    <span className="text-[17px] leading-snug text-etyme-ink">{q}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-5 text-[15px] leading-relaxed text-etyme-muted">
                No one supplier can answer, because each sees only its own people.
                {' '}<Link href={'/compliance' as Route} className={TEXT_LINK}>What it costs when somebody finally asks →</Link>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── The platform ─────────────────────────────────────── */}
      {/* The eight parts, drawn from the same data as the Platform menu
          (PRODUCT_STAGES), so the menu and the page teach one map. The
          three trade words are defined once, under them. */}
      <section id="platform" className={`${SCREEN} ${EDGE}`}>
        <div className={BAND}>
          <p className="eyebrow mb-3">The platform</p>
          <h2 className={H2}>Etyme puts every supplier’s contractors on one record</h2>
          <p className="mt-4 max-w-[60ch] text-[17px] leading-relaxed text-etyme-muted">
            Your managers, program office and finance work from it. Your suppliers work in it too, and each sees only its own people and rates.
          </p>

          <div className={`${UNDER_HEADING} grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4`}>
            {PRODUCT_STAGES.map((stage) => (
              <div key={stage.heading}>
                <p className="stat-label border-b border-etyme-rule pb-2">{stage.heading}</p>
                <ul className="mt-3 space-y-3">
                  {stage.items.map((m) => (
                    <li key={m.href}>
                      <Link
                        href={m.href as Route}
                        className={`group flex gap-3 rounded-panel border border-etyme-rule bg-etyme-raised px-4 py-3.5
                                   transition-shadow hover:shadow-lift ${FOCUS}`}
                      >
                        <ModuleIcon href={m.href} className="mt-0.5 shrink-0 text-etyme-action" />
                        <span>
                          <span className="block text-[15px] font-semibold leading-snug text-etyme-ink group-hover:text-etyme-action">
                            {m.t}
                          </span>
                          <span className="mt-1 block text-[13px] leading-snug text-etyme-muted">{m.d}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <dl className="mt-10 grid gap-x-6 gap-y-4 border-t border-etyme-rule pt-6 md:grid-cols-3">
            {TERMS.map((term) => (
              <div key={term.t}>
                <dt className="text-[14px] font-semibold text-etyme-ink">{term.t}</dt>
                <dd className="mt-1 text-[14px] leading-snug text-etyme-muted">{term.d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── The product, on real screens ─────────────────────── */}
      <section id="product" className={`${SCREEN} ${EDGE} bg-etyme-surface`}>
        <div className={BAND}>
          <p className="eyebrow mb-3">The product</p>
          <h2 className={H2}>These are the screens your desks use</h2>

          <div className={`${UNDER_HEADING} grid gap-6 md:grid-cols-2`}>
            {SHOWCASE.map((s, i) => (
              <figure key={s.img} className={`${FIGURE} ${i === 0 ? 'md:col-span-2' : ''}`}>
                <img
                  src={s.img}
                  data-captured-at={s.capturedAt}
                  alt={s.alt}
                  width={1440}
                  height={900}
                  loading={i === 0 ? 'eager' : 'lazy'}
                  className="block h-auto w-full border-b border-etyme-rule"
                />
                <figcaption className={CAPTION}>{s.caption}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ── Solutions: the client's desks ────────────────────── */}
      <section id="solutions" className={`${SCREEN} ${EDGE}`}>
        <div className={BAND}>
          <p className="eyebrow mb-3">Solutions</p>
          <h2 className={H2}>Each desk at your company sees its own work</h2>

          <ul className={`${UNDER_HEADING} grid gap-3 sm:grid-cols-2`}>
            {DESKS.map((d) => (
              <li key={d.t} className="flex flex-col rounded-panel border border-etyme-rule bg-etyme-raised p-5">
                <p className="text-[17px] font-semibold text-etyme-ink">{d.t}</p>
                <p className="stat-label mt-4">Cannot answer today</p>
                <p className="mt-1 text-[15px] leading-snug text-etyme-ink">{d.cannot}</p>
                <p className="stat-label mt-3">What the record answers</p>
                <p className="mt-1 text-[15px] leading-snug text-etyme-muted">{d.answers}</p>
                <div className="mt-auto pt-4 text-[14px] font-medium">
                  <DemoLink target={d.demo} label={`Open ${d.screen} as ${d.demo.seat} →`} className={TEXT_LINK} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── How it works: three steps ────────────────────────── */}
      <section id="how-it-works" className={`${SCREEN} ${EDGE} bg-etyme-surface`}>
        <div className={BAND}>
          <p className="eyebrow mb-3">How it works</p>
          <h2 className={H2}>Connect. Control. Reconcile.</h2>

          <ol className={`${UNDER_HEADING} grid gap-6 md:grid-cols-3`}>
            {HOW.map((h) => (
              <li key={h.n} className="border-t-2 border-etyme-ink pt-4">
                <span className="font-mono text-[12px] tabular-nums text-etyme-faint">{h.n}</span>
                <p className="mt-1 font-serif text-[26px] leading-tight text-etyme-ink">{h.t}</p>
                <p className="mt-2 text-[15px] leading-relaxed text-etyme-muted">{h.d}</p>
              </li>
            ))}
          </ol>
          <p className="mt-8 text-[15px]">
            <Link href={'/docs/process' as Route} className={TEXT_LINK}>Read the whole process, step by step →</Link>
          </p>
        </div>
      </section>

      {/* ── The spend audit, inline ──────────────────────────── */}
      {/* Posts a real lead to /api/market/leads (lib/public-site/audit-form)
          and says it was sent only on a 2xx. */}
      <section id="audit" className={`${SCREEN} ${EDGE}`}>
        <div className={`${BAND} grid gap-8 lg:grid-cols-12 lg:gap-x-6`}>
          <div className="lg:col-span-6">
            <p className="eyebrow mb-3">Free contractor spend audit</p>
            <h2 className={H2}>Ask for a free audit of what your contractors cost</h2>
            <dl className="mt-6 divide-y divide-etyme-rule border-y border-etyme-rule">
              {AUDIT_STEPS.map((x) => (
                <div key={x.t} className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
                  <dt className="text-[14px] font-semibold text-etyme-ink">{x.t}</dt>
                  <dd className="text-[15px] leading-snug text-etyme-muted">{x.d}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-[15px] leading-relaxed text-etyme-muted">
              Nothing you send starts a sequence or joins a list.
              {' '}<CountedLink href={GET_THE_AUDIT.href} event="audit_cta_clicked" className={TEXT_LINK}>Or start on the audit page</CountedLink>.
            </p>
          </div>
          <div className="lg:col-span-6">
            <AuditForm />
          </div>
        </div>
      </section>

      {/* ── Security and trust ───────────────────────────────── */}
      {/* From the security position (/security), which lists the gaps as
          plainly as the controls. No certification is claimed, because
          none is held. */}
      <section id="security" className={`${SCREEN} ${EDGE} bg-etyme-surface`}>
        <div className={BAND}>
          <p className="eyebrow mb-3">Security</p>
          <h2 className={H2}>Here is what is done, and what is not yet</h2>

          <div className={`${UNDER_HEADING} grid gap-6 md:grid-cols-2`}>
            <div className="rounded-panel border border-etyme-rule bg-etyme-raised p-5">
              <p className="stat-label">Done</p>
              <ul className="mt-3 space-y-2.5">
                {SECURITY_DONE.map((line) => (
                  <li key={line} className="flex gap-2.5 text-[15px] leading-snug text-etyme-ink">
                    <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-etyme-verified" />
                    {line}
                  </li>
                ))}
                <li className="flex gap-2.5 text-[15px] leading-snug text-etyme-ink">
                  <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-etyme-verified" />
                  <span>
                    A data processing addendum you can read now.
                    {' '}<Link href={'/dpa' as Route} className={TEXT_LINK}>Read the DPA</Link>
                  </span>
                </li>
              </ul>
            </div>
            <div className="rounded-panel border border-etyme-rule bg-etyme-raised p-5">
              <p className="stat-label">Not done yet</p>
              <ul className="mt-3 space-y-2.5">
                {SECURITY_NOT_YET.map((line) => (
                  <li key={line} className="flex gap-2.5 text-[15px] leading-snug text-etyme-ink">
                    <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-etyme-attention" />
                    {line}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[14px] leading-snug text-etyme-muted">
                A penetration test comes first, then SOC 2. No date is published, because none is contracted.
              </p>
            </div>
          </div>
          <p className="mt-6 text-[15px]">
            <Link href={'/security' as Route} className={TEXT_LINK}>Read the full security position →</Link>
          </p>
        </div>
      </section>

      {/* ── The close ───────────────────────────────────────── */}
      {/* The same close every public page ends in (lib/public-site/
          close-band), with the ask form behind its third card here. What
          only this page says at its close, as quick links: where to check
          us, the program office once and quietly, the price in one row,
          and the supplier's and the contractor's doors as text links,
          because this page is written to the company buying. */}
      <CloseBand id="close" withForm>
        <table className="w-full table-fixed border-collapse text-left text-[13px] leading-snug">
          <thead>
            <tr className="border-b border-etyme-rule text-[10.5px] uppercase tracking-[0.08em] text-etyme-faint">
              <th scope="col" className="w-1/2 py-1.5 pr-3 font-medium">If you want to…</th>
              <th scope="col" className="w-1/2 py-1.5 font-medium">Go to</th>
            </tr>
          </thead>
          <tbody className="text-etyme-ink">
            <tr className="border-b border-etyme-rule/70">
              <td className="py-1.5 pr-3 align-top">Read how it works</td>
              <td className="py-1.5 align-top">
                <Link href={'/docs' as Route} className={QUICK_LINK}>
                  Documentation →
                </Link>
              </td>
            </tr>
            <tr className="border-b border-etyme-rule/70">
              <td className="py-1.5 pr-3 align-top">Have Etyme run your program office</td>
              <td className="py-1.5 align-top">
                <Link href={'/about' as Route} className={QUICK_LINK}>
                  How that works →
                </Link>
              </td>
            </tr>
            <tr id="why" className="scroll-mt-6 border-b border-etyme-rule/70">
              <td className="py-1.5 pr-3 align-top">Know the price</td>
              <td className="py-1.5 align-top">
                <Link href={'/about' as Route} className={QUICK_LINK}>
                  None set yet. Free for the first five firms →
                </Link>
              </td>
            </tr>
            <tr className="border-b border-etyme-rule/70">
              <td className="py-1.5 pr-3 align-top">See it as a supplier</td>
              <td className="py-1.5 align-top">
                <TryDemo side="BENCH" label="A supplier’s desk →" className={QUICK_LINK} />
              </td>
            </tr>
            <tr>
              <td className="py-1.5 pr-3 align-top">See it as a contractor</td>
              <td className="py-1.5 align-top">
                <TryDemo side="CANDIDATE" label="A contractor’s own page →" className={QUICK_LINK} />
              </td>
            </tr>
          </tbody>
        </table>
      </CloseBand>
      </main>

      <SiteFooter />
    </div>
  )
}
