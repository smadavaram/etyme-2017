import { EtymeLogo } from '@/components/logo'
import { MENU, HEADER, ADDRESS } from './nav'
import { FOOTER_LINKS } from './skeleton-words'
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
 * the audit button are gone, and so are the desktop menus. Since
 * 2026-10-15 the sheet behind the icon tells the product as four steps,
 * one line and one page each, then Security, Documentation, About and
 * Contact, the demo and Sign up (`./nav`, `MENU`), at 1280 as at 390.
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
                         rounded-b-2xl border-b border-etyme-rule bg-etyme-surface shadow-lg"
            >
              {/* The menu told as a story (2026-10-15): the four steps, one
                  line each, then the small row and the two buttons. */}
              <div className="mx-auto max-w-6xl px-4 pb-6 pt-5 sm:px-7 sm:pt-6">
                <p className="mb-1 hidden text-[12px] uppercase tracking-[0.08em] text-etyme-faint sm:block">{MENU.kicker}</p>
                <h2 className="mb-3.5 text-balance font-serif text-[24px] font-normal leading-tight tracking-[-0.02em] text-etyme-ink sm:mb-[18px] sm:text-[28px]">
                  <span className="sm:hidden">{MENU.headingPhone}</span>
                  <span className="hidden sm:inline">{MENU.heading}</span>
                </h2>
                <ol className="grid gap-2.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4">
                  {MENU.steps.map((s) => (
                    <li key={s.href}>
                      <a
                        href={s.href}
                        className={`block h-full rounded-xl border border-etyme-rule bg-etyme-raised px-3.5 pb-4 pt-3.5 text-etyme-ink
                                   transition hover:-translate-y-px hover:border-etyme-action-press motion-reduce:transition-none ${FOCUS}`}
                      >
                        <span className="block text-[12px] tabular-nums text-etyme-faint">{s.n}</span>
                        <span className="mt-0.5 block text-[17px] font-semibold">{s.t}</span>
                        <span className="mt-1 block text-[14px] leading-snug text-etyme-muted">{s.l}</span>
                      </a>
                    </li>
                  ))}
                </ol>
                <div className="mt-3.5 flex flex-col gap-4 sm:mt-[18px] sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:border-t sm:border-etyme-rule sm:pt-4">
                  <nav aria-label="More" className="order-2 flex flex-wrap justify-center gap-x-[18px] gap-y-1 text-[14px] sm:order-1 sm:justify-start">
                    {MENU.small.map((l) => (
                      <a key={l.href} href={l.href} className={`py-1 ${LINK} ${FOCUS}`}>
                        {l.short ? (
                          <>
                            <span className="sm:hidden">{l.short}</span>
                            <span className="hidden sm:inline">{l.t}</span>
                          </>
                        ) : l.t}
                      </a>
                    ))}
                  </nav>
                  <div className="order-1 flex flex-col-reverse gap-2 sm:order-2 sm:flex-row sm:flex-wrap">
                    <a
                      href={MENU.see.href}
                      className={`rounded-[9px] border border-etyme-rule bg-etyme-raised px-4 py-2.5 text-center text-[15px] font-semibold text-etyme-ink
                                 hover:bg-etyme-sunk ${FOCUS}`}
                    >
                      {MENU.see.t}
                    </a>
                    <a
                      href={MENU.signUp.href}
                      className={`rounded-[9px] bg-etyme-action px-4 py-2.5 text-center text-[15px] font-semibold text-white hover:opacity-90 ${FOCUS}`}
                    >
                      {MENU.signUp.t}
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </details>
        </div>
        <SheetCloser id="site-sheet" />
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
