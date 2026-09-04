import { NextRequest, NextResponse } from 'next/server'
import { getSessionEmail } from '@/lib/api-context'
import { prisma } from '@/lib/db'

/**
 * GET /api/me
 *
 * Returns the authenticated person with their credentials, contexts,
 * and active context. Mirrors BUILD.md §3 — Auth and identity.
 *
 * Honours the same `x-context-id` header as getCallerContext, so the
 * shell and the data agree on which company the caller is acting as.
 * Without it a person holding contexts at two companies could see one
 * company's navigation wrapped around the other company's records.
 *
 * Field filtering: payRate, billRate, and cost fields are stripped
 * unless the caller holds the required permission (BUILD.md §2).
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
            select: { id: true, name: true, slug: true, kind: true },
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
        company: ctx.company,
        role: ctx.role
          ? { id: ctx.role.id, name: ctx.role.name, permissions: ctx.role.permissions }
          : null,
        grantedAt: ctx.grantedAt.toISOString(),
      })),
      activeContext: activeContext
        ? {
            id: activeContext.id,
            type: activeContext.type,
            company: activeContext.company,
            role: activeContext.role
              ? { id: activeContext.role.id, name: activeContext.role.name, permissions: activeContext.role.permissions }
              : null,
          }
        : null,
    },
  })
}
