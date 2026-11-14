import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId, type CallerContext } from '@/lib/api-context'
import { accessActor, recordAccess, recordRefusal, type AccessAction, type AccessSubject } from '@/lib/access-log'
import { changePlatformSettings } from '@/lib/platform-settings'
import { LIMIT_SETTINGS, checkLimit, readLimitsScreen } from '@/lib/ask-etyme-limits'
import { reportError } from '@/lib/alerts'
import { recentMailFailures } from '@/lib/notify/mail-failures'
import { momentFor } from '@/lib/when'
import { mailLeaves } from '@/lib/notify/mail-leaves'
import { mailListSays } from './mail-says'

/**
 * GET   /api/superadmin/ask-etyme — Ask Etyme's two limits in force, where
 *       each came from, who last set it here and when, the last ten
 *       changes, and the newest email sends that did not go.
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
 * The limits name no company, show no usage by company and no spending
 * figure. The one list that names a company is "Email that did not go"
 * (2026-11-12), read only here, behind the same staff check, its read
 * logged before it is sent: a sending domain nobody verified fails every
 * company's mail at once, and only Etyme can fix it.
 */

/**
 * Not yet a line in AccessAction (lib/access-log is regulatory's); the
 * column is text, so the row is written under this name today.
 */
const OPEN_SUPERADMIN: AccessAction = 'SUPERADMIN_SETTINGS_OPEN'

/**
 * Reading the email that did not go (2026-11-12). It names companies and
 * masked recipients across every company, so each read is its own row,
 * written and waited for before the list is sent. Not yet a line in
 * AccessAction (lib/access-log is regulatory's); the column is text.
 */
const READ_MAIL_FAILURES = 'SUPERADMIN_EMAIL_FAILURES_READ' as string as AccessAction

/** How many of the newest failed sends the screen lists. */
const MAIL_FAILURES_LISTED = 50

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
  const [screen, mail] = await Promise.all([readLimitsScreen(), emailThatDidNotGo(caller)])
  return NextResponse.json({ data: { ...screen, mail } })
}

/**
 * "Email that did not go": the newest failed sends, for Etyme's staff only.
 * When, the kind of notice, the company's name, the provider's status and
 * its own cleaned words, and the recipient masked as "s…@domain". Never a
 * title, a body, a person's name or a full address (lib/notify/mail-failures).
 * The read is logged before the list is handed over; where the log cannot
 * be written, the list is not sent and the screen says so.
 */
async function emailThatDidNotGo(caller: CallerContext): Promise<
  | { rows: { id: string; at: string; kind: string; company: string | null; provider: string | null; status: number | null; failureKind: string; words: string | null; recipient: string | null }[]; says: string }
  | { rows: null; says: string }
> {
  try {
    const rows = await recentMailFailures(MAIL_FAILURES_LISTED)
    await recordAccess([caller.person.id], {
      ...accessActor(caller),
      action: READ_MAIL_FAILURES,
      reason: `Read the ${rows.length} newest email sends that did not go, across companies, on the Superadmin screen: when, the kind, the company, the provider's answer and a masked recipient.`,
    })
    return {
      rows: rows.map((r) => ({
        id: r.id,
        at: momentFor(r.at, 'UTC'),
        kind: r.kind,
        company: r.companyName,
        provider: r.provider,
        status: r.status,
        failureKind: r.failureKind,
        words: r.words,
        recipient: r.recipient,
      })),
      says: mailListSays(rows.length, mailLeaves()),
    }
  } catch (err) {
    await reportError('superadmin/ask-etyme: the email that did not go', err).catch(() => undefined)
    return { rows: null, says: 'The list of email that did not go could not be read just now. Reload to try again.' }
  }
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
