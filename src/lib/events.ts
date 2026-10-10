import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'
import { readMarketEvent, MARKET_TYPE_PREFIX } from '@/lib/public-site/market-events'

/**
 * Writing to the event log.
 *
 * One function, `emit`. There is deliberately no update and no delete —
 * an append-only log that something can rewrite is worth nothing, and the
 * cheapest way to keep it append-only is to never write the code that
 * would not be.
 *
 * Fire-and-forget, like notify() and logAccess(). A failure to record an
 * event must never fail the thing that happened; an unrecorded award is
 * bad, an award that did not happen because the log was busy is worse.
 */

/**
 * Every event the system can emit.
 *
 * Past tense, dotted, subject first. The list is a union rather than a
 * free string so that adding an event is a deliberate act and a consumer
 * can be told what to expect — a webhook subscriber choosing event types
 * from a drop-down is reading this.
 *
 * Adding to this list is cheap. Renaming one is not: an outside system is
 * filtering on the name, so a rename is a breaking change to somebody
 * else's integration. Add a new name and stop emitting the old one.
 */
export const EVENT_TYPES = [
  // Company and access
  'company.created',
  'company.member_joined',
  'access.granted',
  'access.revoked',

  // Demand
  'requisition.raised',
  'requisition.approved',
  'requisition.rejected',
  'requirement.published',
  'invitation.sent',
  'invitation.responded',

  // Supply
  'submission.created',
  'submission.withdrawn',
  'submission.awarded',
  // The acceptance gap reconstructable from the log even before the
  // delivery columns exist — and a client sitting on a deliverable for
  // three weeks is exactly the thing worth a nudge.
  'milestone.delivered',
  'milestone.accepted',
  'milestone.rejected',
  'agreement.signed',
  'submission.rejected',
  'submission.forwarded',
  'resume.uploaded',

  // Representation — who may put a person in front of a client
  'representation.requested',
  'representation.taken',
  'representation.released',

  // The wall around a firm that both delivers and buys
  'network.viewed',
  'network.refused',

  // Contracts
  'contract.created',
  'contract.extended',
  'contract.rolled_off',
  'rate.amendment_proposed',
  'rate.amendment_approved',
  'rate.amendment_rejected',

  // Money
  'timesheet.submitted',
  'timesheet.approved',
  'timesheet.rejected',
  'invoice.generated',
  'invoice.submitted',
  'invoice.matched',
  'invoice.match_failed',
  'invoice.paid',
  'purchase_order.raised',
  'purchase_order.closed',

  // Governance. The rules themselves change, and a control that can be
  // changed without trace is not a control.
  'governance.rule_created',
  'governance.rule_changed',
  'governance.rule_deactivated',

  // Compliance
  'verification.recorded',
  'verification.expired',
  'tenure.limit_reached',
  'packet.requested',
  'packet.item_received',
  'packet.completed',
] as const

export type EventType = (typeof EVENT_TYPES)[number]

/** PERSON did it, AUTOMATION did it unprompted, SERVICE is a machine caller. */
export type ActorKind = 'PERSON' | 'AUTOMATION' | 'SERVICE'

export interface EmitParams {
  type: EventType
  /** The tenant. Null only for events that belong to nobody yet. */
  companyId: string | null
  /** What it happened to — model name and id. */
  subjectType: string
  subjectId: string
  /** Enough facts to act on without reading the source row. */
  payload: Record<string, unknown>
  /** Who did it. Omit when nothing did — a cycle falling due has no actor. */
  actorPersonId?: string | null
  actorKind?: ActorKind
}

/**
 * Record that something happened.
 *
 * Never awaited by callers and never throws. If this cannot write, the
 * error goes to the console and the caller carries on — the alternative
 * is a logging failure taking down an invoice run.
 */
export function emit(params: EmitParams): Promise<{ id: string } | null> {
  return prisma.event
    .create({
      data: {
        type: params.type,
        companyId: params.companyId,
        subjectType: params.subjectType,
        subjectId: params.subjectId,
        payload: params.payload as any,
        actorPersonId: params.actorPersonId ?? null,
        actorKind: params.actorKind ?? (params.actorPersonId ? 'PERSON' : 'AUTOMATION'),
      },
      select: { id: true },
    })
    .catch((err) => {
      console.error(`[Events] Could not record ${params.type}:`, err)
      return null
    })
}

/**
 * Everything that happened to one thing, oldest first.
 *
 * The reason `subjectType` and `subjectId` are indexed together: "show me
 * this contract's history" is the question a support conversation opens
 * with, and it should not be a table scan.
 */
export async function historyOf(
  subjectType: string,
  subjectId: string,
  limit = 200
): Promise<
  {
    id: string
    type: string
    payload: unknown
    actorPersonId: string | null
    actorKind: string
    occurredAt: Date
  }[]
> {
  return prisma.event.findMany({
    where: { subjectType, subjectId },
    orderBy: { seq: 'asc' },
    take: limit,
    select: {
      id: true,
      type: true,
      payload: true,
      actorPersonId: true,
      actorKind: true,
      occurredAt: true,
    },
  })
}

/**
 * The stream, for a consumer catching up.
 *
 * `after` is a sequence number, not a timestamp. Two events written in the
 * same millisecond have an unambiguous order here and do not under a
 * clock, so a consumer that resumes from a timestamp silently skips one
 * of them roughly never — which is the worst failure rate to debug.
 */
export async function streamSince(
  companyId: string,
  after: bigint,
  types: EventType[] | null,
  limit = 500
): Promise<{ events: { seq: bigint; type: string; subjectType: string; subjectId: string; payload: unknown; occurredAt: Date }[]; nextCursor: bigint | null }> {
  const events = await prisma.event.findMany({
    where: {
      companyId,
      seq: { gt: after },
      ...(types && types.length > 0 ? { type: { in: types } } : {}),
    },
    orderBy: { seq: 'asc' },
    take: limit,
    select: {
      seq: true,
      type: true,
      subjectType: true,
      subjectId: true,
      payload: true,
      occurredAt: true,
    },
  })

  return {
    events,
    // Null means caught up. A consumer that gets a cursor back should ask
    // again immediately rather than waiting for its next poll.
    nextCursor: events.length === limit ? events[events.length - 1].seq : null,
  }
}

/**
 * Is this a name we know?
 *
 * Used where an event type arrives from outside — a webhook subscription
 * naming the types it wants. An unknown type there is a typo that would
 * otherwise present as "the integration silently receives nothing".
 */
export function isKnownEventType(value: string): value is EventType {
  return (EVENT_TYPES as readonly string[]).includes(value)
}

/**
 * Count one thing a public-site visitor did, from the server.
 *
 * The public site counts its doors from the browser (`lib/public-site/count`,
 * through `POST /api/market/events`). One door is not a click: taking a
 * seat in the demo happens inside `POST /api/demo`, on the server, where
 * the browser counter cannot run. This writes the same row that route
 * writes, so the staff summary reads both alike:
 *
 *   companyId null · type `market.<event>` · subjectType 'Visit' ·
 *   subjectId the visit id · actorKind 'VISITOR' · payload { page, visit }
 *
 * The event, the page and the visit id go through market's own reader
 * (`readMarketEvent`), so nothing reaches the log here that the browser's
 * route would have refused: no query string, no address, no name.
 *
 * Where the caller has no visit id — a demo seat taken by a script, or a
 * browser that refused sessionStorage — a random one is made here. That
 * row is still one real demo start; it counts as a visit of its own,
 * which is said in `minted` so the caller can tell.
 *
 * Awaited, and never throws: a serverless host may stop the function the
 * moment the response goes out (the lesson of `recordRefusal`), and a
 * count is never worth a demo seat that failed to open.
 */
export async function countVisitorEvent(
  event: string,
  where: { page: string; visit?: string | null },
): Promise<{ counted: boolean; minted: boolean; says: string }> {
  const minted = !where.visit
  let visit = where.visit ?? ''
  if (minted) visit = randomBytes(16).toString('hex')
  const read = readMarketEvent({ event, page: where.page, visit })
  if (!read.ok) return { counted: false, minted, says: read.says }
  try {
    await prisma.event.create({
      data: {
        companyId: null,
        type: `${MARKET_TYPE_PREFIX}${read.row.event}`,
        subjectType: 'Visit',
        subjectId: read.row.visit,
        actorKind: 'VISITOR',
        payload: { page: read.row.page, visit: read.row.visit },
      },
    })
  } catch (err) {
    console.error(`[Events] Could not count ${MARKET_TYPE_PREFIX}${read.row.event}:`, err)
    return { counted: false, minted, says: 'Not counted. Nothing else is affected.' }
  }
  return { counted: true, minted, says: `Counted ${read.row.event} on ${read.row.page}.` }
}

/** The demo door's one count: somebody took a seat in the demo. */
export function countDemoStarted(where: { page?: string; visit?: string | null } = {}) {
  return countVisitorEvent('demo_started', { page: where.page ?? '/demo', visit: where.visit })
}
