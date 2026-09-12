import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { staffOnly } from '@/lib/seat'
import { prisma } from '@/lib/db'
import { sensitivityOf } from '@/lib/access-grant'

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
