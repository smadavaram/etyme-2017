import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { reconcile, type TheirLine } from '@/lib/reconciliation'

/**
 * POST /api/integrations/reconcile — our invoices against their statement.
 *
 * Ours: what we billed the counterparty in the period. Theirs: the
 * statement lines pasted in. The run is persisted with every break
 * named, because a reconciliation ending in a bare number gets redone
 * next month from zero.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Reconciliation')
  if (notStaff) return notStaff

  const companyId = caller.company!.id
  const body = await request.json().catch(() => ({}))

  const againstCompanyId = body?.againstCompanyId ? String(body.againstCompanyId) : null
  const periodStart = new Date(String(body?.periodStart ?? ''))
  const periodEnd = new Date(String(body?.periodEnd ?? ''))
  if (isNaN(periodStart.getTime()) || isNaN(periodEnd.getTime())) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'A period, both ends.', field: 'periodStart' } },
      { status: 422 }
    )
  }

  const theirs: TheirLine[] = Array.isArray(body?.theirs)
    ? body.theirs
        .map((t: any) => ({
          amountCents: Math.round(Number(t.amountCents ?? Number(t.amount) * 100)),
          on: String(t.on ?? ''),
          ref: t.ref ? String(t.ref) : null,
        }))
        .filter((t: TheirLine) => Number.isFinite(t.amountCents))
    : []

  const invoices = await prisma.invoice.findMany({
    where: {
      engagement: { msa: { vendorId: companyId, ...(againstCompanyId ? { clientId: againstCompanyId } : {}) } },
      periodEnd: { gte: periodStart, lte: periodEnd },
    },
    select: { id: true, number: true, total: true, issuedAt: true, periodEnd: true },
  })

  const ours = invoices.map((i) => ({
    id: i.id,
    amountCents: Math.round(Number(i.total) * 100),
    on: (i.issuedAt ?? i.periodEnd).toISOString().slice(0, 10),
    ref: i.number,
  }))

  const result = reconcile(ours, theirs)

  const run = await prisma.reconciliationRun.create({
    data: {
      companyId,
      againstCompanyId,
      system: body?.system ? String(body.system) : 'STATEMENT',
      periodStart,
      periodEnd,
      oursCents: result.oursCents,
      theirsCents: result.theirsCents,
      differenceCents: result.differenceCents,
      breaks: result.breaks as any,
      runById: caller.person.id,
    },
    select: { id: true },
  })

  return NextResponse.json({ data: { runId: run.id, ...result } })
}

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Reconciliation')
  if (notStaff) return notStaff

  const runs = await prisma.reconciliationRun.findMany({
    where: { companyId: caller.company!.id },
    orderBy: { runAt: 'desc' },
    take: 20,
    include: { againstCompany: { select: { name: true } } },
  })

  return NextResponse.json({
    data: {
      runs: runs.map((r) => ({
        id: r.id,
        against: r.againstCompany?.name ?? r.system,
        period: `${r.periodStart.toISOString().slice(0, 10)} to ${r.periodEnd.toISOString().slice(0, 10)}`,
        oursCents: r.oursCents,
        theirsCents: r.theirsCents,
        differenceCents: r.differenceCents,
        breaks: r.breaks,
        runAt: r.runAt,
      })),
    },
  })
}
