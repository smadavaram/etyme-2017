import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { sendingDomainHealth } from '@/lib/notify/sending-domain'
import { lookUpTxt } from '@/lib/notify/sending-domain-lookup'

/**
 * GET /api/settings/mail-domain — the domain Etyme's email is sent from,
 * and whether its SPF, DKIM and DMARC records are in DNS (record 110).
 *
 * Read by a DNS lookup on this request. It answers the domain and three
 * states, each "found", "not found" or "could not be checked". No key,
 * no sender mailbox name and nothing of any company is read or returned,
 * so any signed-in seat may open it.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { error } = await getCallerContext(request)
  if (error) return error
  return NextResponse.json({ data: await sendingDomainHealth(lookUpTxt) })
}
