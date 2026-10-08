import { NextRequest, NextResponse } from 'next/server'
import { signUpCompany, signUpCandidate, signUpClaim, signUpProbe, doorOpen, type Answer } from '@/lib/password-door'

/**
 * POST /api/auth/password/signup
 *
 *   { as: 'company', email, password, personName, name, type, country, currency, address }
 *     — a colleague whose email belongs at a company already here sends
 *       only email, personName and password
 *   { as: 'candidate', email, password, name }
 *   { as: 'claim', token, email, password, personName } — from a supplier
 *     invitation; confirming takes that company's record, founds nothing
 *
 * Writes the person and a one-time link, sends the link, and nothing
 * else (lib/password-door). The answer is the same whether or not the
 * email already has an account, so this never tells a stranger who is
 * registered. A refusal is a sentence and names the field it is about.
 */
function answer(a: Answer) {
  return a.ok
    ? NextResponse.json({ data: { says: a.says } })
    : NextResponse.json({ error: { code: 'VALIDATION', message: a.says, field: a.field } }, { status: a.status })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  if (body.as === 'company') return answer(await signUpCompany(body))
  if (body.as === 'candidate') return answer(await signUpCandidate(body))
  if (body.as === 'claim') return answer(await signUpClaim(body))
  return NextResponse.json(
    { error: { code: 'VALIDATION', message: 'Say whether you are signing up a company or yourself as a candidate.', field: 'as' } },
    { status: 422 },
  )
}

/**
 * GET /api/auth/password/signup?email=
 *
 * What the form shows after the email field: whether this email joins a
 * company already here, so a colleague is not asked for a company at all.
 * The same answer the Microsoft or Google door gives after sign-in, and it
 * names only a company whose owners sign in on that very email domain.
 */
export async function GET(request: NextRequest) {
  if (!doorOpen()) return NextResponse.json({ data: { open: false, joins: null } })
  const email = request.nextUrl.searchParams.get('email')
  return NextResponse.json({ data: { open: true, ...(await signUpProbe(email)) } })
}
