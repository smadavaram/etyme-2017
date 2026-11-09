import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, type CallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasAnyPermission, PERMISSIONS } from '@/lib/permissions'
import { emit } from '@/lib/events'
import {
  checkGrant,
  checkRevoke,
  effectivePermissions,
  grantsForSeat,
  holdsGrantRight,
  labelOf,
  permissionScope,
  GRANT_RIGHT,
  GRANT_SCOPES,
  GRANTABLE_TO_A_TEAM,
  PERSON_ONLY,
  type GrantRow,
  type HolderSet,
} from '@/lib/permission-grants'
import { SCOPE_LABELS } from '@/lib/permission-grants/words'

/**
 * GET    /api/settings/grants      — the grants at this company, and what the dialog offers
 * POST   /api/settings/grants      — give access: a permission, to a role or a person, how far, why
 * DELETE /api/settings/grants?id=  — take a grant away
 *
 * The Owner decides who sees what (founder, 2026-11-08). Only the Owner
 * gives access, or somebody the Owner gave that right to by name; every
 * grant and every revoke is recorded the way a role edit is (an automation
 * log row and an access event), and a revoked grant is kept. The rules
 * are lib/permission-grants; this route finds the facts they need at the
 * caller's own company and nowhere else.
 */

type Ok = { caller: CallerContext; companyId: string; companyName: string; isOwner: boolean; grantRight: boolean }

async function guard(request: NextRequest): Promise<{ ok: Ok; error: null } | { ok: null; error: NextResponse }> {
  const { caller, error } = await getCallerContext(request)
  if (error) return { ok: null, error }
  if (!caller.company) {
    return {
      ok: null,
      error: NextResponse.json(
        { error: { code: 'NO_COMPANY', message: 'Access is given by a company, and you are not signed in at one.' } },
        { status: 403 }
      ),
    }
  }
  const role = caller.context.roleId
    ? await prisma.role.findFirst({ where: { id: caller.context.roleId, companyId: caller.company.id }, select: { name: true } })
    : null
  const seat = { companyId: caller.company.id, roleId: caller.context.roleId, contextId: caller.context.id }
  const grantRight = holdsGrantRight(seat, await grantsForSeat(seat))
  return {
    ok: { caller, companyId: caller.company.id, companyName: caller.company.name, isOwner: role?.name === 'Owner', grantRight },
    error: null,
  }
}

function refuse(code: string, message: string, status: number, field?: string | null) {
  return NextResponse.json({ error: { code, message, ...(field ? { field } : {}) } }, { status })
}

const SCOPE_WORDS: Record<string, string> = {
  COMPANY: 'across the company',
  UNIT: 'for one team and every team under it',
  PERSON: 'for their own work',
}

export async function GET(request: NextRequest) {
  const { ok, error } = await guard(request)
  if (error) return error
  const { caller, companyId, companyName, isOwner, grantRight } = ok
  if (!isOwner && !grantRight && !hasAnyPermission(caller.permissions, ['team.manage', 'governance.read'])) {
    return refuse('FORBIDDEN', `Who holds what at ${companyName} is read by the Owner, and by whoever manages roles or reads the approval rules there.`, 403)
  }

  const [grants, roles, seats, units] = await Promise.all([
    prisma.permissionGrant.findMany({
      where: { companyId },
      orderBy: [{ revokedAt: 'asc' }, { grantedAt: 'desc' }],
      take: 500,
      select: {
        id: true, permission: true, scope: true, reason: true, grantedAt: true, revokedAt: true,
        role: { select: { id: true, name: true } },
        context: { select: { id: true, person: { select: { name: true } } } },
        orgUnit: { select: { id: true, name: true } },
        grantedBy: { select: { name: true } },
        revokedBy: { select: { name: true } },
      },
    }),
    prisma.role.findMany({ where: { companyId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.context.findMany({
      where: { companyId, revokedAt: null },
      select: { id: true, person: { select: { name: true } }, role: { select: { name: true } } },
      orderBy: { grantedAt: 'asc' },
      take: 1000,
    }),
    prisma.orgUnit.findMany({ where: { companyId }, select: { id: true, name: true, parentId: true }, orderBy: { name: 'asc' } }),
  ])

  const permissions = [...PERMISSIONS, ...(isOwner ? [GRANT_RIGHT] : [])].map((key) => ({
    key,
    label: labelOf(key),
    personOnly: key === GRANT_RIGHT || (PERSON_ONLY as readonly string[]).includes(key),
    // Every scope a reader narrows by is offered: margin and profit and
    // loss, and since demand narrowed them at the query (37c14618b) jobs
    // and submissions. Anything else is the whole company's only.
    scopes: key !== GRANT_RIGHT && GRANTABLE_TO_A_TEAM.has(key) ? GRANT_SCOPES : ['COMPANY'],
  }))

  return NextResponse.json({
    data: {
      canGive: isOwner || grantRight,
      isOwner,
      permissions,
      scopes: GRANT_SCOPES.map((s) => ({ key: s, label: SCOPE_LABELS[s] })),
      roles: roles.filter((r) => r.name !== 'Owner'),
      people: seats.map((s) => ({ contextId: s.id, name: s.person.name, roleName: s.role?.name ?? null })),
      units,
      grants: grants.map((g) => ({
        id: g.id,
        permission: g.permission,
        says:
          `${g.role ? `Everybody in ${g.role.name}` : g.context?.person.name ?? 'Somebody no longer here'} may ${labelOf(g.permission)} ` +
          (g.scope === 'UNIT' && g.orgUnit ? `for ${g.orgUnit.name} and every team under it` : SCOPE_WORDS[g.scope] ?? ''),
        reason: g.reason,
        grantedBy: g.grantedBy.name,
        grantedAt: g.grantedAt.toISOString(),
        revokedBy: g.revokedBy?.name ?? null,
        revokedAt: g.revokedAt?.toISOString() ?? null,
      })),
    },
  })
}

export async function POST(request: NextRequest) {
  const { ok, error } = await guard(request)
  if (error) return error
  const { caller, companyId, companyName, isOwner, grantRight } = ok

  const body = await request.json().catch(() => ({}))
  const permission = typeof body.permission === 'string' ? body.permission.trim() : ''
  const roleId = typeof body.roleId === 'string' && body.roleId ? body.roleId : null
  const contextId = typeof body.contextId === 'string' && body.contextId ? body.contextId : null
  const scope = typeof body.scope === 'string' ? body.scope.trim() : ''
  const orgUnitId = typeof body.orgUnitId === 'string' && body.orgUnitId ? body.orgUnitId : null
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''

  // Every live grant at the company, read once: the holder's sets and what
  // they already hold come from it.
  const all = (await prisma.permissionGrant.findMany({
    where: { companyId, revokedAt: null },
    select: { id: true, companyId: true, permission: true, roleId: true, contextId: true, scope: true, orgUnitId: true, revokedAt: true },
  })) as GrantRow[]

  let holder: { kind: 'ROLE' | 'PERSON'; name: string } | null = null
  const holderSets: HolderSet[] = []
  let alreadyHeld = false

  if (roleId && !contextId) {
    const role = await prisma.role.findFirst({
      where: { id: roleId, companyId },
      select: {
        id: true, name: true, permissions: true,
        contexts: { where: { revokedAt: null }, select: { id: true, person: { select: { name: true } } }, take: 1000 },
      },
    })
    if (role) {
      holder = { kind: 'ROLE', name: `Everybody in ${role.name}` }
      const roleSeat = { companyId, roleId: role.id, contextId: '' }
      const roleSet = effectivePermissions(role.permissions, roleSeat, all)
      alreadyHeld = roleSet.includes(permission) || role.permissions.includes('*')
      holderSets.push({ name: role.name, roleName: role.name, permissions: roleSet })
      for (const c of role.contexts) {
        holderSets.push({
          name: c.person.name,
          roleName: role.name,
          permissions: effectivePermissions(role.permissions, { companyId, roleId: role.id, contextId: c.id }, all),
        })
      }
    }
  } else if (contextId && !roleId) {
    const seat = await prisma.context.findFirst({
      where: { id: contextId, companyId, revokedAt: null },
      select: { id: true, roleId: true, person: { select: { name: true } }, role: { select: { name: true, permissions: true } } },
    })
    if (seat) {
      holder = { kind: 'PERSON', name: seat.person.name }
      const set = effectivePermissions(seat.role?.permissions ?? [], { companyId, roleId: seat.roleId, contextId: seat.id }, all)
      alreadyHeld = set.includes(permission) || set.includes('*')
      if (permission === GRANT_RIGHT) alreadyHeld = all.some((g) => g.permission === GRANT_RIGHT && g.contextId === seat.id)
      holderSets.push({ name: seat.person.name, roleName: seat.role?.name ?? null, permissions: set })
    }
  }

  const unitAtCompany = orgUnitId
    ? Boolean(await prisma.orgUnit.findFirst({ where: { id: orgUnitId, companyId }, select: { id: true } }))
    : false

  const verdict = checkGrant({
    companyName,
    granter: {
      isOwner,
      hasGrantRight: grantRight,
      permissions: caller.permissions,
      scope: permission ? await permissionScope(caller, permission) : { has: false, scope: 'NONE', unitIds: [] },
    },
    permission, roleId, contextId, holder, holderSets,
    alreadyHeld,
    scope, orgUnitId, unitAtCompany, reason,
  })
  if (!verdict.ok) {
    return refuse(verdict.field ? 'VALIDATION' : 'FORBIDDEN', verdict.says, verdict.field ? 422 : 403, verdict.field)
  }

  const grant = await prisma.permissionGrant.create({
    data: {
      companyId, permission, roleId, contextId,
      scope: scope as 'COMPANY' | 'UNIT' | 'PERSON',
      orgUnitId: scope === 'UNIT' ? orgUnitId : null,
      grantedById: caller.person.id,
      reason,
    },
    select: { id: true, grantedAt: true },
  })

  const said = `${holder!.name} may now ${labelOf(permission)} ${SCOPE_WORDS[scope]}.`
  await prisma.automationLog.create({
    data: {
      companyId,
      action: 'PERMISSION_GRANTED',
      summary: `${caller.person.name} gave access: ${said}`,
      reason,
      payload: { grantId: grant.id, permission, roleId, contextId, scope, orgUnitId, holders: Math.max(holderSets.length - (roleId ? 1 : 0), 0) },
      reversible: true,
    },
  })
  void emit({
    type: 'access.granted',
    companyId,
    subjectType: 'PermissionGrant',
    subjectId: grant.id,
    actorPersonId: caller.person.id,
    payload: { permission, roleId, contextId, scope, orgUnitId },
  })

  return NextResponse.json({ data: { id: grant.id, says: `Saved. ${said} Revoke takes it back in one press.` } }, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const { ok, error } = await guard(request)
  if (error) return error
  const { caller, companyId, companyName, isOwner, grantRight } = ok

  const id = request.nextUrl.searchParams.get('id') ?? ''
  const grant = id
    ? await prisma.permissionGrant.findFirst({
        where: { id, companyId },
        select: {
          id: true, permission: true, revokedAt: true, scope: true, roleId: true, contextId: true,
          role: { select: { name: true } }, context: { select: { person: { select: { name: true } } } },
        },
      })
    : null

  const verdict = checkRevoke({ isOwner, hasGrantRight: grantRight, grant, companyName })
  if (!verdict.ok) {
    return refuse(verdict.field ? 'NOT_FOUND' : 'FORBIDDEN', verdict.says, verdict.field ? 404 : 403)
  }

  await prisma.permissionGrant.update({ where: { id: grant!.id }, data: { revokedAt: new Date(), revokedById: caller.person.id } })
  const who = grant!.role ? `Everybody in ${grant!.role.name}` : grant!.context?.person.name ?? 'Somebody no longer here'
  const said = `${who} may no longer ${labelOf(grant!.permission)} through this grant.`
  await prisma.automationLog.create({
    data: {
      companyId,
      action: 'PERMISSION_REVOKED',
      summary: `${caller.person.name} took access away: ${said}`,
      reason: 'Revoked on Users & permissions',
      payload: { grantId: grant!.id, permission: grant!.permission, roleId: grant!.roleId, contextId: grant!.contextId },
      reversible: true,
    },
  })
  void emit({
    type: 'access.revoked',
    companyId,
    subjectType: 'PermissionGrant',
    subjectId: grant!.id,
    actorPersonId: caller.person.id,
    payload: { permission: grant!.permission },
  })

  return NextResponse.json({ data: { id: grant!.id, says: `Revoked. ${said}` } })
}
