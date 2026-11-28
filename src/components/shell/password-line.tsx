'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

/** Where the account menu's password line goes, and the route it reads. */
export const PASSWORD_HREF = { page: '/dashboard/settings/password', api: '/api/auth/password/reset' } as const

/** The line's words: "Set a password" until there is one, then "Change password". */
export function passwordLineLabel(hasPassword: boolean): string {
  return hasPassword ? 'Change password' : 'Set a password'
}

/**
 * The account menu's password line (fault 5, 2026-11-12): "Set a
 * password" for a person who came in with Google, Microsoft or a staff
 * seat and holds none, "Change password" once they do. Drawn only where
 * the person's address may hold a password: never at a directory-only
 * company's address, never in the demo world. It is the person's own
 * account, whichever company or hat the menu is showing.
 */
export function PasswordLine({ onPicked, roomy = false }: {
  /** Called before the page changes, so the menu that holds the line can close. */
  onPicked?: () => void
  /** The phone sheet's thumb-sized row. */
  roomy?: boolean
}) {
  const [label, setLabel] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    fetch(PASSWORD_HREF.api, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live) setLabel(j?.data?.allowed ? passwordLineLabel(Boolean(j.data.hasPassword)) : null) })
      .catch(() => { if (live) setLabel(null) })
    return () => { live = false }
  }, [])
  if (!label) return null
  return (
    <Link
      href={PASSWORD_HREF.page}
      onClick={() => onPicked?.()}
      className={`block w-full text-left px-4 ${roomy ? 'py-3' : 'py-2.5'} text-[13px] text-etyme-ink
                  hover:bg-etyme-surface focus-visible:bg-etyme-surface transition-colors border-b border-etyme-rule`}
    >
      {label}
    </Link>
  )
}
