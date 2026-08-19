import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'

/**
 * POST   /api/settings/cost-centers      — add one
 * PATCH  /api/settings/cost-centers      — edit one
 * DELETE /api/settings/cost-centers?id=  — retire one
 *
 * Who owns the spend. A requisition with no cost centre is spend nobody
 * owns, which is why the approval engine routes it to a human — and why a
 * company with no cost centres routes everything to a human and then
 * wonders why the system is slow.
 *
 * The code must match the owner's ERP exactly, because the coded invoice
 * export is posted straight into it. A near-miss on a cost centre code is
 * a rejected file, not a warning.
 */

async function guard(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return { caller: null, error }
  if (!caller.company) {
    return {
      caller: null,
      error: NextResponse.json(
        { error: { code: 'NO_COMPANY', message: 'Cost centres belong to a company' } },
        { status: 403 }
      ),
    }
  }
  // Finance owns the chart of accounts, not whoever can edit the address.
  if (!hasPermission(caller.permissions, 'settings.manage')) {
    return {
      caller: null,
      error: NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Changing cost centres needs settings.manage' } },
        { status: 403 }
      ),
    }
  }
  return { caller, error: null }
}

export async function POST(request: NextRequest) {
  const { caller, error } = await guard(request)
  if (error) return error
  const companyId = caller!.company!.id

  const body = await request.json().catch(() => ({}))
  const code = String(body.code ?? '').trim().toUpperCase()
  const name = String(body.name ?? '').trim()

  if (!code || !name) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'A cost centre needs the code your ERP uses and a name people recognise',
          field: !code ? 'code' : 'name',
        },
      },
      { status: 422 }
    )
  }

  const clash = await prisma.costCenter.findFirst({ where: { companyId, code } })
  if (clash) {
    return NextResponse.json(
      { error: { code: 'DUPLICATE', message: `${code} already exists — it is ${clash.name}` } },
      { status: 409 }
    )
  }

  const costCenter = await prisma.costCenter.create({
    data: {
      companyId,
      code,
      name,
      glAccount: body.glAccount ? String(body.glAccount).trim() : null,
    },
    select: { id: true, code: true, name: true, glAccount: true, isActive: true },
  })

  return NextResponse.json({ data: { costCenter } }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const { caller, error } = await guard(request)
  if (error) return error
  const companyId = caller!.company!.id

  const body = await request.json().catch(() => ({}))
  const id = String(body.id ?? '')
  const existing = await prisma.costCenter.findFirst({ where: { id, companyId } })
  if (!existing) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such cost centre here' } },
      { status: 404 }
    )
  }

  // Changing a code after invoices have been coded against it means last
  // month's file and this month's file post to different places for the
  // same team. Renaming is safe; recoding is not.
  if (typeof body.code === 'string' && body.code.trim().toUpperCase() !== existing.code) {
    const used = await prisma.contractCostAllocation.count({ where: { costCenterId: id } })
    if (used > 0) {
      return NextResponse.json(
        {
          error: {
            code: 'ALREADY_CODED',
            message: `${existing.code} is already coded on ${used} contract allocation(s). Changing the code would split this team's spend across two codes in your ERP. Retire it and add the new code instead.`,
          },
        },
        { status: 409 }
      )
    }
  }

  const costCenter = await prisma.costCenter.update({
    where: { id },
    data: {
      ...(typeof body.code === 'string' && body.code.trim() ? { code: body.code.trim().toUpperCase() } : {}),
      ...(typeof body.name === 'string' && body.name.trim() ? { name: body.name.trim() } : {}),
      ...('glAccount' in body ? { glAccount: body.glAccount ? String(body.glAccount).trim() : null } : {}),
      ...('isActive' in body ? { isActive: Boolean(body.isActive) } : {}),
    },
    select: { id: true, code: true, name: true, glAccount: true, isActive: true },
  })

  return NextResponse.json({ data: { costCenter } })
}

/**
 * Retire, not delete.
 *
 * A cost centre with history is part of how last year's spend is
 * explained. Deleting it would orphan those allocations; marking it
 * inactive keeps the history readable and stops it appearing on new work.
 */
export async function DELETE(request: NextRequest) {
  const { caller, error } = await guard(request)
  if (error) return error

  const id = request.nextUrl.searchParams.get('id') ?? ''
  const existing = await prisma.costCenter.findFirst({
    where: { id, companyId: caller!.company!.id },
    select: {
      id: true, code: true, name: true,
      _count: { select: { allocations: true, requisitions: true } },
    },
  })
  if (!existing) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such cost centre here' } },
      { status: 404 }
    )
  }

  const hasHistory = existing._count.allocations > 0 || existing._count.requisitions > 0

  if (hasHistory) {
    await prisma.costCenter.update({ where: { id }, data: { isActive: false } })
    return NextResponse.json({
      data: {
        retired: existing.code,
        message: `${existing.code} is retired. It stays on ${existing._count.allocations} allocation(s) and ${existing._count.requisitions} requisition(s) so last year's spend still explains itself, and it will not be offered on new work.`,
      },
    })
  }

  await prisma.costCenter.delete({ where: { id } })
  return NextResponse.json({
    data: { removed: existing.code, message: `${existing.code} removed. Nothing was coded to it.` },
  })
}
