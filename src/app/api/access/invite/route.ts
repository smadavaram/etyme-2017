import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { emit } from '@/lib/events'
import { notify } from '@/lib/notify'
import { checkInvite } from '@/lib/account-lifecycle'

/**
 * POST /api/access/invite   { email, name?, roleId? }
 *
 * Making somebody a seat before they have signed in.
 *
 * Anybody on the verified company domain joins by signing in and needs no
 * invitation — that is the whole join-beats-create design, and offering an
 * invitation alongside it would create a second path to the same seat.
 *
 * So this exists for the case the domain rule genuinely cannot cover: a
 * contractor on their own address, somebody at a subsidiary with a
 * different domain, an accountant who needs to see the invoices. An
 * invitation is a hole in the domain rule, punched deliberately, and it
 * says so rather than pretending otherwise.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'An invitation comes from a company' } },
      { status: 403 }
    )
  }
  if (!hasPermission(caller.permissions, 'team.manage')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'Inviting somebody needs team.manage. It lets a person in who your domain rule would keep out, so it is the same decision as granting access.',
        },
      },
      { status: 403 }
    )
  }

  const inviter = realPersonId(caller)
  if (!inviter) {
    return NextResponse.json(
      { error: { code: 'PERSON_REQUIRED', message: 'An integration cannot invite people. A person has to decide this.' } },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const email = String(body.email ?? '').trim().toLowerCase()

  const company = await prisma.company.findUnique({
    where: { id: caller.company.id },
    select: { domain: true, name: true },
  })

  const existing = await prisma.person.findUnique({
    where: { primaryEmail: email },
    select: {
      id: true,
      name: true,
      contexts: {
        where: { companyId: caller.company.id, revokedAt: null },
        select: { id: true },
      },
    },
  })

  const check = checkInvite(email, company?.domain ?? null, (existing?.contexts.length ?? 0) > 0)
  if (!check.ok) {
    return NextResponse.json(
      { error: { code: 'CANNOT_INVITE', message: check.reason, field: 'email' } },
      { status: 422 }
    )
  }

  // A role is optional. Without one they arrive able to see nothing, which
  // is the same as somebody joining on the domain — and is the safe
  // default, because an invitation is already an exception.
  let role: { id: string; name: string; permissions: string[] } | null = null
  if (body.roleId) {
    role = await prisma.role.findFirst({
      where: { id: String(body.roleId), companyId: caller.company.id },
      select: { id: true, name: true, permissions: true },
    })
    if (!role) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'No such role here', field: 'roleId' } },
        { status: 422 }
      )
    }
    // Nobody hands out more than they hold, on invitation any more than on
    // a key or a grant.
    const beyond = role.permissions.filter((p) => !hasPermission(caller.permissions, p as any))
    if (beyond.length > 0) {
      return NextResponse.json(
        {
          error: {
            code: 'BEYOND_YOU',
            message: `${role.name} carries things you do not have yourself: ${beyond.join(', ')}`,
            field: 'roleId',
          },
        },
        { status: 422 }
      )
    }
  }

  const now = new Date()

  // The person may already exist — a consultant, or somebody at another
  // company. Inviting them here adds a seat rather than a second account.
  const person = existing
    ? await prisma.person.findUniqueOrThrow({ where: { id: existing.id }, select: { id: true, name: true } })
    : await prisma.person.create({
        data: {
          primaryEmail: email,
          name: String(body.name ?? '').trim() || email.split('@')[0],
        },
        select: { id: true, name: true },
      })

  const context = await prisma.context.create({
    data: {
      personId: person.id,
      companyId: caller.company.id,
      type: 'EMPLOYEE',
      roleId: role?.id ?? null,
      grantedById: inviter,
      invitedAt: now,
      invitedById: inviter,
      grantReason: body.reason ? String(body.reason).trim() : `Invited by ${caller.person.name}`,
    },
    select: { id: true },
  })

  await prisma.automationLog.create({
    data: {
      companyId: caller.company.id,
      action: 'PERSON_INVITED',
      summary: `${caller.person.name} invited ${email}${role ? ` as ${role.name}` : ' with no role yet'}`,
      // The reason this is worth logging: it is an exception to the rule
      // everything else depends on.
      reason: check.reason,
      payload: { contextId: context.id, email, roleId: role?.id ?? null, outsider: check.outsider },
      reversible: true,
    },
  })

  void emit({
    type: 'company.member_joined',
    companyId: caller.company.id,
    subjectType: 'Person',
    subjectId: person.id,
    actorPersonId: inviter,
    payload: { email, invited: true, roleName: role?.name ?? null, outsider: check.outsider },
  })

  void notify({
    personId: person.id,
    companyId: caller.company.id,
    type: 'SYSTEM',
    title: `${caller.person.name} invited you to ${company?.name ?? 'their company'}`,
    body: role
      ? `You have been given the ${role.name} role. Sign in with ${email} to start.`
      : `Sign in with ${email}. Somebody there will decide what you can see.`,
    entityId: context.id,
    channel: 'EMAIL',
  })

  return NextResponse.json(
    {
      data: {
        contextId: context.id,
        email,
        role: role?.name ?? null,
        state: 'INVITED',
        note: check.reason,
        message: role
          ? `${email} can sign in as ${role.name}. Until they do, they show as invited rather than active.`
          : `${email} can sign in. They will see nothing until somebody gives them a role.`,
      },
    },
    { status: 201 }
  )
}
