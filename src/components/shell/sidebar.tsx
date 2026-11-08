'use client'

import Link from 'next/link'
import { useEffect, useRef, type ReactNode } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { EtymeLogo, EtymeMark } from '@/components/logo'
import { DemoChip } from '@/components/shell/demo-chip'
import { useOwedCount } from '@/components/shell/ask-etyme-mark'
import { consoleHome } from '@/lib/console-home'
import { getNavForKind, activeHref, menuFor, menuLinks, viewOf, ASK_ETYME_HREF, ETYME_MARK_ICON, type CompanyKind, type Hat, type MenuGroup, type MenuLink } from '@/lib/nav-table'
import { ViewSwitch } from '@/components/shell/view-switch'
import { RailSlotOutlet } from '@/components/shell/rail-slots'

/**
 * Sidebar navigation — from CLAUDE.md design system.
 *
 * The table it draws is `lib/nav-table`, which a server route may read;
 * this file is the drawing and nothing else, because it is a client
 * component and a route that imports one gets a reference rather than a
 * function (sign-up walk, round two, item 17). What it used to export
 * is re-exported here for the screens that already read it from here.
 */
export {
  getNavForKind, activeHref, mayOpen, mayReach, openBecause, OPEN_TO_EVERY_SEAT,
  type NavSection, type NavItem, type SeatFacts, type CompanyKind,
} from '@/lib/nav-table'

export function Sidebar({
  companyKind,
  companyName,
  personName,
  companyLabel,
  isConsultant = false,
  worker = false,
  permissions,
  seatedAtClient = null,
  termsHref = null,
  region = null,
  hat = null,
  earnsCommission = false,
  pending = false,
  sheet = false,
  onDismiss,
  footer,
  demo = false,
}: {
  /** The company is a made-up one; its name reads "Demo" in front. */
  demo?: boolean
  /** Absent for a consultant, who has no company. */
  companyKind?: CompanyKind | null
  companyName?: string
  /** Whose workspace this is when there is no company to name. */
  personName?: string
  companyLabel?: string
  /** True when this person is on a bench rather than of the company. */
  isConsultant?: boolean
  /** True when this person is also somebody the work is about — a GSI's
   *  own billable engineer holds a seat AND is the subject of a
   *  placement. They wear two hats, one at a time (`hat`). */
  worker?: boolean
  /** What this seat holds. Undefined while the session loads, which
   *  shows the menu unfiltered rather than flashing a short one. */
  permissions?: readonly string[] | null
  /** The client whose desk this firm is acting at, if any. */
  seatedAtClient?: string | null
  /** Where this person's own terms wait on them, if anywhere. */
  termsHref?: string | null
  /** The region this seat reads, if it sits on a REGION unit. */
  region?: string | null
  /** The hat this person has on: the firm's links, or their own pages, never both. */
  hat?: Hat | null
  /** This person earns commission at this firm: "Your commissions" under Accounting. */
  earnsCommission?: boolean
  /** Session still loading — render the frame without nav items so the
   *  wrong company's navigation never flashes on screen. */
  pending?: boolean
  /** The phone's slide-in sheet rather than the desktop rail: fills
   *  whatever holds it instead of pinning itself to the viewport, and
   *  gives every row a thumb-sized target. */
  sheet?: boolean
  /** The reader is done with the sheet — a destination tapped, or the
   *  close button, which only renders when this is given. */
  onDismiss?: () => void
  /** Below the company block. The sheet puts the account here. */
  footer?: ReactNode
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const sections = pending
    ? []
    : getNavForKind(companyKind, isConsultant, { worker, permissions, seatedAtClient, termsHref, region, hat, earnsCommission })

  // Where this seat's own front door is. One answer, in lib/console-home,
  // shared with /dashboard's own redirect and the demo door — three
  // places used to decide it and all three had it wrong for somebody.
  const dashboardHref = consoleHome({
    kind: companyKind ?? null,
    isConsultant,
    seated: Boolean(seatedAtClient),
    worker,
    permissions,
  }).href

  // The page being read, by the longest match across every page on the
  // menu, tabs included: a link is lit on any of its pages.
  const current = activeHref(sections, pathname, searchParams, dashboardHref)
  // The number on Ask Etyme, the same the phone's switch carries, from
  // the same one read.
  const asks = sections.some((s) => s.items.some((i) => i.href === ASK_ETYME_HREF))
  const owed = useOwedCount(asks)

  // What the Dashboard column prints: the role's links under the
  // founder's headings (founder, 2026-11-08, "One app, two tabs").
  const groups = pending ? [] : menuFor(companyKind, isConsultant, { worker, permissions, seatedAtClient, termsHref, region, hat, earnsCommission })
  const view = viewOf(pathname)
  // The Dashboard tab opens the first link of this seat's own menu.
  const dashboardTab = menuLinks(groups)[0]?.href ?? dashboardHref

  // The link for the page being read is brought into view when the menu
  // opens, so a long menu opens where the reader is (worker tester,
  // 2026-10-03).
  const navRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const here = navRef.current?.querySelector<HTMLElement>('[data-current="true"]')
    here?.scrollIntoView?.({ block: 'nearest' })
  }, [current, sections.length])

  return (
    <aside
      className={
        sheet
          ? 'w-full h-full flex flex-col bg-etyme-surface'
          : 'w-[232px] flex-shrink-0 h-screen sticky top-0 flex flex-col bg-etyme-surface border-r border-etyme-rule'
      }
    >
      {/* Logo — the wordmark at 26px, the size every marketing header and
          the denied page draw it at, so a person who signed in under the
          real logo lands under the same one. It was the mark alone at 28px
          (15px wide, three thin strokes) beside "etyme" set in Inter: the
          kit's "rail header beside the name" read literally, which drew an
          icon and a word where the logo should be. The founder read it as
          "the logo is missing". The mark stays in the phone header, beside
          the company's name, which is the sentence the kit meant. */}
      <div className="px-5 h-14 shrink-0 flex items-center gap-2.5">
        <Link href={dashboardHref as any} aria-label="Etyme home" className="flex items-center">
          <EtymeLogo size="md" />
        </Link>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Close menu"
            className="ml-auto -mr-2 w-10 h-10 rounded-nav flex items-center justify-center
                       text-etyme-muted hover:text-etyme-ink hover:bg-etyme-sunk transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Ask Etyme | Dashboard, at the top of the column in both views. On
          a phone it is the first row under the header, so the sheet does
          not draw it a second time. */}
      {asks && !sheet && !pending && (
        <div className="px-3 pb-2">
          <ViewSwitch dashboardHref={dashboardTab} owed={owed} />
        </div>
      )}

      {/* Nav sections */}
      <nav ref={navRef} aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-4">
        {asks && view === 'ask' ? (
          // Ask Etyme's column: New conversation and search, Pinned, then
          // the conversations. The Ask Etyme page fills each (RailSlot).
          <div data-column="ask">
            <RailSlotOutlet name="top" />
            <RailSlotOutlet name="pinned" heading="Pinned" />
            <RailSlotOutlet name="conversations" heading="Conversations" />
          </div>
        ) : (
          <>
            {/* A Member with no desk reads what is addressed to them and
                their own pages under "You"; the top of the menu says
                where those are and takes them there. It scrolls the menu;
                it is not a second link to any page. */}
            {groups.findIndex((g) => g.heading === 'You') > 0 && (
              <button
                type="button"
                onClick={() => navRef.current?.querySelector<HTMLElement>('[data-section="You"]')
                  ?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })}
                className={`mt-2 w-full text-left px-2.5 py-2 rounded-nav text-etyme-action-press
                            hover:bg-etyme-action-wash transition-colors ${sheet ? 'text-[14px]' : 'text-[12.5px]'}`}
              >
                Your own pages ↓
              </button>
            )}
            {groups.map((group, n) => (
              <MenuGroupBlock
                key={`${group.heading ?? ''}:${n}`}
                group={group}
                current={current}
                sheet={sheet}
                onDismiss={onDismiss}
              />
            ))}
          </>
        )}
      </nav>

      {/* Bottom — company info */}
      <div className="px-5 py-3 border-t border-etyme-rule">
        {pending ? (
          <>
            <div className="h-3 w-24 rounded bg-etyme-sunk motion-safe:animate-pulse" />
            <div className="h-2.5 w-16 rounded bg-etyme-sunk/70 motion-safe:animate-pulse mt-1.5" />
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5 min-w-0">
              {/* In front of a made-up company's name, never a person's. */}
              {demo && companyName && <DemoChip />}
              <div className="text-[12px] font-medium text-etyme-ink truncate">
                {/* A company, or the person themselves. This said
                    "Techpeple Inc." for anybody with no firm — a design
                    placeholder that survived into production and named a
                    bench vendor from the seeded world under the page of a
                    consultant who has never heard of it. */}
                {companyName ?? personName ?? 'Your workspace'}
              </div>
            </div>
            <div className="text-[11px] text-etyme-faint truncate">
              {companyLabel ?? (companyKind === 'CLIENT' ? 'Client · Enterprise' : 'Vendor · US IT')}
            </div>
          </>
        )}
      </div>

      {footer}
    </aside>
  )
}


/** A menu icon: the Etyme mark where the table names it, else the glyph. */
function NavIcon({ icon, active }: { icon: string; active: boolean }) {
  if (icon === ETYME_MARK_ICON) {
    return (
      <span aria-hidden="true" className="w-4 flex items-center justify-center">
        <EtymeMark size={14} />
      </span>
    )
  }
  return (
    <span aria-hidden="true" className={`w-4 text-center text-[11px] ${active ? 'opacity-90' : 'opacity-50'}`}>
      {icon}
    </span>
  )
}

/**
 * One group of the Dashboard column: a heading over its links (Network,
 * HR, Money, or "You" over a worker's own pages), or links with none.
 * A heading is a label and never a link. Each link is lit on any of the
 * pages it stands for; the others are the tab row under the page header.
 */
function MenuGroupBlock({ group, current, sheet, onDismiss }: {
  group: MenuGroup; current: string | null; sheet?: boolean; onDismiss?: () => void
}) {
  return (
    <div className={group.heading ? 'mb-1' : ''} data-section={group.heading ?? group.links[0]?.label}>
      {group.heading && (
        <div className="eyebrow px-2.5 pt-4 pb-1">
          {group.heading}
        </div>
      )}
      {group.links.map((link) => {
        const active = link.covers.some((i) => i.href === current)
        return (
          <NavLink key={link.label + link.href} item={link} active={active} sheet={sheet} onDismiss={onDismiss} />
        )
      })}
    </div>
  )
}

/** One row on the menu. The active page is marked three ways — the fill, a bar at the left edge and aria-current — so it never rests on color alone. */
function NavLink({ item, active, sheet, onDismiss }: { item: Pick<MenuLink, 'label' | 'href' | 'icon'> & { badge?: number }; active: boolean; sheet?: boolean; onDismiss?: () => void }) {
  return (
    <Link
      href={item.href as any}
      onClick={onDismiss}
      data-current={active ? 'true' : undefined}
      aria-current={active ? 'page' : undefined}
      className={`
        relative flex items-center gap-2.5 px-2.5 rounded-nav
        ${sheet ? 'py-2.5 text-[14px]' : 'py-1.5 text-[13px]'}
        transition-colors duration-fast
        ${active
          ? 'bg-etyme-action-wash text-etyme-action-press font-medium'
          : 'text-etyme-ink hover:bg-etyme-sunk/70'
        }
      `}
    >
      {active && (
        <span aria-hidden="true" className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-pill bg-etyme-action" />
      )}
      <NavIcon icon={item.icon} active={active} />
      <span className="truncate">{item.label}</span>
      {item.badge !== undefined && (
        <span className="ml-auto text-[10px] font-semibold text-etyme-attention
                         bg-etyme-attention-wash px-1.5 py-0.5 rounded-pill tabular-nums">
          {item.badge}
        </span>
      )}
    </Link>
  )
}
