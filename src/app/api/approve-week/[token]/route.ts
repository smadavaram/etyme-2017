import { NextRequest, NextResponse } from 'next/server'
import { openLink, answerLink } from '@/lib/week-approval'

/**
 * GET  /api/approve-week/:token — what the client's approver sees
 * POST /api/approve-week/:token — Approve, or Send back with a reason
 *
 * No sign-in: the approver works at the client and has no account here,
 * and the link is the credential. It works once, runs out after seven
 * days, and is refused in a sentence once used, sent back, overtaken by a
 * new filing, or approved another way. Hours and days only, never a rate.
 * Approving writes the client's signature and nothing else; every firm
 * below accepts the week in its own turn.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const out = await openLink(token)
  if (!out.ok) return NextResponse.json({ error: { code: out.code, message: out.says } }, { status: out.status })
  return NextResponse.json({ data: out.view })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const body = await request.json().catch(() => ({}))
  const out = await answerLink(token, { answer: body?.answer, code: body?.code, note: body?.note })
  if (!out.ok) {
    return NextResponse.json({ error: { code: out.code, message: out.says, ...(out.field ? { field: out.field } : {}) } }, { status: out.status })
  }
  return NextResponse.json({ data: { says: out.says } })
}
