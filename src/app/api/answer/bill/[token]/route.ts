import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { openBillLink } from '@/lib/notify/bill-delivery'

/**
 * GET /api/answer/bill/:token
 *
 * One bill, read-only, for the person a supplier emailed it to. No seat:
 * the signed token names the bill and the address it was sent to, and
 * dies 90 days after the bill's due date. Every open is logged as that
 * person's read before the bill is handed over (lib/notify/bill-delivery).
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  try {
    const opened = await openBillLink(token)
    if (!opened.ok) {
      return NextResponse.json({ error: { code: opened.code, message: opened.says } }, { status: opened.status })
    }
    return NextResponse.json({ data: opened.view })
  } catch (err) {
    void reportError('bill-link', err).catch(() => {})
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'The bill could not be opened just now. Try the link again in a minute.' } },
      { status: 500 }
    )
  }
}
