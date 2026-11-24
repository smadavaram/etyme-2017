import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { openOptOut, applyOptOut } from '@/lib/notify/outreach-optout'

/**
 * GET  /api/answer/outreach/:token  which firm's letters this is about
 * POST /api/answer/outreach/:token  stop that firm's outreach to this contact
 *
 * The unsubscribe link in an outreach letter (record 116). No sign-in:
 * the signed token names one contact. GET changes nothing, because a mail
 * scanner follows every link; the button posts. A second post is harmless.
 * It never stops a chase or a bill, and the token is never echoed.
 */
const fail = (err: unknown) => {
  void reportError('outreach-unsubscribe', err).catch(() => {})
  return NextResponse.json({ error: { code: 'INTERNAL', message: 'The unsubscribe did not go through just now. Use the link in the letter again in a minute.' } }, { status: 500 })
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  try {
    const out = await openOptOut(token)
    if (!out.ok) return NextResponse.json({ error: { code: 'NOT_FOUND', message: out.says } }, { status: out.status })
    return NextResponse.json({ data: out.view })
  } catch (err) { return fail(err) }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  try {
    const out = await applyOptOut(token)
    if (!out.ok) return NextResponse.json({ error: { code: 'NOT_FOUND', message: out.says } }, { status: out.status })
    return NextResponse.json({ data: { says: out.says } })
  } catch (err) { return fail(err) }
}
