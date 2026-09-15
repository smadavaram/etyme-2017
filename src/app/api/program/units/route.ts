import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'

/**
 * POST /api/program/units   { name, kind, parentId? }
 *
 * A business unit, practice, account, project or department. Org units
 * came only from the seed; a real client had no way to add the unit a
 * new desk sits in. Kinds are the five the schema names; a practice and
 * an account were documented and never creatable.
 */
const KINDS = ['BU', 'PRACTICE', 'ACCOUNT', 'PROJECT', 'DEPARTMENT'] as const

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'The organization')
  if (notStaff) return notStaff
  if (!hasPermission(caller.permissions, 'settings.manage') && !hasPermission(caller.permissions, 'governance.write')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: `Adding a unit is for whoever runs the program at ${caller.company!.name}.` } },
      { status: 403 }
    )
  }
  const body = await request.json().catch(() => ({}))
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : ''
  const kind = typeof body.kind === 'string' ? body.kind.trim().toUpperCase() : 'DEPARTMENT'
  const parentId = typeof body.parentId === 'string' && body.parentId ? body.parentId : null
  if (!name) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Give the unit a name.' } }, { status: 422 })
  if (!(KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: `A unit is a business unit, a practice, an account, a project or a department — not "${body.kind}".` } },
      { status: 422 }
    )
  }
  const companyId = caller.company!.id
  if (parentId) {
    const parent = await prisma.orgUnit.findFirst({ where: { id: parentId, companyId }, select: { id: true } })
    if (!parent) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That parent unit is not yours.' } }, { status: 404 })
  }
  const twin = await prisma.orgUnit.findFirst({ where: { companyId, name, parentId }, select: { id: true } })
  if (twin) return NextResponse.json({ data: { id: twin.id, existing: true, says: `${name} is already there.` } })

  const unit = await prisma.orgUnit.create({ data: { companyId, name, kind: kind as never, parentId }, select: { id: true } })
  return NextResponse.json(
    { data: { id: unit.id, existing: false, says: `${name} added. Name its HR and Procurement desks, or it inherits the unit above.` } },
    { status: 201 }
  )
}
