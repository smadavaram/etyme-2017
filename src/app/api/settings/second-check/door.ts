import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { getCallerContext, realPersonId, type CallerContext } from '@/lib/api-context'

/**
 * The one door the second check's routes share: a person, signed in as
 * herself. Never an integration and never the read-only sample seat,
 * because a second check is a person's own. The time this session signed
 * in is read from its token on the server, and only where the token is
 * the caller's own; it is never taken from the body.
 */
export interface SecondCheckCaller {
  caller: CallerContext
  personId: string
  email: string
  name: string
  companyId: string | null
  /** When this session signed in, in milliseconds; null where the session does not say. */
  authAt: number | null
  /** The address the page was opened at, for a passkey's relying party. */
  origin: string
}

export function refused(message: string, status: number, code: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status })
}

export async function secondCheckDoor(request: NextRequest): Promise<{ ok: SecondCheckCaller; error?: undefined } | { ok?: undefined; error: NextResponse }> {
  const { caller, error } = await getCallerContext(request)
  if (error) return { error }
  const personId = realPersonId(caller)
  if (!personId || caller.isService || caller.readOnly) {
    return { error: refused('A second check is a person’s own. Sign in as yourself to add one.', 403, 'PERSON_REQUIRED') }
  }
  let authAt: number | null = null
  try {
    const token = await getToken({ req: request })
    const email = typeof token?.email === 'string' ? token.email.trim().toLowerCase() : null
    const at = Number(token?.authAt)
    if (email && email === caller.person.primaryEmail.toLowerCase() && Number.isFinite(at)) authAt = at
  } catch {
    authAt = null
  }
  return {
    ok: {
      caller, personId,
      email: caller.person.primaryEmail, name: caller.person.name,
      companyId: caller.company?.id ?? null,
      authAt,
      origin: request.nextUrl.origin,
    },
  }
}
