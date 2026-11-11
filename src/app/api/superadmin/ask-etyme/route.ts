import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId, type CallerContext } from '@/lib/api-context'
import { accessActor, recordRefusal, type AccessAction, type AccessSubject } from '@/lib/access-log'
import { changePlatformSettings } from '@/lib/platform-settings'
import { LIMIT_SETTINGS, checkLimit, readLimitsScreen } from '@/lib/ask-etyme-limits'
import { reportError } from '@/lib/alerts'

/**
 * GET   /api/superadmin/ask-etyme — Ask Etyme's two limits in force, where
 *       each came from, who last set it here and when, and the last ten
 *       changes.
 * PATCH /api/superadmin/ask-etyme { personDailyTokens?, companyMonthlyTokens?, trialDays? }
 *       — set any of the three, or clear it with null so the deployment's
 *       setting (or the trial's default) decides. Every change is recorded
 *       with who and when.
 *
 * Superadmin only (founder, 2026-11-11): an address on ETYME_STAFF_EMAILS,
 * read as `caller.staff`, which no company grants and no company revokes.
 * An Owner or an Admin of any company is refused like anybody else. Every
 * refusal is written to the access log and waited for before it is sent
 * (`recordRefusal`), with the refused person as its subject, because no
 * other person's or company's data is behind this screen.
 *
 * Platform settings only: nothing here names a company, shows usage by
 * company or a spending figure.
 */

/**
 * Not yet a line in AccessAction (lib/access-log is regulatory's); the
 * column is text, so the row is written under this name today.
 */
const OPEN_SUPERADMIN = 'SUPERADMIN_SETTINGS_OPEN' as AccessAction

const REFUSED = "This screen is for Etyme's Superadmin only. A company's Owner and Admin set their own company's Ask Etyme under Settings."

async function refuse(caller: CallerContext, doing: string): Promise<NextResponse> {
  // The subject is the person refused; a key with no person names its company.
  const subject: AccessSubject | null = caller.isService
    ? (caller.company ? { companyId: caller.company.id } : null)
    : caller.person.id
  if (subject) {
    await recordRefusal([subject], {
      ...accessActor(caller),
      action: OPEN_SUPERADMIN,
      reason: `Refused ${doing} Ask Etyme's limits on the Superadmin screen: not on Etyme's staff list.`,
    })
  }
  return NextResponse.json({ error: { code: 'FORBIDDEN', message: REFUSED } }, { status: 403 })
}

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.staff || caller.isService) return refuse(caller, 'reading')
  return NextResponse.json({ data: await readLimitsScreen() })
}

export async function PATCH(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.staff || caller.isService) return refuse(caller, 'changing')

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Send the numbers to change.' } }, { status: 422 })
  }
  const changes: { key: string; value: string | null }[] = []
  for (const s of LIMIT_SETTINGS) {
    if (!(s.field in body)) continue
    const checked = checkLimit((body as Record<string, unknown>)[s.field], s)
    if (!checked.ok) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: checked.says, field: s.field } }, { status: 422 })
    }
    changes.push({ key: s.key, value: checked.value })
  }
  if (changes.length === 0) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Say which number to change: each person per day, each company per month, or the free trial in days.' } }, { status: 422 })
  }

  try {
    const written = await changePlatformSettings(changes, {
      personId: realPersonId(caller),
      email: caller.person.primaryEmail,
    })
    const screen = await readLimitsScreen()
    return NextResponse.json({
      data: {
        ...screen,
        says: written.length === 0 ? 'Nothing changed: the numbers were already these.' : 'Saved. Ask Etyme reads the new numbers from its next question.',
      },
    })
  } catch (err) {
    await reportError('superadmin/ask-etyme', err).catch(() => undefined)
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'The limits were not saved. Nothing changed; try again.' } }, { status: 500 })
  }
}
