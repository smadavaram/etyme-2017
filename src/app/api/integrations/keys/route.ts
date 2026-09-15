import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission, PERMISSIONS } from '@/lib/permissions'
import { emit } from '@/lib/events'
import { mintKey, suggestedDurationDays, reviewKey } from '@/lib/service-accounts'

/**
 * GET    /api/integrations/keys      — the machines that can call in
 * POST   /api/integrations/keys      — issue a key
 * DELETE /api/integrations/keys?id=  — revoke one
 *
 * Issuing a key hands a machine the same powers a person would have, so
 * this needs team.manage — the permission for deciding what anybody can
 * do — rather than settings.manage.
 *
 * A key cannot be given more than the person issuing it holds. Otherwise
 * anybody who can create an integration can escalate themselves through
 * one, which is the oldest trick in this shape of system.
 */

async function guard(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return { caller: null, error }
  if (!caller.company) {
    return {
      caller: null,
      error: NextResponse.json(
        { error: { code: 'NO_COMPANY', message: 'Integrations belong to a company' } },
        { status: 403 }
      ),
    }
  }
  if (!hasPermission(caller.permissions, 'team.manage')) {
    return {
      caller: null,
      error: NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'Issuing an API key needs team.manage. A key can do whatever it is given, so this is the same decision as giving somebody a role.',
          },
        },
        { status: 403 }
      ),
    }
  }
  return { caller, error: null }
}

export async function GET(request: NextRequest) {
  const { caller, error } = await guard(request)
  if (error) return error

  const accounts = await prisma.serviceAccount.findMany({
    where: { companyId: caller!.company!.id },
    orderBy: [{ revokedAt: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true, name: true, description: true, keyPrefix: true, permissions: true,
      expiresAt: true, lastUsedAt: true, revokedAt: true, createdAt: true,
      createdBy: { select: { name: true } },
      _count: { select: { webhooks: true } },
    },
  })

  const now = new Date()
  const rows = accounts.map((a) => {
    const review = reviewKey(
      { createdAt: a.createdAt, lastUsedAt: a.lastUsedAt, expiresAt: a.expiresAt },
      now
    )
    return {
      id: a.id,
      name: a.name,
      description: a.description,
      // Enough to tell two keys apart in a list, far too little to use.
      keyPrefix: a.keyPrefix,
      permissions: a.permissions,
      expiresAt: a.expiresAt?.toISOString().slice(0, 10) ?? null,
      lastUsedAt: a.lastUsedAt?.toISOString().slice(0, 10) ?? null,
      revoked: Boolean(a.revokedAt),
      issuedBy: a.createdBy.name,
      issuedAt: a.createdAt.toISOString().slice(0, 10),
      webhookCount: a._count.webhooks,
      finding: review.finding,
      detail: review.detail,
    }
  })

  return NextResponse.json({
    data: {
      keys: rows,
      // What a person should actually look at. A key issued and never used
      // is the loudest, because it means an integration was abandoned or
      // never finished and the key has been sitting there since.
      worthALook: rows.filter((r) => !r.revoked && r.finding !== 'OK').length,
      // A key can never carry more than its issuer holds.
      grantable: PERMISSIONS.filter((p) => hasPermission(caller!.permissions, p)),
    },
  })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await guard(request)
  if (error) return error
  const companyId = caller!.company!.id

  const body = await request.json().catch(() => ({}))
  const name = String(body.name ?? '').trim()
  if (!name) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Name it after the thing that will use it — "SAP AP feed", not "key 2"',
          field: 'name',
        },
      },
      { status: 422 }
    )
  }

  const asked: string[] = Array.isArray(body.permissions) ? body.permissions.map(String) : []
  if (asked.length === 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Say what this integration may do', field: 'permissions' } },
      { status: 422 }
    )
  }

  const known = new Set<string>(PERMISSIONS)
  const unknown = asked.filter((p) => !known.has(p))
  if (unknown.length > 0) {
    return NextResponse.json(
      {
        error: {
          code: 'UNKNOWN_PERMISSION',
          message: `Not a permission this system checks: ${unknown.join(', ')}`,
          field: 'permissions',
        },
      },
      { status: 422 }
    )
  }

  // Nobody hands out more than they hold. Otherwise anybody who can create
  // an integration can escalate themselves through one.
  const beyond = asked.filter((p) => !hasPermission(caller!.permissions, p as any))
  if (beyond.length > 0) {
    return NextResponse.json(
      {
        error: {
          code: 'BEYOND_YOU',
          message: `You cannot give a key something you do not have yourself: ${beyond.join(', ')}`,
          field: 'permissions',
        },
      },
      { status: 422 }
    )
  }

  const suggested = suggestedDurationDays(asked)
  const days = body.expiresInDays === null ? null : Math.min(730, Math.max(1, Number(body.expiresInDays ?? suggested)))
  const expiresAt = days === null ? null : new Date(Date.now() + days * 86_400_000)

  // A key with no end date that can change things is an argument somebody
  // should have to make out loud, not a default.
  const writes = asked.some((p) => !p.endsWith('.read')) || asked.includes('*')
  if (expiresAt === null && writes && !String(body.reason ?? '').trim()) {
    return NextResponse.json(
      {
        error: {
          code: 'REASON_REQUIRED',
          message: 'A key that can change things and never expires needs a reason on the record.',
          field: 'reason',
        },
      },
      { status: 422 }
    )
  }

  // A machine issuing keys for other machines is a chain nobody can audit,
  // and its id is not a Person row so it cannot be recorded as the issuer
  // anyway. A person has to do this.
  const issuer = realPersonId(caller!)
  if (!issuer) {
    return NextResponse.json(
      {
        error: {
          code: 'PERSON_REQUIRED',
          message: 'An integration cannot issue keys for other integrations. A person has to decide this.',
        },
      },
      { status: 403 }
    )
  }

  const minted = mintKey()

  const account = await prisma.serviceAccount.create({
    data: {
      companyId,
      name,
      description: body.description ? String(body.description).trim() : null,
      keyHash: minted.hash,
      keyPrefix: minted.prefix,
      permissions: asked,
      expiresAt,
      createdById: issuer,
    },
    select: { id: true, name: true, keyPrefix: true, expiresAt: true },
  })

  await prisma.automationLog.create({
    data: {
      companyId,
      action: 'API_KEY_ISSUED',
      summary: `${caller!.person.name} issued an API key for ${name}${expiresAt ? ` until ${expiresAt.toISOString().slice(0, 10)}` : ' with no end date'}`,
      reason: body.reason ? String(body.reason).trim() : `Can do: ${asked.join(', ')}`,
      payload: { serviceAccountId: account.id, permissions: asked, expiresAt: expiresAt?.toISOString() ?? null },
      reversible: true,
    },
  })

  void emit({
    type: 'access.granted',
    companyId,
    subjectType: 'ServiceAccount',
    subjectId: account.id,
    actorPersonId: issuer,
    payload: { name, permissions: asked, expiresAt: expiresAt?.toISOString() ?? null },
  })

  return NextResponse.json(
    {
      data: {
        id: account.id,
        name: account.name,
        // Shown once, here, and never again. A system that can show you a
        // key twice can be made to show it to somebody else.
        key: minted.key,
        keyPrefix: account.keyPrefix,
        expiresAt: account.expiresAt?.toISOString().slice(0, 10) ?? null,
        permissions: asked,
        message: `Copy this key now — it will not be shown again. Send it as "Authorization: Bearer ${minted.prefix}…".`,
        suggestedDays: suggested,
      },
    },
    { status: 201 }
  )
}

export async function DELETE(request: NextRequest) {
  const { caller, error } = await guard(request)
  if (error) return error

  const id = request.nextUrl.searchParams.get('id') ?? ''
  const existing = await prisma.serviceAccount.findFirst({
    where: { id, companyId: caller!.company!.id },
    select: { id: true, name: true, revokedAt: true, _count: { select: { webhooks: true } } },
  })
  if (!existing) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such key here' } },
      { status: 404 }
    )
  }
  if (existing.revokedAt) {
    return NextResponse.json(
      { error: { code: 'ALREADY_REVOKED', message: `${existing.name} was already revoked` } },
      { status: 409 }
    )
  }

  // Revoking the account stops its webhooks too, rather than leaving a
  // mouth still talking after the ears were taken away.
  await prisma.$transaction([
    prisma.serviceAccount.update({
      where: { id },
      data: { revokedAt: new Date(), revokedById: realPersonId(caller!) },
    }),
    prisma.webhookSubscription.updateMany({
      where: { serviceAccountId: id },
      data: { isActive: false, disabledAt: new Date(), disabledReason: 'The key that owned it was revoked' },
    }),
  ])

  await prisma.automationLog.create({
    data: {
      companyId: caller!.company!.id,
      action: 'API_KEY_REVOKED',
      summary: `${caller!.person.name} revoked the key for ${existing.name}`,
      reason: request.nextUrl.searchParams.get('reason') ?? 'Revoked from the integrations screen',
      payload: { serviceAccountId: id, webhooksStopped: existing._count.webhooks },
      reversible: false,
    },
  })

  return NextResponse.json({
    data: {
      revoked: existing.name,
      webhooksStopped: existing._count.webhooks,
      message:
        existing._count.webhooks > 0
          ? `${existing.name} is revoked, and its ${existing._count.webhooks} webhook(s) have stopped with it.`
          : `${existing.name} is revoked. Anything using that key will start failing immediately.`,
    },
  })
}
