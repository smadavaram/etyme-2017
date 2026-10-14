import type { EmbedStep } from '@/lib/sample-seat'
import { HomeDemo } from './home-demo'
import { HomeFooter } from './frame'
import { CountedLink } from './counted-link'
import { GET_THE_AUDIT } from './funnel'
import {
  CHIPS, CHIPS_LABEL, FRAME, ON_SCREEN, DOORS, FOOTER_LINKS, BAND, BAND_FOR_SELF, CLIENT_SIGN_UP, SECURITY,
  type BandKind,
} from './skeleton-words'

/**
 * The pieces every page that sells or explains the product draws: the
 * live frame with its four chips, the sign-up band with every party's
 * door on one line, the one security line, and the one-row footer.
 *
 * ── Decided by the founder, 2026-10-14 ───────────────────────────────
 *
 * "Make sure even the sub pages and doors follow the same structure."
 * The home page was built first (6e7d6b9f2); the eight product pages and
 * the four party doors follow it, and this file is what they share, so
 * the band a reader meets on /timesheets is the band on the home page,
 * word for word, and cannot drift from it. Each page adds only its own
 * question, the line under it, the step its frame opens at and at most
 * three short lines (`./sub-page`).
 *
 * Every word drawn here is a constant in `./skeleton-words`, so the guard
 * that counts a page's words (`copyOfSkeleton` there) counts what is
 * drawn, and the data files can say a page's whole copy without
 * importing a component.
 */

export const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-etyme-action/40 focus-visible:ring-offset-2'
export const PRIMARY_BUTTON =
  `whitespace-nowrap rounded-lg bg-etyme-action px-5 py-3 text-center text-[15px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90 ${FOCUS}`
const SECOND_BUTTON =
  `whitespace-nowrap rounded-lg border border-etyme-rule bg-etyme-surface px-5 py-3 text-center text-[15px] font-semibold text-etyme-ink transition-colors hover:border-etyme-ink ${FOCUS}`
const TEXT_LINK = `text-etyme-action-press underline-offset-4 hover:underline ${FOCUS} rounded-sm`

/**
 * The live product, read-only, opened at a step. The button under it is
 * the page's own (it counts its click, or seats the reader at a desk).
 */
export function LiveDemo({
  step, caption, label = ON_SCREEN, children,
}: { step?: EmbedStep; caption?: string; label?: string; children: React.ReactNode }) {
  return (
    <section id="demo" aria-label="Live demo" className="pb-4">
      <HomeDemo
        name={FRAME.name}
        step={step}
        title={FRAME.title}
        chrome={FRAME.chrome}
        label={label}
        caption={caption}
        chipsLabel={CHIPS_LABEL}
        chips={CHIPS}
        fallback={FRAME.fallback}
      >
        {children}
      </HomeDemo>
    </section>
  )
}

/**
 * Sign-up, right under the product. A party door names its own sign-up;
 * the contractors' door draws a person's band (`BAND_FOR_SELF`), with no
 * audit beside it. Everything else is the same band.
 */
export function SignUpBand({ primary = CLIENT_SIGN_UP, band = 'COMPANY' }: { primary?: { t: string; href: string }; band?: BandKind }) {
  const words = band === 'SELF' ? BAND_FOR_SELF : BAND
  return (
    <section
      id="sign-up"
      className="my-9 grid gap-5 rounded-r-lg border border-etyme-rule bg-etyme-surface p-6 md:grid-cols-[1fr_auto] md:items-center md:p-7"
    >
      <div className="min-w-0">
        <h2 className="text-balance font-serif text-[26px] font-normal leading-tight tracking-[-0.02em] text-etyme-ink md:text-[28px]">
          {words.heading}
        </h2>
        <p className="mt-1.5 text-[15px] leading-snug text-etyme-muted">{words.line}</p>
        <p className="mt-2 text-[14px] leading-snug text-etyme-muted">
          {BAND.doorsLead}{' '}
          {DOORS.map((d, i) => (
            <span key={d.href}>
              {i > 0 && <span aria-hidden="true"> · </span>}
              <a href={d.href} className={TEXT_LINK}>{d.t}</a>
            </span>
          ))}
        </p>
      </div>
      <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
        <a href={primary.href} className={PRIMARY_BUTTON}>{primary.t}</a>
        {band === 'COMPANY' && (
          <CountedLink href={GET_THE_AUDIT.href} event="audit_cta_clicked" className={SECOND_BUTTON}>
            {BAND.audit}
          </CountedLink>
        )}
      </div>
    </section>
  )
}

/** Security: one line and the link. */
export function SecurityLine() {
  return (
    <p id="security" className="mb-10 text-[15px] leading-snug text-etyme-muted">
      {SECURITY.line}{' '}
      <a href="/security" className={TEXT_LINK}>{SECURITY.link}</a>
      <span aria-hidden="true"> · </span>
      <a href="/docs" className={TEXT_LINK}>{SECURITY.docs}</a>
    </p>
  )
}

/** The one-row footer every page of this shape ends on. */
export function SkeletonFooter() {
  return <HomeFooter links={FOOTER_LINKS} />
}
