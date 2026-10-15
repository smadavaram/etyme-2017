import { MODULES, PAIR_LABELS, LINE_LABELS, type ModulePage } from './modules'
import { OPEN_DEMO } from './skeleton-words'
import { SiteHeader } from './frame'
import { DemoLink } from './demo-link'
import { LiveDemo, SignUpBand, SecurityLine, SkeletonFooter, PRIMARY_BUTTON, FOCUS } from './skeleton'

/**
 * The four step pages, each telling the story the same way (founder,
 * 2026-10-15, "build it" on the menu told as a story):
 *
 *   #top       "Step n of 4 · Name", one promise, one line under it
 *   #pair      "Today" beside "With Etyme"
 *   #demo      the panel that shows the product working, opened at this
 *              step, and the button that seats the reader at this step's
 *              own screen in the full demo
 *   #lines     what you do, who is involved, what happens next
 *   Previous and Next, so the four read as one story
 *   #sign-up   the home page's band, then the security line and the footer
 *
 * The words are data (`./modules`), so the guards in `lib/positioning`
 * read them, and one test counts every page against its word ceiling.
 * The party doors keep the home page's shape (`./sub-page`).
 */
export function ModulePageView({ m }: { m: ModulePage }) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-etyme-canvas">
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* ── Which step, the promise, and one line ── */}
        <section id="top" className="max-w-[760px] pb-2 pt-10 md:pt-14">
          <p className="mb-2 text-[12px] font-medium uppercase tracking-[0.08em] text-etyme-faint">{m.eyebrow}</p>
          <h1 className="text-balance font-serif text-[34px] font-normal leading-[1.04] tracking-[-0.025em] text-etyme-ink md:text-[56px]">
            {m.headline}
          </h1>
          <p className="mt-3 max-w-[56ch] text-[17px] leading-snug text-etyme-muted md:text-[19px]">{m.lede}</p>
        </section>

        {/* ── Today, and with Etyme ── */}
        <section id="pair" aria-label={`${PAIR_LABELS.today} and ${PAIR_LABELS.withEtyme}`} className="my-7 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-etyme-rule bg-etyme-attention-wash px-[18px] py-4">
            <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-etyme-attention">{PAIR_LABELS.today}</p>
            <p className="text-[15px] leading-snug text-etyme-ink">{m.today}</p>
          </div>
          <div className="rounded-xl border border-etyme-rule bg-etyme-verified-wash px-[18px] py-4">
            <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-etyme-verified">{PAIR_LABELS.withEtyme}</p>
            <p className="text-[15px] leading-snug text-etyme-ink">{m.withEtyme}</p>
          </div>
        </section>

        {/* ── The product, working, at this step ── */}
        <LiveDemo step={m.step}>
          <DemoLink target={m.demo} label={OPEN_DEMO} className={PRIMARY_BUTTON} />
        </LiveDemo>

        {/* ── What you do, who is involved, what happens next ── */}
        <dl id="lines" className="mt-5 max-w-[760px] border-t border-etyme-rule">
          {LINE_LABELS.map((label, i) => (
            <div key={label} className="flex flex-col gap-0.5 border-b border-etyme-rule py-[11px] sm:flex-row sm:gap-3.5">
              <dt className="min-w-[132px] text-[15px] font-semibold text-etyme-ink">{label}</dt>
              <dd className="text-[15px] leading-snug text-etyme-ink">{m.lines[i]}</dd>
            </div>
          ))}
        </dl>

        {/* ── Previous and Next ── */}
        <nav aria-label="Steps" data-prev-next="bottom" className="mb-2 mt-6 flex justify-between gap-4 text-[14px]">
          <a href={m.prev.href} rel="prev" className={`rounded-sm text-etyme-action-press underline-offset-4 hover:underline ${FOCUS}`}>
            <span aria-hidden="true">← </span>{m.prev.t}
          </a>
          <a href={m.next.href} rel="next" className={`rounded-sm text-right text-etyme-action-press underline-offset-4 hover:underline ${FOCUS}`}>
            {m.next.t}<span aria-hidden="true"> →</span>
          </a>
        </nav>

        <SignUpBand />
        <SecurityLine />
      </main>

      <SkeletonFooter />
    </div>
  )
}

/**
 * What a route file under `app/(site)` needs, so each one is three lines:
 *
 *     import { modulePage } from '@/lib/public-site/module-page'
 *     const { Page, metadata } = modulePage('/requisitions')
 *     export { metadata }
 *     export default Page
 */
export function modulePage(route: string) {
  const m = MODULES.find((x) => x.route === route)
  if (!m) throw new Error(`No step page is registered at ${route}`)
  return {
    metadata: { title: m.title, description: m.lede },
    Page: function Page() {
      return <ModulePageView m={m} />
    },
  }
}
