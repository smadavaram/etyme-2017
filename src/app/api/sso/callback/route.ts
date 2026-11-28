import { NextRequest, NextResponse } from 'next/server'
import { sealBlob, deploymentSecret } from '@/lib/identity/oidc'
import { finishDirectorySignIn, STATE_COOKIE, TICKET_COOKIE, TICKET_LIFE_SECONDS } from '@/lib/identity/directory'

/** Thirty seconds, so the directory's calls, ten seconds each (OAUTH_HTTP_TIMEOUT_MS), finish before the host stops them. */
export const maxDuration = 30

/**
 * GET /api/sso/callback?code&state
 *
 * Where a company's directory sends the browser back. The sealed state
 * cookie is read once and cleared on every answer, so a state is never
 * used twice; the code is exchanged and the id token verified; the person
 * is found by the issuer and the subject; the policy is asked
 * (lib/identity/directory). On a yes, a two-minute ticket is set as an
 * http-only cookie for NextAuth's `directory-oidc` door, which spends it
 * once, and the browser goes to /sso to finish. Only this app's own
 * address is ever redirected to.
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams
  const r = await finishDirectorySignIn({
    cookie: request.cookies.get(STATE_COOKIE)?.value,
    state: q.get('state'), code: q.get('code'), error: q.get('error'),
  })
  const secure = request.nextUrl.protocol === 'https:'
  const res = r.ok
    ? NextResponse.redirect(new URL(`/sso?next=${encodeURIComponent(r.next)}`, request.nextUrl.origin))
    : NextResponse.redirect(new URL(`/sso?error=${encodeURIComponent(r.code)}${refusalParam(r.says)}`, request.nextUrl.origin))
  res.cookies.set(STATE_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure, path: '/api/sso', maxAge: 0 })
  if (r.ok) {
    res.cookies.set(TICKET_COOKIE, r.ticket, { httpOnly: true, sameSite: 'lax', secure, path: '/api/auth', maxAge: TICKET_LIFE_SECONDS })
  }
  return res
}

/**
 * The refusal's sentence, sealed, so the page says exactly why and nobody
 * can put words of their own on this app's page through the address.
 */
function refusalParam(says: string): string {
  const own = deploymentSecret()
  return own ? `&r=${encodeURIComponent(sealBlob({ says }, 'sso-refusal', 120, own))}` : ''
}
