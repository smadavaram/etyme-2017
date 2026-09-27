import { Ask } from '@/app/site/ask'
import { ASK_COPY } from './leads'
import { CLOSE_BAND, SEE_IT, GET_THE_AUDIT, ASK_A_PERSON } from './funnel'

/**
 * The band every public page ends in: see it, get the audit, ask a person.
 *
 * One component, so the ladder cannot drift page by page (see `./funnel`
 * for why these three and in this order). Every page drawn inside the
 * frame ends in it, and the home page ends in it too, with the form
 * itself beside it rather than a link to the form, because the home page
 * is where most people who want to talk first will be.
 *
 * `children` is for what one page must say at its close and no other
 * page should: the home page's one quiet sentence offering to run the
 * program, and its one line about the price. Anything that belongs on
 * every page belongs in `./funnel`, where the guard reads it.
 */
export function CloseBand({
  id,
  withForm = false,
  children,
}: {
  id?: string
  /** Draw the ask form beside the band, and point "Ask a person" at it. */
  withForm?: boolean
  children?: React.ReactNode
}) {
  const ask = withForm ? { ...ASK_A_PERSON, href: '#contact' } : ASK_A_PERSON
  return (
    <section id={id} className="scroll-mt-6 border-t border-etyme-rule bg-etyme-surface" data-close-band="">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-20">
        <div className={withForm ? 'grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-start' : ''}>
          <div>
            <h2 className="max-w-[24ch] text-balance font-serif text-3xl leading-tight tracking-[-0.02em] text-etyme-ink md:text-[40px]">
              {CLOSE_BAND.heading}
            </h2>
            <p className="mt-4 max-w-[54ch] text-[16px] leading-relaxed text-etyme-muted">{CLOSE_BAND.line}</p>

            <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-3">
              <a
                href={SEE_IT.href}
                className="rounded-lg bg-etyme-action px-6 py-3.5 text-sm font-semibold text-white shadow-sm
                           transition-opacity hover:opacity-90"
              >
                {`${SEE_IT.t} →`}
              </a>
              <a
                href={GET_THE_AUDIT.href}
                className="rounded-lg border border-etyme-ink/25 bg-etyme-raised px-6 py-3.5 text-sm font-semibold
                           text-etyme-ink transition-colors hover:border-etyme-ink"
              >
                {GET_THE_AUDIT.t}
              </a>
              <a
                href={ask.href}
                className="px-1 py-3.5 text-sm font-medium text-etyme-muted underline underline-offset-4
                           transition-colors hover:text-etyme-ink"
              >
                {ask.t}
              </a>
            </div>
            <p className="mt-4 max-w-[54ch] text-[13.5px] leading-relaxed text-etyme-muted">{GET_THE_AUDIT.d}</p>

            {children}
          </div>

          {withForm && (
            <div id="contact" className="scroll-mt-6 rounded-xl border border-etyme-rule bg-etyme-raised p-6 md:p-7">
              <p className="eyebrow mb-2">{ASK_COPY.eyebrow}</p>
              <h3 className="font-serif text-[24px] leading-snug tracking-[-0.02em] text-etyme-ink">
                {ASK_COPY.heading}
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-etyme-muted">{ASK_COPY.body}</p>
              <div className="mt-5">
                <Ask source="HOME_PAGE" />
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
