import { NextRequest, NextResponse } from 'next/server'
import { enterSignInDoor } from '@/lib/notify/sign-in-link-door'

/**
 * POST /api/answer/sign-in/:token — Continue, on the page a firm's
 * sign-in link opens (`/answer/sign-in/:token`).
 *
 * No seat: the person has not signed in yet, which is the point. The
 * signed token names the notice the firm's link was kept on, and the
 * door decides here, at use, where she goes (`enterSignInDoor` in
 * lib/notify/sign-in-link-door): to the sign-in page where her address
 * has a way in already, or to choose a password where it has none. A
 * form post answered with a redirect, so the password door's one-time
 * link goes to her browser and never into a reply body. A link that no
 * longer works goes back to its page, which says so.
 *
 * Only a press decides. Opening the page reads, so a mail scanner that
 * follows every link decides nothing.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const used = await enterSignInDoor(token)
  const to = used.ok ? used.to : `/answer/sign-in/${encodeURIComponent(token)}`
  return NextResponse.redirect(new URL(to, request.url), 303)
}
