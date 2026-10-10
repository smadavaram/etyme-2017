'use client'

/**
 * Top header bar — sticky, shows context + user + plus button.
 *
 * CLAUDE.md design system:
 *   "Shell — sticky header (logo + org + role), sidebar nav with section groups"
 *   "Restore the plus button with its four sections" (UX Stress Test #2)
 *   "Search on every list. Before anything else." (UX Stress Test #1)
 *
 * ── On a phone ────────────────────────────────────────────────────────
 *
 * This bar used to be wider than the screen it sat on. A fixed 224px
 * search box, a bell, a plus, an avatar, four gaps and 48px of side
 * padding came to about 440px, on phones that are 390 wide — and a
 * header wider than the viewport makes the whole page scroll sideways,
 * so every phone screenshot arrived with its left edge cut off. Nothing
 * else on the page was wrong; the header pushed it.
 *
 * Below md the bar is now: ☰ · mark · company / role … search · bell
 * · + · avatar, all icons, in about 260px. The search opens into its
 * own row under the bar rather than living in it. The ☰ opens the same
 * sidebar the desktop shows (components/shell/mobile-nav), and the
 * company and role sit next to the mark the way the prototype's header
 * has them, because the rail that used to say whose workspace this is
 * is not on screen.
 */

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { EtymeMark } from '@/components/logo'
import { NotificationBell } from '@/components/notification-bell'
import { MobileNav } from '@/components/shell/mobile-nav'
import { signOutEverywhere } from '@/components/shell/sign-out'
import { useSession } from '@/components/session-provider'
import { getNavForKind, mayOpen } from '@/lib/nav-table'
import { DemoChip } from '@/components/shell/demo-chip'
import { deskOf } from '@/components/shell/sidebar-props'
import { consoleHome } from '@/lib/console-home'
import { hasAnyPermission, type Permission } from '@/lib/permissions'

type HeaderProps = {
  title?: string
}

// ── Plus menu sections (UX Stress Test #2: four sections) ──

type PlusMenuItem = {
  label: string
  description: string
  href: string
  icon: string
  /**
   * What the route behind the form asks for when it is sent, any one of.
   *
   * The page's own gate (`mayOpen`) is about reading it, and reading is
   * not creating: a client's compliance officer may open the job request
   * list and is refused the moment she sends a new one, because POST
   * /api/requirements asks for requirements.write. An item is offered
   * only to a desk that holds what the send will ask for. Copied from the
   * route's own check, and named beside each item so a change to one is
   * a change seen next to the other.
   */
  writes?: readonly string[]
  /**
   * Only the worker files their own week (CLAUDE.md, station 6, and
   * `mayEnter` in lib/timesheet-authority), and only on a live line —
   * in progress, or ended inside the final-week grace (`rungsToFile`).
   * Offered to nobody else, and to nobody whose lines have all ended.
   */
  workerOnly?: true
  /**
   * The menu link that reaches what this item creates, where the item's
   * own page is not one the reader's menu names. Read only to decide
   * whether the item is on the reader's menu and under which heading.
   */
  onMenuAs?: string
}

type PlusMenuSection = {
  label: string
  items: PlusMenuItem[]
}

const PLUS_MENU: PlusMenuSection[] = [
  {
    label: 'Sell',
    items: [
      {
        // One screen word for the one object on every party's menu
        // (CLAUDE.md, 2026-09-30): the menu beside this button says "Job
        // requests", so the button does too (sign-up walk, round seven,
        // problem 13). The machine name, `requirements`, does not move.
        label: 'New job request',
        description: 'Record a client’s job request for submissions',
        href: '/dashboard/requirements?new=1',
        icon: '◈',
        writes: ['requirements.write'],
      },
      {
        label: 'Submit consultant',
        description: 'Submit a candidate to a job request',
        href: '/dashboard/submissions?new=1',
        icon: '◇',
        // POST /api/submissions: the recruiting desk, or a delivery
        // manager putting the firm's own employee forward.
        writes: ['submissions.create', 'assignments.write'],
      },
    ],
  },
  {
    // "Talent" named a department, not a job. The nav section where a
    // firm signs somebody to its bench is Procure, and this menu says
    // the same word the menu beside it says.
    label: 'Procure',
    items: [
      {
        label: 'Add consultant',
        description: 'Create a candidate profile',
        href: '/dashboard/consultants?new=1',
        icon: '◌',
        writes: ['consultants.write'],
      },
      {
        label: 'Add to bench',
        description: 'List a consultant as available',
        href: '/dashboard/bench?new=1',
        icon: '◎',
        writes: ['consultants.write'],
      },
    ],
  },
  {
    label: 'Operate',
    items: [
      // With the nav: both sides of a contract, and the hours under
      // them, are the administration of a placement.
      {
        label: 'New contract',
        // Not "a sell or buy contract" — those are two lines on one
        // document, not two documents to pick between (CLAUDE.md,
        // "one document, a header and its lines"). The form writes the
        // line this firm bills from and, where it is asked to, the line
        // it pays from beside it.
        description: 'One person, one rate — the line you bill from and the line you pay from',
        href: '/dashboard/contracts?new=1',
        icon: '▣',
        writes: ['assignments.write'],
      },
      {
        label: 'New timesheet',
        description: 'Log hours against a sell contract',
        href: '/dashboard/timesheets?new=1',
        icon: '▦',
        workerOnly: true,
      },
      {
        label: 'New expense report',
        description: 'Submit travel, equipment, or training',
        href: '/dashboard/expenses?new=1',
        icon: '◫',
        // POST /api/expenses asks for this, and nothing stronger.
        writes: ['invoices.read'],
      },
      {
        label: 'Generate bill',
        description: 'Bill the customer for approved timesheets',
        href: '/dashboard/invoices?new=1',
        icon: '▧',
        writes: ['invoices.issue'],
      },
      {
        label: 'New conversation',
        // A client is reached from the role or the candidate, on a thread
        // the client opens. This is the note among your own people.
        description: 'A note among your own people',
        href: '/dashboard/conversations?new=1',
        icon: '💬',
      },
    ],
  },
]

/**
 * A client does not submit consultants, list a bench, or raise invoices —
 * those are vendor actions. They open roles, approve work, and message
 * their vendors.
 */
const CLIENT_PLUS_MENU: PlusMenuSection[] = [
  {
    // "Program" was this section's name after the nav had stopped using
    // it — the same orphan the eyebrow on the requisitions page was.
    label: 'Workforce',
    items: [
      {
        label: 'New job request',
        description: 'Post a job to your suppliers',
        href: '/dashboard/requirements?new=1',
        // The client's menu reaches its job requests through Requisitions.
        onMenuAs: '/dashboard/requisitions',
        icon: '◈',
        writes: ['requirements.write'],
      },
      {
        label: 'New conversation',
        // A supplier is written to from the role or the candidate, so the
        // thread is about something. This is the note among your own people.
        description: 'A note among your own people',
        href: '/dashboard/conversations?new=1',
        icon: '💬',
      },
    ],
  },
  {
    label: 'Governance',
    items: [
      {
        label: 'Review approvals',
        description: 'Timesheets and expenses awaiting you',
        href: '/dashboard/decisions',
        // No client menu names the queue: it is the dashboard's, where a
        // client approves from the row (CLAUDE.md, "The client dashboard
        // reads as a desk"). A seat whose menu has no dashboard has no
        // approvals to review.
        onMenuAs: '/dashboard/program',
        icon: '⬡',
      },
    ],
  },
]

/**
 * What this seat can create.
 *
 * A consultant gets nothing: every item in the supplier menu — submit a
 * consultant, add one to a bench, generate an invoice — is somebody
 * else's action taken about them, and the + button hides itself rather
 * than opening on a list of refusals.
 */
export function plusMenuFor(
  /** The kind whose menu this desk reads — `deskOf(session).menuKind`. */
  kind: string | null,
  isConsultant: boolean,
  /** What this seat holds. Undefined while the session loads. */
  permissions: readonly string[] | null | undefined,
  /** Somebody the work is about, who may file their own week. */
  worker = false,
  /**
   * `filesAWeek`: a live line to file a week on (the dashboard layout's
   * `readerFilesAWeek`). `seatedAtClient`: the client whose desk this is,
   * so a desk-less seat's own menu is read the way the sidebar reads it.
   */
  more: { filesAWeek?: boolean; seatedAtClient?: string | null } = {}
): PlusMenuSection[] {
  if (isConsultant || !kind) return []
  // The headings come from the reader's own menu, below; the sections
  // here only order the items within one.
  const sections = kind === 'CLIENT' ? CLIENT_PLUS_MENU : PLUS_MENU

  // ── The + button says the same thing the menu says ────────────────
  //
  // Every item here opens a page: "Add consultant" goes to
  // /dashboard/consultants?new=1, which refuses anybody without
  // consultants.read one screen later. So an action this seat's
  // permissions cannot carry through is not offered, and a seat left
  // with nothing to create gets no + button at all — the rule already
  // written for a consultant, now read off the page's own gate rather
  // than off a second hand-kept list.
  //
  // And opening the form is not sending it. An item is offered only to a
  // desk that holds what the route will ask for on the send, and the
  // week's own form only to the person whose week it is.
  const offered = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((i) =>
        mayOpen(i.href, permissions) && mayCreate(i, permissions) && (!i.workerOnly || (worker && more.filesAWeek === true))
      ),
    }))
    .filter((section) => section.items.length > 0)

  // ── Every seat is offered only what its own menu holds ────────────
  //
  // Sign-up walk, round six, problem 7: a client's Member, with no desk
  // and no Governance section, was offered "Governance › Review
  // approvals". Round seven, problem 1: the fix was written for a seat
  // with no desk, so a seat holding every permission under a trimmed
  // menu never reached it — a one-person firm was offered "Sell › New
  // requirement" and "Procure › Add consultant" (herself, in the third
  // person), and a program office, which places nobody, "Add to bench".
  // The + button and the menu are filtered from one answer (CLAUDE.md),
  // for everybody: an item stays only where the page it opens is a link
  // on the reader's own menu, headed by the section that link sits
  // under, in the menu's order.
  const nav = getNavForKind(kind as Parameters<typeof getNavForKind>[0], false, {
    worker, permissions, seatedAtClient: more.seatedAtClient ?? null,
  })
  const sectionOf = (href: string): number => {
    const path = href.split('?')[0]
    return nav.findIndex((s) => s.items.some((i) => i.href.split('?')[0] === path))
  }
  const regrouped = new Map<number, PlusMenuItem[]>()
  for (const section of offered) {
    for (const item of section.items) {
      const at = sectionOf(item.onMenuAs ?? item.href)
      if (at < 0) continue
      regrouped.set(at, [...(regrouped.get(at) ?? []), item])
    }
  }
  return [...regrouped.entries()]
    .sort(([a], [b]) => a - b)
    .map(([at, items]) => ({ label: nav[at].label, items }))
}

/** Whether the route behind an item will take the send from this desk. */
function mayCreate(item: PlusMenuItem, permissions: readonly string[] | null | undefined): boolean {
  if (!item.writes || permissions == null) return true
  return hasAnyPermission(permissions, item.writes as Permission[])
}

// ── Global search results ──

type SearchResult = {
  label: string
  type: string
  href: string
}

/**
 * What ⌘K can reach: exactly the pages this party's own menu offers.
 *
 * This used to be a hand-kept list of destinations plus a second list of
 * the ones a client was allowed to see, and both had drifted — a client
 * searching "contract" found nothing, because the only contract entries
 * on the list were the vendor's two and the client's allow-list named a
 * label that did not exist. An integrator and a program office got the
 * vendor's list whole.
 *
 * So it is read off the navigation instead. A page reachable from the
 * menu is searchable; one that is not, is not; and neither list can
 * drift from the other again because there is only one.
 */
export function reachablePagesFor(
  kind: Parameters<typeof getNavForKind>[0],
  isConsultant: boolean,
  seat: Parameters<typeof getNavForKind>[2]
): SearchResult[] {
  return getNavForKind(kind, isConsultant, seat).flatMap((section) =>
    section.items.map((item) => ({
      label: item.label,
      type: 'page',
      href: item.href,
    }))
  )
}

/** First letters of the first two words of a name, e.g. "Anita Desai" → "AD". */
function initials(name: string | undefined): string {
  if (!name) return '·'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '·'
  return parts.slice(0, 2).map(p => p[0]!.toUpperCase()).join('')
}

/** Where a dropdown hangs: from the header row on a phone (full width,
 *  under the bar), from its own button from md up. Every menu in this
 *  bar uses it, so none of them can open off the edge of a phone. */
const DROPDOWN =
  'absolute inset-x-3 top-12 md:inset-x-auto md:right-0 md:top-10 ' +
  'bg-etyme-raised rounded-r-lg shadow-float border border-etyme-rule overflow-hidden z-50 ' +
  'motion-safe:animate-fade-in'

const ICON_BUTTON =
  'w-9 h-9 sm:w-8 sm:h-8 shrink-0 rounded-nav flex items-center justify-center ' +
  'transition-colors hover:bg-etyme-sunk hover:text-etyme-ink'

/** One row in any of this bar's menus. */
const MENU_ROW =
  'w-full text-left px-3 py-2 text-[13px] text-etyme-ink transition-colors ' +
  'hover:bg-etyme-surface focus-visible:bg-etyme-surface'

export function Header({ title }: HeaderProps) {
  const router = useRouter()
  const session = useSession()
  const { company, person, contextType, isDemo } = session
  // "Demo" goes in front of a made-up company's name, and only a
  // company's: a consultant with no firm is a person, never a demo of one.
  const demoChip = isDemo && company ? <DemoChip /> : null
  // The desk this person acts at — the seat's kind and the seat's
  // permissions where a client granted one — read through the same
  // helper the sidebar reads, so the three doors cannot disagree.
  const desk = deskOf(session)
  // The role this desk is held under: the client's, at a client's desk.
  const { permissions, roleName } = desk
  const plusMenu = plusMenuFor(desk.menuKind, desk.isConsultant, permissions, desk.worker, {
    filesAWeek: desk.filesAWeek, seatedAtClient: desk.seatedAtClient,
  })
  const [plusOpen, setPlusOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const accountRef = useRef<HTMLDivElement>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  // The phone's search row, under the bar. Separate from focus: the row
  // is open or shut; focus is whether the results should show.
  const [mobileSearch, setMobileSearch] = useState(false)
  const plusRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  const mobileSearchRef = useRef<HTMLDivElement>(null)
  const mobileSearchToggleRef = useRef<HTMLButtonElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Same home the sidebar's Dashboard entry points at, from the same answer.
  const home = consoleHome({
    kind: desk.companyKind,
    isConsultant: desk.isConsultant,
    seated: Boolean(desk.seatedAtClient),
    worker: desk.worker,
    permissions: desk.permissions,
  }).href

  // Close the account menu on an outside click, the same way the plus menu
  // does. A menu that stays open while you click elsewhere feels stuck.
  useEffect(() => {
    if (!accountOpen) return
    function onClick(e: MouseEvent) {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [accountOpen])

  // Close plus menu and search on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const t = e.target as Node
      if (plusRef.current && !plusRef.current.contains(t)) {
        setPlusOpen(false)
      }
      const insideSearch =
        searchRef.current?.contains(t) ||
        mobileSearchRef.current?.contains(t) ||
        mobileSearchToggleRef.current?.contains(t)
      if (!insideSearch) {
        setSearchFocused(false)
        setMobileSearch(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Keyboard shortcuts: Escape to close, Cmd+K to focus search
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setPlusOpen(false)
        setAccountOpen(false)
        setSearchFocused(false)
        setMobileSearch(false)
        searchInputRef.current?.blur()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
        setSearchFocused(true)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  // Search results — filter pages by query, scoped to what this company
  // can reach, which is what its own navigation offers and nothing else.
  //
  // "A page reachable from the menu is searchable; one that is not, is
  // not" — so the seat goes in too. Searching for a page whose route
  // refuses you is the ⌘K version of a button that lies.
  const reachablePages = reachablePagesFor(
    desk.companyKind,
    desk.isConsultant,
    { worker: desk.worker, permissions, seatedAtClient: desk.seatedAtClient }
  )

  const searchResults: SearchResult[] = searchQuery.length >= 1
    ? reachablePages
        .filter(s => s.label.toLowerCase().includes(searchQuery.toLowerCase()))
        .slice(0, 8)
        .map(s => ({ label: s.label, type: s.type, href: s.href }))
    : []

  const showSearchResults = searchFocused && searchQuery.length >= 1

  function navigateTo(href: string) {
    setPlusOpen(false)
    setSearchFocused(false)
    setMobileSearch(false)
    setSearchQuery('')
    router.push(href as any)
  }

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && searchResults.length > 0) {
      navigateTo(searchResults[0].href)
    }
  }

  const searchIcon = (
    <svg
      width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )

  /** The same list under either search box. */
  const results = showSearchResults && (
    <div className="bg-etyme-raised rounded-r-lg shadow-float border border-etyme-rule overflow-hidden">
      {searchResults.length === 0 ? (
        <div className="px-4 py-3 text-[13px] text-etyme-muted">
          No results for &ldquo;{searchQuery}&rdquo;
        </div>
      ) : (
        <div className="py-1">
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-etyme-faint font-medium">
            Pages
          </div>
          {searchResults.map((r) => (
            <button
              key={r.href + r.label}
              onClick={() => navigateTo(r.href)}
              className={`${MENU_ROW} flex items-center gap-2`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                   className="text-etyme-faint flex-shrink-0" aria-hidden="true">
                <path d="M9 18l6-6-6-6" />
              </svg>
              {r.label}
            </button>
          ))}
        </div>
      )}
      <div className="border-t border-etyme-rule px-3 py-2 text-[11px] text-etyme-faint">
        ↵ to navigate · esc to close
      </div>
    </div>
  )

  return (
    <header className="sticky top-0 z-30 bg-etyme-canvas/90 backdrop-blur-md border-b border-etyme-rule">
      {/* relative: the phone dropdowns hang from this row. */}
      <div className="relative h-14 px-4 md:px-6 flex items-center gap-2 md:gap-4">
        {/* ☰ — the navigation, below md. Renders nothing from md up. */}
        <MobileNav />

        {/* Whose workspace this is. The rail says so on a desktop; on a
            phone the rail is off screen, so the header does — mark,
            company, role, as the prototype's header has them. The mark
            and not the wordmark, on purpose: this block names the
            company, and "Northbend Athletic" beside "etyme" would be two
            names in 390px. The wordmark on a phone is at the top of the
            menu sheet, which is the rail itself (sidebar.tsx). */}
        <Link href={home as any} className="md:hidden flex items-center gap-2.5 min-w-0">
          <EtymeMark size={26} />
          <span className="min-w-0">
            {/* The chip first and never shrinking, the name truncating
                after it, so at 390 wide a long name loses letters and
                the chip loses none. */}
            <span className="flex items-center gap-1.5 min-w-0 leading-tight">
              {demoChip}
              <span className="block text-[13px] font-medium text-etyme-ink truncate leading-tight">
                {company?.name ?? person?.name ?? 'etyme'}
              </span>
            </span>
            {(roleName || contextType === 'CONSULTANT') && (
              <span className="block text-[10.5px] text-etyme-faint truncate leading-tight">
                {contextType === 'CONSULTANT' ? 'Consultant' : roleName}
              </span>
            )}
          </span>
        </Link>

        {/* Whose desk this is, from lg up: the company, and the seat the
            reader holds there — the prototype's header, beside the rail
            that carries the logo. A program office acting at a client's
            desk reads whose desk it is, because every list below is the
            client's book (CLAUDE.md, "Etyme runs the program"). Not at
            768: beside the search box the name was squeezed to nothing,
            and the rail already names the company there. */}
        <div className="hidden lg:flex items-center gap-2 min-w-0 text-[13px]">
          {demoChip}
          <span className="font-medium text-etyme-ink truncate max-w-[16rem]">
            {company?.name ?? person?.name ?? ''}
          </span>
          {(desk.seatedAtClient || roleName || contextType === 'CONSULTANT') && (
            <>
              <span aria-hidden="true" className="text-etyme-rule">/</span>
              <span className="text-etyme-muted truncate max-w-[18rem]">
                {contextType === 'CONSULTANT' ? 'Consultant' : roleName}
                {desk.seatedAtClient ? `${roleName ? ' at ' : 'At '}${desk.seatedAtClient}` : ''}
              </span>
            </>
          )}
        </div>

        {/* Page title */}
        {title && (
          <h1 className="hidden md:block text-[15px] font-semibold text-etyme-ink truncate">
            {title}
          </h1>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Search — global, always visible (UX Stress Test #1). From md up
            it lives in the bar; on a phone it is a button that opens a row. */}
        <div className="relative hidden md:block" ref={searchRef}>
          <input
            type="text"
            ref={searchInputRef}
            placeholder="Search pages"
            aria-label="Search pages"
            aria-keyshortcuts="Meta+K Control+K"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-56 lg:w-64 h-8 pl-8 pr-10 rounded-nav text-[13px]
                       bg-etyme-surface border border-etyme-rule
                       text-etyme-ink placeholder:text-etyme-faint
                       focus:outline-none focus:bg-etyme-raised focus:border-etyme-action
                       focus:shadow-[0_0_0_3px_var(--violet-wash)] transition-all"
            onFocus={() => setSearchFocused(true)}
            onKeyDown={onSearchKey}
          />
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-etyme-faint">
            {searchIcon}
          </span>
          <kbd aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2
                         rounded-box border border-etyme-rule bg-etyme-raised px-1 text-[10.5px] leading-[16px] text-etyme-faint">
            ⌘K
          </kbd>

          {/* Search results dropdown */}
          {showSearchResults && (
            <div className="absolute right-0 top-10 w-72 z-50">
              {results}
            </div>
          )}
        </div>

        <button
          type="button"
          ref={mobileSearchToggleRef}
          onClick={() => {
            // Opening focuses the row; closing clears it. The desktop box
            // shows the same state from md up, so a query left behind
            // here came back pre-opened, results and all, the moment the
            // phone rotated past the breakpoint.
            const next = !mobileSearch
            setMobileSearch(next)
            setSearchFocused(next)
            if (!next) setSearchQuery('')
          }}
          aria-label="Search"
          aria-expanded={mobileSearch}
          className={`md:hidden ${ICON_BUTTON} text-etyme-muted ${mobileSearch ? 'bg-etyme-canvas' : ''}`}
        >
          {searchIcon}
        </button>

        {/* Notification bell — real-time via SSE */}
        <NotificationBell />

        {/* Plus button — the add menu (UX Stress Test #2). Absent for a
            seat with nothing of its own to create, which is a consultant:
            every item on it is somebody else's action about them. */}
        {plusMenu.length > 0 && (
        <div className="md:relative" ref={plusRef}>
          <button
            onClick={() => setPlusOpen(!plusOpen)}
            className={`h-9 w-9 sm:h-8 sm:w-auto sm:px-3 shrink-0 rounded-nav text-[13px] font-medium
                       bg-etyme-action text-white
                       hover:bg-etyme-action-hover active:bg-etyme-action-down transition-colors
                       flex items-center justify-center gap-1.5
                       ${plusOpen ? 'bg-etyme-action-hover' : ''}`}
            title="Add new"
            aria-label="Add new"
            aria-haspopup="menu"
            aria-expanded={plusOpen}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span className="hidden sm:inline">New</span>
          </button>

          {/* Plus menu dropdown */}
          {plusOpen && (
            <div className={`${DROPDOWN} md:w-72`}>
              {plusMenu.map((section, si) => (
                <div key={section.label}>
                  {si > 0 && <div className="border-t border-etyme-rule" />}
                  <div className="px-3 py-1.5 mt-1 text-[10px] uppercase tracking-wider text-etyme-faint font-medium">
                    {section.label}
                  </div>
                  {section.items.map((item) => (
                    <button
                      key={item.href + item.label}
                      onClick={() => navigateTo(item.href)}
                      className={`${MENU_ROW} group`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] text-etyme-muted w-4 text-center flex-shrink-0">
                          {item.icon}
                        </span>
                        <span className="text-[13px] font-medium text-etyme-ink group-hover:text-etyme-action-press">
                          {item.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-etyme-faint ml-6 mt-0.5">
                        {item.description}
                      </p>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        {/* Account menu.
            The avatar used to be a button that did nothing at all, which
            meant there was no way to sign out anywhere in the product —
            somebody on a shared machine simply stayed signed in. */}
        <div className="md:relative" ref={accountRef}>
          <button
            onClick={() => setAccountOpen(!accountOpen)}
            aria-haspopup="menu"
            aria-expanded={accountOpen}
            aria-label="Account"
            className="w-9 h-9 sm:w-8 sm:h-8 shrink-0 rounded-full bg-etyme-action-wash text-etyme-action-press
                       border border-etyme-action-line text-[11px] font-semibold flex items-center justify-center
                       hover:bg-etyme-action-line/60 transition-colors"
            title={person?.name ? `${person.name}${company ? ` · ${company.name}` : ''}` : undefined}
          >
            {initials(person?.name)}
          </button>

          {accountOpen && (
            <div className={`${DROPDOWN} md:w-64`}>
              <div className="px-4 py-3 border-b border-etyme-rule">
                <p className="text-[13px] text-etyme-ink font-medium truncate">
                  {person?.name ?? 'Signed in'}
                </p>
                {person?.email && (
                  <p className="text-[12px] text-etyme-muted truncate">{person.email}</p>
                )}
                {company && (
                  <p className="flex items-center gap-1.5 min-w-0 text-[12px] text-etyme-faint mt-0.5">
                    {demoChip}
                    <span className="truncate">{company.name}</span>
                  </p>
                )}
              </div>

              {/* The third door onto the same two pages, and it was the
                  one that refused nobody: the menu and ⌘K both filter on
                  what a seat can open and this pushed anybody who
                  clicked their own name. `mayOpen` reads the permission
                  off the page's own route, so all three agree. */}
              {mayOpen('/dashboard/settings', permissions) && (
                <button
                  onClick={() => { setAccountOpen(false); router.push('/dashboard/settings') }}
                  className={`${MENU_ROW} px-4 py-2.5`}
                >
                  Settings
                </button>
              )}
              {mayOpen('/dashboard/access', permissions) && (
                <button
                  onClick={() => { setAccountOpen(false); router.push('/dashboard/access') }}
                  className={`${MENU_ROW} px-4 py-2.5`}
                >
                  Users &amp; permissions
                </button>
              )}

              <button
                onClick={() => { setAccountOpen(false); void signOutEverywhere() }}
                className="w-full text-left px-4 py-2.5 text-[13px] text-etyme-attention
                           hover:bg-etyme-surface transition-colors border-t border-etyme-rule"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* The phone's search row. Its own line under the bar, full width,
          results directly beneath rather than floating. */}
      {mobileSearch && (
        <div className="md:hidden px-4 pb-3" ref={mobileSearchRef}>
          <div className="relative">
            <input
              type="text"
              autoFocus
              placeholder="Search pages"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onKeyDown={onSearchKey}
              aria-label="Search pages"
              className="w-full h-10 pl-9 pr-3 rounded-nav text-[16px]
                         bg-etyme-raised border border-etyme-rule
                         text-etyme-ink placeholder:text-etyme-faint
                         focus:outline-none focus:border-etyme-action
                         focus:shadow-[0_0_0_3px_var(--violet-wash)]"
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-etyme-faint">
              {searchIcon}
            </span>
          </div>
          {showSearchResults && <div className="mt-2">{results}</div>}
        </div>
      )}
    </header>
  )
}
