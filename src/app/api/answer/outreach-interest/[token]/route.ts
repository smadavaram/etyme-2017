import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { openInterest, applyInterest } from '@/lib/notify/outreach-interest'

/**
 * GET  /api/answer/outreach-interest/:token  which firm's letter this is about
 * POST /api/answer/outreach-interest/:token  say the contact is interested
 *
 * The "I'm interested" link in an outreach letter (record 117). No
 * sign-in: the signed token names one letter. GET changes nothing,
 * because a mail scanner follows every link; the button posts. A second
 * post opens nothing more. The token is never echoed.
 */
const fail = (err: unknown) => {
  void reportError('outreach-interest', err).catch(() => {})
  return NextResponse.json({ error: { code: 'INTERNAL', message: 'That did not go through just now. Use the link in the letter again in a minute.' } }, { status: 500 })
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  try {
    const out = await openInterest(token)
    if (!out.ok) return NextResponse.json({ error: { code: 'NOT_FOUND', message: out.says } }, { status: out.status })
    return NextResponse.json({ data: out.view })
  } catch (err) { return fail(err) }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  try {
    const out = await applyInterest(token)
    if (!out.ok) return NextResponse.json({ error: { code: 'NOT_FOUND', message: out.says } }, { status: out.status })
    return NextResponse.json({ data: { says: out.says, landing: out.landing } })
  } catch (err) { return fail(err) }
}
