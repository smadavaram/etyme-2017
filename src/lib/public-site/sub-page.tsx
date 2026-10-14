import type { EmbedStep } from '@/lib/sample-seat'
import { TryDemo } from '@/components/try-demo'
import { SiteHeader } from './frame'
import { DemoLink } from './demo-link'
import type { DemoTarget } from './flow'
import { LiveDemo, SignUpBand, SecurityLine, SkeletonFooter, PRIMARY_BUTTON } from './skeleton'

/**
 * One product page or party door, drawn in the home page's shape
 * (founder, 2026-10-14: "make sure even the sub pages and doors follow
 * the same structure"):
 *
 *   #top       one question, and one line under it saying what the page is for
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
  question: string
  purpose: string
  step: EmbedStep
  caption?: string
  label?: string
  lines: readonly string[]
  /** The button under the frame. */
  demo: { label: string; target: DemoTarget } | { label: string; candidate: true }
  /** The band's filled button, where it is not the client's sign-up. */
  signUp?: { t: string; href: string }
}

function DemoButton({ demo }: { demo: SubPageProps['demo'] }) {
  if ('candidate' in demo) return <TryDemo side="CANDIDATE" label={demo.label} className={PRIMARY_BUTTON} />
  return <DemoLink target={demo.target} label={demo.label} className={PRIMARY_BUTTON} />
}

export function SubPageView({ question, purpose, step, caption, label, lines, demo, signUp }: SubPageProps) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-etyme-canvas">
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* ── The question, and what this page is for ── */}
        <section id="top" className="max-w-[760px] pb-6 pt-10 md:pt-14">
          <h1 className="text-balance font-serif text-[32px] font-normal leading-[1.08] tracking-[-0.02em] text-etyme-ink md:text-[46px]">
            {question}
          </h1>
          <p className="mt-3 text-[17px] leading-snug text-etyme-muted md:text-[18px]">{purpose}</p>
        </section>

        {/* ── The product, live and read-only, at this page's step ── */}
        <LiveDemo step={step} caption={caption} label={label}>
          <DemoButton demo={demo} />
        </LiveDemo>

        {/* ── At most three lines: what you do, who, what next ── */}
        <ul id="lines" className="mt-8 max-w-[760px] space-y-2 border-l-2 border-etyme-rule pl-4">
          {lines.slice(0, 3).map((l) => (
            <li key={l} className="text-[16px] leading-snug text-etyme-ink">{l}</li>
          ))}
        </ul>

        <SignUpBand primary={signUp} />
        <SecurityLine />
      </main>

      <SkeletonFooter />
    </div>
  )
}
