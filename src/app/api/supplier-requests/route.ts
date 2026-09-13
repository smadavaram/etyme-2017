import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { notify } from '@/lib/notify'
import { mayRecommend, newChecklist, readiness, type ChecklistItem } from '@/lib/supplier-onboarding'

/**
 * GET  /api/supplier-requests          — firms recommended here, and where each stands
 * POST /api/supplier-requests          — recommend one: { name, domain?, contactName?, contactEmail?, reason }
 *
 * A recommendation lands on the Procurement desk as a decision. Nothing
 * is created for the firm until it is approved.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Supplier requests')
  if (notStaff) return notStaff
  const rows = await prisma.supplierRequest.findMany({
    where: { companyId: caller.company!.id },
    orderBy: [{ state: 'asc' }, { createdAt: 'desc' }],
  })
  const people = await prisma.person.findMany({
    where: { id: { in: [...new Set(rows.flatMap((r) => [r.recommendedById, r.decidedById].filter((x): x is string => !!x)))] } },
    select: { id: true, name: true },
  })
  const nameOf = new Map(people.map((p) => [p.id, p.name]))
  return NextResponse.json({
    data: {
      requests: rows.map((r) => {
        const checklist = r.checklist as unknown as ChecklistItem[]
        return {
          ...r,
          checklist,
          recommendedBy: nameOf.get(r.recommendedById) ?? 'somebody',
          decidedBy: r.decidedById ? nameOf.get(r.decidedById) ?? null : null,
          mine: r.recommendedById === caller.person.id,
          readiness: readiness(r.name, checklist),
        }
      }),
      mayRecommend: mayRecommend(caller.permissions),
      mayDecide: caller.permissions.includes('vendors.manage'),
    },
  })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Supplier requests')
  if (notStaff) return notStaff
  if (!mayRecommend(caller.permissions)) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Recommending a supplier is for whoever raises requirements here.' } }, { status: 403 })
  }
  const body = await request.json().catch(() => ({}))
  const name = String(body?.name ?? '').trim()
  const reason = String(body?.reason ?? '').trim()
  if (!name) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Which firm? A name, at least.', field: 'name' } }, { status: 422 })
  if (!reason) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Say why — Procurement reads this first.', field: 'reason' } }, { status: 422 })
  const contactEmail = typeof body?.contactEmail === 'string' && body.contactEmail.includes('@') ? body.contactEmail.trim().toLowerCase() : null
  const domain = typeof body?.domain === 'string' && body.domain.trim() ? body.domain.trim().toLowerCase() : contactEmail?.split('@')[1] ?? null
  const companyId = caller.company!.id

  const open = await prisma.supplierRequest.findFirst({
    where: { companyId, name: { equals: name, mode: 'insensitive' }, state: { in: ['RECOMMENDED', 'IN_REVIEW'] } },
    select: { id: true },
  })
  if (open) {
    return NextResponse.json({ error: { code: 'ALREADY_RECOMMENDED', message: `${name} is already with Procurement.` } }, { status: 409 })
  }

  const row = await prisma.supplierRequest.create({
    data: {
      companyId, name, domain, contactEmail,
      contactName: typeof body?.contactName === 'string' && body.contactName.trim() ? body.contactName.trim() : null,
      reason, recommendedById: caller.person.id, checklist: newChecklist() as unknown as object,
    },
  })

  // The Procurement desk hears, in a sentence.
  const desk = await prisma.context.findMany({
    where: { companyId, role: { permissions: { has: 'vendors.manage' } }, personId: { not: caller.person.id } },
    select: { personId: true },
  })
  for (const d of desk) {
    void notify({
      personId: d.personId, companyId, type: 'SYSTEM', entityId: row.id,
      title: `Supplier recommended — ${name}`,
      body: `${caller.person.name} recommends ${name}: ${reason}`,
      data: { href: '/dashboard/suppliers' },
    })
  }

  return NextResponse.json({
    data: {
      request: row,
      says: `${name} is with Procurement. It becomes a supplier when the paperwork is on file and somebody other than you approves it.`,
    },
  }, { status: 201 })
}
