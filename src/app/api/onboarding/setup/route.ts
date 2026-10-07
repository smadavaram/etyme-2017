import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { setupStateFor, answerStep } from '@/lib/setup-state'

/**
 * GET  /api/onboarding/setup — where this company is in its five steps,
 *      and the dashboard's one line if anything is still owed
 * POST /api/onboarding/setup — { step, outcome: DONE | SKIPPED }, recorded
 *      with who and when
 *
 * The founder, 2026-10-07: "Setup asks five things, then stops." The rules
 * are lib/setup-steps; the record is lib/setup-state. Answering is the
 * desk that changes the company's setup, the same gate as the settings
 * page; reading the state is open to every seat, and answers null for the
 * reminder to anybody who could not act on it.
 */

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json({ data: { reminder: null, shows: false } })
  }
  const state = await setupStateFor(caller.company.id, {
    mayRun: hasPermission(caller.permissions, 'settings.manage'),
    followedLinkBack: request.nextUrl.searchParams.get('finish') === '1',
  })
  return NextResponse.json({ data: state })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Setup belongs to a company, and you are not seated at one.' } },
      { status: 403 }
    )
  }
  if (!hasPermission(caller.permissions, 'settings.manage')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: askTheDesk({
            doing: 'Answering this company’s setup',
            needs: 'settings.manage',
            kind: caller.company.kind,
            companyName: caller.company.name,
          }),
        },
      },
      { status: 403 }
    )
  }
  const body = await request.json().catch(() => ({}))
  const result = await answerStep(caller.company.id, caller.person.id, body.step, body.outcome)
  if (!result.ok) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: result.message } }, { status: 422 })
  }
  const state = await setupStateFor(caller.company.id, { mayRun: true })
  return NextResponse.json({ data: { ...state, finished: result.finished } })
}
