import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { reconcile, type TheirLine } from '@/lib/reconciliation'
import { minorFromWhole } from '@/lib/money'

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
  // Our figures against theirs is money, read by the desks that read it.
  if (!hasPermission(caller.permissions, 'invoices.read')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: askTheDesk({
            doing: 'Reconciling the company\u2019s figures against a statement',
            needs: 'invoices.read',
            kind: caller.company?.kind,
            companyName: caller.company?.name,
          }),
        },
      },
      { status: 403 }
    )
  }

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

  // One currency: the company's own. A statement line typed as a whole
  // amount is read in that currency's own exponent, never times a hundred.
  const currency = await companyCurrency(companyId)
  const theirs: TheirLine[] = Array.isArray(body?.theirs)
    ? body.theirs
        .map((t: any) => ({
          amountCents: Math.round(t.amountCents != null ? Number(t.amountCents) : minorFromWhole(Number(t.amount), currency)),
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
    select: { id: true, number: true, total: true, issuedAt: true, periodEnd: true, currency: true },
  })

  // Bills in another currency are never added to this one; they are counted and said.
  const inOther = [...new Set(invoices.filter((i) => i.currency !== currency).map((i) => i.currency))].sort()
  const ours = invoices.filter((i) => i.currency === currency).map((i) => ({
    id: i.id,
    amountCents: minorFromWhole(i.total, currency),
    on: (i.issuedAt ?? i.periodEnd).toISOString().slice(0, 10),
    ref: i.number,
  }))

  const reconciled = reconcile(ours, theirs, currency)
  const result = inOther.length
    ? { ...reconciled, says: `${reconciled.says} Bills in ${inOther.join(', ')} were left out: a reconciliation is in one currency, ${currency}.` }
    : reconciled

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
  // Our figures against theirs is money, read by the desks that read it.
  if (!hasPermission(caller.permissions, 'invoices.read')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: askTheDesk({
            doing: 'Reconciling the company\u2019s figures against a statement',
            needs: 'invoices.read',
            kind: caller.company?.kind,
            companyName: caller.company?.name,
          }),
        },
      },
      { status: 403 }
    )
  }

  const currency = await companyCurrency(caller.company!.id)
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
        currency,
      })),
    },
  })
}

/**
 * The currency a reconciliation is in: the company's own. A run stores no
 * currency of its own yet (schema request: ReconciliationRun.currency), so
 * every run is run and read in this one.
 */
async function companyCurrency(companyId: string): Promise<string> {
  const c = await prisma.company.findUnique({ where: { id: companyId }, select: { currency: true } })
  return c?.currency || 'USD'
}
