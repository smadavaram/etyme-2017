import type { EmbedStep } from '@/lib/sample-seat'
import { TryDemo } from '@/components/try-demo'
import { SiteHeader } from './frame'
import { DemoLink } from './demo-link'
import type { DemoTarget, PersonTarget } from './flow'
import type { BandKind } from './skeleton-words'
import type { StoryKey } from './story'
import { CategoryLine, LiveDemo, SignUpBand, SecurityLine, SkeletonFooter, PRIMARY_BUTTON } from './skeleton'

/**
 * One product page or party door, drawn in the home page's shape
 * (founder, 2026-10-14: "make sure even the sub pages and doors follow
 * the same structure"):
 *
 *   #top       the category line, the home page's own (2026-10-20), then
 *              a door's tabs where it has them (links, one address each),
 *              then the headline, and one line under it saying what the page is for
 *   #demo      the same live frame, opened at this page's step, the four
 *              chips under it, and one button that seats the reader at
 *              this page's own screen in the full demo
 *   #lines     at most three short lines: what you do here, who is
 *              involved, what happens next
 *   #sign-up   the home page's band; a door's filled button is its own sign-up
 *   then the one security line and the footer
 *
 * No screenshot, no card grid, no day-one panels, no growth story, no
 * bands. The words are data (`./modules`, `./parties`), so the guards in
 * `lib/positioning` read them, and one test counts every page against
 * the hundred and fifty words the founder allowed.
 */

export interface SubPageProps {
  /** A door's tabs, each a link to its own address, the open one marked. Drawn on the server; no script. */
  tabs?: { label: string; list: { t: string; href: string; current: boolean }[] }
  /** The headline: a product page's question, or a door's statement. */
  question: string
  purpose: string
  step: EmbedStep
  caption?: string
  label?: string
  lines: readonly string[]
  /** A link at the end of the last line, to the top of the page that says the rest. */
  link?: { t: string; href: string }
  /** The button under the frame. */
  demo: { label: string; target: DemoTarget | PersonTarget } | { label: string; candidate: true }
  /** The band's filled button, where it is not the client's sign-up. */
  signUp?: { t: string; href: string }
  /** The band: a company's, or a person's own (the contractors' door). */
  band?: BandKind
  /** Which story the panel plays: Northbend Athletic's unless a page names another. */
  story?: StoryKey
}

function DemoButton({ demo }: { demo: SubPageProps['demo'] }) {
  if ('candidate' in demo) return <TryDemo side="CANDIDATE" label={demo.label} className={PRIMARY_BUTTON} />
  return <DemoLink target={demo.target} label={demo.label} className={PRIMARY_BUTTON} />
}

const TAB = 'rounded-full border px-3 py-1.5 text-[14px] leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-etyme-action/40 focus-visible:ring-offset-2'

export function SubPageView({ tabs, question, purpose, step, caption, label, lines, link, demo, signUp, band, story }: SubPageProps) {
  const shown = lines.slice(0, 3)
  return (
    <div className="min-h-screen overflow-x-hidden bg-etyme-canvas">
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* ── The question, and what this page is for ── */}
        <section id="top" className="max-w-[760px] pb-6 pt-10 md:pt-14">
          {/* The category first, above the tabs, as on the home page (2026-10-20). */}
          <CategoryLine className={tabs ? 'mb-3' : 'mb-2'} />
          {tabs && (
            <nav aria-label={tabs.label} className="mb-6 flex flex-wrap gap-2">
              {tabs.list.map((t) => (
                <a
                  key={t.href}
                  href={t.href}
                  aria-current={t.current ? 'page' : undefined}
                  className={`${TAB} ${t.current ? 'border-etyme-ink bg-etyme-ink text-etyme-canvas' : 'border-etyme-rule bg-etyme-raised text-etyme-ink hover:bg-etyme-sunk'}`}
                >
                  {t.t}
                </a>
              ))}
            </nav>
          )}
          <h1 className="text-balance font-serif text-[32px] font-normal leading-[1.08] tracking-[-0.02em] text-etyme-ink md:text-[46px]">
            {question}
          </h1>
          <p className="mt-3 text-[17px] leading-snug text-etyme-muted md:text-[18px]">{purpose}</p>
        </section>

        {/* ── The product, live and read-only, at this page's step ── */}
        <LiveDemo step={step} caption={caption} label={label} story={story}>
          <DemoButton demo={demo} />
        </LiveDemo>

        {/* ── At most three lines: what you do, who, what next ── */}
        <ul id="lines" className="mt-8 max-w-[760px] space-y-2 border-l-2 border-etyme-rule pl-4">
          {shown.map((l, i) => (
            <li key={l} className="text-[16px] leading-snug text-etyme-ink">
              {l}
              {link && i === shown.length - 1 && (
                <>
                  {' '}
                  <a href={link.href} className="font-medium text-etyme-action-press underline-offset-4 hover:underline">{link.t}</a>
                </>
              )}
            </li>
          ))}
        </ul>

        <SignUpBand primary={signUp} band={band} />
        <SecurityLine />
      </main>

      <SkeletonFooter />
    </div>
  )
}
