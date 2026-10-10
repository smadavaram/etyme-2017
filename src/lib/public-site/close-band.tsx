import { Ask } from '@/app/site/ask'
import { CountedLink } from './counted-link'
import { ASK_COPY } from './leads'
import { CLOSE_BAND, SEE_IT, GET_THE_AUDIT, ASK_A_PERSON } from './funnel'
import { SCREEN, BAND, H2, UNDER_HEADING } from './rhythm'

/**
 * The band every public page ends in: see it, get the audit, ask a person.
 *
 * One component, so the ladder cannot drift page by page (see `./funnel`
 * for why these three and in this order). Every page drawn inside the
 * frame ends in it, and the home page ends in it too.
 *
 * Three cards, side by side from `md` and stacked on a phone, each one
 * line and one button. Decided 2026-09-28 (night): the founder read the
 * band on his phone as too big and too wordy — 1,794 pixels tall at 390
 * wide, most of it the ask form open beside the buttons. Everything the
 * band does is send a reader to the demo, the audit or a person, so that
 * is all it shows. On the home page the ask form waits behind its button
 * (`details`, so it works with no script); elsewhere the button goes to
 * the form on the contact page.
 *
 * `children` is for what one page must say at its close and no other
 * page should: the home page's quick-links table (2026-09-29, "less
 * prose") — where to check us, the program office once and quietly, the
 * one row on price, and the two quieter doors. Anything that belongs on
 * every page belongs in
 * `./funnel`, where the guard reads it.
 *
 * `withForm` is the home page's close, and it is also one more band of
 * the home page's rhythm
 * (`./rhythm`, 2026-09-30): one screen under the header, the same padding,
 * column and heading size as the bands above it, on the canvas because
 * the band above it is the ink and the footer under it the surface. No
 * hairline of its own: the band above ends in one and the footer starts
 * with one. Every other page keeps the close as it was.
 */

const CARD = 'flex flex-col rounded-xl border border-etyme-rule bg-etyme-raised px-4 py-3.5 shadow-sm md:p-5'
const LINE = 'text-[13.5px] leading-snug text-etyme-muted md:text-[14px]'
const QUIET_BUTTON =
  'inline-block rounded-lg border border-etyme-ink/20 bg-etyme-surface px-4 py-2.5 text-sm font-semibold ' +
  'text-etyme-ink transition-colors hover:border-etyme-ink focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-etyme-action/40'

export function CloseBand({
  id,
  withForm = false,
  children,
}: {
  id?: string
  /**
   * The home page's close: the ask form behind the third card's button,
   * rather than a link to the contact page, and the home page's band
   * rhythm — one screen, the same padding, column and heading.
   */
  withForm?: boolean
  children?: React.ReactNode
}) {
  const ask = ASK_A_PERSON
  const onHome = withForm
  return (
    <section
      id={id}
      className={onHome ? `${SCREEN} bg-etyme-canvas` : 'border-t border-etyme-rule bg-etyme-surface'}
      data-close-band=""
    >
      <div className={onHome ? BAND : 'mx-auto max-w-6xl px-4 py-9 sm:px-6 md:py-20'}>
        <h2
          className={onHome ? H2 : 'max-w-[26ch] text-balance font-serif text-[24px] leading-tight tracking-[-0.02em] text-etyme-ink md:text-[34px]'}
        >
          {CLOSE_BAND.heading}
        </h2>

        <div className={`${onHome ? UNDER_HEADING : 'mt-5 md:mt-8'} grid gap-2.5 md:grid-cols-3 md:items-start md:gap-4`}>
          <div className={CARD}>
            <p className={LINE}>{CLOSE_BAND.cards.see}</p>
            <div className="mt-2.5 md:mt-3">
              <CountedLink href={SEE_IT.href} event="demo_cta_clicked" className={QUIET_BUTTON}>
                {`${SEE_IT.t} →`}
              </CountedLink>
            </div>
          </div>

          <div className={CARD}>
            <p className={LINE}>{CLOSE_BAND.cards.audit}</p>
            <div className="mt-2.5 md:mt-3">
              {/* The filled button since 2026-10-09: the audit is the primary
                  call to action on every page, the demo the second. */}
              <CountedLink
                href={GET_THE_AUDIT.href}
                event="audit_cta_clicked"
                className="inline-block rounded-lg bg-etyme-action px-4 py-2.5 text-sm font-semibold text-white shadow-sm
                           transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2
                           focus-visible:ring-etyme-action/40 focus-visible:ring-offset-2"
              >
                {GET_THE_AUDIT.t}
              </CountedLink>
            </div>
          </div>

          <div className={CARD}>
            <p className={LINE}>{CLOSE_BAND.cards.ask}</p>
            {withForm ? (
              <details id="contact" className="group mt-2.5 scroll-mt-6 md:mt-3">
                <summary className={`${QUIET_BUTTON} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
                  {ask.t}
                </summary>
                <div className="mt-4 border-t border-etyme-rule pt-4">
                  <p className="mb-4 text-[13px] leading-snug text-etyme-muted">{ASK_COPY.body}</p>
                  <Ask source="HOME_PAGE" />
                </div>
              </details>
            ) : (
              <div className="mt-2.5 md:mt-3">
                <a href={ask.href} className={QUIET_BUTTON}>
                  {ask.t}
                </a>
              </div>
            )}
          </div>
        </div>

        {children && (
          <div className="mt-5 max-w-2xl border-t border-etyme-rule pt-3 text-[13px] leading-snug text-etyme-muted md:mt-8">
            {children}
          </div>
        )}
      </div>
    </section>
  )
}
