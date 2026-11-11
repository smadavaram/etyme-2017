import { NextRequest, NextResponse } from 'next/server'
import { findDirectory, startDirectorySignIn, safeNext, STATE_COOKIE, STATE_LIFE_SECONDS } from '@/lib/identity/directory'

/**
 * GET /api/sso/start?email=<work email>&next=/start
 * GET /api/sso/start?company=<the company's Etyme address>
 *
 * The door into a company's own directory (founder, 2026-11-11). The work
 * email finds the company by its verified domain, or the company's link
 * names it; the browser is sent to that company's directory with a state,
 * a nonce and a PKCE challenge sealed in a ten-minute cookie. Etyme asks
 * for no password here. Anything that cannot open goes back to the
 * sign-in page with a code the page turns into a sentence
 * (lib/login-doors).
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams
  const back = (code: string) => NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(code)}`, request.nextUrl.origin))
  const found = await findDirectory({ email: q.get('email'), slug: q.get('company') })
  if (!found.ok) return back(found.code)
  const started = await startDirectorySignIn(found, safeNext(q.get('next')))
  if (!started.ok) return back(started.code)
  const res = NextResponse.redirect(started.redirectTo)
  res.cookies.set(STATE_COOKIE, started.cookie, {
    httpOnly: true, sameSite: 'lax', secure: request.nextUrl.protocol === 'https:', path: '/api/sso', maxAge: STATE_LIFE_SECONDS,
  })
  return res
}
