import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { staffOnly } from '@/lib/seat'
import { prisma } from '@/lib/db'
import { historyOf, isKnownEventType, EVENT_TYPES, type EventType } from '@/lib/events'

/**
 * GET /api/events
 *
 * Reading the log. Three ways to ask, because three different people ask:
 *
 *   ?subjectType=SellContract&subjectId=x   one thing's whole history
 *   ?after=40213&types=invoice.paid         a consumer catching up
 *   (nothing)                               the company's recent activity
 *
 * Always scoped to the caller's company. The event log is the one place
 * where a scoping mistake leaks everything at once, so the company filter
 * is applied here and not left to the query string.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'The activity log')
  if (notStaff) return notStaff

  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'The event log belongs to a company' } },
      { status: 403 }
    )
  }

  const url = request.nextUrl
  const subjectType = url.searchParams.get('subjectType')
  const subjectId = url.searchParams.get('subjectId')
  const afterRaw = url.searchParams.get('after')
  const typesRaw = url.searchParams.get('types')
  const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') ?? '100', 10)))

  // ── One thing's history ────────────────────────────────────────────
  if (subjectType && subjectId) {
    const rows = await historyOf(subjectType, subjectId, limit)
    // historyOf does not filter by company, because it answers "what
    // happened to this", so the check happens here instead.
    const mine = await prisma.event.findFirst({
      where: { subjectType, subjectId, companyId: caller.company.id },
      select: { id: true },
    })
    if (!mine) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'No history here for you' } },
        { status: 404 }
      )
    }
    return NextResponse.json({
      data: {
        subjectType,
        subjectId,
        events: rows.map((e) => ({
          id: e.id,
          type: e.type,
          payload: e.payload,
          actorPersonId: e.actorPersonId,
          actorKind: e.actorKind,
          occurredAt: e.occurredAt.toISOString(),
        })),
      },
    })
  }

  // ── The stream ─────────────────────────────────────────────────────
  // A typo in a type name is the failure that presents as "the integration
  // receives nothing", so unknown names are refused rather than ignored.
  let types: EventType[] | null = null
  if (typesRaw) {
    const asked = typesRaw.split(',').map((t) => t.trim()).filter(Boolean)
    const unknown = asked.filter((t) => !isKnownEventType(t))
    if (unknown.length > 0) {
      return NextResponse.json(
        {
          error: {
            code: 'UNKNOWN_EVENT_TYPE',
            message: `Not an event this system emits: ${unknown.join(', ')}`,
            field: 'types',
            known: EVENT_TYPES,
          },
        },
        { status: 422 }
      )
    }
    types = asked as EventType[]
  }

  let after = BigInt(0)
  if (afterRaw) {
    try {
      after = BigInt(afterRaw)
    } catch {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: '`after` is a sequence number', field: 'after' } },
        { status: 422 }
      )
    }
  }

  const events = await prisma.event.findMany({
    where: {
      companyId: caller.company.id,
      seq: { gt: after },
      ...(types ? { type: { in: types } } : {}),
    },
    orderBy: { seq: 'asc' },
    take: limit,
    select: {
      seq: true,
      type: true,
      subjectType: true,
      subjectId: true,
      payload: true,
      actorKind: true,
      actorPerson: { select: { id: true, name: true } },
      occurredAt: true,
    },
  })

  return NextResponse.json({
    data: {
      events: events.map((e) => ({
        // Serialised as a string: a sequence number outgrows a JavaScript
        // number eventually, and a consumer silently losing precision on
        // its cursor is a bug that shows up years later.
        seq: e.seq.toString(),
        type: e.type,
        subjectType: e.subjectType,
        subjectId: e.subjectId,
        payload: e.payload,
        actorKind: e.actorKind,
        actor: e.actorPerson ? { id: e.actorPerson.id, name: e.actorPerson.name } : null,
        occurredAt: e.occurredAt.toISOString(),
      })),
      // Null means caught up. A cursor back means ask again now, not at
      // the next poll.
      nextCursor: events.length === limit ? events[events.length - 1].seq.toString() : null,
    },
  })
}
