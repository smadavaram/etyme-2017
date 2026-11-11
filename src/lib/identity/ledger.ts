import type { Prisma } from '@prisma/client'
import { recordAccess, recordRefusal, type AccessAction, type AccessSubject } from '@/lib/access-log'
import type { EffectiveMode } from '@/lib/identity/policy'

/**
 * The identity events, each written to the access log under a name of its
 * own (founder, 2026-11-11): "SSO configured, domain verified, user
 * provisioned, user deprovisioned, group mapped to a role, login
 * succeeded, login refused because SSO only, invite sent, invite accepted,
 * membership revoked, auth policy changed. They go to the existing logs
 * with named actions, not a third ledger."
 *
 * Every row carries the time (the row's own `at`), the company, the actor,
 * the subject (the person, or the company where no person is named), the
 * policy that governed it and the surface it happened on. The policy and
 * the surface are written at the front of the reason in one fixed shape,
 * `policy <MODE> · surface <SURFACE> · <sentence>`, so a query reads them
 * back and a person reads the sentence.
 *
 * Every name is in lib/access-log's `AccessAction` list (etyme-regulatory,
 * 9e93a8bf2), so a row is typed like any other read.
 */

export const IDENTITY_EVENTS = [
  'SSO_CONFIGURED',
  'DOMAIN_VERIFIED',
  'USER_PROVISIONED',
  'USER_DEPROVISIONED',
  'GROUP_ROLE_MAPPED',
  'LOGIN_SUCCEEDED',
  'LOGIN_REFUSED_SSO_ONLY',
  /** A join by domain refused because the company admits people by invitation only. Not one of the eleven; the INVITE_ONLY twin of the refusal above. */
  'JOIN_REFUSED_BY_POLICY',
  'INVITE_SENT',
  'INVITE_ACCEPTED',
  'MEMBERSHIP_REVOKED',
  'AUTH_POLICY_CHANGED',
  /** "Sign out everywhere": every live session of a person ended. Not one of the eleven; the act the kill is made of. */
  'SESSIONS_ENDED',
] as const
export type IdentityEvent = (typeof IDENTITY_EVENTS)[number]

/**
 * Which code writes each event today, or null where nothing does yet and
 * the event is a typed stub for the second stage of pass 1 or for a route
 * in another domain. Read by the ledger test, so a stub cannot be reported
 * as wired.
 */
export const WRITTEN_BY: Record<IdentityEvent, string | null> = {
  SSO_CONFIGURED: null, // the directory settings screen, stage B
  DOMAIN_VERIFIED: 'src/app/api/settings/setup/[item]/route.ts',
  USER_PROVISIONED: 'src/lib/identity/provision.ts', // SCIM, a directory sign-in with just-in-time on, a directory group
  USER_DEPROVISIONED: 'src/lib/identity/provision.ts', // SCIM, and the mock directory's own off switch
  GROUP_ROLE_MAPPED: null, // the directory settings screen, stage B
  LOGIN_SUCCEEDED: 'src/lib/identity/sign-in.ts', // called from the sign-in event in src/lib/auth.ts
  LOGIN_REFUSED_SSO_ONLY: 'src/lib/identity/read.ts',
  JOIN_REFUSED_BY_POLICY: 'src/lib/identity/read.ts',
  INVITE_SENT: 'src/app/api/access/invite/route.ts',
  INVITE_ACCEPTED: 'src/lib/identity/sign-in.ts',
  MEMBERSHIP_REVOKED: 'src/app/api/access/[contextId]/route.ts',
  AUTH_POLICY_CHANGED: 'src/app/api/settings/sign-in/route.ts',
  SESSIONS_ENDED: 'src/lib/identity/read.ts',
}

export const SURFACES = ['WEB', 'API', 'TEAMS', 'STAFF', 'DIRECTORY', 'SCIM', 'CRON'] as const
export type Surface = (typeof SURFACES)[number]

export interface IdentityEntry {
  event: IdentityEvent
  /** The company whose policy or seat this is about. */
  companyId: string | null
  /** Who did it; null where nobody is signed in yet (a refused sign-in by an address with no account). */
  actorPersonId: string | null
  /** Whom it is about: a person, or the company where no person is named. */
  subject: AccessSubject | null
  policy: EffectiveMode
  surface: Surface
  /** What happened, in a sentence a person reads back. */
  says: string
  /**
   * An act that was asked for and refused, under the act's own name (a
   * directory asking to remove the last Owner): written as a refusal, and
   * before the refusal is sent, like the two refusal events.
   */
  refused?: boolean
}

const SHAPE = /^policy (SSO_ONLY|INVITE_ONLY|HYBRID|OPEN) · surface ([A-Z]+) · ([\s\S]+)$/

/** The reason column, in the one shape the ledger is read back by. */
export function identityReason(e: Pick<IdentityEntry, 'policy' | 'surface' | 'says'>): string {
  return `policy ${e.policy} · surface ${e.surface} · ${e.says}`
}

/** The policy, the surface and the sentence, read back out of a row's reason. Null for a row not in the shape. */
export function readIdentityReason(reason: string | null | undefined): { policy: EffectiveMode; surface: Surface; says: string } | null {
  const m = SHAPE.exec(String(reason ?? ''))
  if (!m || !(SURFACES as readonly string[]).includes(m[2])) return null
  return { policy: m[1] as EffectiveMode, surface: m[2] as Surface, says: m[3] }
}

/** Whether an event is a refusal: written refused, and before the refusal is sent. */
export function isRefusal(event: IdentityEvent): boolean {
  return event === 'LOGIN_REFUSED_SSO_ONLY' || event === 'JOIN_REFUSED_BY_POLICY'
}

/**
 * The row an entry writes, or why it cannot be written. Pure, so the
 * ledger's shape is a sentence in a test. A row with no subject names the
 * company; a row with neither is refused, because a row about nobody is a
 * row nobody can find.
 */
export function identityRow(e: IdentityEntry):
  | { ok: true; subject: AccessSubject; action: AccessAction; allowed: boolean; actorPersonId: string | null; actorCompanyId: string | null; reason: string }
  | { ok: false; says: string } {
  if (!(IDENTITY_EVENTS as readonly string[]).includes(e.event)) return { ok: false, says: `${e.event} is not an identity event.` }
  const subject = e.subject ?? (e.companyId ? { companyId: e.companyId } : null)
  if (!subject) return { ok: false, says: `A ${e.event} row must name a person or a company.` }
  if (!e.says.trim()) return { ok: false, says: `A ${e.event} row must say what happened.` }
  return {
    ok: true,
    subject,
    action: e.event,
    allowed: !(isRefusal(e.event) || e.refused === true),
    actorPersonId: e.actorPersonId,
    actorCompanyId: e.companyId,
    reason: identityReason(e),
  }
}

/**
 * Write an identity event. A refusal goes through `recordRefusal`, which
 * the caller awaits before it sends the refusal and which never throws.
 * Anything else goes through `recordAccess`, in the caller's transaction
 * where one is passed, so a policy change and its row commit together.
 */
export async function recordIdentityEvent(e: IdentityEntry, db?: Pick<Prisma.TransactionClient, 'accessLog'>): Promise<number> {
  const row = identityRow(e)
  if (!row.ok) throw new Error(row.says)
  const params = { action: row.action, actorPersonId: row.actorPersonId ?? undefined, actorCompanyId: row.actorCompanyId ?? undefined, reason: row.reason }
  if (!row.allowed) return recordRefusal([row.subject], params)
  return db ? recordAccess([row.subject], params, db) : recordAccess([row.subject], params)
}
