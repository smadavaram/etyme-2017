'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useSession } from '@/components/session-provider'
import { sidebarPropsFrom } from '@/components/shell/sidebar-props'
import { consoleHome } from '@/lib/console-home'
import { getNavForKind, activeHref, type NavItem } from '@/lib/nav-table'

/**
 * On a phone, the pages beside the one being read, as a row of pills.
 *
 * The prototype's mobile pill nav (CLAUDE.md: "mobile pill nav"). The ☰
 * sheet holds the whole menu; this row holds the handful a reader moves
 * between without opening it — the other pages in the same section, or
 * in the same named group where the section has groups. Contractors,
 * Suppliers, Contacts; Timesheets, Expenses, Bills.
 *
 * Drawn at the top of the page, in its flow, never fixed over it: it
 * scrolls away with the page and covers no row, no button and no last
 * line. Read off the same table the sidebar draws (`lib/nav-table`)
 * through the same identity (`sidebarPropsFrom`), so it cannot offer a
 * page the menu does not.
 *
 * Nothing is drawn from md up, while the session loads, or where the
 * page's section has fewer than two pages to move between.
 */
export function pillsFor(items: readonly NavItem[], current: string | null): NavItem[] {
  const here = items.find((i) => i.href === current)
  if (!here) return []
  const near = here.group === undefined ? items.filter((i) => i.group === undefined) : items.filter((i) => i.group === here.group)
  return near.length >= 2 ? near : []
}

export function SectionPills() {
  const session = useSession()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const id = sidebarPropsFrom(session)
  if (id.pending) return null

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
  const section = sections.find((s) => s.items.some((i) => i.href === current))
  const pills = section ? pillsFor(section.items, current) : []
  if (pills.length === 0) return null

  return (
    <nav
      aria-label={`${section!.label} pages`}
      className="md:hidden -mx-4 sm:-mx-6 mb-5 flex gap-1.5 overflow-x-auto px-4 sm:px-6 pb-1
                 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {pills.map((p) => {
        const on = p.href === current
        return (
          <Link
            key={p.href}
            href={p.href as any}
            aria-current={on ? 'page' : undefined}
            className={`shrink-0 rounded-pill border px-3.5 py-1.5 text-[13px] transition-colors ${
              on
                ? 'border-etyme-ink bg-etyme-ink font-medium text-etyme-canvas'
                : 'border-etyme-rule bg-etyme-surface text-etyme-muted'
            }`}
          >
            {p.label}
          </Link>
        )
      })}
    </nav>
  )
}
