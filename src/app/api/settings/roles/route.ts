import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission, PERMISSIONS, type Permission } from '@/lib/permissions'
import { emit } from '@/lib/events'

/**
 * POST   /api/settings/roles       — make a role
 * PATCH  /api/settings/roles       — change what a role can do
 * DELETE /api/settings/roles?id=   — remove one
 *
 * Editing a role changes what everybody holding it can do, immediately and
 * without telling them. That is why this needs team.manage rather than
 * settings.manage, and why every change is an event: "who could see the
 * margin in March" is a question that gets asked after somebody leaves.
 */

async function guard(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return { caller: null, error }
  if (!caller.company) {
    return {
      caller: null,
      error: NextResponse.json(
        { error: { code: 'NO_COMPANY', message: 'Roles belong to a company' } },
        { status: 403 }
      ),
    }
  }
  if (!hasPermission(caller.permissions, 'team.manage')) {
    return {
      caller: null,
      error: NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Changing roles needs team.manage' } },
        { status: 403 }
      ),
    }
  }
  return { caller, error: null }
}

/** Names we do not emit and do not accept. */
function validatePermissions(raw: unknown): { ok: Permission[]; bad: string[] } {
  const known = new Set<string>(PERMISSIONS)
  const list = Array.isArray(raw) ? raw.map(String) : []
  return {
    ok: list.filter((p) => known.has(p)) as Permission[],
    // A permission nobody checks grants nothing and looks identical to one
    // that works, so an unknown name is refused rather than stored.
    bad: list.filter((p) => !known.has(p)),
  }
}

export async function POST(request: NextRequest) {
  const { caller, error } = await guard(request)
  if (error) return error
  const companyId = caller!.company!.id

  const body = await request.json().catch(() => ({}))
  const name = String(body.name ?? '').trim()
  if (!name) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'A role needs a name', field: 'name' } },
      { status: 422 }
    )
  }

  const clash = await prisma.role.findFirst({ where: { companyId, name } })
  if (clash) {
    return NextResponse.json(
      { error: { code: 'DUPLICATE', message: `There is already a role called ${name}` } },
      { status: 409 }
    )
  }

  const { ok, bad } = validatePermissions(body.permissions)
  if (bad.length > 0) {
    return NextResponse.json(
      {
        error: {
          code: 'UNKNOWN_PERMISSION',
          message: `Not a permission this system checks: ${bad.join(', ')}`,
          field: 'permissions',
          known: PERMISSIONS,
        },
      },
      { status: 422 }
    )
  }

  const role = await prisma.role.create({
    data: { companyId, name, permissions: ok, isDefault: false },
    select: { id: true, name: true, permissions: true, isDefault: true },
  })

  return NextResponse.json({ data: { role, heldBy: 0 } }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const { caller, error } = await guard(request)
  if (error) return error
  const companyId = caller!.company!.id

  const body = await request.json().catch(() => ({}))
  const id = String(body.id ?? '')
  const existing = await prisma.role.findFirst({
    where: { id, companyId },
    select: { id: true, name: true, permissions: true, _count: { select: { contexts: true } } },
  })
  if (!existing) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such role here' } },
      { status: 404 }
    )
  }

  const data: Record<string, unknown> = {}
  let added: string[] = []
  let removed: string[] = []

  if (typeof body.name === 'string' && body.name.trim() && body.name.trim() !== existing.name) {
    data.name = body.name.trim()
  }

  if ('permissions' in body) {
    const { ok, bad } = validatePermissions(body.permissions)
    if (bad.length > 0) {
      return NextResponse.json(
        {
          error: {
            code: 'UNKNOWN_PERMISSION',
            message: `Not a permission this system checks: ${bad.join(', ')}`,
            field: 'permissions',
            known: PERMISSIONS,
          },
        },
        { status: 422 }
      )
    }

    const before = new Set(existing.permissions)
    const after = new Set<string>(ok)
    added = ok.filter((p) => !before.has(p))
    removed = existing.permissions.filter((p) => !after.has(p))

    // The last way back in. A company that removes team.manage from every
    // role it holds cannot grant anything ever again, and the only remedy
    // is somebody editing the database.
    if (removed.includes('team.manage')) {
      const otherHolders = await prisma.role.count({
        where: {
          companyId,
          id: { not: id },
          permissions: { has: 'team.manage' },
          contexts: { some: { revokedAt: null } },
        },
      })
      if (otherHolders === 0) {
        return NextResponse.json(
          {
            error: {
              code: 'LAST_ADMIN',
              message:
                'This is the only role anybody holds that can manage people. Removing it would lock everyone out of granting access. Give another role team.manage first.',
            },
          },
          { status: 409 }
        )
      }
    }

    data.permissions = ok
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Nothing to change' } },
      { status: 422 }
    )
  }

  const role = await prisma.role.update({
    where: { id },
    data,
    select: { id: true, name: true, permissions: true, isDefault: true },
  })

  if (added.length > 0 || removed.length > 0) {
    await prisma.automationLog.create({
      data: {
        companyId,
        action: 'ROLE_PERMISSIONS_CHANGED',
        summary: `${caller!.person.name} changed what ${role.name} can do — ${existing._count.contexts} person(s) affected`,
        reason: [
          added.length ? `gained ${added.join(', ')}` : null,
          removed.length ? `lost ${removed.join(', ')}` : null,
        ].filter(Boolean).join(' · '),
        payload: { roleId: id, added, removed, holders: existing._count.contexts },
        reversible: true,
      },
    })

    void emit({
      type: 'access.granted',
      companyId,
      subjectType: 'Role',
      subjectId: id,
      actorPersonId: caller!.person.id,
      payload: { roleName: role.name, added, removed, holders: existing._count.contexts },
    })
  }

  return NextResponse.json({
    data: {
      role,
      added,
      removed,
      // Nobody is told their permissions changed, so the person changing
      // them should at least see how many people they just affected.
      affected: existing._count.contexts,
      message:
        existing._count.contexts > 0
          ? `Saved. ${existing._count.contexts} person(s) hold this role and their access changed just now.`
          : 'Saved. Nobody holds this role yet.',
    },
  })
}

export async function DELETE(request: NextRequest) {
  const { caller, error } = await guard(request)
  if (error) return error

  const id = request.nextUrl.searchParams.get('id') ?? ''
  const existing = await prisma.role.findFirst({
    where: { id, companyId: caller!.company!.id },
    select: { id: true, name: true, _count: { select: { contexts: true } } },
  })
  if (!existing) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such role here' } },
      { status: 404 }
    )
  }

  // Deleting a role somebody holds would leave them in the company with no
  // permissions and no explanation. Move them first.
  if (existing._count.contexts > 0) {
    return NextResponse.json(
      {
        error: {
          code: 'IN_USE',
          message: `${existing._count.contexts} person(s) hold ${existing.name}. Give them another role first.`,
        },
      },
      { status: 409 }
    )
  }

  await prisma.role.delete({ where: { id } })
  return NextResponse.json({ data: { removed: existing.name } })
}
