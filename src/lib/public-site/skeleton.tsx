import type { EmbedStep } from '@/lib/sample-seat'
import { StoryPanel } from './story-panel'
import { storyIndex } from './story'
import { HomeFooter } from './frame'
import {
  ON_SCREEN, DOORS, FOOTER_LINKS, BAND, BAND_FOR_SELF, CLIENT_SIGN_UP, SECURITY,
  type BandKind,
} from './skeleton-words'

/**
 * The pieces every page that sells or explains the product draws: the
 * panel that shows the product working, the sign-up band with every party’s
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
const TEXT_LINK = `text-etyme-action-press underline-offset-4 hover:underline ${FOCUS} rounded-sm`

/**
 * The product shown working, opened at a step: the one compact panel
 * (`./story-panel`) every page that sells the product draws, since the
 * founder replaced the big live frame with it on 2026-10-14. The button
 * in its footer is the page's own (it counts its click, or seats the
 * reader at the right job in the full demo). Under it, the page's one
 * line about what its reader is looking at, and the label that says every
 * firm on it is a demo company.
 */
export function LiveDemo({
  step, caption, label = ON_SCREEN, children,
}: { step?: EmbedStep; caption?: string; label?: string; children: React.ReactNode }) {
  return (
    <section id="demo" aria-label="The product shown working" className="pb-4">
      <StoryPanel start={storyIndex(step)}>{children}</StoryPanel>
      {caption && <p className="mt-3 text-[15px] leading-snug text-etyme-ink">{caption}</p>}
      <p className={`${caption ? 'mt-1 text-etyme-muted' : 'mt-3 text-etyme-ink'} text-[15px] leading-snug`}>{label}</p>
    </section>
  )
}

/**
 * Sign-up, right under the product, with one button: Sign up. A party
 * door names its own sign-up; the contractors' door draws a person's band
 * (`BAND_FOR_SELF`) with the candidate's sign-up. The audit that stood
 * beside it left every page on 2026-10-14.
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
