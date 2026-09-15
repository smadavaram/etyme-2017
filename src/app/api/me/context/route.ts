import { NextRequest, NextResponse } from 'next/server'
import { getSessionEmail } from '@/lib/api-context'
import { prisma } from '@/lib/db'

/**
 * POST /api/me/context
 *
 * Switch active context. BUILD.md §3 — Auth and identity.
 *
 * A person may have multiple contexts:
 *   - EMPLOYEE at Company A (owner)
 *   - CONSULTANT at Company B (placed there)
 *   - PARTNER at Company C (network partnership)
 *
 * Switching context changes what they see and what permissions apply.
 * The active context is stored in the JWT and refreshed on switch.
 */
export async function POST(request: NextRequest) {
  const email = await getSessionEmail()

  if (!email) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  const body = await request.json()
  const { contextId } = body

  if (!contextId || typeof contextId !== 'string') {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'contextId is required',
          field: 'contextId',
        },
      },
      { status: 422 }
    )
  }

  // Find the person by their email
  const person = await prisma.person.findUnique({
    where: { primaryEmail: email },
    select: { id: true },
  })

  if (!person) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Person not found' } },
      { status: 404 }
    )
  }

  // Verify this context belongs to the authenticated person and is not revoked
  const context = await prisma.context.findFirst({
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

  if (!context) {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_CONTEXT',
          message: 'Context not found, does not belong to you, or has been revoked',
        },
      },
      { status: 403 }
    )
  }

  // Write AccessLog for context switch — every data access is logged
  await prisma.accessLog.create({
    data: {
      subjectId: person.id,
      actorPersonId: person.id,
      actorCompanyId: context.companyId,
      action: 'CONTEXT_SWITCH',
      allowed: true,
      reason: `Switched to ${context.type} context at ${context.company?.name ?? 'unknown'}`,
    },
  })

  return NextResponse.json({
    data: {
      activeContext: {
        id: context.id,
        type: context.type,
        company: context.company,
        role: context.role
          ? {
              id: context.role.id,
              name: context.role.name,
              permissions: context.role.permissions,
            }
          : null,
      },
      message: 'Context switched',
    },
  })
}

/**
 * GET /api/me/context
 *
 * List all active (non-revoked) contexts for the authenticated person.
 */
export async function GET() {
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
      contexts: {
        where: { revokedAt: null },
        include: {
          company: { select: { id: true, name: true, slug: true, kind: true } },
          role: { select: { id: true, name: true, permissions: true } },
        },
        orderBy: { grantedAt: 'desc' },
      },
    },
  })

  if (!person) {
    return NextResponse.json({
      data: { contexts: [] },
    })
  }

  return NextResponse.json({
    data: {
      person: {
        id: person.id,
        name: person.name,
        email: person.primaryEmail,
      },
      contexts: person.contexts.map((ctx) => ({
        id: ctx.id,
        type: ctx.type,
        company: ctx.company,
        role: ctx.role
          ? { id: ctx.role.id, name: ctx.role.name, permissions: ctx.role.permissions }
          : null,
        grantedAt: ctx.grantedAt.toISOString(),
      })),
    },
  })
}
