import { EtymeLogo } from '@/components/logo'
import { HEADER, ADDRESS } from './nav'
import { FOOTER_LINKS } from './skeleton-words'
import { CloseBand } from './close-band'

/**
 * The header and footer every page of the public site shares, the home
 * page included since 2026-09-27.
 *
 * ── The logo and Sign in. Decided by the founder, 2026-10-19 ──────────
 *
 * "Even the menu has very [little] value, it can be on the footer." The
 * header is two things at every width: the logo and Sign in, a 44-pixel
 * tap target. The menu icon of 2026-10-14 and the sheet behind it are
 * gone; the footer's one row carries the demo, the documentation, About
 * and the rest, and the four steps are the documentation's own spine.
 *
 * Links are plain anchors on purpose: every page here is a
 * server-rendered document that works with JavaScript off.
 */

const LINK = 'text-etyme-muted underline-offset-2 transition-colors hover:text-etyme-ink hover:underline'

/** One focus ring for everything a reader can press in the frame. */
const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-etyme-action/40'

/** The tap target for Sign in, the one thing on the right of the header: 44 pixels tall. */
const TAP = 'inline-flex h-11 items-center justify-center rounded-lg'

/**
 * The header stays on screen as the page scrolls (2026-09-28). `sticky`
 * rather than `fixed`, so it keeps its own place in the flow, and it sets
 * the document's scroll padding to its own height — 69 pixels at every
 * width since 2026-10-14 (12 + 44 + 12, and the rule; unchanged when the
 * menu icon left on 2026-10-19, because Sign in holds the 44) — so an anchor lands
 * under it rather than behind it. A change to its padding or to `TAP`
 * changes the figure.
 */
export function SiteHeader() {
  return (
    <header
      className="sticky top-0 z-40 border-b border-etyme-rule bg-etyme-canvas/95 backdrop-blur
                 [html:has(&)]:scroll-pt-[69px] lg:[html:has(&)]:scroll-pt-[69px]"
    >
      <nav aria-label="Main" className="mx-auto flex max-w-6xl items-center gap-x-1 px-4 py-3 sm:gap-x-2 sm:px-6">
        <a href="/" aria-label="Etyme — home" className={`shrink-0 rounded-md ${FOCUS}`}>
          <EtymeLogo size="md" />
        </a>

        <div className="ml-auto flex items-center">
          <a
            href={HEADER.signIn.href}
            className={`${TAP} whitespace-nowrap px-3 text-sm font-medium text-etyme-muted transition-colors
                       hover:text-etyme-ink ${FOCUS}`}
          >
            {HEADER.signIn.t}
          </a>
        </div>
      </nav>
    </header>
  )
}

/**
 * The footer of every page in the frame: the documentation, the security
 * position, the legal pages, contact. The same one row the home page,
 * the product pages and the doors draw (`./skeleton`), since 2026-10-15.
 */
export function SiteFooter() {
  return <HomeFooter links={FOOTER_LINKS} />
}

/**
 * A public page: the header, the page, the close, the footer.
 *
 * Every page drawn in the frame ends in the same ways forward — see it,
 * ask a person — since 2026-09-27 (the audit left them on 2026-10-14), so a reader
 * who arrives on a module page or a documentation page from a search
 * result has the same ladder as one who arrived on the home page. There
 * is no switch to leave it off: a page that should not end in it is not
 * a page of this site.
 */
export function SiteFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-etyme-canvas">
      <SiteHeader />
      <main>{children}</main>
      <CloseBand />
      <SiteFooter />
    </div>
  )
}

/**
 * The footer of every public page, as the founder approved it on
 * 2026-10-14: one row of links — the five doors, the demo, the
 * documentation, About, security and the legal pages, and contact — then
 * where Etyme is. The client's sign-up is in the band above it.
 */
export function HomeFooter({ links }: { links: { t: string; href: string }[] }) {
  return (
    <footer className="border-t border-etyme-rule">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <nav aria-label="Footer" className="flex flex-wrap items-baseline gap-x-5 gap-y-2 text-[13px]">
          <span className="font-semibold text-etyme-ink">{'Etyme'}</span>
          {links.map((l) => (
            <a key={l.href} href={l.href} className={`${LINK} ${FOCUS} rounded-sm`}>{l.t}</a>
          ))}
        </nav>
        <p className="mt-6 font-mono text-[11px] text-etyme-faint">
          {`© ${new Date().getFullYear()} ${ADDRESS.company} · ${ADDRESS.street}, ${ADDRESS.city} · `}
          <a href={`mailto:${ADDRESS.email}`} className="hover:text-etyme-ink">{ADDRESS.email}</a>
        </p>
      </div>
    </footer>
  )
}
