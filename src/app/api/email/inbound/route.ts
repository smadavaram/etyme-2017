import { NextRequest, NextResponse } from 'next/server'
import { intakeLive, receiveDelivery } from '@/lib/email-intake'

/**
 * POST /api/email/inbound
 *
 * Where the mail provider posts a message forwarded to a company's
 * address on in.etyme.com. Nobody but the provider may post here: the
 * signature over the raw bytes is checked before anything is parsed
 * (`verifyDelivery` in lib/email-intake), and an unsigned, stale or
 * wrong one is refused and logged. Then the address must belong to
 * exactly one company with forwarded email turned on, the sender must
 * pass SPF and DKIM aligned and be seated at that company, and every
 * file must be what its bytes say. Every message writes its row, kept or
 * dropped, before this answers.
 *
 * Closed until the deployment opens it (`EMAIL_INTAKE_LIVE` exactly "1"):
 * until then it answers 404 at once, reads nothing and writes no row, so
 * a flood of posts costs nothing.
 *
 * Nothing a message says is acted on. An accepted one becomes a draft a
 * person says yes or no to.
 */
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  if (!intakeLive()) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, { status: 404, headers: { 'cache-control': 'no-store' } })
  }
  const raw = await request.text().catch(() => '')
  const header = (svix: string, standard: string) => request.headers.get(svix) ?? request.headers.get(standard)
  const out = await receiveDelivery({
    raw,
    id: header('svix-id', 'webhook-id'),
    timestamp: header('svix-timestamp', 'webhook-timestamp'),
    signature: header('svix-signature', 'webhook-signature'),
    now: new Date(),
  })
  // The provider reads the status; the sentence is for whoever reads its delivery log.
  return NextResponse.json(
    out.status >= 400
      ? { error: { code: out.code, message: out.says } }
      : { data: { verdict: out.verdict, code: out.code, says: out.says } },
    { status: out.status, headers: { 'cache-control': 'no-store' } }
  )
}
