import type { Metadata } from 'next'
import { SiteHeader, HomeFooter } from '@/lib/public-site/frame'
import { CountedLink } from '@/lib/public-site/counted-link'
import { HomeDemo } from '@/lib/public-site/home-demo'
import { SEE_IT, GET_THE_AUDIT } from '@/lib/public-site/funnel'

/**
 * The front door.
 *
 * ── The home page is the product, and the slop is gone ──────────────
 *
 * The founder approved this page on 2026-10-14 ("Build it", on the
 * drawing he corrected three times). Three sections and about a hundred
 * and ten words, and the test for every word: which buyer asked for it,
 * and can the reader check it by clicking something on this page.
 *
 *   hero        the question and the category line, word for word
 *   #demo       the live product, read-only, in a frame: the seeded
 *               Northbend Athletic program manager's screens from
 *               /embed/demo, labeled as a sample, with four chips —
 *               Source, Submit, Approve, Pay — each moving the frame to
 *               its step, and one button to the full demo
 *   #sign-up    "Seen enough? Set up your company.", sign-up first, the
 *               audit second, and every party's door on one small line,
 *               Clients first
 *   then one line for security, and the footer
 *
 * Cut, and where each went (CLAUDE.md, the same section): the problem
 * band (the demo answers the four questions on its first screen); the
 * platform band and its cards (the chips); specialist teams around the
 * world and what is set once (the documentation); the desks band and the
 * Platform, Solutions and How It Works items in this page's header (six
 * audiences on one page speak to none); the three screenshots and their
 * captions (the live product); the security band's four cards (one line
 * and the link); the audit form and the close (the audit is the second
 * call, on its own page); the trust card. Ask Etyme and Teams are not
 * sold here: Ask Etyme is the demo's first screen, and Teams waits for a
 * real card tapped in a real tenant.
 *
 * ── Rules that still bind ────────────────────────────────────────────
 *
 * Category first, never one module, never AI, never a supply claim, no
 * named company but the demo's own, labeled as a sample beside it, no
 * size of buyer, no claim a reader cannot check, plain words, written to
 * the client. `lib/positioning` holds each and `positioning.test.ts`
 * reads this file against them.
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

/**
 * The four chips under the product. Each moves the frame to its step.
 * The overview is the frame's first screen and no chip is lit until one
 * is pressed, because the overview is none of the four steps.
 */
const CHIPS: { t: string; href: string }[] = [
  { t: 'Source', href: '/embed/demo/source' },
  { t: 'Submit', href: '/embed/demo/submit' },
  { t: 'Approve', href: '/embed/demo/approve' },
  { t: 'Pay', href: '/embed/demo/pay' },
]

/**
 * The frame the product sits in. The chrome strip says whose screens
 * these are, in the drawing's words; the line under the frame says every
 * firm on them is a demo company, not a customer, and is always visible
 * (the founder's label, 2026-09-27). The two are drawn together by one
 * component and read together by `public-example-names.test.ts`.
 */
const FRAME = {
  src: '/embed/demo',
  name: 'home-demo',
  title: 'Live demo of Northbend Athletic, a demo company, not a customer: the program manager’s screens',
  chrome: 'Live demo · Northbend Athletic, a sample company',
  fallback: { t: 'The demo did not load here.', link: 'Open it on its own page' },
}
const ON_SCREEN = 'You are the program manager. Every firm on this screen is a demo company, not a customer.'

/** Every party's door, on one small line in the sign-up band. Clients first. */
const DOORS: { t: string; href: string }[] = [
  { t: 'Clients', href: '/signup' },
  { t: 'Program offices', href: '/for/program-offices' },
  { t: 'Integrators', href: '/for/integrators' },
  { t: 'Suppliers', href: '/for/suppliers' },
  { t: 'Workers', href: '/for/contractors' },
]

/** The footer: the documentation, the same four doors, security, the legal pages, contact. */
const FOOTER_LINKS: { t: string; href: string }[] = [
  { t: 'Documentation', href: '/docs' },
  { t: 'Program offices', href: '/for/program-offices' },
  { t: 'Integrators', href: '/for/integrators' },
  { t: 'Suppliers', href: '/for/suppliers' },
  { t: 'Workers', href: '/for/contractors' },
  { t: 'Security', href: '/security' },
  { t: 'Privacy', href: '/privacy' },
  { t: 'Terms', href: '/terms' },
  { t: 'DPA', href: '/dpa' },
  { t: 'Contact', href: '/contact' },
]

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-etyme-action/40 focus-visible:ring-offset-2'
const PRIMARY_BUTTON =
  `whitespace-nowrap rounded-lg bg-etyme-action px-5 py-3 text-center text-[15px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90 ${FOCUS}`
const SECOND_BUTTON =
  `whitespace-nowrap rounded-lg border border-etyme-rule bg-etyme-surface px-5 py-3 text-center text-[15px] font-semibold text-etyme-ink transition-colors hover:border-etyme-ink ${FOCUS}`
const TEXT_LINK = `text-etyme-action-press underline-offset-4 hover:underline ${FOCUS} rounded-sm`

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-etyme-canvas">
      <SiteHeader onHome />

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* ── Hero: the question and the category, word for word ── */}
        <section id="top" className="max-w-[760px] pb-6 pt-10 md:pt-14">
          <h1 className="text-balance font-serif text-[34px] font-normal leading-[1.06] tracking-[-0.02em] text-etyme-ink md:text-[52px]">
            Know what every contractor costs, across every supplier.
          </h1>
          <p className="mt-3 text-[17px] leading-snug text-etyme-muted md:text-[18px]">
            Enterprise contingent workforce management.
          </p>
        </section>

        {/* ── The product, live and read-only ───────────────────── */}
        <section id="demo" aria-label="Live demo" className="pb-4">
          <HomeDemo
            name={FRAME.name}
            src={FRAME.src}
            title={FRAME.title}
            chrome={FRAME.chrome}
            label={ON_SCREEN}
            chipsLabel={'The four steps'}
            chips={CHIPS}
            fallback={FRAME.fallback}
          >
            <CountedLink href={SEE_IT.href} event="demo_cta_clicked" className={PRIMARY_BUTTON}>
              Open the demo, no account
            </CountedLink>
          </HomeDemo>
        </section>

        {/* ── Sign-up, right under the product ──────────────────── */}
        <section
          id="sign-up"
          className="my-9 grid gap-5 rounded-r-lg border border-etyme-rule bg-etyme-surface p-6 md:grid-cols-[1fr_auto] md:items-center md:p-7"
        >
          <div className="min-w-0">
            <h2 className="text-balance font-serif text-[26px] font-normal leading-tight tracking-[-0.02em] text-etyme-ink md:text-[28px]">
              Seen enough? Set up your company.
            </h2>
            <p className="mt-1.5 text-[15px] leading-snug text-etyme-muted">
              Two minutes. Your suppliers and contractors go where the sample ones are. Free while we are testing.
            </p>
            <p className="mt-2 text-[14px] leading-snug text-etyme-muted">
              Your door:{' '}
              {DOORS.map((d, i) => (
                <span key={d.href}>
                  {i > 0 && <span aria-hidden="true"> · </span>}
                  <a href={d.href} className={TEXT_LINK}>{d.t}</a>
                </span>
              ))}
            </p>
          </div>
          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
            <a href="/signup" className={PRIMARY_BUTTON}>Sign up</a>
            <CountedLink href={GET_THE_AUDIT.href} event="audit_cta_clicked" className={SECOND_BUTTON}>
              Get a free contractor spend audit
            </CountedLink>
          </div>
        </section>

        {/* ── Security: one line and the link ───────────────────── */}
        <p id="security" className="mb-10 text-[15px] leading-snug text-etyme-muted">
          Security: what is done, and what is next in order.{' '}
          <a href="/security" className={TEXT_LINK}>Read the security position</a>
          <span aria-hidden="true"> · </span>
          <a href="/docs" className={TEXT_LINK}>Documentation</a>
        </p>
      </main>

      <HomeFooter links={FOOTER_LINKS} />
    </div>
  )
}
