import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { makeSignInLink, readSignInLine, type Answer } from '@/lib/notify/sign-in-link-door'

/**
 * GET  /api/notifications/sign-in-link?personId=…   what the person's row says
 * POST /api/notifications/sign-in-link { personId }  make or renew the link
 *
 * For somebody a firm employs or lists who has no way to sign in, so no
 * timesheet can be filed for them (the founder's retest, 2026-11-03).
 * Only a seat that may invite (`team.manage`, the invite route's gate)
 * reads or makes it; every answer is logged as a read of the person
 * before it goes out (`lib/notify/sign-in-link-door`).
 */

function answer(a: Answer) {
  return a.ok
    ? NextResponse.json({ data: a.data })
    : NextResponse.json({ error: { code: a.code, message: a.says } }, { status: a.status })
}

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const personId = request.nextUrl.searchParams.get('personId') ?? ''
  return answer(await readSignInLine(caller, personId))
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const body = await request.json().catch(() => ({}))
  return answer(await makeSignInLink(caller, String(body.personId ?? '')))
}
