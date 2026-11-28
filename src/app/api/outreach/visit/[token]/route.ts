import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { getCallerContext, getSessionEmail } from '@/lib/api-context'
import { openVisit } from '@/lib/outreach/visit'

/**
 * GET /api/outreach/visit/:token  the tracked link in a pack's letter
 *
 * It always sends the reader on to the page the letter is about. It writes a
 * visit only when somebody is signed in as the person the letter was written
 * to: never an anonymous visitor, and never a person signed in as somebody
 * else. The signed token names one letter and one page and is never stored.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  try {
    // The seat she holds, else her session: a person with no seat at any firm may still be the contact the letter was written to.
    const { caller } = await getCallerContext(_req)
    const out = await openVisit(token, caller?.person.primaryEmail ?? (await getSessionEmail()))
    if (!out.redirect) return NextResponse.json({ error: { code: 'NOT_FOUND', message: out.why } }, { status: 404 })
    return NextResponse.redirect(new URL(out.redirect, _req.url), 302)
  } catch (err) {
    void reportError('outreach-visit', err).catch(() => {})
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'That did not go through just now. Use the link in the letter again in a minute.' } }, { status: 500 })
  }
}
