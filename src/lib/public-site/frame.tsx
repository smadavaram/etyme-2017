import { EtymeLogo } from '@/components/logo'
import { NAV_MENUS, NAV_LINKS, SHEET_MORE, PRIMARY, SPEND_AUDIT, FOOTER, ADDRESS, itemsOf, type NavMenu } from './nav'
import { SheetCloser } from './sheet-closer'
import { CountedLink } from './counted-link'
import { CloseBand } from './close-band'

/**
 * The header and footer every page of the public site shares, the home
 * page included since 2026-09-27.
 *
 * The header is two menus — Platform by step, Solutions by desk — and
 * two links, How It Works and Security, with Sign in and one filled
 * button on the right since 2026-10-09
 * (see `./nav` for where the structure came from and which of its words
 * were corrected). Links are plain anchors on purpose: every page here is
 * a server-rendered document that works with JavaScript off, and a
 * marketing page is the one surface where that still matters. The menus
 * open on hover and on keyboard focus, with no script.
 *
 * On a phone the menus fold into one sheet carrying the same links, so a reader who arrives on a module page from a search result
 * has every link the desktop reader has.
 */

const LINK = 'text-etyme-muted underline-offset-2 transition-colors hover:text-etyme-ink hover:underline'

/** One focus ring for everything a reader can press in the frame. */
const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-etyme-action/40'

/** A top-level word in the desktop header. */
const TOP_LINK =
  `rounded-md px-3 py-2 text-etyme-muted transition-colors hover:text-etyme-ink focus-visible:text-etyme-ink ${FOCUS}`

/** How wide each menu's panel is, by how many groups sit side by side. */
const PANEL: Record<string, string> = {
  Platform: 'w-[min(52rem,calc(100vw-3rem))] grid gap-2 lg:grid-cols-4',
  Solutions: 'w-[26rem]',
}

function MenuPanel({ menu }: { menu: NavMenu }) {
  return (
    <div className={`rounded-xl border border-etyme-rule bg-etyme-raised p-2 shadow-xl ${PANEL[menu.label] ?? 'w-80'}`}>
      {menu.groups.map((group) => (
        <div key={group.heading}>
          <p className="px-3 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-etyme-faint">
            {group.heading}
          </p>
          {group.items.map((item) => (
            <a key={item.t} href={item.href} className={`block rounded-lg px-3 py-2.5 hover:bg-etyme-canvas ${FOCUS}`}>
              <span className="block text-[13px] font-medium text-etyme-ink">{item.t}</span>
              {item.d && (
                <span className="mt-0.5 block text-[12px] leading-snug text-etyme-muted">{item.d}</span>
              )}
            </a>
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * The header stays on screen as the page scrolls. Decided 2026-09-28, on
 * the founder's go-to-market list.
 *
 * `sticky` rather than `fixed`, so it keeps its own place in the flow and
 * nothing under it has to be pushed down by a guessed height. It sets the
 * document's scroll padding to its own height, from here, so a link to an
 * anchor — and a band the home page settles on — lands under the header
 * rather than behind it, on every page that draws it.
 *
 * ── Compact, since 2026-10-09 ────────────────────────────────────────
 *
 * The founder's brief: Platform, Solutions, How It Works, Security, and
 * the primary button, which is the spend audit. `onHome` sends each label
 * to its band on the home page; on any other page it opens the top of a
 * page (see `NAV_MENUS` in `./nav`).
 *
 * One row at every width, as before: on a phone the row is the logo, Sign
 * in, the audit under its short label, and Menu, which opens a sheet
 * under the header with every link the desktop reader has, large enough
 * to tap. The height is 61 pixels on a phone and 69 from `lg`; a change
 * to the header's padding changes these.
 */
export function SiteHeader({ onHome = false }: { onHome?: boolean }) {
  const to = (h: { home: string; away: string }) => (onHome ? h.home : h.away)
  return (
    <header
      className="sticky top-0 z-40 border-b border-etyme-rule bg-etyme-canvas/95 backdrop-blur
                 [html:has(&)]:scroll-pt-[61px] lg:[html:has(&)]:scroll-pt-[69px]"
    >
      <nav aria-label="Main" className="relative mx-auto flex max-w-6xl items-center gap-x-1 px-4 py-3 sm:gap-x-2 sm:px-6 lg:py-4">
        <a href="/" aria-label="Etyme — home" className={`shrink-0 rounded-md ${FOCUS}`}>
          <EtymeLogo size="md" />
        </a>

        <ul className="ml-6 hidden items-center gap-1 text-sm lg:flex">
          {NAV_MENUS.map((menu) => (
            <li key={menu.label} className="group relative">
              <a href={to(menu.href)} aria-haspopup="true" className={`${TOP_LINK} inline-flex items-center gap-1`}>
                {menu.label}
                <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" className="text-etyme-faint">
                  <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </a>
              <div
                className="invisible absolute left-0 top-full z-20 -translate-y-1 pt-2 opacity-0
                           transition-[opacity,transform,visibility] duration-150 group-hover:visible group-hover:translate-y-0
                           group-hover:opacity-100 group-focus-within:visible
                           group-focus-within:translate-y-0 group-focus-within:opacity-100 motion-reduce:transition-none"
              >
                <MenuPanel menu={menu} />
              </div>
            </li>
          ))}
          {NAV_LINKS.map((l) => (
            <li key={l.label}>
              <a href={to(l.href)} className={TOP_LINK}>{l.label}</a>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <a
            href="/login"
            className={`whitespace-nowrap rounded-lg px-2 py-2 text-sm font-medium text-etyme-muted transition-colors
                       hover:text-etyme-ink sm:px-3 ${FOCUS}`}
          >
            {'Sign in'}
          </a>
          <CountedLink
            href={PRIMARY.href}
            event="audit_cta_clicked"
            className={`whitespace-nowrap rounded-lg bg-etyme-action px-3 py-2 text-sm font-semibold text-white shadow-sm
                       transition-opacity hover:opacity-90 sm:px-4 ${FOCUS}`}
          >
            <span className="sm:hidden">{PRIMARY.short ?? PRIMARY.t}</span>
            <span className="hidden sm:inline">{PRIMARY.t}</span>
          </CountedLink>
        </div>

        {/* The phone sheet. A details element needs no script; SheetCloser adds
            Escape and closes it when a link in it is followed. */}
        <details id="site-sheet" className="group/menu lg:hidden">
          <summary
            className={`cursor-pointer list-none whitespace-nowrap rounded-lg px-2 py-2 text-sm font-medium
                       text-etyme-muted hover:text-etyme-ink [&::-webkit-details-marker]:hidden ${FOCUS}`}
          >
            <span className="group-open/menu:hidden">{'Menu'}</span>
            <span className="hidden group-open/menu:inline">{'Close'}</span>
          </summary>
          <div
            className="absolute inset-x-0 top-full max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain
                       border-b border-etyme-rule bg-etyme-canvas px-4 pb-6 pt-2 shadow-lg sm:px-6"
          >
            <ul className="divide-y divide-etyme-rule">
              {NAV_MENUS.map((menu) => (
                <li key={menu.label} className="py-3">
                  <a href={to(menu.href)} className={`block py-1.5 text-[17px] font-medium text-etyme-ink ${FOCUS}`}>
                    {menu.label}
                  </a>
                  <ul className="mt-1 grid gap-x-6 sm:grid-cols-2">
                    {itemsOf(menu).map((item) => (
                      <li key={item.t}>
                        <a href={item.href} className={`block py-1.5 text-[15px] ${LINK} ${FOCUS}`}>{item.t}</a>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
              {NAV_LINKS.map((l) => (
                <li key={l.label} className="py-3">
                  <a href={to(l.href)} className={`block py-1.5 text-[17px] font-medium text-etyme-ink ${FOCUS}`}>{l.label}</a>
                </li>
              ))}
              <li className="py-3">
                <ul className="grid gap-x-6 sm:grid-cols-2">
                  {SHEET_MORE.map((item) => (
                    <li key={item.t}>
                      <a href={item.href} className={`block py-1.5 text-[15px] ${LINK} ${FOCUS}`}>{item.t}</a>
                    </li>
                  ))}
                </ul>
              </li>
            </ul>
            <CountedLink
              href={PRIMARY.href}
              event="audit_cta_clicked"
              className={`mt-3 block rounded-lg bg-etyme-action px-4 py-3 text-center text-[15px] font-semibold text-white ${FOCUS}`}
            >
              {PRIMARY.t}
            </CountedLink>
          </div>
        </details>
        <SheetCloser id="site-sheet" />
      </nav>
    </header>
  )
}

export function SiteFooter() {
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
            <a
              href={SPEND_AUDIT.href}
              className="mt-5 inline-block rounded-lg border border-etyme-rule bg-etyme-raised px-4 py-2 text-[13px]
                         font-medium text-etyme-ink transition-colors hover:border-etyme-ink"
            >
              {SPEND_AUDIT.t}
            </a>
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
 * Every page drawn in the frame ends in the same three ways forward —
 * see it, get the audit, ask a person — since 2026-09-27, so a reader
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
