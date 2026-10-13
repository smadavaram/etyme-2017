'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { Sidebar } from '@/components/shell/sidebar'
import { sidebarPropsFrom, deskOf } from '@/components/shell/sidebar-props'
import { signOutEverywhere } from '@/components/shell/sign-out'
import { useSession } from '@/components/session-provider'
import { mayOpen } from '@/lib/nav-table'

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
 * The account sits at the bottom of the sheet: the person, their email
 * and the role they hold here, then Settings and Sign out. On a desktop
 * that lives behind the avatar in the header; on a phone the header has
 * no words at all (founder, 2026-10-13, the phone header cut), so the
 * sheet is where a phone reader finds who they are signed in as.
 *
 * In the demo the sheet opens on one quiet line, "Demo · Northbend
 * Athletic is a sample company" — the chip that used to sit in the
 * header, said once, where the company is named.
 *
 * The ☰ sits on the right of the header, after the flip, in the same box
 * size as the logo and the flip. The header does not draw it on Ask
 * Etyme.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const session = useSession()
  const desk = deskOf(session)
  // "Demo" is a company's word, never a person's: a consultant with no
  // firm is not a demo of one. The same rule the sidebar's chip reads.
  const demoCompany = session.isDemo && session.company ? session.company.name : null

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
              className="absolute inset-0 w-full bg-etyme-ink/35 motion-safe:animate-fade-in"
            />
            <div
              className="absolute inset-y-0 left-0 w-[min(300px,85vw)] flex flex-col bg-etyme-surface
                         border-r border-etyme-rule shadow-float motion-safe:animate-slide-in-left"
            >
              {demoCompany && (
                <p
                  role="note"
                  data-demo-line
                  className="shrink-0 border-b border-etyme-rule bg-etyme-sunk/60 px-5 py-2 text-[12px] leading-snug text-etyme-muted"
                >
                  Demo · {demoCompany} is a sample company
                </p>
              )}
              <div className="flex-1 min-h-0">
              <Sidebar
                {...sidebarPropsFrom(session)}
                sheet
                onDismiss={close}
                footer={
                  <Account
                    name={session.person?.name}
                    email={session.person?.email}
                    role={desk.isConsultant ? 'Consultant' : desk.roleName}
                    // The same gate the desktop account menu reads: a
                    // button the route will refuse is a button that lies.
                    mayOpenSettings={mayOpen('/dashboard/settings', desk.permissions)}
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
        // Only while the sheet exists; a reference to an id that is not
        // in the document is worse for a screen reader than none.
        aria-controls={open ? 'mobile-nav' : undefined}
        className="md:hidden w-9 h-9 sm:w-8 sm:h-8 shrink-0 rounded-nav flex items-center justify-center
                   text-etyme-ink hover:bg-etyme-sunk transition-colors"
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
  role,
  mayOpenSettings,
  onSettings,
  onSignOut,
}: {
  name?: string
  email?: string
  /** The role held here — the header no longer says it on a phone. */
  role?: string | null
  mayOpenSettings: boolean
  onSettings: () => void
  onSignOut: () => void
}) {
  return (
    <div className="px-4 py-3 border-t border-etyme-rule">
      <p className="text-[13px] font-medium text-etyme-ink truncate">{name || 'Signed in'}</p>
      {email && <p className="text-[12px] text-etyme-muted truncate">{email}</p>}
      {role && <p className="text-[12px] text-etyme-faint truncate">{role}</p>}
      <div className="mt-3 flex items-center gap-2">
        {mayOpenSettings && (
        <button
          type="button"
          onClick={onSettings}
          className="flex-1 h-10 rounded-nav border border-etyme-rule bg-etyme-raised
                     text-[13px] text-etyme-ink hover:bg-etyme-sunk transition-colors"
        >
          Settings
        </button>
        )}
        <button
          type="button"
          onClick={onSignOut}
          className="flex-1 h-10 rounded-nav border border-etyme-rule bg-etyme-raised
                     text-[13px] font-medium text-etyme-attention hover:bg-etyme-sunk transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
