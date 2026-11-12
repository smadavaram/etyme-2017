import { NextRequest, NextResponse } from 'next/server'
import { configuredProviders } from '@/lib/auth'
import { policyFacts } from '@/lib/identity/read'
import { domainOfEmail } from '@/lib/company-domains'
import { doorsFor, looksLikeEmail, tooManyDoorAsks, directoryStart } from '@/lib/login-doors'

/**
 * POST /api/auth/doors { email }
 *
 * Which door the sign-in page draws for one address (founder, 2026-11-12,
 * "The sign-in page asks for the email first"). Public: there is no
 * session yet. The answer is decided from the address's domain and that
 * domain's company (lib/login-doors `doorsFor`), never from whether the
 * address has an account, so a known address and an unknown one on the
 * same kind of domain get the same answer. Nothing is read beyond the
 * sign-in policy and the directories turned on for that domain.
 */

const asked = new Map<string, number[]>()

function caller(request: NextRequest): string {
  return (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
}

export async function POST(request: NextRequest) {
  const now = Date.now()
  const who = caller(request)
  const seen = (asked.get(who) ?? []).filter((t) => now - t < 60_000)
  if (tooManyDoorAsks(seen, now)) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'That is a lot of tries in a minute. Wait a minute and try again.' } },
      { status: 429 },
    )
  }
  asked.set(who, [...seen, now])
  if (asked.size > 10_000) asked.clear()

  const body = await request.json().catch(() => ({}))
  const email = String(body?.email ?? '').trim().toLowerCase()
  if (!looksLikeEmail(email)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Type your email address, like you@company.com.', field: 'email' } },
      { status: 400 },
    )
  }
  const facts = await policyFacts(email)
  const configured = new Set(configuredProviders().map((p: any) => String(p.options?.id ?? p.id)))
  const answer = doorsFor({
    domain: domainOfEmail(email),
    publicAddress: facts.publicAddress,
    domainCompany: facts.domainCompany ? { mode: facts.domainCompany.mode, issuers: facts.domainCompany.issuers } : null,
    configured,
  })
  return NextResponse.json({
    data: {
      doors: answer.doors,
      says: answer.says ?? null,
      start: answer.doors.includes('directory') ? directoryStart(email) : null,
    },
  })
}
