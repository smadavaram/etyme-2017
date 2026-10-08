import { NextRequest, NextResponse } from 'next/server'
import { requestReset } from '@/lib/password-door'

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
