import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { normalEmail } from '@/lib/public-site/leads'
import {
  LEDGER,
  UNSUBSCRIBED_SAYS,
  UNSUBSCRIBE_REFUSED_SAYS,
  tokenMatches,
} from '@/lib/public-site/course-door'

/**
 * The link in the confirmation email. Signed for one address, so it ends
 * that address and nobody else's. Safe to open twice (a mail scanner may
 * open it first): the second open changes nothing.
 *
 * The reply is the same whether or not the address is on file.
 */

async function end(emailIn: string, token: string): Promise<boolean> {
  const email = normalEmail(emailIn)
  if (!email || !tokenMatches(email, token, process.env.NEXTAUTH_SECRET ?? '')) return false

  const lead = await prisma.marketingLead.findUnique({ where: { email }, select: { id: true } })
  if (!lead) return true

  const logs = await prisma.automationLog.findMany({ where: { action: LEDGER.unsubscribed }, select: { payload: true } })
  if (logs.some((r: any) => r.payload?.leadId === lead.id)) return true

  await prisma.automationLog.create({
    data: {
      action: 'COURSE_DOOR_UNSUBSCRIBED',
      summary: 'A course door address unsubscribed',
      reason: 'The person opened the signed link in the confirmation email; nothing more is sent about the course',
      payload: { leadId: lead.id },
      reversible: false,
    },
  })
  return true
}

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const ok = await end(p.get('email') ?? '', p.get('token') ?? '')
  const says = ok ? UNSUBSCRIBED_SAYS : UNSUBSCRIBE_REFUSED_SAYS
  return new NextResponse(`<!doctype html><meta charset="utf-8"><title>Etyme</title><p>${says}</p>`, {
    status: ok ? 200 : 400,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {}
  try { body = (await request.json()) as Record<string, unknown> } catch { /* falls to refusal */ }
  const ok = await end(
    typeof body.email === 'string' ? body.email : '',
    typeof body.token === 'string' ? body.token : ''
  )
  return ok
    ? NextResponse.json({ data: { says: UNSUBSCRIBED_SAYS } })
    : NextResponse.json({ error: { code: 'LINK_NOT_VALID', message: UNSUBSCRIBE_REFUSED_SAYS } }, { status: 400 })
}
