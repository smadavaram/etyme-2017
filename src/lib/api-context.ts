import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { looksLikeKey, hashKey, keyMatches, checkKey } from '@/lib/service-accounts'
import { cookies } from 'next/headers'
import { DEMO_COOKIE, read as readDemo } from '@/lib/demo-session'

/**
 * Caller context — resolved once per request, used by every endpoint
 * that needs to know who is calling and what they can see.
 *
 * BUILD.md §2: "Cannot be retrofitted. Every read path filters by
 * context from the first commit, or you audit every query later."
 */

export interface CallerContext {
  person: {
    id: string
    name: string
    primaryEmail: string
  }
  context: {
    id: string
    type: string
    companyId: string | null
    roleId: string | null
  }
  company: {
    id: string
    name: string
    slug: string
    kind: string
    /** ALLOWED · NAMED_ONLY · CLOSED — who here may see outside the company. */
    outsideAccess: string
    /** Whether one client account here may see another. */
    accountWalls: boolean
    /**
     * A sandbox rather than somebody's book.
     *
     * Demo and real are separate universes: a visitor looking around must
     * never see a customer's name, and a customer must never see a
     * stranger's sandbox.
     */
    isDemo: boolean
  } | null
  /**
   * The org unit this person sits on, if any.
   *
   * Null means firm-wide, which is the deliberate act — a CFO or a head of
   * delivery. Set means they see that unit and everything under it, where
   * the company has turned account walls on.
   */
  orgUnitId?: string | null
  permissions: readonly string[]
  /**
   * True when the caller is a machine holding an API key rather than a
   * person holding a session. Its `person.id` is not a real Person row, so
   * anything writing a foreign key must use realPersonId() instead.
   */
  isService?: boolean
}

/**
 * The caller's person id, or null when the caller is a machine.
 *
 * A service account's id is not a Person row. Writing it into a field that
 * references one is a foreign-key error at best and, where the column is
 * nullable and unchecked, a dangling reference nobody notices for months.
 */
export function realPersonId(caller: CallerContext): string | null {
  return caller.isService ? null : caller.person.id
}

/**
 * Resolve the session email — dev bypass or real OAuth.
 * Shared by getCallerContext and any route that uses getServerSession directly.
 */
export async function getSessionEmail(): Promise<string | null> {
  const devBypass = process.env.DEV_BYPASS_AUTH
  if (devBypass && process.env.NODE_ENV === 'development') {
    return devBypass
  }

  const session = await getServerSession(authOptions)
  if (session?.user?.email) return session.user.email

  // A demo visitor, who has not signed up and should not have to.
  //
  // Checked after the real session, never before: somebody with an
  // account is that account, whatever a stale demo cookie says.
  return await demoEmail()
}

/**
 * The demo identity in the cookie, if there is a valid one.
 *
 * Only ever returns a @demo.etyme.local address — a signature over a real
 * customer's email would otherwise be a way in.
 */
async function demoEmail(): Promise<string | null> {
  try {
    const jar = await cookies()
    return readDemo(jar.get(DEMO_COOKIE)?.value)
  } catch {
    // cookies() throws outside a request scope, which is where the cron
    // jobs call this from. No cookie, no demo visitor.
    return null
  }
}

/**
 * Resolve the authenticated caller's person, active context, company, and permissions.
 *
 * Uses the `x-context-id` header when present; otherwise falls back to the
 * most recently granted active (non-revoked) context.
 *
 * Returns null + a NextResponse on failure (401 / 404 / 403).
 */
export async function getCallerContext(
  request?: NextRequest
): Promise<
  | { caller: CallerContext; error: null }
  | { caller: null; error: NextResponse }
> {
  // ── A machine calling in ────────────────────────────────────────────
  //
  // Checked before any person is looked up, because a service account is
  // not a person and giving an integration somebody's login is how a
  // leaver's departure breaks the nightly ERP feed — or worse, does not.
  const machine = await callerFromApiKey(request)
  if (machine) return machine

  // ── Dev bypass — resolve founder context without OAuth ──
  // Set DEV_BYPASS_AUTH=email in .env.local for development screenshots.
  // NEVER enable in production. Removed before deploy.
  // One resolver, not two.
  //
  // This carried its own copy of the session logic, so every route using
  // getCallerContext — which is nearly all of them — was resolving
  // identity by different code from the handful using getSessionEmail.
  // The two agreed until they did not: a demo visitor was somebody to
  // /api/me and nobody to /api/bench.
  const sessionEmail = await getSessionEmail()

  if (!sessionEmail) {
    return {
      caller: null,
      error: NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      ),
    }
  }

  const person = await prisma.person.findUnique({
    where: { primaryEmail: sessionEmail },
    select: { id: true, name: true, primaryEmail: true },
  })

  if (!person) {
    return {
      caller: null,
      error: NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Person not found. Complete onboarding first.' } },
        { status: 404 }
      ),
    }
  }

  // Prefer explicit context from header; otherwise most recent active context
  const contextId = request?.headers.get('x-context-id') ?? undefined

  // A pause has to actually stop somebody. Recording a suspension and
  // still letting them in is a control worse than none, because everybody
  // believes it worked.
  const usable = { revokedAt: null, suspendedAt: null }

  const context = contextId
    ? await prisma.context.findFirst({
        where: { id: contextId, personId: person.id, ...usable },
        include: {
          company: { select: { id: true, name: true, slug: true, kind: true, outsideAccess: true, accountWalls: true, isDemo: true } },
          role: { select: { id: true, name: true, permissions: true } },
        },
      })
    : await prisma.context.findFirst({
        where: { personId: person.id, ...usable },
        include: {
          company: { select: { id: true, name: true, slug: true, kind: true, outsideAccess: true, accountWalls: true, isDemo: true } },
          role: { select: { id: true, name: true, permissions: true } },
        },
        orderBy: { grantedAt: 'desc' },
      })

  if (!context) {
    // Tell a suspended person that they are suspended. "No active context"
    // reads as a fault, and somebody who thinks the product is broken
    // files a ticket rather than asking their manager.
    const paused = await prisma.context.findFirst({
      where: { personId: person.id, revokedAt: null, suspendedAt: { not: null } },
      select: { suspendReason: true, company: { select: { name: true } } },
    })

    if (paused) {
      return {
        caller: null,
        error: NextResponse.json(
          {
            error: {
              code: 'SUSPENDED',
              message: `Your access at ${paused.company?.name ?? 'this company'} is paused${paused.suspendReason ? `: ${paused.suspendReason}` : ''}. Somebody there can lift it.`,
            },
          },
          { status: 403 }
        ),
      }
    }

    return {
      caller: null,
      error: NextResponse.json(
        { error: { code: 'NO_CONTEXT', message: 'No active context. You must belong to a company.' } },
        { status: 403 }
      ),
    }
  }

  // ── Record that this access was actually used ──
  //
  // The access review reports grants nobody has touched, and a review built
  // on a signal nothing writes is worse than no review: it says everything
  // is dormant, so it gets ignored, and then the one real finding is
  // ignored with it.
  //
  // Only grants with a role count. A seat with no permissions is somebody
  // waiting, not somebody working, and marking their access as used would
  // hide exactly the queue that needs attention.
  //
  // Written at most hourly. Every authenticated request passes through
  // here, and a write per request to record "still here" is a lot of
  // traffic for a field read once a quarter.
  if (context.roleId) {
    const stale =
      !context.lastUsedAt ||
      Date.now() - context.lastUsedAt.getTime() > 60 * 60 * 1000
    if (stale) {
      // Deliberately not awaited. Whether this lands is not worth delaying
      // the caller's request for, and losing one is harmless.
      prisma.context
        .update({ where: { id: context.id }, data: { lastUsedAt: new Date() } })
        .catch(() => {})
    }
  }

  return {
    caller: {
      person,
      context: {
        id: context.id,
        type: context.type,
        companyId: context.companyId,
        roleId: context.roleId,
      },
      company: context.company,
      permissions: (context.role?.permissions as string[]) ?? [],
      // Where they sit in the firm. Null is firm-wide, and that absence is
      // the deliberate act rather than an oversight.
      orgUnitId: context.orgUnitId,
    },
    error: null,
  }
}

/**
 * A caller holding an API key rather than a session.
 *
 * Returns null when there is no key at all, so the ordinary session path
 * carries on. Returns an error when there is a key and it is not usable —
 * a bad key must never fall through to "not authenticated", because the
 * two lead to completely different debugging.
 */
async function callerFromApiKey(
  request?: NextRequest
): Promise<
  | { caller: CallerContext; error: null }
  | { caller: null; error: NextResponse }
  | null
> {
  const header = request?.headers.get('authorization') ?? ''
  const presented = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!presented || !looksLikeKey(presented)) return null

  const account = await prisma.serviceAccount.findUnique({
    where: { keyHash: hashKey(presented) },
    select: {
      id: true, name: true, permissions: true, revokedAt: true, expiresAt: true,
      company: { select: { id: true, name: true, slug: true, kind: true, outsideAccess: true, accountWalls: true, isDemo: true } },
    },
  })

  if (!account || !keyMatches(presented, hashKey(presented))) {
    return {
      caller: null,
      error: NextResponse.json(
        { error: { code: 'BAD_KEY', message: 'That API key is not one of ours.' } },
        { status: 401 }
      ),
    }
  }

  const verdict = checkKey(
    { revokedAt: account.revokedAt, expiresAt: account.expiresAt, permissions: account.permissions },
    new Date()
  )
  if (!verdict.usable) {
    return {
      caller: null,
      error: NextResponse.json(
        { error: { code: 'KEY_UNUSABLE', message: verdict.reason } },
        { status: 401 }
      ),
    }
  }

  // Last use, for the same reason a person's is recorded: a key nobody has
  // used in three months is exposure rather than integration, and the only
  // way to know is to write it down.
  void prisma.serviceAccount
    .update({ where: { id: account.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {})

  return {
    caller: {
      // A service account is not a person. It is given a person-shaped
      // record so every route can read caller.person.name for a log line,
      // and the name says plainly what it is.
      person: {
        id: `service:${account.id}`,
        name: `${account.name} (integration)`,
        primaryEmail: `service+${account.id}@etyme.local`,
      },
      // Shaped like a person's context so nothing has to special-case a
      // machine, but honestly labelled. Nothing reads this today; leaving
      // a null here would be a crash waiting for the first route that does.
      context: {
        id: `service:${account.id}`,
        type: 'SERVICE',
        companyId: account.company.id,
        roleId: null,
      },
      company: account.company,
      permissions: account.permissions,
      isService: true,
    },
    error: null,
  }
}
