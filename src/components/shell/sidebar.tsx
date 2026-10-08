'use client'

import Link from 'next/link'
import { useEffect, useRef, type ReactNode } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { EtymeLogo } from '@/components/logo'
import { DemoChip } from '@/components/shell/demo-chip'
import { consoleHome } from '@/lib/console-home'
import { getNavForKind, activeHref, type CompanyKind } from '@/lib/nav-table'

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
   *  placement. They get their firm's menu and "You" both. */
  worker?: boolean
  /** What this seat holds. Undefined while the session loads, which
   *  shows the menu unfiltered rather than flashing a short one. */
  permissions?: readonly string[] | null
  /** The client whose desk this firm is acting at, if any. */
  seatedAtClient?: string | null
  /** Where this person's own terms wait on them, if anywhere. */
  termsHref?: string | null
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
    : getNavForKind(companyKind, isConsultant, { worker, permissions, seatedAtClient, termsHref })

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

  const current = activeHref(sections, pathname, searchParams, dashboardHref)

  // The link for the page being read is brought into view when the menu
  // opens. A worker who is also staff reads their firm's sections first
  // and "You" at the end (CLAUDE.md: appended, never substituted), and
  // Karthik Menon scrolled past twenty of Teleworld's links to find his
  // own work on the phone (worker tester, 2026-10-03). The order stays;
  // the menu opens where he is.
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
          : 'w-[220px] flex-shrink-0 h-screen sticky top-0 flex flex-col bg-etyme-surface border-r border-etyme-rule'
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
      <div className="px-5 py-5 flex items-center gap-2.5">
        <Link href={dashboardHref as any} aria-label="Etyme home" className="flex items-center">
          <EtymeLogo size="md" />
        </Link>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Close menu"
            className="ml-auto -mr-2 w-9 h-9 rounded-md flex items-center justify-center
                       text-etyme-muted hover:text-etyme-ink hover:bg-etyme-canvas transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Nav sections */}
      <nav ref={navRef} className="flex-1 overflow-y-auto px-3 pb-4">
        {/* A worker who is also staff reads "You" last, after the firm's
            sections (CLAUDE.md: appended, never substituted). On a phone
            that was twenty links of the firm's before his own work
            (worker tester, 2026-10-03), so the top of the menu says
            where his own pages are and takes him there. It scrolls the
            menu; it is not a second link to any page. */}
        {sections.findIndex((s) => s.label === 'You') > 0 && (
          <button
            type="button"
            onClick={() => navRef.current?.querySelector<HTMLElement>('[data-section="You"]')
              ?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })}
            className={`mt-3 w-full text-left px-2.5 py-2 rounded-md text-etyme-action
                        hover:bg-etyme-canvas transition-colors ${sheet ? 'text-[14px]' : 'text-[12.5px]'}`}
          >
            Your own pages ↓
          </button>
        )}
        {sections.map((section) => (
          <div key={section.label} className="mb-1" data-section={section.label}>
            <div className="eyebrow px-2 pt-5 pb-1.5">
              {section.label}
            </div>
            {section.items.map((item, i) => {
              // A sub-group header prints once, the moment its name first
              // differs from the item before it — not for every item that
              // carries it. This is what turns 22 flat links into three
              // named clusters without inventing a new top-level section.
              const priorGroup = i > 0 ? section.items[i - 1].group : undefined
              const showGroup = item.group !== undefined && item.group !== priorGroup

              const active = item.href === current
              return (
                <div key={item.label}>
                  {showGroup && (
                    <div className="px-2.5 pt-3 pb-1 text-[10px] font-medium uppercase
                                    tracking-[0.06em] text-etyme-faint">
                      {item.group}
                    </div>
                  )}
                  <Link
                    href={item.href as any}
                    onClick={onDismiss}
                    data-current={active ? 'true' : undefined}
                    aria-current={active ? 'page' : undefined}
                    className={`
                      flex items-center gap-2.5 px-2.5 rounded-md
                      ${sheet ? 'py-2.5 text-[14px]' : 'py-[7px] text-[13px]'}
                      transition-colors
                      ${active
                        ? 'bg-etyme-canvas text-etyme-ink font-medium'
                        : 'text-etyme-muted hover:text-etyme-ink hover:bg-etyme-canvas/60'
                      }
                    `}
                  >
                    <span className="w-4 text-center text-[11px] opacity-60">
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                    {item.badge !== undefined && (
                      <span className="ml-auto text-[10px] font-semibold text-etyme-attention
                                       bg-etyme-attention/10 px-1.5 py-0.5 rounded-full tabular-nums">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                </div>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Bottom — company info */}
      <div className="px-4 py-3 border-t border-etyme-rule">
        {pending ? (
          <>
            <div className="h-3 w-24 rounded bg-etyme-rule/60 animate-pulse" />
            <div className="h-2.5 w-16 rounded bg-etyme-rule/40 animate-pulse mt-1.5" />
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5 min-w-0">
              {/* In front of a made-up company's name, never a person's. */}
              {demo && companyName && <DemoChip />}
              <div className="text-[11px] font-medium text-etyme-ink truncate">
                {/* A company, or the person themselves. This said
                    "Techpeple Inc." for anybody with no firm — a design
                    placeholder that survived into production and named a
                    bench vendor from the seeded world under the page of a
                    consultant who has never heard of it. */}
                {companyName ?? personName ?? 'Your workspace'}
              </div>
            </div>
            <div className="text-[10px] text-etyme-faint">
              {companyLabel ?? (companyKind === 'CLIENT' ? 'Client · Enterprise' : 'Vendor · US IT')}
            </div>
          </>
        )}
      </div>

      {footer}
    </aside>
  )
}
