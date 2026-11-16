import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { readCaller, refuseUnlessPayerManager, logCodeChange } from '../coding/guard'
import { COST_OBJECT_KIND_WORDS } from '@/lib/counterparty'

/**
 * GET   /api/settings/internal-orders  — the client's cost objects
 * POST  /api/settings/internal-orders  — add one, with its kind
 * PATCH /api/settings/internal-orders  — change the kind of one
 *
 * An internal order, a project code, a WBS element or a material code.
 * The kind is a choice, never free text. Existing rows are internal orders.
 */
const KINDS = COST_OBJECT_KIND_WORDS.map((k) => k.value) as string[]
const KIND_SAYS = 'Choose a kind: internal order, project code, WBS element or material code.'
const select = { id: true, code: true, name: true, kind: true } as const

export async function GET(request: NextRequest) {
  const { caller, error } = await readCaller(request)
  if (error) return error
  const refused = await refuseUnlessPayerManager(caller, 'Reading the cost objects')
  if (refused) return refused
  const rows = await prisma.internalOrder.findMany({ where: { companyId: caller.company!.id, isActive: true }, orderBy: { code: 'asc' }, select })
  return NextResponse.json({ data: { internalOrders: rows } })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await readCaller(request)
  if (error) return error
  const refused = await refuseUnlessPayerManager(caller, 'Adding a cost object')
  if (refused) return refused
  const companyId = caller.company!.id

  const body = await request.json().catch(() => ({}))
  const code = String(body.code ?? '').trim().toUpperCase()
  const name = String(body.name ?? '').trim()
  const kind = String(body.kind ?? 'INTERNAL_ORDER')
  if (!code || !name) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'A cost object needs the code your accounting system uses and a name.', field: !code ? 'code' : 'name' } }, { status: 422 })
  }
  if (!KINDS.includes(kind)) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: KIND_SAYS, field: 'kind' } }, { status: 422 })
  }
  const clash = await prisma.internalOrder.findFirst({ where: { companyId, code } })
  if (clash) {
    return NextResponse.json({ error: { code: 'DUPLICATE', message: `${code} already exists — it is ${clash.name}.` } }, { status: 409 })
  }
  const internalOrder = await prisma.internalOrder.create({ data: { companyId, code, name, kind }, select })
  await logCodeChange(caller, 'COST_OBJECT_ADDED', `the cost objects: added ${code}`)
  return NextResponse.json({ data: { internalOrder } }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const { caller, error } = await readCaller(request)
  if (error) return error
  const refused = await refuseUnlessPayerManager(caller, 'Changing a cost object')
  if (refused) return refused

  const body = await request.json().catch(() => ({}))
  const kind = String(body.kind ?? '')
  if (!KINDS.includes(kind)) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: KIND_SAYS, field: 'kind' } }, { status: 422 })
  }
  const existing = await prisma.internalOrder.findFirst({ where: { id: String(body.id ?? ''), companyId: caller.company!.id } })
  if (!existing) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No such cost object here.' } }, { status: 404 })
  }
  const internalOrder = await prisma.internalOrder.update({ where: { id: existing.id }, data: { kind }, select })
  await logCodeChange(caller, 'COST_OBJECT_CHANGED', `the kind of ${existing.code} to ${kind}`)
  return NextResponse.json({ data: { internalOrder } })
}
