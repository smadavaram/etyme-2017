import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { logBulkAccess } from '@/lib/access-log'
import {
  mayRead, mayBar, stillStands,
  CANNOT_READ, NO_COMPANY, cannotBar, cannotLift,
  type Target,
} from './desks'

/** Every refusal on this route says what is missing and what to do. */
function refuse(message: string) {
  return NextResponse.json({ error: { code: 'FORBIDDEN', message } }, { status: 403 })
}

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

  // A consultant on somebody's bench is the subject of these records, not
  // a member of the staff who keep them.
  const notStaff = staffOnly(caller, 'The do-not-return list')
  if (notStaff) return notStaff

  // Asked before the query, not assumed by it. See NO_COMPANY.
  const companyId = caller.company?.id
  if (!companyId) return refuse(NO_COMPANY)

  if (!mayRead(caller.permissions)) return refuse(CANNOT_READ)

  const url = request.nextUrl
  const includeInactive = url.searchParams.get('includeInactive') === 'true'
  const targetType = url.searchParams.get('targetType') // PERSON | COMPANY

  const where: any = { companyId }

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

  const now = new Date()

  // Every read of another person's data leaves a trail, refusals
  // included. A refused request above names nobody, so there is nobody
  // to log it against; this one hands back a page of named people and
  // what was held against them, which is exactly the read the trail
  // exists for.
  logBulkAccess(
    entries.filter((e) => e.targetType === 'PERSON').map((e) => e.targetId),
    {
      actorPersonId: caller.person.id,
      actorCompanyId: companyId,
      action: 'DNR_VIEW',
      reason: `Do-not-return list at ${caller.company!.name}`,
    }
  )

  const activeCount = entries.filter((e) => stillStands(e, now)).length

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
        isActive: stillStands(e, now),
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

  const notStaff = staffOnly(caller, 'The do-not-return list')
  if (notStaff) return notStaff

  if (!caller.company?.id) return refuse(NO_COMPANY)

  // The gate is per half of the list and is checked inside each handler,
  // because barring a person and barring a firm are different decisions
  // taken at different desks. See ./desks.
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

  const target = targetType.toUpperCase() as Target

  // Who may place the bar depends on what is being barred. A recruiter
  // may keep somebody off the people they put forward; taking a whole
  // firm off the supplier panel is procurement's act, not theirs.
  if (!mayBar(caller.permissions, target)) return refuse(cannotBar(target))

  // Validate target exists
  if (target === 'PERSON') {
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
  if (target === 'COMPANY' && targetId === caller.company?.id) {
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
        targetType: target,
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
      targetType: target,
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
      summary: `${target} ${targetId} blacklisted: ${reason}`,
      reason: `Blacklist entry created via API`,
      reversible: true,
      payload: { blacklistId: entry.id, targetType: target, targetId },
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

  // Scoped to the caller's own company on the way in, so a bar at
  // another company is not found rather than refused — one company's
  // do-not-return list is never read by another, by id or otherwise.
  const entry = await prisma.blacklist.findFirst({
    where: { id: blacklistId, companyId: caller.company?.id },
  })

  if (!entry) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Blacklist entry not found' } },
      { status: 404 }
    )
  }

  const target = entry.targetType.toUpperCase() as Target
  if (!mayBar(caller.permissions, target)) return refuse(cannotLift(target))

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
