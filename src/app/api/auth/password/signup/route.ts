import { NextRequest, NextResponse } from 'next/server'
import { signUpCompany, signUpCandidate, type Answer } from '@/lib/password-door'

/**
 * POST /api/auth/password/signup
 *
 *   { as: 'company', email, password, name, type, country, currency, address }
 *   { as: 'candidate', email, password, name? }
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
  return NextResponse.json(
    { error: { code: 'VALIDATION', message: 'Say whether you are signing up a company or yourself as a candidate.', field: 'as' } },
    { status: 422 },
  )
}
