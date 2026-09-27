import { EtymeLogo } from '@/components/logo'
import { NAV_MENUS, PRIMARY, SPEND_AUDIT, FOOTER, ADDRESS, type NavMenu } from './nav'

/**
 * The header and footer every page of the public site shares, the home
 * page included since 2026-09-27.
 *
 * The header is four menus — Product by stage, Solutions by role,
 * Resources, Company — with Sign in and one filled button on the right
 * (see `./nav` for where the structure came from and which of its words
 * were corrected). Links are plain anchors on purpose: every page here is
 * a server-rendered document that works with JavaScript off, and a
 * marketing page is the one surface where that still matters. The menus
 * open on hover and on keyboard focus, with no script.
 *
 * On a phone the menus fold into one disclosure carrying the same four
 * groups, so a reader who arrives on a module page from a search result
 * has every link the desktop reader has.
 */

const LINK = 'text-etyme-muted underline-offset-2 transition-colors hover:text-etyme-ink hover:underline'

/** How wide each menu's panel is, by how many groups sit side by side. */
const PANEL: Record<string, string> = {
  Product: 'w-[min(52rem,calc(100vw-3rem))] grid gap-2 lg:grid-cols-4',
  Solutions: 'w-[26rem]',
  Resources: 'w-[36rem] grid gap-2 lg:grid-cols-2',
  Company: 'w-80',
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
            <a key={item.t} href={item.href} className="block rounded-lg px-3 py-2.5 hover:bg-etyme-canvas">
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
                className="invisible absolute left-0 top-full z-20 -translate-y-1 pt-2 opacity-0
                           transition-all duration-100 group-hover:visible group-hover:translate-y-0
                           group-hover:opacity-100 group-focus-within:visible
                           group-focus-within:translate-y-0 group-focus-within:opacity-100"
              >
                <MenuPanel menu={menu} />
              </div>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-2">
          <a
            href="/login"
            className="hidden rounded-lg px-3 py-2 text-sm font-medium text-etyme-muted transition-colors
                       hover:text-etyme-ink sm:inline-block"
          >
            {'Sign in'}
          </a>
          <a
            href={PRIMARY.href}
            className="rounded-lg bg-etyme-action px-4 py-2 text-sm font-semibold text-white shadow-sm
                       transition-opacity hover:opacity-90"
          >
            {PRIMARY.t}
          </a>
        </div>

        {/* The phone drawer. `details` needs no script, and closes by tapping the same word. */}
        <details className="w-full lg:hidden">
          <summary className="cursor-pointer list-none text-sm font-medium text-etyme-muted">
            {'Menu'}
          </summary>
          <div className="mt-3 space-y-6 border-t border-etyme-rule pt-4">
            {NAV_MENUS.map((menu) => (
              <div key={menu.label}>
                <p className="eyebrow">{menu.label}</p>
                <div className="mt-2 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  {menu.groups.map((group) => (
                    <div key={group.heading}>
                      {menu.groups.length > 1 && (
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-etyme-faint">
                          {group.heading}
                        </p>
                      )}
                      <ul className="mt-1.5 space-y-1.5">
                        {group.items.map((item) => (
                          <li key={item.t}>
                            <a href={item.href} className={`text-[14px] ${LINK}`}>{item.t}</a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <p>
              <a href="/login" className={`text-[14px] ${LINK}`}>{'Sign in'}</a>
            </p>
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
