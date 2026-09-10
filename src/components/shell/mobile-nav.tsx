'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { Sidebar } from '@/components/shell/sidebar'
import { sidebarPropsFrom } from '@/components/shell/sidebar-props'
import { signOutEverywhere } from '@/components/shell/sign-out'
import { useSession } from '@/components/session-provider'

/**
 * The navigation, on a phone.
 *
 * The dashboard layout hides the sidebar below the md breakpoint and,
 * until this existed, put nothing in its place: a phone got a header
 * and a page and no way to reach any other page. The founder's own
 * report — "the navigation, sign in sign out are all missing".
 *
 * This is the same Sidebar, slid in from the left behind a ☰ button —
 * the door every phone app has, so nobody has to be told where the menu
 * is. Not a second navigation: the sections, groups, labels and the
 * active-state rule are all the sidebar's, and sidebar-props.ts reads the
 * company off the session for both surfaces, so a client on a phone sees
 * the client nav and never the vendor's.
 *
 * The sheet closes when a destination is tapped, on Escape, on the
 * backdrop, and on any route change; the page behind it does not scroll
 * while it is open. Rendered through a portal at body level: the header
 * it lives in is sticky with a backdrop-filter, and a fixed element
 * inside that is positioned against the header box rather than the
 * viewport — a full-height sheet became a 56px strip.
 *
 * The account sits at the bottom of the sheet, with Sign out. On a
 * desktop that lives behind the avatar in the header; on a phone a
 * two-letter circle does not read as a menu, so the sheet says it in
 * words as well.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const session = useSession()

  // A new page means a destination was chosen; the sheet has done its job.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = before
    }
  }, [open])

  const close = () => setOpen(false)

  const sheet =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            id="mobile-nav"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="md:hidden fixed inset-0 z-40"
          >
            <button
              type="button"
              aria-label="Close menu"
              onClick={close}
              className="absolute inset-0 w-full bg-etyme-ink/30 motion-safe:animate-fade-in"
            />
            <div
              className="absolute inset-y-0 left-0 w-[min(300px,85vw)] bg-etyme-surface
                         border-r border-etyme-rule shadow-2xl motion-safe:animate-slide-in-left"
            >
              <Sidebar
                {...sidebarPropsFrom(session)}
                sheet
                onDismiss={close}
                footer={
                  <Account
                    name={session.person?.name}
                    email={session.person?.email}
                    onSettings={() => {
                      close()
                      router.push('/dashboard/settings')
                    }}
                    onSignOut={() => {
                      close()
                      void signOutEverywhere()
                    }}
                  />
                }
              />
            </div>
          </div>,
          document.body
        )
      : null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="mobile-nav"
        className="md:hidden -ml-1.5 w-9 h-9 shrink-0 rounded-md flex items-center justify-center
                   text-etyme-ink hover:bg-etyme-canvas transition-colors"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      {sheet}
    </>
  )
}

/** Who is signed in, and the two things they do about it. */
function Account({
  name,
  email,
  onSettings,
  onSignOut,
}: {
  name?: string
  email?: string
  onSettings: () => void
  onSignOut: () => void
}) {
  return (
    <div className="px-4 py-3 border-t border-etyme-rule">
      <p className="text-[13px] font-medium text-etyme-ink truncate">{name || 'Signed in'}</p>
      {email && <p className="text-[12px] text-etyme-muted truncate">{email}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onSettings}
          className="flex-1 h-9 rounded-md border border-etyme-rule bg-etyme-raised
                     text-[13px] text-etyme-ink hover:bg-etyme-canvas transition-colors"
        >
          Settings
        </button>
        <button
          type="button"
          onClick={onSignOut}
          className="flex-1 h-9 rounded-md border border-etyme-rule bg-etyme-raised
                     text-[13px] font-medium text-etyme-attention hover:bg-etyme-canvas transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
