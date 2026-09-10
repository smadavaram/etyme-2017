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

type HeaderProps = {
  title?: string
}

// ── Plus menu sections (UX Stress Test #2: four sections) ──

type PlusMenuItem = {
  label: string
  description: string
  href: string
  icon: string
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
        label: 'New requirement',
        description: 'Open a role for client submissions',
        href: '/dashboard/requirements?new=1',
        icon: '◈',
      },
      {
        label: 'Submit consultant',
        description: 'Submit a candidate to a requirement',
        href: '/dashboard/submissions?new=1',
        icon: '◇',
      },
      {
        label: 'New contract',
        description: 'Create a sell or buy contract',
        href: '/dashboard/contracts?new=1',
        icon: '▣',
      },
    ],
  },
  {
    label: 'Talent',
    items: [
      {
        label: 'Add consultant',
        description: 'Create a candidate profile',
        href: '/dashboard/consultants?new=1',
        icon: '◌',
      },
      {
        label: 'Add to bench',
        description: 'List a consultant as available',
        href: '/dashboard/bench?new=1',
        icon: '◎',
      },
    ],
  },
  {
    label: 'Operate',
    items: [
      {
        label: 'New timesheet',
        description: 'Log hours against a sell contract',
        href: '/dashboard/timesheets?new=1',
        icon: '▦',
      },
      {
        label: 'New expense report',
        description: 'Submit travel, equipment, or training',
        href: '/dashboard/expenses?new=1',
        icon: '◫',
      },
      {
        label: 'Generate invoice',
        description: 'Create an invoice for approved timesheets',
        href: '/dashboard/invoices?new=1',
        icon: '▧',
      },
      {
        label: 'New conversation',
        description: 'Message a client or candidate',
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
    label: 'Program',
    items: [
      {
        label: 'New role',
        description: 'Open a requisition for your vendors',
        href: '/dashboard/requirements?new=1',
        icon: '◈',
      },
      {
        label: 'New conversation',
        description: 'Message a vendor or contractor',
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
        icon: '⬡',
      },
    ],
  },
]

// ── Global search results ──

type SearchResult = {
  label: string
  type: string
  href: string
}

/** Pages a client company can actually reach — mirrors CLIENT_NAV. */
const CLIENT_SEARCH_LABELS = new Set([
  'Program', 'Org view', 'Requirements', 'Submissions', 'Contracts', 'Rolloff', 'Alumni',
  'Timesheets', 'Invoices', 'Expenses', 'Compliance', 'Tenure',
  'Notifications', 'Conversations', 'Decisions',
])

const SEARCH_SECTIONS: { type: string; label: string; href: string }[] = [
  { type: 'page', label: 'Dashboard', href: '/dashboard' },
  { type: 'page', label: 'Requirements', href: '/dashboard/requirements' },
  { type: 'page', label: 'Submissions', href: '/dashboard/submissions' },
  { type: 'page', label: 'Sell contracts', href: '/dashboard/contracts?side=sell' },
  { type: 'page', label: 'Buy contracts', href: '/dashboard/contracts?side=buy' },
  { type: 'page', label: 'Rolloff', href: '/dashboard/rolloff' },
  { type: 'page', label: 'Bench', href: '/dashboard/bench' },
  { type: 'page', label: 'Consultants', href: '/dashboard/consultants' },
  { type: 'page', label: 'Training', href: '/dashboard/training' },
  { type: 'page', label: 'Timesheets', href: '/dashboard/timesheets' },
  { type: 'page', label: 'Invoices', href: '/dashboard/invoices' },
  { type: 'page', label: 'Expenses', href: '/dashboard/expenses' },
  { type: 'page', label: 'Payroll', href: '/dashboard/payroll' },
  { type: 'page', label: 'Automation', href: '/dashboard/automation' },
  { type: 'page', label: 'Compliance', href: '/dashboard/compliance' },
  { type: 'page', label: 'Notifications', href: '/dashboard/notifications' },
  { type: 'page', label: 'Conversations', href: '/dashboard/conversations' },
  { type: 'page', label: 'Needs attention', href: '/dashboard/decisions' },
  { type: 'page', label: 'Reports', href: '/dashboard/reports' },
  { type: 'page', label: 'Import', href: '/dashboard/import' },
  { type: 'page', label: 'Program', href: '/dashboard/program' },
  { type: 'page', label: 'Org view', href: '/dashboard/program/org' },
  { type: 'page', label: 'Past contractors', href: '/dashboard/alumni' },
  { type: 'page', label: 'Tenure', href: '/dashboard/tenure' },
]

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
  'bg-white rounded-lg shadow-lg border border-etyme-rule overflow-hidden z-50'

const ICON_BUTTON =
  'w-9 h-9 sm:w-8 sm:h-8 shrink-0 rounded-md flex items-center justify-center ' +
  'transition-colors hover:bg-etyme-canvas'

export function Header({ title }: HeaderProps) {
  const router = useRouter()
  const { company, person, roleName, contextType } = useSession()
  const isClient = company?.kind === 'CLIENT'
  const plusMenu = isClient ? CLIENT_PLUS_MENU : PLUS_MENU
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

  // Same home the sidebar's Dashboard entry points at.
  const home = contextType === 'CONSULTANT'
    ? '/dashboard/my-work'
    : isClient ? '/dashboard/program' : '/dashboard'

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

  // Search results — filter pages by query, scoped to what this company can reach
  const reachablePages = isClient
    ? SEARCH_SECTIONS.filter(s => CLIENT_SEARCH_LABELS.has(s.label))
    : SEARCH_SECTIONS

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
    <div className="bg-white rounded-lg shadow-lg border border-etyme-rule overflow-hidden">
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
              className="w-full text-left px-3 py-2 text-[13px] text-etyme-ink
                         hover:bg-etyme-canvas transition-colors flex items-center gap-2"
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
    <header className="sticky top-0 z-30 bg-etyme-canvas/95 backdrop-blur-sm border-b border-etyme-rule">
      {/* relative: the phone dropdowns hang from this row. */}
      <div className="relative h-14 px-4 md:px-6 flex items-center gap-2 md:gap-4">
        {/* ☰ — the navigation, below md. Renders nothing from md up. */}
        <MobileNav />

        {/* Whose workspace this is. The rail says so on a desktop; on a
            phone the rail is off screen, so the header does — mark,
            company, role, as the prototype's header has them. */}
        <Link href={home as any} className="md:hidden flex items-center gap-2.5 min-w-0">
          <EtymeMark size={26} />
          <span className="min-w-0">
            <span className="block text-[13px] font-medium text-etyme-ink truncate leading-tight">
              {company?.name ?? person?.name ?? 'etyme'}
            </span>
            {(roleName || contextType === 'CONSULTANT') && (
              <span className="block text-[10.5px] text-etyme-faint truncate leading-tight">
                {contextType === 'CONSULTANT' ? 'Consultant' : roleName}
              </span>
            )}
          </span>
        </Link>

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
            placeholder="Search… ⌘K"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-56 h-8 pl-8 pr-3 rounded-md text-[13px]
                       bg-etyme-surface border border-etyme-rule
                       text-etyme-ink placeholder:text-etyme-faint
                       focus:outline-none focus:ring-2 focus:ring-etyme-action/20
                       focus:border-etyme-action/40 transition-all"
            onFocus={() => setSearchFocused(true)}
            onKeyDown={onSearchKey}
          />
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-etyme-faint">
            {searchIcon}
          </span>

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
            setMobileSearch((v) => !v)
            setSearchFocused(true)
          }}
          aria-label="Search"
          aria-expanded={mobileSearch}
          className={`md:hidden ${ICON_BUTTON} text-etyme-muted ${mobileSearch ? 'bg-etyme-canvas' : ''}`}
        >
          {searchIcon}
        </button>

        {/* Notification bell — real-time via SSE */}
        <NotificationBell />

        {/* Plus button — the four-section add menu (UX Stress Test #2) */}
        <div className="md:relative" ref={plusRef}>
          <button
            onClick={() => setPlusOpen(!plusOpen)}
            className={`h-9 w-9 sm:h-8 sm:w-auto sm:px-3 shrink-0 rounded-md text-[13px] font-medium
                       bg-etyme-action text-white
                       hover:bg-etyme-action/90 transition-colors
                       flex items-center justify-center gap-1.5
                       ${plusOpen ? 'ring-2 ring-etyme-action/30' : ''}`}
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
                      className="w-full text-left px-3 py-2 hover:bg-etyme-canvas
                                 transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] text-etyme-muted w-4 text-center flex-shrink-0">
                          {item.icon}
                        </span>
                        <span className="text-[13px] font-medium text-etyme-ink group-hover:text-etyme-action">
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
            className="w-9 h-9 sm:w-8 sm:h-8 shrink-0 rounded-full bg-etyme-action/10 text-etyme-action
                       text-[11px] font-bold flex items-center justify-center
                       hover:bg-etyme-action/20 transition-colors"
            title={person?.name ? `${person.name}${company ? ` · ${company.name}` : ''}` : undefined}
          >
            {initials(person?.name)}
          </button>

          {accountOpen && (
            <div className={`${DROPDOWN} md:w-64 !bg-etyme-raised`}>
              <div className="px-4 py-3 border-b border-etyme-rule">
                <p className="text-[13px] text-etyme-ink font-medium truncate">
                  {person?.name ?? 'Signed in'}
                </p>
                {person?.email && (
                  <p className="text-[12px] text-etyme-muted truncate">{person.email}</p>
                )}
                {company && (
                  <p className="text-[12px] text-etyme-faint truncate mt-0.5">
                    {company.name}
                  </p>
                )}
              </div>

              <button
                onClick={() => { setAccountOpen(false); router.push('/dashboard/settings') }}
                className="w-full text-left px-4 py-2.5 text-[13px] text-etyme-ink
                           hover:bg-etyme-canvas transition-colors"
              >
                Settings
              </button>
              <button
                onClick={() => { setAccountOpen(false); router.push('/dashboard/access') }}
                className="w-full text-left px-4 py-2.5 text-[13px] text-etyme-ink
                           hover:bg-etyme-canvas transition-colors"
              >
                Users & permissions
              </button>

              <button
                onClick={() => { setAccountOpen(false); void signOutEverywhere() }}
                className="w-full text-left px-4 py-2.5 text-[13px] text-etyme-attention
                           hover:bg-etyme-canvas transition-colors border-t border-etyme-rule"
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
              className="w-full h-10 pl-9 pr-3 rounded-md text-[15px]
                         bg-etyme-surface border border-etyme-rule
                         text-etyme-ink placeholder:text-etyme-faint
                         focus:outline-none focus:ring-2 focus:ring-etyme-action/20
                         focus:border-etyme-action/40"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-etyme-faint">
              {searchIcon}
            </span>
          </div>
          {showSearchResults && <div className="mt-2">{results}</div>}
        </div>
      )}
    </header>
  )
}
