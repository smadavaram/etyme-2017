'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { useEffect, useState } from 'react'
import { SECOND_CHECK_HREF } from '@/lib/identity/second-check-words'

/**
 * The account menu's "Second check" line (Layer 7, slice S1): the
 * person's own passkeys and authenticator app, whichever company or hat
 * the menu is showing. Drawn only where the route answers this person,
 * so never for the read-only sample seat or an integration.
 */
export function SecondCheckLine({ onPicked, roomy = false }: {
  /** Called before the page changes, so the menu that holds the line can close. */
  onPicked?: () => void
  /** The phone sheet's thumb-sized row. */
  roomy?: boolean
}) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    let live = true
    fetch(SECOND_CHECK_HREF.api, { cache: 'no-store' })
      .then((r) => { if (live) setShown(r.ok) })
      .catch(() => { if (live) setShown(false) })
    return () => { live = false }
  }, [])
  if (!shown) return null
  return (
    <Link
      href={SECOND_CHECK_HREF.page as Route}
      onClick={() => onPicked?.()}
      className={`block w-full text-left px-4 ${roomy ? 'py-3' : 'py-2.5'} text-[13px] text-etyme-ink
                  hover:bg-etyme-surface focus-visible:bg-etyme-surface transition-colors border-b border-etyme-rule`}
    >
      Second check
    </Link>
  )
}
