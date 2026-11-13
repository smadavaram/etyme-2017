'use client'

import { useEffect, useState } from 'react'
import { signIn, getProviders } from 'next-auth/react'
import {
  chooserFor, keepRetry, rememberDoor, readLastDoor, providerOf, accountButtons, continueWith, tryAgainWith,
  LINKEDIN_DOOR_SAYS, type KnownDoors, type RetryDoor,
} from '@/lib/login-doors'

/**
 * Google, Microsoft and LinkedIn, one button each, shared by every door.
 *
 * Since the founder's evening of 2026-11-12 ("how a new user signs up, or
 * Google sign in, or Microsoft sign in, or LinkedIn sign in, and then if
 * the user wants to use username and password or directory sign in") the
 * account buttons come first on the sign-in page and the sign-up page
 * alike, and the email under "or use your email". One component so the
 * two pages cannot drift.
 *
 * A button is drawn only when NextAuth lists its provider, which it does
 * only when the deployment holds that provider's keys (lib/auth). A
 * Microsoft button that lands on an error page is worse than none. While
 * the list is unknown nothing is drawn (lib/login-doors).
 *
 * This file holds the one button handler every door shares, so the door
 * used last is remembered and Try again knows what to restart, wherever
 * the press happened.
 *
 * Both ask the provider for its account chooser (`CHOOSE_ACCOUNT`, and
 * `ACCOUNT_CHOOSER` on the providers in lib/auth), so a browser signed in
 * to a personal Gmail still offers the work account (founder, 2026-10-20).
 *
 * Both land on /start, which seats a person who already has an account on
 * this email in it, joins a colleague to a company that owns the email's
 * domain, or sets a new company up (/api/onboarding).
 */

/** Which ways in this deployment has, asked once. Null until known. */
export function useKnownDoors(): KnownDoors {
  const [available, setAvailable] = useState<KnownDoors>(null)
  useEffect(() => {
    getProviders()
      .then((p) => setAvailable(new Set(Object.keys(p ?? {}))))
      // If we cannot ask, offer only the password door, which is always
      // there, rather than buttons nobody knows will work.
      .catch(() => setAvailable(null))
  }, [])
  return available
}

const accountButton =
  'w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-etyme-rule ' +
  'hover:border-etyme-action/30 hover:bg-etyme-canvas transition-all text-sm font-medium text-etyme-ink'

// The same button, filled, for "Try <Provider> again": doorButton's color
// and border with the account button's shape, so both stand one height.
const retryButton =
  'w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-transparent bg-etyme-action ' +
  'hover:opacity-90 transition-opacity text-sm font-medium text-white'

/**
 * The one press of a provider button, on every door: remember the door on
 * this browser (one word, no address), keep the door and the address for
 * Try again in this tab, and start a fresh sign-in with the account
 * chooser and the address as a hint.
 */
export function startAccountDoor(door: RetryDoor, callbackUrl = '/start', email?: string | null): void {
  rememberDoor(door)
  keepRetry(door, email)
  void signIn(providerOf(door), { callbackUrl }, chooserFor(email))
}

function MicrosoftMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 21 21" fill="none" aria-hidden="true">
      <path d="M10 0H0V10H10V0Z" fill="#F25022" />
      <path d="M21 0H11V10H21V0Z" fill="#7FBA00" />
      <path d="M10 11H0V21H10V11Z" fill="#00A4EF" />
      <path d="M21 11H11V21H21V11Z" fill="#FFB900" />
    </svg>
  )
}

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

function LinkedInMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="4" fill="#0A66C2" />
      <path d="M7.1 9.6H4.8V19h2.3V9.6zM6 5.6a1.3 1.3 0 1 0 0 2.7 1.3 1.3 0 0 0 0-2.7zM19.2 13.8c0-2.5-1.3-4.4-3.8-4.4-1.2 0-2.1.6-2.5 1.3V9.6h-2.2V19H13v-4.7c0-1.3.3-2.5 1.8-2.5s1.6 1.4 1.6 2.6V19h2.3v-5.2z" fill="#fff" />
    </svg>
  )
}

const MARKS: Record<RetryDoor, () => JSX.Element> = { google: GoogleMark, microsoft: MicrosoftMark, linkedin: LinkedInMark }

/**
 * One account button: Google, Microsoft or LinkedIn, an outline, with the
 * provider's small mark. Filled only as "Try <Provider> again" after that
 * provider's sign-in did not finish, the one filled button on that screen.
 * LinkedIn carries "Candidates only" at its right edge and in its name.
 */
export function AccountDoorButton({ door, callbackUrl = '/start', email, autoFocus = false, retry = false }: {
  door: RetryDoor
  callbackUrl?: string
  email?: string | null
  autoFocus?: boolean
  /** The provider whose sign-in did not finish: filled, and said as Try again. */
  retry?: boolean
}) {
  const Mark = MARKS[door]
  const words = retry ? tryAgainWith(door) : continueWith(door)
  return (
    <button type="button" autoFocus={autoFocus} data-door={retry ? 'try-again' : door}
      aria-label={door === 'linkedin' ? `${words}, ${LINKEDIN_DOOR_SAYS.toLowerCase()}` : undefined}
      onClick={() => startAccountDoor(door, callbackUrl, email)} className={retry ? retryButton : accountButton}>
      <Mark />
      <span className="flex-1 min-w-0 text-left">{words}</span>
      {door === 'linkedin' && (
        <span className={`shrink-0 text-xs font-normal ${retry ? 'text-white/80' : 'text-etyme-muted'}`}>{LINKEDIN_DOOR_SAYS}</span>
      )}
    </button>
  )
}

/**
 * The account buttons, full width, one under another: only the providers
 * this deployment holds keys for, the door this browser used last first
 * (lib/login-doors `accountButtons`). Shared by sign-in and sign-up, so the
 * two cannot drift. Nothing is drawn while the list is not known.
 */
export function AccountButtons({ available, callbackUrl = '/start', email, retry = null }: {
  available: KnownDoors
  callbackUrl?: string
  email?: string | null
  /** The provider whose sign-in did not finish, drawn first and filled. */
  retry?: RetryDoor | null
}) {
  const [last, setLast] = useState<ReturnType<typeof readLastDoor>>(null)
  useEffect(() => { setLast(readLastDoor()) }, [])
  const drawn = accountButtons(available, retry ?? last)
  if (drawn.length === 0) return null
  return (
    <div data-account-doors className="space-y-3">
      {drawn.map((d) => (
        <AccountDoorButton key={d} door={d} callbackUrl={callbackUrl} email={email} retry={d === retry} />
      ))}
    </div>
  )
}
