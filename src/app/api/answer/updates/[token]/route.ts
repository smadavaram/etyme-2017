import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { openUpdates, applyUpdates } from '@/lib/notify/updates-links'

/**
 * GET  /api/answer/updates/:token  which answer this link gives, and whether it is already given
 * POST /api/answer/updates/:token  give the yes, or take it back, as the link says
 *
 * The link in an update letter (record 117). No sign-in: the signed token
 * names one person and one purpose. GET changes nothing, because a mail
 * scanner follows every link; the button posts. A second post is harmless.
 * The token is never echoed.
 */
const fail = (err: unknown) => {
  void reportError('updates-link', err).catch(() => {})
  return NextResponse.json({ error: { code: 'INTERNAL', message: 'That did not go through just now. Use the link in the letter again in a minute.' } }, { status: 500 })
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  try {
    const out = await openUpdates(token)
    if (!out.ok) return NextResponse.json({ error: { code: 'NOT_FOUND', message: out.says } }, { status: out.status })
    return NextResponse.json({ data: out.view })
  } catch (err) { return fail(err) }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  try {
    const out = await applyUpdates(token)
    if (!out.ok) return NextResponse.json({ error: { code: 'NOT_FOUND', message: out.says } }, { status: out.status })
    return NextResponse.json({ data: { says: out.says } })
  } catch (err) { return fail(err) }
}
