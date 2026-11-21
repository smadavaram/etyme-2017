import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { reportError } from '@/lib/alerts'

/**
 * The security log: one writer, and the guard /ready reads.
 *
 * Record 86 (founder, 2026-11-16), answer 1: "A separate security log
 * that nothing can change." It sits apart from the access log and the
 * activity log, as an enterprise ERP keeps its security audit log apart
 * from its change records. It supersedes the 2026-11-11 words "not a
 * third ledger" for security events only: the identity events stay in
 * the access log (lib/identity/ledger).
 *
 * Append-only is the database's rule, not this file's. The triggers in
 * prisma/sql/append-only.sql refuse every UPDATE, DELETE and TRUNCATE on
 * the table, and /ready says "missing" until they are there
 * (`securityLogGuarded` below).
 *
 * What a row never holds: an email, a name, a secret, a code, a token, or
 * bank digits beyond the last four. `scrubFacts` removes any of them a
 * caller passes by mistake, so a slip at a call site cannot put one in a
 * row that can never be deleted.
 */

export const SECURITY_EVENTS = [
  // The second check (record 86, answers 2 to 5).
  'SECOND_CHECK_ENROLLED',
  'SECOND_CHECK_REMOVED',
  'SECOND_CHECK_PASSED',
  'SECOND_CHECK_FAILED',
  /** A proof spent on the one act it was made for; its id makes a second spend impossible. */
  'SECOND_CHECK_USED',
  'SECOND_CHECK_RESET',
  /** A reset asked for and refused: by an Admin, of one's own, or with no seat. */
  'SECOND_CHECK_RESET_REFUSED',
  /** A release of money, naming the check that stood behind it. */
  'MONEY_RELEASED',
  // Bank details (record 86, answers 6 to 8).
  'BANK_CHANGE_ENTERED',
  'BANK_CHANGE_OWNERS_TOLD',
  'BANK_CHANGE_NOTICE_NOT_SENT',
  'BANK_CHANGE_DISOWNED',
  'BANK_CALLBACK_RECORDED',
  'BANK_CHECKED',
  /** Full bank details shown, after a fresh second check (record 87). Never the details themselves. */
  'BANK_DETAILS_SHOWN',
  // Sensitive numbers (record 99). Who, which record and why; never the number.
  /** A full tax ID shown to an Owner, after a fresh second check. */
  'SENSITIVE_REVEALED',
  /** A reveal asked for and refused, written before the refusal is sent. */
  'SENSITIVE_REVEAL_REFUSED',
] as const
export type SecurityEventName = (typeof SECURITY_EVENTS)[number]

/**
 * Which code writes each event today, or null where nothing does yet.
 * The second check's own events are written from slice S1 and S6
 * (lib/identity/second-check); money releases and bank changes are null
 * until slices S2 and S4 build them. Read by the ledger's test, so a stub
 * cannot be reported as wired.
 */
const SECOND_CHECK_FILE = 'src/lib/identity/second-check.ts'
export const WRITTEN_BY: Record<SecurityEventName, string | null> = {
  SECOND_CHECK_ENROLLED: SECOND_CHECK_FILE,
  SECOND_CHECK_REMOVED: SECOND_CHECK_FILE,
  SECOND_CHECK_PASSED: SECOND_CHECK_FILE,
  SECOND_CHECK_FAILED: SECOND_CHECK_FILE,
  SECOND_CHECK_USED: SECOND_CHECK_FILE,
  SECOND_CHECK_RESET: SECOND_CHECK_FILE,
  SECOND_CHECK_RESET_REFUSED: SECOND_CHECK_FILE,
  MONEY_RELEASED: null,
  BANK_CHANGE_ENTERED: null,
  BANK_CHANGE_OWNERS_TOLD: null,
  BANK_CHANGE_NOTICE_NOT_SENT: null,
  BANK_CHANGE_DISOWNED: null,
  BANK_CALLBACK_RECORDED: null,
  BANK_CHECKED: null,
  BANK_DETAILS_SHOWN: null,
  SENSITIVE_REVEALED: 'src/app/api/settings/sensitive/reveal/route.ts',
  SENSITIVE_REVEAL_REFUSED: 'src/app/api/settings/sensitive/reveal/route.ts',
}

export const SECURITY_SURFACES = ['WEB', 'TEAMS', 'STAFF', 'CRON', 'EMAIL_LINK'] as const
export type SecuritySurface = (typeof SECURITY_SURFACES)[number]

export interface SecurityEventInput {
  event: SecurityEventName
  surface: SecuritySurface
  /** The sentence a person reads. */
  says: string
  companyId?: string | null
  actorPersonId?: string | null
  subjectPersonId?: string | null
  subjectCompanyId?: string | null
  sessionId?: string | null
  method?: 'PASSKEY' | 'AUTHENTICATOR_APP' | null
  targetKind?: string | null
  targetId?: string | null
  facts?: Record<string, unknown> | null
}

// ── What a row never holds ───────────────────────────────────────────

/** A fact whose name says it is a secret is dropped whole. */
const SECRET_KEY = /secret|password|passcode|token|totp|^otp|challenge|signature|private|cookie|^code$|accountnumber|routingnumber|fullnumber|email/i

/** Six digits or more in a row: a one-time code, or a full account or routing number. */
const LONG_DIGITS = /\d{6,}/g

export const REMOVED = '[removed]'

function scrubText(v: string): string {
  return v.replace(LONG_DIGITS, REMOVED)
}

function scrubValue(v: unknown): unknown {
  if (typeof v === 'string') return scrubText(v)
  if (v instanceof Date) return v.toISOString()
  if (Array.isArray(v)) return v.map(scrubValue)
  if (v && typeof v === 'object') return scrubFacts(v as Record<string, unknown>)
  if (typeof v === 'bigint') return v.toString()
  return v
}

/**
 * Pure: the facts as a row may hold them. A key that names a secret, a
 * code, a token or an email is dropped; a run of six digits or more in
 * any text is replaced; nested facts are read the same way.
 */
export function scrubFacts(facts: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(facts)) {
    if (SECRET_KEY.test(k)) continue
    if (v === undefined || typeof v === 'function') continue
    out[k] = scrubValue(v)
  }
  return out
}

/** Pure: the row `recordSecurityEvent` writes. */
export function securityEventRow(i: SecurityEventInput): Prisma.SecurityEventUncheckedCreateInput {
  const facts = i.facts ? scrubFacts(i.facts) : null
  return {
    event: i.event,
    surface: i.surface,
    says: scrubText(i.says),
    companyId: i.companyId ?? null,
    actorPersonId: i.actorPersonId ?? null,
    subjectPersonId: i.subjectPersonId ?? null,
    subjectCompanyId: i.subjectCompanyId ?? null,
    sessionId: i.sessionId ?? null,
    method: i.method ?? null,
    targetKind: i.targetKind ?? null,
    targetId: i.targetId ?? null,
    ...(facts && Object.keys(facts).length ? { facts: facts as Prisma.InputJsonValue } : {}),
  }
}

type Db = Pick<typeof prisma, 'securityEvent'>

/**
 * Write one row to the security log, and wait for it.
 *
 * Never throws. A caller awaits it before it answers, so a serverless
 * host cannot stop the function with the row unwritten (the access log's
 * lesson, 2026-10-08). Where the write fails, staff are told and the
 * answer is false; the caller decides whether its act may stand without
 * the row. Returns the row's id where it was written.
 */
export async function recordSecurityEvent(i: SecurityEventInput, db: Db = prisma): Promise<string | null> {
  try {
    const row = await db.securityEvent.create({ data: securityEventRow(i), select: { id: true } })
    return row.id
  } catch (err) {
    await reportError(
      'security-log',
      new Error(
        `Could not write ${String(i?.event)} to the security log. ` +
          `Cause: ${err instanceof Error ? err.message : String(err)}`
      ),
      { personId: i?.actorPersonId ?? null, companyId: i?.companyId ?? null }
    ).catch(() => undefined)
    return null
  }
}

/**
 * Write one row under an id the caller chose, once. The second check uses
 * it to spend a proof: the row's id is made from the proof's own, so the
 * database's primary key refuses a second spend, even two at the same
 * instant. `ALREADY` where a row with that id exists; `FAILED` where the
 * write failed for any other reason, and staff are told. Never throws.
 */
export async function recordSecurityEventOnce(
  id: string,
  i: SecurityEventInput,
  db: Db = prisma
): Promise<'WRITTEN' | 'ALREADY' | 'FAILED'> {
  try {
    // Read first, so an ordinary second try is answered without a failed
    // write; the primary key still decides two tries at the same instant.
    if (await db.securityEvent.findUnique({ where: { id }, select: { id: true } })) return 'ALREADY'
    await db.securityEvent.create({ data: { ...securityEventRow(i), id }, select: { id: true } })
    return 'WRITTEN'
  } catch (err) {
    if ((err as { code?: string })?.code === 'P2002') return 'ALREADY'
    await reportError(
      'security-log',
      new Error(`Could not write ${String(i?.event)} to the security log. Cause: ${err instanceof Error ? err.message : String(err)}`),
      { personId: i?.actorPersonId ?? null, companyId: i?.companyId ?? null }
    ).catch(() => undefined)
    return 'FAILED'
  }
}

// ── The guard, as /ready reads it ────────────────────────────────────

/** The triggers prisma/sql/append-only.sql creates. Both must be there and switched on. */
export const GUARD_TRIGGERS = ['security_event_never_changed', 'security_event_never_emptied'] as const

/**
 * Whether the database guards the security log: both triggers present on
 * the table and not switched off. False where the table or a trigger is
 * missing, or the read fails. Never throws.
 */
export async function securityLogGuarded(db: Pick<typeof prisma, '$queryRawUnsafe'> = prisma): Promise<boolean> {
  try {
    const rows = (await db.$queryRawUnsafe(
      `SELECT tgname FROM pg_trigger WHERE tgrelid = to_regclass('"SecurityEvent"') AND NOT tgisinternal AND tgenabled <> 'D'`
    )) as { tgname: string }[]
    const on = new Set(rows.map((r) => r.tgname))
    return GUARD_TRIGGERS.every((t) => on.has(t))
  } catch {
    return false
  }
}
