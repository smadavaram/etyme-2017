import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { requestReset, setOwnPassword, ownPasswordState, SIGN_IN_AGAIN_TO_SET } from '@/lib/password-door'
import type { Door } from '@/lib/identity/policy'

/**
 * POST /api/auth/password/reset { email }
 *
 * Sends a one-time link that lives an hour. Says the same thing whether
 * or not there is an account for the email.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const a = await requestReset(body.email)
  return a.ok
    ? NextResponse.json({ data: { says: a.says } })
    : NextResponse.json({ error: { code: 'VALIDATION', message: a.says, field: a.field } }, { status: a.status })
}

/**
 * The signed-in session's own facts, read from its token on the server:
 * the address, the door, when it was signed in and its version. Null for
 * no session, or a session that no longer stands (ended, or a door the
 * address's company no longer allows). Never anything from the body.
 */
async function ownSession(request: NextRequest): Promise<{ email: string; door: Door | null; authAt: unknown; sv: unknown } | null> {
  const token = await getToken({ req: request })
  const email = typeof token?.email === 'string' ? token.email : null
  if (!email) return null
  const { liveSessionStands } = await import('@/lib/identity/read')
  const v = await liveSessionStands({
    email,
    door: (token!.door as Door | undefined) ?? null,
    issuer: (token!.iss as string | undefined) ?? null,
    tokenVersion: token!.sv as number | undefined,
  })
  return v.stands ? { email, door: (token!.door as Door | undefined) ?? null, authAt: token!.authAt, sv: token!.sv } : null
}

/**
 * GET /api/auth/password/reset
 *
 * The signed-in person's own password: whether they have one, and whether
 * their address's company lets them hold one. Read by the account menu to
 * say "Set a password" or "Change password", or nothing. Writes nothing.
 */
export async function GET(request: NextRequest) {
  const me = await ownSession(request)
  if (!me) return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: SIGN_IN_AGAIN_TO_SET } }, { status: 401 })
  return NextResponse.json({ data: await ownPasswordState(me.email) })
}

/**
 * PUT /api/auth/password/reset { password, current? }
 *
 * "Set a password" from the account menu (fault 5, 2026-11-12): the
 * signed-in person sets a password of their own with no email, or changes
 * the one they have by giving it. Every rule is lib/password-door
 * `setOwnPassword`; the row is written before this answers. A change hands
 * back a sealed ticket the page gives to NextAuth's update at once, so this
 * session stays signed in while every other one ends.
 */
export async function PUT(request: NextRequest) {
  const me = await ownSession(request)
  if (!me) return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: SIGN_IN_AGAIN_TO_SET } }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const a = await setOwnPassword({
    email: me.email, door: me.door, authAt: me.authAt, sessionVersion: me.sv,
    current: body.current, password: body.password,
  })
  return a.ok
    ? NextResponse.json({ data: { says: a.says, changed: a.changed, refresh: a.refresh } })
    : NextResponse.json({ error: { code: a.status === 429 ? 'WAIT' : 'VALIDATION', message: a.says, field: a.field } }, { status: a.status })
}
