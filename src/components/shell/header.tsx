'use client'

/**
 * Top header bar — sticky, shows context + user + plus button.
 *
 * CLAUDE.md design system:
 *   "Shell — sticky header (logo + org + role), sidebar nav with section groups"
 *   "Restore the plus button with its four sections" (UX Stress Test #2)
 *   "Search on every list. Before anything else." (UX Stress Test #1)
 */

import { useState } from 'react'

type HeaderProps = {
  title?: string
}

export function Header({ title }: HeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false)

  return (
    <header className="sticky top-0 z-30 bg-etyme-canvas/95 backdrop-blur-sm
                        border-b border-etyme-rule px-6 h-14 flex items-center gap-4">
      {/* Page title */}
      {title && (
        <h1 className="text-[15px] font-semibold text-etyme-ink">
          {title}
        </h1>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search — global, always visible (UX Stress Test #1) */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search…"
          className="w-56 h-8 pl-8 pr-3 rounded-md text-[13px]
                     bg-etyme-surface border border-etyme-rule
                     text-etyme-ink placeholder:text-etyme-faint
                     focus:outline-none focus:ring-2 focus:ring-etyme-action/20
                     focus:border-etyme-action/40 transition-all"
          onFocus={() => setSearchOpen(true)}
          onBlur={() => setSearchOpen(false)}
        />
        <svg
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-etyme-faint"
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </div>

      {/* Plus button — the four-section add menu (UX Stress Test #2) */}
      <button
        className="h-8 px-3 rounded-md text-[13px] font-medium
                   bg-etyme-action text-white
                   hover:bg-etyme-action/90 transition-colors
                   flex items-center gap-1.5"
        title="Add new"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span className="hidden sm:inline">New</span>
      </button>

      {/* User avatar */}
      <button className="w-8 h-8 rounded-full bg-etyme-action/10 text-etyme-action
                          text-[11px] font-bold flex items-center justify-center
                          hover:bg-etyme-action/20 transition-colors">
        SM
      </button>
    </header>
  )
}
