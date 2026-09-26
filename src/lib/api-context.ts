import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { looksLikeKey, hashKey, keyMatches, checkKey } from '@/lib/service-accounts'
import { cookies } from 'next/headers'
import { DEMO_COOKIE, read as readDemo } from '@/lib/demo-session'
import { staffAddresses } from '@/lib/alerts'

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
    /**
     * Where they are, for text the server writes them. Null until
     * somebody sets it, and lib/when falls back to UTC and says so
     * rather than guessing.
     */
    timezone: string | null
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
  /**
   * True when the caller's address is on `ETYME_STAFF_EMAILS` — one of
   * Etyme's own people rather than a customer's.
   *
   * Read off the address on purpose. Staff is not a seat, not a role and
   * not a permission, because a customer role that could grant it would
   * let a customer open a breach or read another customer's census. No
   * company grants it and no company can revoke it.
   *
   * It is not a permission either, and grants none: a staff caller with
   * no seat carries `company: null` and `permissions: []`, so every
   * ordinary route — which asks `hasPermission(caller.permissions, ...)`
   * and scopes by `caller.company.id` — refuses them exactly as before.
   * Only a route that asks for `caller.staff` by name lets them in.
   */
  staff?: boolean
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
 * Whether an address is one of Etyme's own.
 *
 * Fails closed: with `ETYME_STAFF_EMAILS` unset the list is empty and
 * nobody is staff, which is the same variable `/ready` already asks for.
 *
 * Case-insensitive, because an address is not case sensitive in the half
 * that matters and nobody types their own mailbox the same way twice.
 */
export function isStaffAddress(
  email: string | null | undefined,
  list: string[] = staffAddresses()
): boolean {
  if (!email) return false
  const want = email.trim().toLowerCase()
  return list.some((a) => a.trim().toLowerCase() === want)
}

/**
 * The context a staff member has when they hold no seat anywhere.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * Staff are identified by address, by design. `getCallerContext` refused
 * anybody with no active `Context` before any staff check could run, so
 * "staff by address" was true of the design and false of the code: an
 * Etyme person who is not an employee of any customer could not open the
 * breach register they are the only people allowed to open. It was
 * reported four times — once from the breach route, once from the census
 * review, and twice as a wrong sentence shown to a consultant.
 *
 * ── What it is, and what it is carefully not ─────────────────────────
 *
 * It says who they are and nothing about what they may do. No company —
 * because they are in none — and `permissions: []`, because a permission
 * is a customer's grant and this is not one. A route that scopes by
 * `caller.company.id` finds null and refuses. A route that asks
 * `hasPermission(caller.permissions, ...)` finds nothing and refuses.
 * The only door this opens is a route that checks `caller.staff`, and
 * those are Etyme's own: the breach register, and the census review.
 *
 * The person is real. Unlike a service account, whose id is not a Person
 * row, a staff member signed in through OAuth has one — so
 * `realPersonId()` keeps returning it and `openedById` on a breach is a
 * real foreign key. Somebody on the staff list with no Person row at all
 * still gets the ordinary 404: they have not finished signing in, which
 * is a different problem from having no seat.
 */
export function staffCaller(person: CallerContext['person']): CallerContext {
  return {
    person,
    // Shaped like a context so no route has to special-case it, and
    // labeled honestly. It is not a row: nothing may write this id into
    // a column that references one.
    context: { id: `staff:${person.id}`, type: 'STAFF', companyId: null, roleId: null },
    company: null,
    permissions: [],
    orgUnitId: null,
    staff: true,
  }
}

/** What a person with no usable seat gets: the staff door, or a sentence. */
export type NoSeat =
  | { staff: true }
  | { staff: false; status: number; code: string; says: string }

/**
 * Nobody has given this person a seat. Decide what they are told.
 *
 * Pure, so the four cases can be read as sentences without a database.
 *
 * ── The order, and why ───────────────────────────────────────────────
 *
 * Staff first. Being staff is not granted by any company, so no company
 * can take it away — including by suspending a seat somebody happens to
 * hold there. That suspension still bites: the staff context carries no
 * company and no permission, so nothing at that company is reachable
 * through it. What is lost is the helpful "your access is paused"
 * sentence, for the rare person who is both Etyme staff and a suspended
 * employee of a customer, and that is the cheaper of the two mistakes.
 *
 * Then paused, then ended, then nobody. The last three used to be one
 * sentence — "No active context. You must belong to a company." — which
 * was wrong three different ways at once. It reads as a fault, so
 * somebody files a ticket instead of asking their manager. It tells a
 * consultant to join a company, which is the one thing a consultant has
 * no business doing and the product exists to say is not required of
 * them. And it says the same thing to somebody whose seat was deliberately
 * removed as to somebody who never had one, which is the difference
 * between "that was on purpose" and "you are early".
 */
export function whenThereIsNoSeat(args: {
  email: string
  isStaff: boolean
  /** A seat that exists and is paused, if there is one. */
  paused: { companyName: string | null; reason: string | null } | null
  /** A seat that was taken away, if there was one. */
  ended: { companyName: string | null } | null
}): NoSeat {
  if (args.isStaff) return { staff: true }

  if (args.paused) {
    return {
      staff: false,
      status: 403,
      code: 'SUSPENDED',
      says:
        `Your access at ${args.paused.companyName ?? 'this company'} is paused` +
        `${args.paused.reason ? `: ${args.paused.reason}` : ''}. Somebody there can lift it.`,
    }
  }

  if (args.ended) {
    return {
      staff: false,
      status: 403,
      code: 'ACCESS_ENDED',
      says:
        `Your seat at ${args.ended.companyName ?? 'the company you were at'} was removed, so ` +
        `there is nothing here for you to open now. If that was not meant, an owner or ` +
        `administrator there can grant it again.`,
    }
  }

  return {
    staff: false,
    status: 403,
    code: 'NO_SEAT',
    says:
      `You are signed in as ${args.email}, and nobody has given you a seat yet. If a company ` +
      `invited you, open the link in that invitation — it is what puts the seat here. If you ` +
      `are here as a consultant, finish setting up your own profile and your work is under ` +
      `your own pages; you do not need to belong to a company.`,
  }
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
    select: { id: true, name: true, primaryEmail: true, timezone: true },
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
    // Why they have no seat decides what they are told, and one of the
    // four answers is not a refusal at all — see whenThereIsNoSeat.
    //
    // Both lookups only happen on this path, which is the rare one: a
    // request from somebody holding a seat never reaches here.
    const staff = isStaffAddress(person.primaryEmail)

    const paused = staff
      ? null
      : await prisma.context.findFirst({
          where: { personId: person.id, revokedAt: null, suspendedAt: { not: null } },
          select: { suspendReason: true, company: { select: { name: true } } },
        })

    const ended =
      staff || paused
        ? null
        : await prisma.context.findFirst({
            where: { personId: person.id, revokedAt: { not: null } },
            select: { company: { select: { name: true } } },
            orderBy: { revokedAt: 'desc' },
          })

    const verdict = whenThereIsNoSeat({
      email: person.primaryEmail,
      isStaff: staff,
      paused: paused
        ? { companyName: paused.company?.name ?? null, reason: paused.suspendReason }
        : null,
      ended: ended ? { companyName: ended.company?.name ?? null } : null,
    })

    if (verdict.staff) return { caller: staffCaller(person), error: null }

    return {
      caller: null,
      error: NextResponse.json(
        { error: { code: verdict.code, message: verdict.says } },
        { status: verdict.status }
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
      // Staff who do hold a seat somewhere are still staff. Read the same
      // way whether or not they have one, so a route asking `caller.staff`
      // gets one answer rather than two.
      staff: isStaffAddress(person.primaryEmail),
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
        // A machine is nowhere. UTC is the honest answer for anything it
        // writes, which is what null already means.
        timezone: null,
      },
      // Shaped like a person's context so nothing has to special-case a
      // machine, but honestly labeled. Nothing reads this today; leaving
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
      // A key is never staff. Staff is an address on a list of people,
      // and an integration holding a customer's key must not become one
      // by being pointed at a staff mailbox.
      staff: false,
    },
    error: null,
  }
}
