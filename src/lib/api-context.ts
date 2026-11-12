import { NextRequest, NextResponse } from 'next/server'
import { seatPermissions } from '@/lib/permission-grants'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { looksLikeKey, hashKey, keyMatches, checkKey } from '@/lib/service-accounts'
import { cookies } from 'next/headers'
import { DEMO_COOKIE, read as readDemo, reservedAddress } from '@/lib/demo-session'
import { AsyncLocalStorage } from 'node:async_hooks'
import {
  SAMPLE_COOKIE, SAMPLE_WORLD, SAMPLE_DESK, SAMPLE_PERSON_EMAIL, isSampleCookie, isSamplePerson, sampleMay, sampleRefusalBody,
} from '@/lib/sample-seat'
import { DESK_ROLES } from '@/lib/demo-desks'
import { staffAddresses, reportError } from '@/lib/alerts'
import { desklessDoor, recordNamedBy, READS_PEOPLE, type RecordFamily } from '@/lib/deskless-door'
import { regionDoor, REGION_UNIT_KIND } from '@/lib/region-scope'
import { pageNameOf, HAT_COOKIE, readHatCookie, type CompanyKind } from '@/lib/nav-table'
import { invoiceBetween } from '@/lib/money/invoice-parties'
import { seatFor } from '@/lib/program-seat'
import { recordRefusal } from '@/lib/access-log'
import { ownSeatFor, ownWorkOf, ownSeatWasRemoved, openOwnSeat } from '@/lib/own-seat'
import {
  seatRefusal, linkedInSeatRefusal, effectiveMode, isLimitedPublicSeat, narrowForPublicSeat, publicSeatRefusal, needsWithheld, directoryTurnedOffSays, DIRECTORY_SUSPEND_REASON,
  type CompanyPolicy, type Door, type SignInMode,
} from '@/lib/identity/policy'
import { recordIdentityEvent } from '@/lib/identity/ledger'
import { pausedSays } from '@/lib/access-grant'
import { domainOfEmail, isConsumerDomain } from '@/lib/company-domains'
import { PERMISSIONS, askTheDesk, type Permission } from '@/lib/permissions'

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
  /**
   * The region this seat reads, where its org unit is a REGION unit
   * (founder, 2026-10-27, the region map). Null or absent for every other
   * seat. A region seat is refused by every route that does not ask for
   * the caller with `{ narrowsToRegion: true }`, and a route that does
   * reads `regionScopeFor(companyId, region.unitId)` from lib/region-scope
   * and applies it to every query it makes.
   */
  region?: { unitId: string; label: string } | null
  permissions: readonly string[]
  /**
   * The role's own permissions, before any grant (2026-11-08). Absent
   * where the caller was resolved by a door that reads grants nowhere
   * (the sample seat, an API key, staff), in which case `permissions` is
   * the role's. `permissionScope` in lib/permission-grants reads it.
   */
  rolePermissions?: readonly string[]
  /** The permissions this seat holds by a grant rather than its role. */
  grantedPermissions?: readonly string[]
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
  /**
   * True when the caller is the shared sample seat the home page frames
   * (`lib/sample-seat`): anybody, with no account, reading the seeded
   * Northbend Athletic program manager's screens.
   *
   * Set in exactly one place, `sampleCaller` below, and read off which
   * door resolved the caller — never off a header, a body field or a
   * query string. A read-only caller never reaches a route on a write:
   * the check refuses it first, so no route has to remember to.
   */
  readOnly?: boolean
  /**
   * True when the seat is an invited public address at a hybrid company
   * (founder, 2026-11-11): its money and signing acts were taken off
   * `permissions` above. `refusalFor` reads it so the refusal says why.
   */
  publicSeat?: boolean
}

/**
 * The caller's person id, or null when the caller is a machine.
 *
 * A service account's id is not a Person row. Writing it into a field that
 * references one is a foreign-key error at best and, where the column is
 * nullable and unchecked, a dangling reference nobody notices for months.
 */
/**
 * The refusal for an act the caller's seat does not hold, said for this
 * caller. A limited public-address seat refused an act the limit took
 * away is told that, in one sentence (publicSeatRefusal); everybody else
 * reads askTheDesk's sentence naming who does it. A route that refuses on
 * a permission passes its caller here rather than calling askTheDesk.
 */
export function refusalFor(
  caller: Pick<CallerContext, 'publicSeat' | 'company'>,
  args: { doing: string; needs: Permission | readonly Permission[] }
): string {
  if (caller.publicSeat && needsWithheld(args.needs)) return publicSeatRefusal(caller.company?.name)
  return askTheDesk({ ...args, kind: caller.company?.kind ?? null, companyName: caller.company?.name ?? null })
}

/**
 * Whether the request still carries a session cookie that a company's
 * directory ended: the cookie decodes to an address whose directory
 * identity is off. The session callback refused it, so `getServerSession`
 * answered nobody; the cookie itself is still on this request. Returns the
 * sentence, or null for every other kind of signed-out. Never throws.
 */
async function endedByDirectory(): Promise<string | null> {
  try {
    const secret = process.env.NEXTAUTH_SECRET
    if (!secret) return null
    const jar = cookies()
    const raw = jar.get('__Secure-next-auth.session-token')?.value ?? jar.get('next-auth.session-token')?.value
    if (!raw) return null
    const { decode } = await import('next-auth/jwt')
    const token = await decode({ token: raw, secret })
    const email = typeof token?.email === 'string' ? token.email.trim().toLowerCase() : null
    if (!email) return null
    const off = await prisma.externalIdentity.findFirst({
      where: { person: { primaryEmail: email }, disabledAt: { not: null } },
      orderBy: { disabledAt: 'desc' },
      select: { company: { select: { name: true } } },
    })
    return off ? directoryTurnedOffSays(off.company?.name ?? null) : null
  } catch {
    return null
  }
}

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

  if (args.paused && args.paused.reason === DIRECTORY_SUSPEND_REASON) {
    return { staff: false, status: 403, code: 'DIRECTORY_OFF', says: directoryTurnedOffSays(args.paused.companyName) }
  }

  if (args.paused) {
    return {
      staff: false,
      status: 403,
      code: 'SUSPENDED',
      // One sentence for a paused seat, the same one the paused page shows
      // (`pausedSays` in lib/access-grant): the reason is cut to a clause, so
      // "back." never meets ". Somebody" as a double period.
      says: pausedSays(args.paused.companyName, args.paused.reason),
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
  return (await getSessionIdentity())?.email ?? null
}

/**
 * Who the session is, and the door it was signed in through (founder,
 * 2026-11-11). The door is what a directory-only company's seat is checked
 * against on every request. An ended session never reaches here: the
 * session callback in lib/auth refuses it before a session is returned.
 * The dev bypass and a demo visitor carry no door.
 */
export async function getSessionIdentity(): Promise<{ email: string; door: Door | null; issuer: string | null } | null> {
  const devBypass = process.env.DEV_BYPASS_AUTH
  if (devBypass && process.env.NODE_ENV === 'development') {
    return { email: devBypass, door: null, issuer: null }
  }

  const session = await getServerSession(authOptions)
  // Lowercased, because the person is found by the email they signed up
  // with, and a Microsoft account may spell it Sharath@Etyme.com.
  if (session?.user?.email) {
    const u = session.user as { email: string; door?: Door | null; issuer?: string | null }
    const email = session.user.email.trim().toLowerCase()
    return { email, door: u.door ?? null, issuer: u.issuer ?? null }
  }

  // A demo visitor, who has not signed up and should not have to.
  //
  // Checked after the real session, never before: somebody with an
  // account is that account, whatever a stale demo cookie says.
  const demo = await demoEmail()
  return demo ? { email: demo, door: null, issuer: null } : null
}

/** The seat company's sign-in policy, as read with the seat. Null where the company has none. */
export function seatCompanyPolicy(company: {
  id: string; name: string
  signInPolicy?: { mode: string } | null
  identityProviders?: { issuer: string }[] | null
} | null | undefined): CompanyPolicy | null {
  if (!company) return null
  const mode = (company.signInPolicy?.mode as SignInMode | undefined) ?? null
  const issuers = (company.identityProviders ?? []).map((d) => d.issuer)
  if (!mode && issuers.length === 0) return null
  return { companyId: company.id, companyName: company.name, mode, issuers }
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
    const email = readDemo(jar.get(DEMO_COOKIE)?.value)
    // The shared sample's person is a seat for strangers, read-only, and
    // only the sample door opens it. A demo cookie naming it — however it
    // was signed — would hand somebody that seat with the program
    // manager's writes, under the sample's name. It is nobody.
    return isSamplePerson(email) ? null : email
  } catch {
    // cookies() throws outside a request scope, which is where the cron
    // jobs call this from. No cookie, no demo visitor.
    return null
  }
}

/**
 * The embed's own reads, made in-process as the sample seat.
 *
 * The frame on the home page draws its rows on the server by calling the
 * same GET handlers the dashboard calls, inside this scope, so its numbers
 * are the dashboard's numbers. Inside it the caller is the sample seat
 * whoever is signed in: a buyer who happens to hold a real seat sees the
 * sample in the frame, never their own book.
 *
 * Only server code can enter the scope. Nothing on the wire can.
 */
const sampleScope = new AsyncLocalStorage<true>()

export function asSampleSeat<T>(read: () => Promise<T>): Promise<T> {
  return sampleScope.run(true, read)
}

/**
 * The seat the person chose in the account menu on this device, if any
 * (founder, 2026-11-03, "One person, two hats"). Only a choice among the
 * person's own live seats: the caller below looks it up under their own
 * person id and, where it is not theirs or no longer live, uses the
 * seat it always used. Never a refusal, so a stale cookie locks nobody
 * out.
 */
async function chosenSeat(request?: NextRequest): Promise<string | null> {
  const onRequest = request?.cookies?.get(HAT_COOKIE)?.value
  if (onRequest !== undefined) return readHatCookie(onRequest).contextId
  try {
    const jar = await cookies()
    return readHatCookie(jar.get(HAT_COOKIE)?.value).contextId
  } catch {
    // Outside a request scope: a cron job, a script. No choice.
    return null
  }
}

/** Whether this request carries the sample cookie. Read off the request where there is one. */
async function sampleCookieOn(request?: NextRequest): Promise<boolean> {
  const onRequest = request?.cookies?.get(SAMPLE_COOKIE)?.value
  if (onRequest !== undefined) return isSampleCookie(onRequest)
  try {
    const jar = await cookies()
    return isSampleCookie(jar.get(SAMPLE_COOKIE)?.value)
  } catch {
    // Outside a request scope: a cron job, a script. No visitor.
    return false
  }
}

/**
 * The shared sample seat: a person of its own at Northbend Athletic,
 * holding the program manager's role, read-only (`lib/sample-seat`).
 *
 * The seat is its own — the person `SAMPLE_PERSON_EMAIL`, seeded beside
 * the Northbend desks — and the role is the program manager's, so every
 * read answers as it does for her while every access-log row the routes
 * write names the sample, never her (measured 2026-10-14: ninety-four
 * routes write `caller.person.id`). What differs is the flag, and what
 * follows from it here, once, for every route:
 *
 * - a write is refused with the sample's sentence and its two doors,
 *   before any route code runs, and the refusal never reaches the world;
 * - so is a caller with no request to read a method off, which is a page
 *   rather than a route: the seat fails closed;
 * - `lastUsedAt` is not touched, because a stranger looking is not use;
 * - the person must be at a domain nobody can register, so a deployment
 *   where the slug somehow names a real company opens nothing;
 * - a world seeded before the sample's person existed opens nothing
 *   either: it says so and staff are told, and it never falls back to
 *   the program manager's own seat, which is the bug this replaced.
 */
async function sampleCaller(
  request?: NextRequest
): Promise<{ caller: CallerContext; error: null } | { caller: null; error: NextResponse }> {
  const seat = await prisma.context.findFirst({
    where: {
      revokedAt: null, suspendedAt: null,
      company: { slug: SAMPLE_WORLD },
      person: { primaryEmail: SAMPLE_PERSON_EMAIL },
      role: { name: { in: DESK_ROLES[SAMPLE_DESK] } },
    },
    include: {
      person: { select: { id: true, name: true, primaryEmail: true, timezone: true } },
      company: { select: { id: true, name: true, slug: true, kind: true, outsideAccess: true, accountWalls: true, isDemo: true } },
      role: { select: { id: true, name: true, permissions: true } },
    },
    orderBy: { grantedAt: 'asc' },
  })

  if (!seat || !seat.company || !reservedAddress(seat.person.primaryEmail)) {
    // The company is there and the sample's own seat is not: a world
    // seeded before the seat existed. Staff hear it; the visitor reads a
    // sentence. Nothing here reaches for another seat at the company.
    const company = await prisma.company.findUnique({ where: { slug: SAMPLE_WORLD }, select: { id: true } })
    if (company) {
      await reportError(
        'sample seat: missing',
        'The shared sample has no seat of its own at Northbend Athletic, so the home page frame shows nothing. Reseed the world to make it.',
        { companyId: company.id }
      ).catch(() => undefined)
    }
    return {
      caller: null,
      error: NextResponse.json(
        {
          error: {
            code: 'SAMPLE_NOT_SEEDED',
            message: company
              ? 'The sample is not set up on this deployment yet, so there is nothing to show. Open the demo instead.'
              : 'The sample company is not on this deployment yet, so there is nothing to show. Open the demo instead.',
          },
        },
        { status: 404 }
      ),
    }
  }

  const caller: CallerContext = {
    person: seat.person,
    context: { id: seat.id, type: seat.type, companyId: seat.companyId, roleId: seat.roleId },
    company: seat.company,
    permissions: (seat.role?.permissions as string[]) ?? [],
    orgUnitId: seat.orgUnitId,
    staff: false,
    readOnly: true,
  }

  if (!sampleMay(request?.method)) {
    await recordRefusal([seat.personId], {
      action: 'SAMPLE_WRITE', actorKind: 'SAMPLE', actorSampleSeat: seat.id, actorCompanyId: seat.company.id,
      reason: `Refused ${request?.method ?? 'a call with no method'} ${request?.nextUrl?.pathname ?? '(no route)'}: the shared sample is read-only.`,
    })
    return { caller: null, error: NextResponse.json(sampleRefusalBody(), { status: 403 }) }
  }

  const refused = await desklessRefusal(caller, request)
  if (refused) return { caller: null, error: refused }
  return { caller, error: null }
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
  request?: NextRequest,
  /**
   * `narrowsToRegion`: this route applies `lib/region-scope` to every read
   * it makes, so a seat scoped to one region may open it. Absent, a region
   * seat is refused here in a sentence before the route reads anything.
   */
  opts: { narrowsToRegion?: boolean } = {}
): Promise<
  | { caller: CallerContext; error: null }
  | { caller: null; error: NextResponse }
> {
  // ── A machine calling in ────────────────────────────────────────────
  //
  // Checked before any person is looked up, because a service account is
  // not a person and giving an integration somebody's login is how a
  // leaver's departure breaks the nightly ERP feed — or worse, does not.
  // ── The frame's own reads ───────────────────────────────────────────
  //
  // First, before a key or a session: inside the embed's scope the caller
  // is the sample seat whoever is signed in (`asSampleSeat`).
  if (sampleScope.getStore()) return sampleCaller(request)

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
  const identity = await getSessionIdentity()
  const sessionEmail = identity?.email ?? null

  if (!sessionEmail) {
    // Nobody signed in and no demo of their own: a visitor looking at the
    // home page's frame is the sample seat, read-only. Last, never first —
    // see lib/sample-seat.
    if (await sampleCookieOn(request)) return sampleCaller(request)
    // A session the person's own company directory ended is told so, not
    // treated as somebody who never signed in (walk on 62a498151).
    const off = await endedByDirectory()
    if (off) {
      return { caller: null, error: NextResponse.json({ error: { code: 'DIRECTORY_OFF', message: off } }, { status: 401 }) }
    }
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

  // How the company's people sign in, read with the seat so the check
  // below costs no query (lib/identity).
  const SEAT_POLICY = {
    signInPolicy: { select: { mode: true } },
    identityProviders: { where: { enabled: true }, select: { issuer: true } },
  } as const
  const seatInclude = {
    company: { select: { id: true, name: true, slug: true, kind: true, outsideAccess: true, accountWalls: true, isDemo: true, ...SEAT_POLICY } },
    role: { select: { id: true, name: true, permissions: true } },
    // Read with the seat so a region seat is known without a second query.
    orgUnit: { select: { id: true, name: true, kind: true } },
  } as const

  // Where no header names a seat, the one chosen in the account menu,
  // if it is still this person's and live; else the most recent.
  const chosen = contextId ? null : await chosenSeat(request)
  let context = contextId
    ? await prisma.context.findFirst({
        where: { id: contextId, personId: person.id, ...usable },
        include: seatInclude,
      })
    : (chosen
        ? await prisma.context.findFirst({
            where: { id: chosen, personId: person.id, ...usable },
            include: seatInclude,
          })
        : null) ?? await prisma.context.findFirst({
        where: { personId: person.id, ...usable },
        include: seatInclude,
        orderBy: { grantedAt: 'desc' },
      })

  if (!context && !contextId) {
    // ── Their own work is their own seat (simulation, 2026-10-20) ──────
    //
    // Nine placed workers and three people asked onto a bench had no seat
    // at all — a firm placed or listed them before they ever signed in —
    // and were refused their own week, papers, terms and Ask Etyme with
    // "nobody has given you a seat yet". The work was theirs. So somebody
    // on a placement, a submission or a bench listing is given the
    // company-less consultant seat a candidate gets at sign-up: their own
    // work, no company, no permission (lib/own-seat). Not where a seat at
    // a firm is paused, and not where their own seat was taken away: those
    // keep the sentences below. Staff are answered below as before; a
    // staff member who is also on a placement is seated as themselves.
    const paused = await prisma.context.findFirst({
      where: { personId: person.id, revokedAt: null, suspendedAt: { not: null } },
      select: { id: true },
    })
    const verdict = paused
      ? ({ open: false } as const)
      : ownSeatFor({
          name: person.name,
          work: await ownWorkOf(prisma, person.id),
          paused: false,
          ownSeatRemoved: await ownSeatWasRemoved(prisma, person.id),
        })
    if (verdict.open) {
      const id = await openOwnSeat(prisma, person, verdict.because)
      context = await prisma.context.findUnique({ where: { id }, include: seatInclude })
    }
  }

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

  // ── The company's sign-in policy, on every request ──────────────────
  //
  // A directory-only company's seat is used only from a session that
  // company's own directory signed in (founder, 2026-11-11), whoever holds
  // the seat and however it was made. A session signed in by any other
  // door, including one signed in before the Owner changed the policy, is
  // refused here on its next request, the row written before the answer.
  const seatPolicy = seatCompanyPolicy(context.company as any)
  const seatSays = seatRefusal(seatPolicy, { door: identity?.door ?? null, issuer: identity?.issuer ?? null })
  if (seatSays && seatPolicy) {
    await recordIdentityEvent({
      event: 'LOGIN_REFUSED_SSO_ONLY',
      companyId: seatPolicy.companyId,
      actorPersonId: person.id,
      subject: { personId: person.id },
      policy: 'SSO_ONLY',
      surface: request?.nextUrl?.pathname?.startsWith('/api/') ? 'API' : 'WEB',
      says: `Refused the seat at ${seatPolicy.companyName} to a session signed in through ${identity?.door ?? 'a door from before 2026-11-11'}${request?.nextUrl?.pathname ? ` on ${request.nextUrl.pathname}` : ''}: ${seatSays}`,
    })
    return {
      caller: null,
      error: NextResponse.json({ error: { code: 'DIRECTORY_ONLY', message: seatSays } }, { status: 403 }),
    }
  }
  // LinkedIn is a worker's and a one-person firm's door, never a door to a
  // company with colleagues (founder, 2026-11-11).
  const linkedInSays = linkedInSeatRefusal(identity?.door ?? null, context.company as any)
  if (linkedInSays && context.companyId) {
    await recordIdentityEvent({
      event: 'JOIN_REFUSED_BY_POLICY',
      companyId: context.companyId,
      actorPersonId: person.id,
      subject: { personId: person.id },
      policy: effectiveMode(seatPolicy),
      surface: request?.nextUrl?.pathname?.startsWith('/api/') ? 'API' : 'WEB',
      says: `Refused a LinkedIn session the seat at ${(context.company as any)?.name ?? 'the company'}: ${linkedInSays}`,
    })
    return {
      caller: null,
      error: NextResponse.json({ error: { code: 'LINKEDIN_NOT_FOR_COMPANIES', message: linkedInSays } }, { status: 403 }),
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

  // The role's permissions and every grant the Owner gave this seat or its
  // role (founder, 2026-11-08), so a granted seat passes the menu's door and
  // every `hasPermission` asked over `caller.permissions`. A grant narrowed
  // to a team counts only where its reader narrows the query
  // (lib/permission-grants). One query; a failed read is the role alone.
  let rolePermissions = (context.role?.permissions as string[]) ?? []
  const held = await seatPermissions(
    { companyId: context.companyId, roleId: context.roleId, contextId: context.id },
    rolePermissions
  )
  let permissions: readonly string[] = held.permissions
  let grantedPermissions: readonly string[] = held.granted

  // ── An invited seat on a public address at a hybrid company ─────────
  //
  // It never pays, bills, signs, awards or runs payroll, whatever its
  // role or a grant says (founder, 2026-11-11). Taken off the permissions
  // here, the one place every route reads them from, so no route has to
  // remember it.
  const ownDomain = domainOfEmail(person.primaryEmail)
  const publicSeat = isLimitedPublicSeat(seatPolicy, !ownDomain || isConsumerDomain(ownDomain))
  if (publicSeat) {
    permissions = narrowForPublicSeat(permissions, PERMISSIONS)
    rolePermissions = narrowForPublicSeat(rolePermissions, PERMISSIONS)
    grantedPermissions = narrowForPublicSeat(grantedPermissions, PERMISSIONS)
  }

  // The seat's company, without the policy fields read beside it.
  const { signInPolicy: _policy, identityProviders: _directories, ...seatCompany } =
    (context.company ?? {}) as NonNullable<typeof context.company> & { signInPolicy?: unknown; identityProviders?: unknown }
  void _policy; void _directories

  const caller: CallerContext = {
    person,
    context: {
      id: context.id,
      type: context.type,
      companyId: context.companyId,
      roleId: context.roleId,
    },
    company: context.company ? (seatCompany as CallerContext['company']) : null,
    permissions,
    rolePermissions,
    grantedPermissions,
    // Where they sit in the firm. Null is firm-wide, and that absence is
    // the deliberate act rather than an oversight.
    orgUnitId: context.orgUnitId,
    // A seat on a REGION unit reads that region and nothing else (lib/region-scope).
    region: context.orgUnit?.kind === REGION_UNIT_KIND ? { unitId: context.orgUnit.id, label: context.orgUnit.name } : null,
    // Staff who do hold a seat somewhere are still staff. Read the same
    // way whether or not they have one, so a route asking `caller.staff`
    // gets one answer rather than two.
    staff: isStaffAddress(person.primaryEmail),
    ...(publicSeat ? { publicSeat: true } : {}),
  }

  const refused = await desklessRefusal(caller, request)
  if (refused) return { caller: null, error: refused }

  const outOfRegion = await regionRefusalFor(caller, request, Boolean(opts.narrowsToRegion))
  if (outOfRegion) return { caller: null, error: outOfRegion }

  return { caller, error: null }
}

/**
 * The one door for a seat that reads one region (founder, 2026-10-27).
 *
 * A route that applies the region scope says so when it asks for the
 * caller; every other route refuses a region seat here, before it reads
 * anything, in a sentence naming the region. Where the route answers about
 * people, the refused read of each person on the client's contracts is
 * logged before the 403, as the desk-less door does.
 *
 * Only asked where there is a request path: the dashboard layout resolves
 * its caller with none, to draw the menu.
 */
async function regionRefusalFor(
  caller: CallerContext,
  request: NextRequest | undefined,
  narrows: boolean
): Promise<NextResponse | null> {
  const path = request?.nextUrl?.pathname
  if (!path || !caller.company || !caller.region) return null
  const verdict = regionDoor({
    path,
    region: caller.region,
    narrows,
    pageName: pageNameOf(path, caller.company.kind as CompanyKind),
  })
  if (verdict.open) return null

  const first = path.replace(/^\/api\/?/, '').split('/')[0]
  if (READS_PEOPLE.includes(first)) {
    const companyId = caller.company.id
    const lines = await prisma.sellContract.findMany({
      where: { OR: [{ clientCompanyId: companyId }, { endClientCompanyId: companyId }] },
      select: { personId: true },
      distinct: ['personId'],
      take: 500,
    })
    await recordRefusal(lines.map((l) => l.personId).filter((id) => id !== caller.person.id), {
      actorPersonId: caller.person.id,
      actorCompanyId: companyId,
      action: 'PROFILE_VIEW',
      allowed: false,
      reason: `${path} at ${caller.company.name} refused to a seat that reads ${caller.region.label} only: ${verdict.says}`,
    })
  }
  return NextResponse.json({ error: { code: 'OUT_OF_REGION', message: verdict.says } }, { status: 403 })
}

/**
 * The one door for a seat that holds no desk (sign-up walk, round four).
 *
 * A colleague seated as Member and not yet given a desk opens the routes
 * behind the links its menu shows it, and the routes the menu marks as
 * answering such a seat themselves; any other route is refused here in a
 * sentence, before it reads anything. The rule and its allowlist are
 * `lib/deskless-door`, read off `lib/nav-table`.
 *
 * Only asked where there is a request to read a path from — the
 * dashboard layout resolves its caller with none, to draw the menu, and
 * is not a route. A firm acting in a client's program-office seat reads
 * under the client's role, so a live seat is never refused here; it is
 * looked up only on the refusing path, which is the rare one.
 *
 * Where the route answers about people, the refusal is a refused read of
 * each person on the firm's contracts, logged before the 403.
 */
async function desklessRefusal(caller: CallerContext, request?: NextRequest): Promise<NextResponse | null> {
  const path = request?.nextUrl?.pathname
  if (!path || !caller.company) return null
  const verdict = desklessDoor({
    path,
    method: request?.method,
    contextType: caller.context.type,
    permissions: caller.permissions,
    isService: caller.isService,
    companyName: caller.company.name,
    companyKind: caller.company.kind,
  })
  if (verdict.open) return null
  if (await seatFor(caller, null)) return null

  // A record by id at another company is a stranger's question, and the
  // door's sentence — ask your owner — is one the owner cannot answer
  // (round seven, problem 8). Answered the way the placement route
  // answers a stranger, with the refused read of whoever the record is
  // about logged before the answer goes out.
  const named = recordNamedBy(path)
  if (named) {
    const at = await recordAt(named.family, named.id, caller.company.id)
    if (!at.here) {
      if (at.people.length > 0) {
        await recordRefusal(at.people.filter((id) => id !== caller.person.id), {
          actorPersonId: caller.person.id,
          actorCompanyId: caller.company.id,
          action: 'PROFILE_VIEW',
          allowed: false,
          reason: `${path} is at another company than ${caller.company.name}, refused to a seat that sees only its own work as not there`,
        })
      }
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: named.strangerSays } }, { status: 404 })
    }
  }

  if (verdict.readsPeople) {
    const companyId = caller.company.id
    const lines = await prisma.sellContract.findMany({
      where: { OR: [{ companyId }, { clientCompanyId: companyId }, { endClientCompanyId: companyId }] },
      select: { personId: true },
      distinct: ['personId'],
      take: 500,
    })
    await recordRefusal(lines.map((l) => l.personId).filter((id) => id !== caller.person.id), {
      actorPersonId: caller.person.id,
      actorCompanyId: companyId,
      action: 'PROFILE_VIEW',
      allowed: false,
      reason: `${path} at ${caller.company.name} refused to a seat that sees only its own work: ${verdict.says}`,
    })
  }
  return NextResponse.json({ error: { code: 'NO_DESK', message: verdict.says } }, { status: 403 })
}

/**
 * Whether a record by id is at this company — a party to it, the way its
 * own route reads parties — and whom it is about. A record that does not
 * exist is not here either, so the two are answered alike.
 */
async function recordAt(family: RecordFamily, id: string, companyId: string): Promise<{ here: boolean; people: string[] }> {
  if (family === 'requirement') {
    const r = await prisma.requirement.findUnique({
      where: { id },
      select: {
        companyId: true, endClientCompanyId: true, payerCompanyId: true,
        invitations: { where: { toCompanyId: companyId }, select: { id: true }, take: 1 },
        submissions: { select: { personId: true, fromCompanyId: true, toCompanyId: true } },
      },
    })
    if (!r) return { here: false, people: [] }
    const here = [r.companyId, r.endClientCompanyId, r.payerCompanyId].includes(companyId)
      || r.invitations.length > 0
      || r.submissions.some((x) => x.fromCompanyId === companyId || x.toCompanyId === companyId)
    return { here, people: [...new Set(r.submissions.map((x) => x.personId))] }
  }
  if (family === 'invoice') {
    const exists = await prisma.invoice.findUnique({
      where: { id },
      select: { invoiceLines: { select: { personId: true } } },
    })
    if (!exists) return { here: false, people: [] }
    const here = (await prisma.invoice.count({ where: { id, ...invoiceBetween(companyId) } })) > 0
    return { here, people: [...new Set(exists.invoiceLines.map((l) => l.personId).filter((p): p is string => !!p))] }
  }
  const t = await prisma.timesheet.findUnique({
    where: { id },
    select: { personId: true, sellContract: { select: { companyId: true, clientCompanyId: true, endClientCompanyId: true } } },
  })
  if (!t) return { here: false, people: [] }
  // A week is on every rung of its chain: the line it was filed on, or
  // any line of the same person that names this company.
  const c = t.sellContract
  const here = [c.companyId, c.clientCompanyId, c.endClientCompanyId].includes(companyId)
    || (await prisma.sellContract.count({
      where: { personId: t.personId, OR: [{ companyId }, { clientCompanyId: companyId }, { endClientCompanyId: companyId }] },
    })) > 0
  return { here, people: [t.personId] }
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
