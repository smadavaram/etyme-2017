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
import { peopleKnownTo, firmsKnownTo, notKnownHere } from './known'

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

  // ── Names, not ids ───────────────────────────────────────────────
  //
  // The rows carry `targetId` and `blockedById` and nothing else, and
  // the screen printed them truncated — `cm8k3p…9x2f` — under a column
  // headed "Subject". A do-not-return list whose subject nobody can
  // read is a list nobody can check, which is worse than not having
  // one: it is a compliance record about a named person that does not
  // name them.
  const [people, companies] = await Promise.all([
    prisma.person.findMany({
      where: {
        id: {
          in: [
            ...entries.filter((e) => e.targetType === 'PERSON').map((e) => e.targetId),
            ...entries.map((e) => e.blockedById),
            ...entries.map((e) => e.liftedById).filter((x): x is string => Boolean(x)),
          ],
        },
      },
      select: { id: true, name: true },
    }),
    prisma.company.findMany({
      where: { id: { in: entries.filter((e) => e.targetType === 'COMPANY').map((e) => e.targetId) } },
      select: { id: true, name: true },
    }),
  ])
  const nameOf = new Map<string, string>([
    ...people.map((p) => [p.id, p.name] as const),
    ...companies.map((c) => [c.id, c.name] as const),
  ])

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
        // Null rather than the id where the row has been deleted since:
        // "a number nobody can stand behind" applies to a name too, and
        // a screen saying "no longer on Etyme" is honest where an id is
        // merely unreadable.
        targetName: nameOf.get(e.targetId) ?? null,
        reason: e.reason,
        blockedById: e.blockedById,
        blockedByName: nameOf.get(e.blockedById) ?? null,
        liftedByName: e.liftedById ? nameOf.get(e.liftedById) ?? null : null,
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
      { error: { code: 'VALIDATION', message: 'Say whether you are adding somebody to the do-not-return list or lifting a bar.' } },
      { status: 422 }
    )
  }
}

// ── Add to blacklist ───────────────────────────────

async function handleAdd(body: any, caller: any) {
  const { targetType, targetId, reason, expiresAt } = body

  if (!targetType || !targetId || !reason) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Pick the person or the firm, and say why. The reason is what somebody reading ' +
            'this in a year has to go on.',
          field: !targetId ? 'targetId' : 'reason',
        },
      },
      { status: 422 }
    )
  }

  if (!['PERSON', 'COMPANY'].includes(targetType.toUpperCase())) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'A bar is against a person or against a firm. Choose one.', field: 'targetType' } },
      { status: 422 }
    )
  }

  const target = targetType.toUpperCase() as Target

  // Who may place the bar depends on what is being barred. A recruiter
  // may keep somebody off the people they put forward; taking a whole
  // firm off the supplier panel is procurement's act, not theirs.
  if (!mayBar(caller.permissions, target)) return refuse(cannotBar(target))

  // ── Somebody this company has actually dealt with ─────────────────
  //
  // This checked only that the row existed somewhere on Etyme, which
  // meant any company could write a permanent compliance record naming
  // any person or any firm on the platform — including people it had
  // never met. See `./known` for why that is not a filing mistake.
  const known = target === 'PERSON'
    ? await peopleKnownTo(caller.company.id)
    : await firmsKnownTo(caller.company.id)
  const match = known.find((k) => k.id === targetId)

  if (!match) {
    const row = target === 'PERSON'
      ? await prisma.person.findUnique({ where: { id: targetId }, select: { name: true } })
      : await prisma.company.findUnique({ where: { id: targetId }, select: { name: true } })

    if (!row) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: target === 'PERSON'
              ? 'There is nobody on Etyme by that name. Pick somebody from the list — it holds ' +
                'everybody this company has dealt with.'
              : 'There is no such firm on Etyme. Pick one from the list — it holds every firm ' +
                'this company has traded with.',
            field: 'targetId',
          },
        },
        { status: 404 }
      )
    }

    return NextResponse.json(
      {
        error: {
          code: 'NOT_OURS',
          message: notKnownHere(target, row.name, caller.company.name),
          field: 'targetId',
        },
      },
      { status: 403 }
    )
  }

  // Cannot blacklist your own company
  if (target === 'COMPANY' && targetId === caller.company?.id) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'You cannot put your own company on its own do-not-return list.',
          field: 'targetId',
        },
      },
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
      {
        error: {
          code: 'DUPLICATE',
          message: `${match.name} is already on the do-not-return list at ${caller.company.name}. ` +
            'Lift the existing bar first if the reason has changed.',
          field: 'targetId',
        },
      },
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
      summary: `${match.name} added to the do-not-return list at ${caller.company.name}: ${reason}`,
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
      {
        error: {
          code: 'VALIDATION',
          message: 'Say which bar you are lifting and why. Letting somebody back is a decision ' +
            'somebody will ask about.',
          field: !blacklistId ? 'blacklistId' : 'liftReason',
        },
      },
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
      { error: { code: 'NOT_FOUND', message: 'There is no such bar on this company’s do-not-return list.' } },
      { status: 404 }
    )
  }

  const target = entry.targetType.toUpperCase() as Target
  if (!mayBar(caller.permissions, target)) return refuse(cannotLift(target))

  // The trail says who was let back in, by name. An id in an automation
  // log is a row nobody can audit without a second query.
  const subject = target === 'PERSON'
    ? await prisma.person.findUnique({ where: { id: entry.targetId }, select: { name: true } })
    : await prisma.company.findUnique({ where: { id: entry.targetId }, select: { name: true } })
  const subjectName = subject?.name ?? null

  if (entry.liftedAt) {
    return NextResponse.json(
      { error: { code: 'ALREADY_LIFTED', message: 'That bar has already been lifted. Nobody is being kept out by it.' } },
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
      summary: `${subjectName ?? entry.targetId} taken off the do-not-return list at ${caller.company.name}: ${liftReason}`,
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
