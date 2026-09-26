'use client'

import { signOut } from 'next-auth/react'

/**
 * Sign out of whichever session this is.
 *
 * Two kinds of visitor hold a session here: a person who signed in
 * through NextAuth, and a demo visitor whose whole identity is a signed
 * cookie from /api/demo. NextAuth's signOut clears only the first — so a
 * demo visitor who tapped "Sign out" was sent to the login page with the
 * demo cookie intact and, one tap later, was back in. A sign-out that
 * does nothing is worse than none: it says the product is broken.
 *
 * The demo cookie goes first, then the real session, whichever of the two
 * actually exists. Both are safe to clear when absent.
 */
export async function signOutEverywhere(): Promise<void> {
  await fetch('/api/demo/sign-out', { method: 'POST' }).catch(() => {})
  await signOut({ callbackUrl: '/login' })
}
