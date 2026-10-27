import { NextRequest, NextResponse } from 'next/server'
import { resetPassword } from '@/lib/password-door'

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
    // An invitation's link lands her signed in, on Ask Etyme, where the
    // greeting already welcomes her (2026-10-27).
    ? NextResponse.json({ data: { says: a.says, email: a.email, invitation: a.invitation === true, landing: a.invitation ? '/dashboard/conversations' : '/login' } })
    : NextResponse.json({ error: { code: 'VALIDATION', message: a.says, field: a.field } }, { status: a.status })
}
