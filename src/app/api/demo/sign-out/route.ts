import { NextResponse } from 'next/server'
import { DEMO_COOKIE } from '@/lib/demo-session'

/**
 * POST /api/demo/sign-out — forget who this browser is; keep the workspace.
 *
 * DELETE /api/demo is "start again": it destroys the demo company and the
 * person behind the cookie. That is the wrong thing to do to somebody who
 * only wants to leave — a founder who opens Nike from /demo, signs out on
 * their phone and comes back the next morning expects Nike to still be
 * there. This clears the cookie and touches nothing else.
 *
 * Idempotent, and fine to call with no demo cookie at all: the shell calls
 * it on every sign-out, before NextAuth's own, because from the browser
 * there is no telling which of the two sessions this is.
 */
export async function POST() {
  const res = NextResponse.json({ data: { signedOut: true } })
  res.cookies.delete(DEMO_COOKIE)
  return res
}
