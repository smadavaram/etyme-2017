import { NextResponse } from 'next/server'

/**
 * GET /api/auth/dev-session
 *
 * Whether a development bypass is standing in for a real sign-in.
 *
 * Without this the sign-in page is honest and useless at the same time: it
 * correctly reports that no provider is configured, and leaves whoever is
 * looking at a preview with no way in at all. The bypass already exists in
 * src/lib/api-context.ts — this only says so out loud.
 *
 * Guarded twice. It returns nothing outside development, and it returns
 * nothing when the bypass is unset, so there is no build of this that can
 * name a session in production.
 */
export async function GET() {
  if (process.env.NODE_ENV !== 'development' || !process.env.DEV_BYPASS_AUTH) {
    return NextResponse.json({ data: { active: false, email: null } })
  }

  return NextResponse.json({
    data: {
      active: true,
      email: process.env.DEV_BYPASS_AUTH,
      note: 'Development only. This is not a sign-in and does not exist in a deployed build.',
    },
  })
}
