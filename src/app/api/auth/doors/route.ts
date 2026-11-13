import { NextRequest, NextResponse } from 'next/server'
import { configuredProviders } from '@/lib/auth'
import { policyFacts } from '@/lib/identity/read'
import { domainOfEmail } from '@/lib/company-domains'
import { doorsFor, looksLikeEmail, tooManyDoorAsks, tooManyDoorAsksAll, askerOf, directoryStart, NO_DIRECTORY_YET } from '@/lib/login-doors'
import { takeDoorProof, doorProofCookie, DOOR_PROOF_COOKIE } from '@/lib/identity/door-proof'

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
 *
 * POST /api/auth/doors { proof: true }, the second question
 * (2026-11-12): an account button a directory-only company refused comes
 * back with a sealed proof that the address just went through that
 * provider, in an httpOnly cookie only this route reads
 * (lib/identity/door-proof). Only then does the answer name the company
 * and its directory, because only then has the address proved itself. The
 * proof is taken once: this answer deletes the cookie and a second
 * presentation reads as nothing. A proof that is forged, altered or out of
 * date is answered as if nothing was sent.
 *
 * The limit is keyed on the platform's own client address (`askerOf`),
 * never on a header the caller writes, with a ceiling across every caller
 * so changing a header buys nothing (review, 2026-11-13).
 */

const asked = new Map<string, number[]>()
let everyone: number[] = []

export async function POST(request: NextRequest) {
  const now = Date.now()
  const who = askerOf((request as NextRequest & { ip?: string }).ip, request.headers)
  const seen = (asked.get(who) ?? []).filter((t) => now - t < 60_000)
  everyone = everyone.filter((t) => now - t < 60_000)
  if (tooManyDoorAsks(seen, now) || tooManyDoorAsksAll(everyone, now)) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'That is a lot of tries in a minute. Wait a minute and try again.' } },
      { status: 429 },
    )
  }
  asked.set(who, [...seen, now])
  everyone.push(now)
  if (asked.size > 10_000) {
    for (const [k, ts] of asked) if (!ts.some((t) => now - t < 60_000)) asked.delete(k)
  }

  const body = await request.json().catch(() => ({}))
  if (body?.proof !== undefined) {
    // Only the cookie carries a proof now; one sent in the body is ignored.
    const proven = body.proof === true ? takeDoorProof(request.cookies.get(DOOR_PROOF_COOKIE)?.value) : null
    const facts = proven ? await policyFacts(proven) : null
    const co = facts?.domainCompany
    const answer = (data: unknown) => {
      const res = NextResponse.json({ data })
      res.cookies.set(doorProofCookie('', 0))
      return res
    }
    if (!proven || !co || facts!.publicAddress) return answer({ directory: null })
    return answer({
      directory: {
        email: proven,
        company: co.companyName,
        start: co.issuers.length > 0 ? directoryStart(proven) : null,
        says: co.issuers.length > 0 ? null : NO_DIRECTORY_YET,
      },
    })
  }
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
