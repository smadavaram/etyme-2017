import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/db'

/**
 * GET /api/blacklist
 *
 * BUILD.md §6.10: "black_lister — filters candidates and companies out of
 * search, feeds and contracts."
 *
 * LEGACY_RULES.md §8.1: "black_list — blocks candidates or companies from
 * appearing in search, feeds or contracts for that company."
 *
 * Returns the company's active blacklist entries. Lifted or expired entries
 * are excluded by default unless ?includeInactive=true.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  if (!hasPermission(caller.permissions, 'consultants.write')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Requires consultants.write permission' } },
      { status: 403 }
    )
  }

  const url = request.nextUrl
  const includeInactive = url.searchParams.get('includeInactive') === 'true'
  const targetType = url.searchParams.get('targetType') // PERSON | COMPANY

  const where: any = { companyId: caller.company?.id }

  if (!includeInactive) {
    where.liftedAt = null
    where.OR = [
      { expiresAt: null },                    // permanent — never expires
      { expiresAt: { gt: new Date() } },      // temporary — not yet expired
    ]
  }

  if (targetType) {
    where.targetType = targetType.toUpperCase()
  }

  const entries = await prisma.blacklist.findMany({
    where,
    orderBy: { blockedAt: 'desc' },
  })

  // Count active entries
  const activeCount = entries.filter(
    (e) => !e.liftedAt && (!e.expiresAt || e.expiresAt > new Date())
  ).length

  return NextResponse.json({
    data: {
      blacklist: entries.map((e) => ({
        id: e.id,
        targetType: e.targetType,
        targetId: e.targetId,
        reason: e.reason,
        blockedById: e.blockedById,
        blockedAt: e.blockedAt.toISOString(),
        expiresAt: e.expiresAt?.toISOString() ?? null,
        liftedAt: e.liftedAt?.toISOString() ?? null,
        liftedById: e.liftedById,
        liftReason: e.liftReason,
        isActive: !e.liftedAt && (!e.expiresAt || e.expiresAt > new Date()),
      })),
      activeCount,
    },
  })
}

/**
 * POST /api/blacklist
 *
 * Add a person or company to the blacklist, or lift an existing entry.
 *
 * Actions:
 *   - { action: 'ADD', targetType, targetId, reason, expiresAt? }
 *   - { action: 'LIFT', blacklistId, liftReason }
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  if (!hasPermission(caller.permissions, 'consultants.write')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Requires consultants.write permission' } },
      { status: 403 }
    )
  }

  const body = await request.json()
  const { action } = body

  if (action === 'ADD') {
    return handleAdd(body, caller)
  } else if (action === 'LIFT') {
    return handleLift(body, caller)
  } else {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'action must be ADD or LIFT' } },
      { status: 422 }
    )
  }
}

// ── Add to blacklist ───────────────────────────────

async function handleAdd(body: any, caller: any) {
  const { targetType, targetId, reason, expiresAt } = body

  if (!targetType || !targetId || !reason) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'targetType (PERSON|COMPANY), targetId, and reason are required' } },
      { status: 422 }
    )
  }

  if (!['PERSON', 'COMPANY'].includes(targetType.toUpperCase())) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'targetType must be PERSON or COMPANY' } },
      { status: 422 }
    )
  }

  // Validate target exists
  if (targetType.toUpperCase() === 'PERSON') {
    const person = await prisma.person.findUnique({ where: { id: targetId } })
    if (!person) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Person not found' } },
        { status: 404 }
      )
    }
  } else {
    const company = await prisma.company.findUnique({ where: { id: targetId } })
    if (!company) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Company not found' } },
        { status: 404 }
      )
    }
  }

  // Cannot blacklist your own company
  if (targetType.toUpperCase() === 'COMPANY' && targetId === caller.company?.id) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Cannot blacklist your own company' } },
      { status: 422 }
    )
  }

  // Check for existing active entry (unique constraint will catch it,
  // but we provide a better error message)
  const existing = await prisma.blacklist.findUnique({
    where: {
      companyId_targetType_targetId: {
        companyId: caller.company.id,
        targetType: targetType.toUpperCase(),
        targetId,
      },
    },
  })

  if (existing && !existing.liftedAt) {
    return NextResponse.json(
      { error: { code: 'DUPLICATE', message: 'This target is already blacklisted' } },
      { status: 409 }
    )
  }

  // If there's a lifted entry, delete it so we can create a fresh one
  if (existing && existing.liftedAt) {
    await prisma.blacklist.delete({ where: { id: existing.id } })
  }

  const entry = await prisma.blacklist.create({
    data: {
      companyId: caller.company.id,
      targetType: targetType.toUpperCase(),
      targetId,
      reason,
      blockedById: caller.person.id,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  })

  // Write automation log
  await prisma.automationLog.create({
    data: {
      companyId: caller.company?.id ?? targetId,
      action: 'BLACKLIST_ADD',
      summary: `${targetType.toUpperCase()} ${targetId} blacklisted: ${reason}`,
      reason: `Blacklist entry created via API`,
      reversible: true,
      payload: { blacklistId: entry.id, targetType: targetType.toUpperCase(), targetId },
    },
  })

  return NextResponse.json(
    {
      data: {
        blacklist: {
          id: entry.id,
          targetType: entry.targetType,
          targetId: entry.targetId,
          blockedAt: entry.blockedAt.toISOString(),
        },
      },
    },
    { status: 201 }
  )
}

// ── Lift from blacklist ─────────────────────────────

async function handleLift(body: any, caller: any) {
  const { blacklistId, liftReason } = body

  if (!blacklistId || !liftReason) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'blacklistId and liftReason are required' } },
      { status: 422 }
    )
  }

  const entry = await prisma.blacklist.findFirst({
    where: { id: blacklistId, companyId: caller.company?.id },
  })

  if (!entry) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Blacklist entry not found' } },
      { status: 404 }
    )
  }

  if (entry.liftedAt) {
    return NextResponse.json(
      { error: { code: 'ALREADY_LIFTED', message: 'This blacklist entry has already been lifted' } },
      { status: 409 }
    )
  }

  const updated = await prisma.blacklist.update({
    where: { id: blacklistId },
    data: {
      liftedAt: new Date(),
      liftedById: caller.person.id,
      liftReason,
    },
  })

  // Write automation log
  await prisma.automationLog.create({
    data: {
      companyId: caller.company?.id ?? entry.targetId,
      action: 'BLACKLIST_LIFT',
      summary: `Blacklist lifted for ${entry.targetType} ${entry.targetId}: ${liftReason}`,
      reason: `Blacklist entry lifted via API`,
      reversible: false,
      payload: { blacklistId: entry.id, targetType: entry.targetType, targetId: entry.targetId },
    },
  })

  return NextResponse.json({
    data: {
      blacklist: {
        id: updated.id,
        liftedAt: updated.liftedAt!.toISOString(),
        liftReason: updated.liftReason,
      },
    },
  })
}
