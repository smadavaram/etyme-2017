import { NextRequest, NextResponse } from 'next/server'
import { resetPassword } from '@/lib/password-door'
import { ASK_ETYME_HREF } from '@/lib/nav-table'

/**
 * POST /api/auth/password/reset/confirm { token, password }
 *
 * Sets a new password from a reset link: once, within the hour, and only
 * a password that passes the same rules as sign-up.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const a = await resetPassword(body.token, body.password)
  return a.ok
    // An invitation's link lands her signed in, in Ask Etyme itself (not
    // the thread list, which on a phone is a list), where the greeting
    // already welcomes her (2026-10-27).
    ? NextResponse.json({ data: { says: a.says, email: a.email, invitation: a.invitation === true, landing: a.invitation ? ASK_ETYME_HREF : '/login' } })
    : NextResponse.json({ error: { code: 'VALIDATION', message: a.says, field: a.field } }, { status: a.status })
}
