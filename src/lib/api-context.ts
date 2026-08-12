import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

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
  } | null
  permissions: readonly string[]
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
  return session?.user?.email ?? null
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
  // ── Dev bypass — resolve founder context without OAuth ──
  // Set DEV_BYPASS_AUTH=email in .env.local for development screenshots.
  // NEVER enable in production. Removed before deploy.
  const devBypass = process.env.DEV_BYPASS_AUTH
  let sessionEmail: string | null = null

  if (devBypass && process.env.NODE_ENV === 'development') {
    sessionEmail = devBypass
  } else {
    const session = await getServerSession(authOptions)
    sessionEmail = session?.user?.email ?? null
  }

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

  const context = contextId
    ? await prisma.context.findFirst({
        where: {
          id: contextId,
          personId: person.id,
          revokedAt: null,
        },
        include: {
          company: { select: { id: true, name: true, slug: true, kind: true } },
          role: { select: { id: true, name: true, permissions: true } },
        },
      })
    : await prisma.context.findFirst({
        where: {
          personId: person.id,
          revokedAt: null,
        },
        include: {
          company: { select: { id: true, name: true, slug: true, kind: true } },
          role: { select: { id: true, name: true, permissions: true } },
        },
        orderBy: { grantedAt: 'desc' },
      })

  if (!context) {
    return {
      caller: null,
      error: NextResponse.json(
        { error: { code: 'NO_CONTEXT', message: 'No active context. You must belong to a company.' } },
        { status: 403 }
      ),
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
    },
    error: null,
  }
}
