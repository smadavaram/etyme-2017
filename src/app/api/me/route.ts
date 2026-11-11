import { NextRequest, NextResponse } from 'next/server'
import { getSessionEmail, getCallerContext, seatCompanyPolicy } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { seatGrantFacts, limitForPublicSeat, type SeatGrantFacts } from './grants'

/**
 * GET /api/me
 *
 * Returns the authenticated person with their credentials, contexts,
 * and active context. Mirrors BUILD.md §3 — Auth and identity.
 *
 * Honors the same `x-context-id` header as getCallerContext, so the
 * shell and the data agree on which company the caller is acting as.
 * Without it a person holding contexts at two companies could see one
 * company's navigation wrapped around the other company's records.
 *
 * Field filtering: payRate, billRate, and cost fields are stripped
 * unless the caller holds the required permission (BUILD.md §2).
 *
 * Each seat carries what a grant gave it (founder, 2026-11-08): `role` is
 * the role's own permissions as before; `permissions` is what the seat
 * holds, the role's and every grant's that opens the door, the same list
 * `hasPermission` is asked over; `granted` is the grants' part alone; and
 * `grants` says each one's reach, in words, so a screen never reads a team
 * grant as the whole company's.
 */
export async function GET(request: NextRequest) {
  const email = await getSessionEmail()

  if (!email) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  const person = await prisma.person.findUnique({
    where: { primaryEmail: email },
    include: {
      credentials: {
        select: {
          id: true,
          provider: true,
          email: true,
          lastUsedAt: true,
          createdAt: true,
        },
      },
      contexts: {
        where: { revokedAt: null },
        include: {
          company: {
            select: {
              id: true, name: true, slug: true, kind: true, homeCurrency: true,
              // How the company's people sign in, read the way the one
              // caller check reads it (seatCompanyPolicy), so an invited
              // public-address seat is narrowed here as it is on every route.
              signInPolicy: { select: { mode: true } },
              identityProviders: { where: { enabled: true }, select: { issuer: true } },
            },
          },
          role: {
            select: { id: true, name: true, permissions: true },
          },
        },
        orderBy: { grantedAt: 'desc' },
      },
    },
  })

  if (!person) {
    // Person record doesn't exist yet — happens before company creation.
    // Return session info so the frontend knows they're authenticated.
    return NextResponse.json({
      data: {
        person: {
          id: null,
          email,
          name: email.split('@')[0],
        },
        credentials: [],
        contexts: [],
        activeContext: null,
      },
    })
  }

  // Active context: the one named by x-context-id when it belongs to this
  // person, otherwise the most recently granted. Same rule as getCallerContext.
  const requestedContextId = request.headers.get('x-context-id')
  const activeContext =
    (requestedContextId
      ? person.contexts.find((c) => c.id === requestedContextId)
      : null) ?? person.contexts[0] ?? null

  // What the Owner gave each seat beyond its role (2026-11-08), so a screen
  // that draws a link or a button from here sees a granted permission the
  // way the one caller check does. A view of reach, never more: only the
  // person's own seats, only grants at that seat's own company.
  const grantFacts = new Map<string, { facts: SeatGrantFacts; rolePermissions: readonly string[]; limited: string | null }>()
  await Promise.all(
    person.contexts.map(async (c) => {
      const rolePermissions = (c.role?.permissions as string[]) ?? []
      const facts = await seatGrantFacts({ companyId: c.companyId, roleId: c.roleId, contextId: c.id }, rolePermissions)
      // An invited seat on a public address at a hybrid company is told only
      // what its routes will honor (founder, 2026-11-11), by the caller
      // check's own two functions.
      grantFacts.set(c.id, limitForPublicSeat(facts, rolePermissions, seatCompanyPolicy(c.company as any), person.primaryEmail))
    })
  )
  const empty: SeatGrantFacts = { permissions: [], menuPermissions: [], granted: [], grants: [], mayGiveAccess: false }
  const seatFacts = (id: string) => {
    const f = grantFacts.get(id)
    return f ? (f.limited ? { ...f.facts, limited: f.limited } : f.facts) : empty
  }
  const roleOf = (ctx: (typeof person.contexts)[number]) =>
    ctx.role
      ? { id: ctx.role.id, name: ctx.role.name, permissions: grantFacts.get(ctx.id)?.rolePermissions ?? ctx.role.permissions }
      : null
  // The seat's company, without the policy fields read beside it.
  const companyOf = (ctx: (typeof person.contexts)[number]) => {
    if (!ctx.company) return ctx.company
    const { signInPolicy: _p, identityProviders: _d, ...company } = ctx.company
    void _p; void _d
    return company
  }

  return NextResponse.json({
    data: {
      person: {
        id: person.id,
        email: person.primaryEmail,
        name: person.name,
        createdAt: person.createdAt.toISOString(),
      },
      credentials: person.credentials.map((c) => ({
        id: c.id,
        provider: c.provider,
        email: c.email,
        lastUsedAt: c.lastUsedAt?.toISOString() ?? null,
      })),
      contexts: person.contexts.map((ctx) => ({
        id: ctx.id,
        type: ctx.type,
        company: companyOf(ctx),
        role: roleOf(ctx),
        ...seatFacts(ctx.id),
        grantedAt: ctx.grantedAt.toISOString(),
      })),
      activeContext: activeContext
        ? {
            id: activeContext.id,
            type: activeContext.type,
            company: companyOf(activeContext),
            role: roleOf(activeContext),
            ...seatFacts(activeContext.id),
          }
        : null,
    },
  })
}

/**
 * PATCH /api/me — the few things about you that are yours to set.
 *
 * Deliberately not /api/settings. That is the company's: address,
 * approval rules, cost centers, the holiday calendar, all of it behind
 * settings.manage so one admin changes them for everybody. Where you are
 * is not that. It needs no permission beyond being you, and putting it
 * behind settings.manage would mean either an admin sets your timezone
 * or you can edit the company's holidays.
 *
 * One field today. The rest of user preferences — digests, channels,
 * what you want to hear about — is deferred, and this is the door they
 * will come through when they arrive.
 */
export async function PATCH(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const body = await request.json().catch(() => ({}))

  if (!('timezone' in body)) {
    return NextResponse.json(
      { error: { code: 'NOTHING_TO_DO', message: 'Nothing to change.' } },
      { status: 422 }
    )
  }

  const zone = body.timezone === null ? null : String(body.timezone).trim()

  // Checked against the runtime rather than a list we maintain. A typo
  // saved here reappears as a wrong date in somebody's calendar invite
  // weeks later, and by then nobody connects the two.
  if (zone) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: zone })
    } catch {
      return NextResponse.json(
        {
          error: {
            code: 'UNKNOWN_ZONE',
            message: `"${zone}" is not a timezone this system knows. Use a name like "America/New_York" or "Asia/Kolkata".`,
            field: 'timezone',
          },
        },
        { status: 422 }
      )
    }
  }

  const saved = await prisma.person.update({
    where: { id: caller.person.id },
    data: { timezone: zone || null },
    select: { id: true, timezone: true },
  })

  return NextResponse.json({
    data: {
      timezone: saved.timezone,
      message: saved.timezone
        ? `Times will be shown to you in ${saved.timezone}.`
        : 'Cleared. Times will be shown to you in UTC, and said so.',
    },
  })
}
