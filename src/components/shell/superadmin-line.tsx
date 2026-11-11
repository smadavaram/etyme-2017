'use client'

import Link from 'next/link'
import { useSession } from '@/components/session-provider'

/** Where the account menu's Superadmin line goes. */
export const SUPERADMIN_HREF = '/dashboard/superadmin'

/**
 * The account menu's "Superadmin" line (founder, 2026-11-11, "The ladder
 * and its words"): drawn only for an address on ETYME_STAFF_EMAILS, read on
 * the server by the dashboard layout. It opens Etyme's platform tools and
 * never a company's data. Nobody else sees it, and the screen it opens
 * refuses anybody else at its route.
 */
export function SuperadminLine({ onPicked, roomy = false }: {
  /** Called before the page changes, so the menu that holds the line can close. */
  onPicked?: () => void
  /** The phone sheet's thumb-sized row. */
  roomy?: boolean
}) {
  const { superadmin } = useSession()
  if (!superadmin) return null
  return (
    <Link
      href={SUPERADMIN_HREF}
      onClick={() => onPicked?.()}
      className={`block w-full text-left px-4 ${roomy ? 'py-3' : 'py-2.5'} text-[13px] text-etyme-ink
                  hover:bg-etyme-surface focus-visible:bg-etyme-surface transition-colors border-b border-etyme-rule`}
    >
      Superadmin
    </Link>
  )
}

/**
 * The account menu's one line for an invited seat on a public address at a
 * hybrid company (founder, 2026-11-11): what this seat does not do, in the
 * sentence /api/me gives, so the person reads why a money or signing act
 * is not on their menu. Nothing for any other seat.
 */
export function LimitedSeatLine({ roomy = false }: { roomy?: boolean }) {
  const { limited } = useSession()
  if (!limited) return null
  return (
    <p className={`px-4 ${roomy ? 'py-3' : 'py-2.5'} text-[12px] leading-snug text-etyme-muted border-b border-etyme-rule`}>
      {limited}
    </p>
  )
}
