import { CountedLink } from './counted-link'
import { CLOSE_BAND, SEE_IT, ASK_A_PERSON } from './funnel'

/**
 * The band every public page ends in: see it, or ask a person.
 *
 * One component, so the ladder cannot drift page by page (see `./funnel`
 * for why these and in this order). Every page drawn inside the
 * frame ends in it. The home page did too, with the ask form behind its
 * third button and a table of quick links under it, until 2026-10-14,
 * when the founder approved a home page of three sections that ends in
 * its sign-up band and its footer. The ask form is on the contact page.
 *
 * Cards side by side from `md` and stacked on a phone, each one line and
 * one button. Decided 2026-09-28 (night): the founder read the band on
 * his phone as too big and too wordy — 1,794 pixels tall at 390 wide.
 * Two cards since 2026-10-14, when the founder deleted the audit from
 * every page: everything the band does is send a reader to the demo or a
 * person, so that is all it shows.
 */

const CARD = 'flex flex-col rounded-xl border border-etyme-rule bg-etyme-raised px-4 py-3.5 shadow-sm md:p-5'
const LINE = 'text-[13.5px] leading-snug text-etyme-muted md:text-[14px]'
const QUIET_BUTTON =
  'inline-block rounded-lg border border-etyme-ink/20 bg-etyme-surface px-4 py-2.5 text-sm font-semibold ' +
  'text-etyme-ink transition-colors hover:border-etyme-ink focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-etyme-action/40'

export function CloseBand({ id }: { id?: string } = {}) {
  const ask = ASK_A_PERSON
  return (
    <section
      id={id}
      className="border-t border-etyme-rule bg-etyme-surface"
      data-close-band=""
    >
      <div className="mx-auto max-w-6xl px-4 py-9 sm:px-6 md:py-20">
        <h2
          className="max-w-[26ch] text-balance font-serif text-[24px] leading-tight tracking-[-0.02em] text-etyme-ink md:text-[34px]"
        >
          {CLOSE_BAND.heading}
        </h2>

        <div className="mt-5 grid gap-2.5 md:mt-8 md:grid-cols-2 md:items-start md:gap-4">
          <div className={CARD}>
            <p className={LINE}>{CLOSE_BAND.cards.see}</p>
            <div className="mt-2.5 md:mt-3">
              {/* The filled button again since 2026-10-14, when the audit
                  that held it left every page. */}
              <CountedLink
                href={SEE_IT.href}
                event="demo_cta_clicked"
                className="inline-block rounded-lg bg-etyme-action px-4 py-2.5 text-sm font-semibold text-white shadow-sm
                           transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2
                           focus-visible:ring-etyme-action/40 focus-visible:ring-offset-2"
              >
                {`${SEE_IT.t} →`}
              </CountedLink>
            </div>
          </div>

          <div className={CARD}>
            <p className={LINE}>{CLOSE_BAND.cards.ask}</p>
            <div className="mt-2.5 md:mt-3">
              <a href={ask.href} className={QUIET_BUTTON}>
                {ask.t}
              </a>
            </div>
          </div>
        </div>

      </div>
    </section>
  )
}
