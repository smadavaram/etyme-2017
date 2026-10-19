'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useSession } from '@/components/session-provider'
import { sidebarPropsFrom } from '@/components/shell/sidebar-props'
import { consoleHome } from '@/lib/console-home'
import { getNavForKind, activeHref, tabsFor, ASK_ETYME_HREF, type NavItem } from '@/lib/nav-table'

/**
 * The tab row: the pages of the noun being read, at every width.
 *
 * Nine links, and a process step is a tab (founder, 2026-10-19). The
 * menu prints one link per noun — Jobs, Candidates, Timesheets, Bills —
 * and every page that was a neighbor in the menu is a tab here instead:
 * on Candidates, Candidates and Interviews; on Bills, Bills, AR, AP,
 * Payroll and Commissions. The noun's own page first, the page being
 * read marked by a fill and aria-current. Read off the same table the
 * sidebar draws (`lib/nav-table`, `tabsFor`) through the same identity
 * (`sidebarPropsFrom`), filtered by the same permissions, so it never
 * offers a tab whose route would refuse the reader, nor one the menu
 * does not hold.
 *
 * Drawn at the top of the page, in its flow, never fixed over it: it
 * scrolls away with the page and covers no row, no button and no last
 * line. Pages themselves do not change.
 *
 * Nothing is drawn while the session loads, on a noun with one page, or
 * on Ask Etyme: the chat is the first screen and draws its own column of
 * threads.
 *
 * The worker's "You" is a list in the menu, not a noun with tabs, so on
 * a phone — where the menu is behind ☰ — her other pages sit here as
 * pills, as before; from md up the menu beside the page already lists
 * them.
 */
export function pillsShownOn(pathname: string | null): boolean {
  return !(pathname === ASK_ETYME_HREF || pathname?.startsWith(ASK_ETYME_HREF + '/'))
}

/** On a phone, the other pages of a list section ("You"), where the page being read is one of them. */
export function pillsFor(items: readonly NavItem[], current: string | null): NavItem[] {
  const here = items.find((i) => i.href === current)
  if (!here) return []
  return items.length >= 2 ? [...items] : []
}

export function SectionPills() {
  const session = useSession()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const id = sidebarPropsFrom(session)
  if (id.pending || !pillsShownOn(pathname)) return null

  const sections = getNavForKind(id.companyKind, id.isConsultant, {
    worker: id.worker, permissions: id.permissions, seatedAtClient: id.seatedAtClient, termsHref: id.termsHref,
  })
  const home = consoleHome({
    kind: id.companyKind ?? null,
    isConsultant: id.isConsultant,
    seated: Boolean(id.seatedAtClient),
    worker: id.worker,
    permissions: id.permissions,
  }).href
  const current = activeHref(sections, pathname, searchParams, home)

  const noun = tabsFor(sections, current)
  if (noun) return <TabRow label={noun.label} tabs={noun.tabs} current={current} everyWidth />

  const list = sections.find((s) => !s.tabbed && s.items.some((i) => i.href === current))
  const pills = list ? pillsFor(list.items, current) : []
  if (pills.length === 0) return null
  return <TabRow label={list!.label} tabs={pills} current={current} />
}

function TabRow({ label, tabs, current, everyWidth = false }: {
  label: string; tabs: readonly NavItem[]; current: string | null; everyWidth?: boolean
}) {
  return (
    <nav
      aria-label={`${label} pages`}
      className={`${everyWidth ? '' : 'md:hidden '}-mx-4 sm:-mx-6 md:mx-0 mb-5 flex gap-1.5 overflow-x-auto px-4 sm:px-6 md:px-0 pb-1
                 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
    >
      {tabs.map((p) => {
        const on = p.href === current
        return (
          <Link
            key={p.href}
            href={p.href as any}
            aria-current={on ? 'page' : undefined}
            className={`shrink-0 rounded-pill border px-3.5 py-1.5 text-[13px] transition-colors ${
              on
                ? 'border-etyme-ink bg-etyme-ink font-medium text-etyme-canvas'
                : 'border-etyme-rule bg-etyme-surface text-etyme-muted hover:text-etyme-ink'
            }`}
          >
            {p.label}
          </Link>
        )
      })}
    </nav>
  )
}
