'use client'

import { useEffect, useState } from 'react'
import { getSession, signOut } from 'next-auth/react'
import { ANOTHER_ACCOUNT, AFTER_ANOTHER_ACCOUNT, signedInAsSays } from '@/lib/login-doors'

/**
 * "You are signed in as sharath@gmail.com. Not you? Use another account"
 *
 * The founder, 2026-10-20: a browser already signed in to a personal Gmail
 * sent him into Etyme as that account, with no way to switch. This line
 * sits on the sign-in page and on the first screen after it (/start). It
 * signs the person out and reopens the sign-in page, where Microsoft and
 * Google show their account chooser (lib/auth `ACCOUNT_CHOOSER`).
 *
 * Drawn only when somebody is signed in. One component, so both screens
 * say the same words.
 */
export function AnotherAccount({ email: known, className = '' }: { email?: string | null; className?: string }) {
  const [email, setEmail] = useState<string | null>(known ?? null)
  useEffect(() => {
    if (known) return
    let live = true
    getSession()
      .then((s) => { if (live) setEmail(s?.user?.email ?? null) })
      .catch(() => {})
    return () => { live = false }
  }, [known])

  const says = signedInAsSays(email)
  if (!says) return null
  return (
    <p data-another-account className={`text-sm text-etyme-muted ${className}`}>
      {says}{' '}
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: AFTER_ANOTHER_ACCOUNT })}
        className="text-etyme-action-press hover:underline"
      >
        {ANOTHER_ACCOUNT}
      </button>
    </p>
  )
}
