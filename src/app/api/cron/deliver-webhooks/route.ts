import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sign, shouldRetry, nextAttemptDelaySeconds, MAX_ATTEMPTS } from '@/lib/service-accounts'

/**
 * GET /api/cron/deliver-webhooks
 *
 * The thing that actually sends. Two jobs in one pass:
 *
 *   1. Queue — turn events each subscription has not seen into deliveries.
 *   2. Send — attempt everything due, and schedule what failed.
 *
 * Queueing and sending are separate so a subscription's cursor advances
 * exactly once per event. If sending moved the cursor, a failed delivery
 * would either be lost or replayed forever depending on where the failure
 * happened, and both are worse than a row that says PENDING.
 *
 * Nothing here retries silently. Every attempt is a row with a status code
 * and a reason, because a webhook quietly dropping events is the failure
 * that costs the most trust: the receiver believes they are current and
 * they are not.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const queued = await queueNewEvents()
  // Read the clock after queueing, not before. Deliveries are queued due
  // immediately, so a `now` captured at the top of the request is earlier
  // than their nextAttemptAt and nothing queued this pass would be found —
  // every event would sit one whole cron interval before its first
  // attempt, for no reason anybody could see.
  const sent = await sendDue(new Date())

  return NextResponse.json({
    data: {
      queued: queued.created,
      subscriptionsAdvanced: queued.advanced,
      attempted: sent.attempted,
      delivered: sent.delivered,
      failed: sent.failed,
      abandoned: sent.abandoned,
      subscriptionsDisabled: sent.disabled,
      summary:
        sent.attempted === 0 && queued.created === 0
          ? 'Nothing to send.'
          : `${queued.created} queued, ${sent.delivered} delivered, ${sent.failed} to retry, ${sent.abandoned} given up on.`,
    },
  })
}

/**
 * Turn events into deliveries.
 *
 * Capped per subscription per pass. A subscription that has been switched
 * off for a month comes back to thousands of events, and draining them all
 * in one request would time out and deliver nothing at all.
 */
async function queueNewEvents(): Promise<{ created: number; advanced: number }> {
  const BATCH = 200

  const subs = await prisma.webhookSubscription.findMany({
    where: { isActive: true },
    select: { id: true, companyId: true, eventTypes: true, lastDeliveredSeq: true },
  })

  let created = 0
  let advanced = 0

  for (const sub of subs) {
    const events = await prisma.event.findMany({
      where: {
        companyId: sub.companyId,
        seq: { gt: sub.lastDeliveredSeq },
        // Empty means everything, which is allowed and rarely meant.
        ...(sub.eventTypes.length > 0 ? { type: { in: sub.eventTypes } } : {}),
      },
      orderBy: { seq: 'asc' },
      take: BATCH,
      select: { id: true, seq: true },
    })

    if (events.length === 0) continue

    await prisma.webhookDelivery.createMany({
      data: events.map((e) => ({
        subscriptionId: sub.id,
        eventId: e.id,
        state: 'PENDING',
        nextAttemptAt: new Date(),
      })),
      // A crash between creating deliveries and moving the cursor would
      // otherwise duplicate them on the next pass.
      skipDuplicates: true,
    })

    // The cursor moves on queueing, not on sending. A delivery that fails
    // is retried from its own row rather than by rewinding the stream.
    await prisma.webhookSubscription.update({
      where: { id: sub.id },
      data: { lastDeliveredSeq: events[events.length - 1].seq },
    })

    created += events.length
    advanced++
  }

  return { created, advanced }
}

interface SendResult {
  attempted: number
  delivered: number
  failed: number
  abandoned: number
  disabled: number
}

async function sendDue(now: Date = new Date()): Promise<SendResult> {
  const due = await prisma.webhookDelivery.findMany({
    where: {
      state: { in: ['PENDING', 'FAILED'] },
      // Against the clock now, never against a time captured earlier in
      // the request.
      nextAttemptAt: { lte: new Date() },
      subscription: { isActive: true },
    },
    orderBy: { createdAt: 'asc' },
    take: 100,
    select: {
      id: true, attempt: true, subscriptionId: true,
      subscription: { select: { id: true, url: true, signingSecret: true, name: true, companyId: true } },
      event: {
        select: {
          id: true, seq: true, type: true, subjectType: true, subjectId: true,
          payload: true, actorKind: true, occurredAt: true,
        },
      },
    },
  })

  const result: SendResult = { attempted: 0, delivered: 0, failed: 0, abandoned: 0, disabled: 0 }

  for (const d of due) {
    result.attempted++

    const body = JSON.stringify({
      id: d.event.id,
      // A string, because a sequence number outgrows a JavaScript number
      // and a consumer silently losing precision on its cursor is a bug
      // that shows up years later.
      seq: d.event.seq.toString(),
      type: d.event.type,
      subject: { type: d.event.subjectType, id: d.event.subjectId },
      actorKind: d.event.actorKind,
      occurredAt: d.event.occurredAt.toISOString(),
      data: d.event.payload,
    })

    const timestamp = Math.floor(now.getTime() / 1000)
    let statusCode: number | null = null
    let note: string | null = null

    try {
      // Ten seconds. A receiver that needs longer should accept and process
      // asynchronously; holding this open blocks every other delivery.
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10_000)

      const res = await fetch(d.subscription.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Etyme-Signature': sign(body, d.subscription.signingSecret, timestamp),
          'X-Etyme-Event': d.event.type,
          'X-Etyme-Delivery': d.id,
          // So a receiver can tell a retry from a new event and stay
          // idempotent without keeping their own bookkeeping.
          'X-Etyme-Attempt': String(d.attempt),
        },
        body,
        signal: controller.signal,
      })
      clearTimeout(timer)

      statusCode = res.status
      if (!res.ok) {
        note = `Receiver returned ${res.status}`
      }
    } catch (err) {
      note = err instanceof Error
        ? (err.name === 'AbortError' ? 'No answer within ten seconds' : err.message.slice(0, 160))
        : 'Could not reach the receiver'
    }

    const ok = statusCode !== null && statusCode >= 200 && statusCode < 300

    if (ok) {
      await prisma.webhookDelivery.update({
        where: { id: d.id },
        data: { state: 'SENT', statusCode, note: null, deliveredAt: now, nextAttemptAt: null },
      })
      result.delivered++
      continue
    }

    const retry = shouldRetry(statusCode, d.attempt)

    if (retry.retry) {
      await prisma.webhookDelivery.update({
        where: { id: d.id },
        data: {
          state: 'FAILED',
          attempt: d.attempt + 1,
          statusCode,
          note,
          nextAttemptAt: new Date(now.getTime() + nextAttemptDelaySeconds(d.attempt) * 1000),
        },
      })
      result.failed++
      continue
    }

    await prisma.webhookDelivery.update({
      where: { id: d.id },
      data: { state: 'ABANDONED', statusCode, note: `${note ?? ''} — ${retry.why}`.trim(), nextAttemptAt: null },
    })
    result.abandoned++

    // A subscription failing repeatedly is switched off with the reason
    // kept. Sending forever into a dead endpoint is not persistence, it is
    // a slow denial of service against somebody who has moved on.
    const recentAbandoned = await prisma.webhookDelivery.count({
      where: {
        subscriptionId: d.subscriptionId,
        state: 'ABANDONED',
        createdAt: { gte: new Date(now.getTime() - 24 * 3600 * 1000) },
      },
    })

    if (recentAbandoned >= 5) {
      await prisma.webhookSubscription.update({
        where: { id: d.subscriptionId },
        data: {
          isActive: false,
          disabledAt: now,
          disabledReason: `Switched off after ${recentAbandoned} deliveries failed in a day. Last reason: ${note ?? 'unknown'}. Fix the endpoint and switch it back on — nothing is lost, delivery resumes from where it stopped.`,
        },
      })
      result.disabled++

      await prisma.automationLog.create({
        data: {
          companyId: d.subscription.companyId,
          action: 'WEBHOOK_DISABLED',
          summary: `${d.subscription.name} was switched off after ${recentAbandoned} failed deliveries`,
          reason: note ?? 'The receiver stopped answering',
          payload: { subscriptionId: d.subscriptionId, url: d.subscription.url, abandoned: recentAbandoned },
          reversible: true,
        },
      })
    }
  }

  return result
}

/**
 * POST /api/cron/deliver-webhooks
 *
 * Send one event to one subscription, now. What a person clicks when they
 * have just fixed their endpoint and do not want to wait for the next
 * scheduled pass — or when they want to see a delivery arrive before they
 * trust the thing at all.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const deliveryId = String(body.deliveryId ?? '')

  const existing = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    select: { id: true, state: true, attempt: true },
  })
  if (!existing) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such delivery' } },
      { status: 404 }
    )
  }

  // A retry resets the attempt count, because the reason for retrying is
  // that something changed at the other end.
  await prisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: { state: 'PENDING', attempt: 1, nextAttemptAt: new Date() },
  })

  const sent = await sendDue(new Date())

  return NextResponse.json({
    data: { ...sent, message: sent.delivered > 0 ? 'Delivered.' : 'Still not getting through.' },
  })
}
