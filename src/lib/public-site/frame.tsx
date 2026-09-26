import { EtymeLogo } from '@/components/logo'
import { NAV_MENUS, DOCS_LINK, SPEND_AUDIT, FOOTER, ADDRESS } from './nav'

/**
 * The header and footer every page of the public site shares.
 *
 * The menus are the live home page's four, with the new pages mapped
 * into them (see `./nav`). Links are plain anchors on purpose: every
 * page here is a server-rendered document that works with JavaScript
 * off, and a marketing page is the one surface where that still matters.
 *
 * On a phone the menus fold into one disclosure rather than vanishing.
 * The home page's own header hides its menus below `lg` and shows only
 * "Sign in"; a reader who arrives on a module page from a search result
 * has no home page behind them, so the drawer carries every link.
 */

const LINK = 'text-etyme-muted underline-offset-2 transition-colors hover:text-etyme-ink hover:underline'

export function SiteHeader() {
  return (
    <header className="border-b border-etyme-rule bg-etyme-canvas">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-3 px-4 py-4 sm:px-6">
        <a href="/" aria-label="Etyme — home">
          <EtymeLogo size="md" />
        </a>

        <ul className="ml-6 hidden items-center gap-1 text-sm lg:flex">
          {NAV_MENUS.map((menu) => (
            <li key={menu.label} className="group relative">
              <button
                type="button"
                className="rounded-md px-3 py-2 text-etyme-muted transition-colors hover:text-etyme-ink
                           focus-visible:text-etyme-ink focus-visible:outline-none
                           focus-visible:ring-2 focus-visible:ring-etyme-action/40"
              >
                {menu.label}
              </button>
              <div
                className="invisible absolute left-0 top-full z-20 w-80 -translate-y-1 pt-2 opacity-0
                           transition-all duration-100 group-hover:visible group-hover:translate-y-0
                           group-hover:opacity-100 group-focus-within:visible
                           group-focus-within:translate-y-0 group-focus-within:opacity-100"
              >
                <div className="rounded-xl border border-etyme-rule bg-etyme-raised p-2 shadow-xl">
                  {menu.items.map((item) => (
                    <a key={item.t} href={item.href} className="block rounded-lg px-3 py-2.5 hover:bg-etyme-canvas">
                      <span className="block text-[13px] font-medium text-etyme-ink">{item.t}</span>
                      {item.d && (
                        <span className="mt-0.5 block text-[12px] leading-snug text-etyme-muted">{item.d}</span>
                      )}
                    </a>
                  ))}
                  {menu.note && (
                    <p className="mt-1 border-t border-etyme-rule px-3 pt-2 text-[11px] text-etyme-faint">
                      {menu.note}
                    </p>
                  )}
                </div>
              </div>
            </li>
          ))}
          <li>
            <a href={DOCS_LINK.href} className="rounded-md px-3 py-2 text-etyme-muted transition-colors hover:text-etyme-ink">
              {DOCS_LINK.t}
            </a>
          </li>
        </ul>

        <a
          href="/login"
          className="ml-auto rounded-lg border border-etyme-rule px-4 py-2 text-sm font-medium text-etyme-muted
                     transition-colors hover:border-etyme-ink hover:text-etyme-ink"
        >
          {'Sign in'}
        </a>

        {/* The phone drawer. `details` needs no script, and closes by tapping the same word. */}
        <details className="w-full lg:hidden">
          <summary className="cursor-pointer list-none text-sm font-medium text-etyme-muted">
            {'Menu'}
          </summary>
          <div className="mt-3 space-y-5 border-t border-etyme-rule pt-4">
            {NAV_MENUS.map((menu) => (
              <div key={menu.label}>
                <p className="eyebrow">{menu.label}</p>
                <ul className="mt-2 space-y-1.5">
                  {menu.items.map((item) => (
                    <li key={item.t}>
                      <a href={item.href} className={`text-[14px] ${LINK}`}>{item.t}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div>
              <p className="eyebrow">{'Read'}</p>
              <ul className="mt-2 space-y-1.5">
                <li><a href={DOCS_LINK.href} className={`text-[14px] ${LINK}`}>{DOCS_LINK.t}</a></li>
                <li><a href={SPEND_AUDIT.href} className={`text-[14px] ${LINK}`}>{SPEND_AUDIT.t}</a></li>
              </ul>
            </div>
          </div>
        </details>
      </nav>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t border-etyme-rule bg-etyme-surface">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1fr]">
          <div>
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

/** A public page: the header, the page, the footer. */
export function SiteFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-etyme-canvas">
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </div>
  )
}
