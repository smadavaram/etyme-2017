import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { EVENT_TYPES, isKnownEventType } from '@/lib/events'

/**
 * GET    /api/integrations/webhooks      — where events are being sent
 * POST   /api/integrations/webhooks      — subscribe to some
 * DELETE /api/integrations/webhooks?id=  — stop
 *
 * The alternative to this is every integration polling tables and guessing
 * what changed, which is what the event log exists to end.
 *
 * Failures are visible rather than silent, on the same principle already
 * applied to notifications: a webhook quietly dropping events is the
 * failure mode that costs the most trust, because the receiver believes
 * they are current and are not.
 */

async function guard(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return { caller: null, error }
  if (!caller.company) {
    return {
      caller: null,
      error: NextResponse.json(
        { error: { code: 'NO_COMPANY', message: 'Webhooks belong to a company' } },
        { status: 403 }
      ),
    }
  }
  if (!hasPermission(caller.permissions, 'team.manage')) {
    return {
      caller: null,
      error: NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Sending your events somewhere needs team.manage' } },
        { status: 403 }
      ),
    }
  }
  return { caller, error: null }
}

export async function GET(request: NextRequest) {
  const { caller, error } = await guard(request)
  if (error) return error

  const subs = await prisma.webhookSubscription.findMany({
    where: { companyId: caller!.company!.id },
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true, name: true, url: true, eventTypes: true, isActive: true,
      lastDeliveredSeq: true, disabledAt: true, disabledReason: true, createdAt: true,
      serviceAccount: { select: { name: true, revokedAt: true } },
      deliveries: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { state: true, attempt: true, statusCode: true, note: true, createdAt: true },
      },
    },
  })

  return NextResponse.json({
    data: {
      webhooks: subs.map((s) => {
        const recent = s.deliveries
        const failing = recent.filter((d) => d.state === 'FAILED' || d.state === 'ABANDONED').length
        return {
          id: s.id,
          name: s.name,
          url: s.url,
          // Empty means everything, which is allowed and rarely meant.
          eventTypes: s.eventTypes.length === 0 ? ['everything'] : s.eventTypes,
          isActive: s.isActive,
          ownedBy: s.serviceAccount?.name ?? null,
          disabledReason: s.disabledReason,
          caughtUpTo: s.lastDeliveredSeq.toString(),
          recentFailures: failing,
          // The one line somebody needs: is this actually working?
          health:
            !s.isActive
              ? (s.disabledReason ?? 'Switched off')
              : recent.length === 0
                ? 'Nothing sent yet'
                : failing === 0
                  ? `Last ${recent.length} delivered`
                  : `${failing} of the last ${recent.length} failed`,
        }
      }),
      knownEventTypes: EVENT_TYPES,
    },
  })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await guard(request)
  if (error) return error
  const companyId = caller!.company!.id

  const body = await request.json().catch(() => ({}))
  const name = String(body.name ?? '').trim()
  const url = String(body.url ?? '').trim()

  if (!name) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Name it after what receives it', field: 'name' } },
      { status: 422 }
    )
  }
  // https only, with one carve-out: a loopback address in development, so
  // somebody can point this at a receiver on their own machine and watch a
  // delivery arrive before they trust it. Nothing leaves the machine, so
  // there is no path to read it from.
  //
  // A signed payload sent over plain http to anywhere else is still
  // readable by anything in between, which defeats most of the point of
  // signing it.
  const loopback = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url)
  const localOnly = loopback && process.env.NODE_ENV === 'development'
  if (!localOnly && !/^https:\/\/.+/i.test(url)) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: loopback
            ? 'A loopback address is only allowed in development. This build is not one.'
            : 'An https address. Events carry rates and names, so they do not travel over plain http.',
          field: 'url',
        },
      },
      { status: 422 }
    )
  }

  const asked: string[] = Array.isArray(body.eventTypes) ? body.eventTypes.map(String) : []
  const unknown = asked.filter((t) => !isKnownEventType(t))
  if (unknown.length > 0) {
    return NextResponse.json(
      {
        error: {
          code: 'UNKNOWN_EVENT_TYPE',
          message: `Not an event this system emits: ${unknown.join(', ')}. A typo here would present as the integration silently receiving nothing.`,
          field: 'eventTypes',
          known: EVENT_TYPES,
        },
      },
      { status: 422 }
    )
  }

  // The subscription starts from now, not from the beginning of time.
  // Replaying two years of events into a new integration on its first
  // minute is a denial of service you did to yourself.
  const latest = await prisma.event.findFirst({
    where: { companyId },
    orderBy: { seq: 'desc' },
    select: { seq: true },
  })

  const sub = await prisma.webhookSubscription.create({
    data: {
      companyId,
      name,
      url,
      eventTypes: asked,
      signingSecret: `whsec_${randomBytes(24).toString('base64url')}`,
      serviceAccountId: body.serviceAccountId ? String(body.serviceAccountId) : null,
      lastDeliveredSeq: latest?.seq ?? BigInt(0),
    },
    select: { id: true, name: true, url: true, signingSecret: true, lastDeliveredSeq: true },
  })

  await prisma.automationLog.create({
    data: {
      companyId,
      action: 'WEBHOOK_ADDED',
      summary: `${caller!.person.name} started sending ${asked.length === 0 ? 'all events' : `${asked.length} event type(s)`} to ${name}`,
      reason: `Delivering to ${url}`,
      payload: { webhookId: sub.id, url, eventTypes: asked },
      reversible: true,
    },
  })

  return NextResponse.json(
    {
      data: {
        id: sub.id,
        name: sub.name,
        url: sub.url,
        // Shown once. The receiver needs it to verify that a delivery came
        // from us rather than from anybody else who found their endpoint.
        signingSecret: sub.signingSecret,
        startingFrom: sub.lastDeliveredSeq.toString(),
        message:
          'Copy the signing secret now — it will not be shown again. Verify the X-Etyme-Signature header on every delivery; an endpoint that acts on unverified input is a way into your systems.',
      },
    },
    { status: 201 }
  )
}

export async function DELETE(request: NextRequest) {
  const { caller, error } = await guard(request)
  if (error) return error

  const id = request.nextUrl.searchParams.get('id') ?? ''
  const existing = await prisma.webhookSubscription.findFirst({
    where: { id, companyId: caller!.company!.id },
    select: { id: true, name: true },
  })
  if (!existing) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such webhook here' } },
      { status: 404 }
    )
  }

  await prisma.webhookSubscription.update({
    where: { id },
    data: {
      isActive: false,
      disabledAt: new Date(),
      disabledReason: `Switched off by ${caller!.person.name}`,
    },
  })

  return NextResponse.json({
    data: {
      stopped: existing.name,
      message: `${existing.name} will receive nothing further. Its delivery history is kept.`,
    },
  })
}
