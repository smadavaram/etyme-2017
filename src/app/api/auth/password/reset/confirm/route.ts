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
    ? NextResponse.json({ data: { says: a.says, email: a.email } })
    : NextResponse.json({ error: { code: 'VALIDATION', message: a.says, field: a.field } }, { status: a.status })
}
