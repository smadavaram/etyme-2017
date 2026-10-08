import { NextRequest, NextResponse } from 'next/server'
import { resendVerification } from '@/lib/password-door'

/**
 * POST /api/auth/password/resend { email }
 *
 * "Send the link again", from the sign-in page after it refused an
 * unconfirmed address. The same answer whoever asks.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const a = await resendVerification(body.email)
  return a.ok
    ? NextResponse.json({ data: { says: a.says } })
    : NextResponse.json({ error: { code: 'VALIDATION', message: a.says, field: a.field } }, { status: a.status })
}
