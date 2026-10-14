import { EtymeLogo } from '@/components/logo'
import { NAV_MENUS, NAV_LINKS, SHEET_MORE, HEADER, FOOTER, ADDRESS, groupsShown } from './nav'
import { SheetCloser } from './sheet-closer'
import { CloseBand } from './close-band'

/**
 * The header and footer every page of the public site shares, the home
 * page included since 2026-09-27.
 *
 * ── The logo, Sign in and a menu icon. Decided 2026-10-14 ─────────────
 *
 * The founder: "Menu into icon. Does anyone need the audit form? I think
 * it's useless." So the header is three things at every width: the logo,
 * Sign in, and a menu icon — three lines, a button whose accessible name
 * is "Menu", the same 44-pixel tap target as Sign in. The word "Menu" and
 * the audit button are gone, and so are the desktop menus: the sheet
 * behind the icon carries every link they carried (`./nav`), the same at
 * 1280 as at 390.
 *
 * Links are plain anchors on purpose: every page here is a
 * server-rendered document that works with JavaScript off. The sheet is
 * a details element and needs no script; SheetCloser adds Escape and
 * closes it when a link in it is followed.
 */

const LINK = 'text-etyme-muted underline-offset-2 transition-colors hover:text-etyme-ink hover:underline'

/** One focus ring for everything a reader can press in the frame. */
const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-etyme-action/40'

/** One tap target for both things on the right of the header: 44 pixels tall. */
const TAP = 'inline-flex h-11 items-center justify-center rounded-lg'

/**
 * The header stays on screen as the page scrolls (2026-09-28). `sticky`
 * rather than `fixed`, so it keeps its own place in the flow, and it sets
 * the document's scroll padding to its own height — 69 pixels at every
 * width since 2026-10-14 (12 + 44 + 12, and the rule) — so an anchor lands
 * under it rather than behind it. A change to its padding or to `TAP`
 * changes the figure.
 */
export function SiteHeader() {
  return (
    <header
      className="sticky top-0 z-40 border-b border-etyme-rule bg-etyme-canvas/95 backdrop-blur
                 [html:has(&)]:scroll-pt-[69px] lg:[html:has(&)]:scroll-pt-[69px]"
    >
      <nav aria-label="Main" className="relative mx-auto flex max-w-6xl items-center gap-x-1 px-4 py-3 sm:gap-x-2 sm:px-6">
        <a href="/" aria-label="Etyme — home" className={`shrink-0 rounded-md ${FOCUS}`}>
          <EtymeLogo size="md" />
        </a>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <a
            href={HEADER.signIn.href}
            className={`${TAP} whitespace-nowrap px-3 text-sm font-medium text-etyme-muted transition-colors
                       hover:text-etyme-ink ${FOCUS}`}
          >
            {HEADER.signIn.t}
          </a>

          <details id="site-sheet" className="group/menu">
            <summary
              aria-label={HEADER.menu}
              className={`${TAP} w-11 cursor-pointer list-none text-etyme-ink hover:bg-etyme-sunk
                         [&::-webkit-details-marker]:hidden ${FOCUS}`}
            >
              {/* Three lines, and a cross while the sheet is open. The name
                  is the summary's aria-label; the browser says whether it is
                  open, because a summary is a button with that state. */}
              <svg aria-hidden="true" width="22" height="22" viewBox="0 0 22 22" className="group-open/menu:hidden">
                <path d="M3.5 6h15M3.5 11h15M3.5 16h15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <svg aria-hidden="true" width="22" height="22" viewBox="0 0 22 22" className="hidden group-open/menu:block">
                <path d="M5.5 5.5l11 11M16.5 5.5l-11 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </summary>
            <div
              className="absolute inset-x-0 top-full max-h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain
                         border-b border-etyme-rule bg-etyme-canvas px-4 pb-6 pt-2 shadow-lg sm:px-6"
            >
              <ul className="divide-y divide-etyme-rule">
                {NAV_MENUS.map((menu) => (
                  <li key={menu.label} className="py-3">
                    <a href={menu.href} className={`block py-1.5 text-[17px] font-medium text-etyme-ink ${FOCUS}`}>
                      {menu.label}
                    </a>
                    <ul className="mt-1 grid gap-x-6 sm:grid-cols-2 lg:grid-cols-4">
                      {groupsShown(menu).flatMap((g) => g.items).map((item) => (
                        <li key={item.t}>
                          <a href={item.href} className={`block py-1.5 text-[15px] ${LINK} ${FOCUS}`}>{item.t}</a>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
                {NAV_LINKS.map((l) => (
                  <li key={l.label} className="py-3">
                    <a href={l.href} className={`block py-1.5 text-[17px] font-medium text-etyme-ink ${FOCUS}`}>{l.label}</a>
                  </li>
                ))}
                <li className="py-3">
                  <ul className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-4">
                    {SHEET_MORE.map((item) => (
                      <li key={item.t}>
                        <a href={item.href} className={`block py-1.5 text-[15px] ${LINK} ${FOCUS}`}>{item.t}</a>
                      </li>
                    ))}
                  </ul>
                </li>
              </ul>
            </div>
          </details>
        </div>
        <SheetCloser id="site-sheet" />
      </nav>
    </header>
  )
}

/**
 * `doors` is the party pages' own row (2026-10-13): each of the four doors
 * (`./parties`) links the other three from its footer, because they are
 * reached by link and not from the home page's menu. Every other page
 * draws the footer without it.
 */
export function SiteFooter({ doors }: { doors?: { label: string; href: string }[] } = {}) {
  return (
    <footer className="border-t border-etyme-rule bg-etyme-surface">
      {/* The same gutter as the bands above it, so the logo sits on their
          left edge; the link groups run two to a row on a phone, so the
          footer is no taller than a screen and a half at 390 (it was
          1,423 pixels, the tallest block on the home page). */}
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:py-14">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1fr] lg:gap-10">
          <div className="col-span-2 lg:col-span-1">
            <EtymeLogo size="md" />
            <p className="mt-4 max-w-[32ch] text-[14px] leading-relaxed text-etyme-muted">
              {'The system of record for contingent workers: the layer between a company and every staffing supplier it uses.'}
            </p>
            <p className="mt-3 max-w-[32ch] text-[13px] leading-relaxed text-etyme-faint">
              {'Etyme never runs a bench and never places anybody.'}
            </p>
          </div>

          {FOOTER.map((group) => (
            <div key={group.heading}>
              <p className="stat-label">{group.heading}</p>
              <ul className="mt-3 space-y-2">
                {group.links.map((l) => (
                  <li key={`${group.heading}-${l.href}-${l.label}`}>
                    <a href={l.href} className={`text-[14px] leading-snug ${LINK}`}>{l.label}</a>
                  </li>
                ))}
              </ul>
              {group.note && (
                <p className="mt-3 max-w-[30ch] text-[12px] leading-snug text-etyme-faint">{group.note}</p>
              )}
            </div>
          ))}
        </div>

        {doors && doors.length > 0 && (
          <nav aria-label="Other doors" className="mt-10 border-t border-etyme-rule pt-6">
            <p className="stat-label">{'Also on Etyme'}</p>
            <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
              {doors.map((d) => (
                <li key={d.href}>
                  <a href={d.href} className={`text-[14px] leading-snug ${LINK}`}>{d.label}</a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-etyme-rule pt-6">
          <p className="font-mono text-[11px] text-etyme-faint">
            {`© ${new Date().getFullYear()} ${ADDRESS.company} · ${ADDRESS.street}, ${ADDRESS.city}`}
          </p>
          <p className="font-mono text-[11px] text-etyme-faint">
            <a href={`mailto:${ADDRESS.email}`} className="hover:text-etyme-ink">{ADDRESS.email}</a>
            {' · '}
            {ADDRESS.phone}
          </p>
        </div>
      </div>
    </footer>
  )
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
 * The home page's footer, as the founder approved it on 2026-10-14: one
 * row of links — the documentation, the four doors that are not the
 * client's, security and the legal pages, and contact — then where Etyme
 * is. The client's own door is Sign up, in the band above it.
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
