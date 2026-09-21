import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { staffOnly } from '@/lib/seat'
import { prisma } from '@/lib/db'
import { sensitivityOf } from '@/lib/access-grant'
import { ensureDefaultRoles } from '@/lib/company-roles'
import { hasPermission, askTheDesk, type Permission } from '@/lib/permissions'

/**
 * The same gate the access register itself carries, and for the same
 * reason: this is the other half of one screen. Users & permissions
 * reads `/api/access` and `/api/roles` in one breath, and a catalog of
 * every role at a firm with how much each can do is the map of that
 * firm's segregation of duties. It answered 200 to anybody signed in.
 */
const TO_READ: Permission = 'governance.read'

/**
 * GET /api/roles — the roles this company can grant
 *
 * Each carries how much it can do, so whoever is granting sees that
 * "Owner" and "Delivery Viewer" are not the same kind of decision before
 * they make it rather than after.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Roles and permissions')
  if (notStaff) return notStaff

  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Roles belong to a company' } },
      { status: 403 }
    )
  }

  if (!hasPermission(caller.permissions, TO_READ)) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: askTheDesk({
            doing: 'Reading the roles this company grants',
            needs: TO_READ,
            kind: caller.company.kind,
            companyName: caller.company.name,
          }),
        },
      },
      { status: 403 }
    )
  }

  // The defaults for this kind of company, brought up to date on read.
  await ensureDefaultRoles(caller.company.id, caller.company.kind)

  const roles = await prisma.role.findMany({
    where: { companyId: caller.company.id },
    select: { id: true, name: true, permissions: true, isDefault: true },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({
    data: {
      roles: roles.map(r => ({
        id: r.id,
        name: r.name,
        isDefault: r.isDefault,
        permissionCount: r.permissions.length,
        sensitivity: sensitivityOf(r.permissions),
      })),
    },
  })
}
