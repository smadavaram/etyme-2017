import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'
import { commissionFor } from '@/lib/commission'
import { orderFor, postCommission, NoRate } from '@/lib/order-postings'

/**
 * GET — what has been earned, and on what.
 *
 * The run posted commissions from the day it was built and nothing
 * read them back, so the only way to see a recruiter's earnings was a
 * database query. Postings are the record, so they are what this reads:
 * one row per person per period, with the contract each came from.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Commissions')
  if (notStaff) return notStaff
  if (!hasPermission(caller.permissions, 'payroll.run') && !hasPermission(caller.permissions, 'invoices.read')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Commissions are the money desk’s. Ask whoever runs payroll here.' } },
      { status: 403 }
    )
  }
  const companyId = caller.company!.id

  const postings = await prisma.orderPosting.findMany({
    where: { companyId, kind: 'COMMISSION' },
    orderBy: { postedAt: 'desc' },
    take: 500,
    select: {
      id: true, amountCents: true, currency: true, postedAt: true, says: true,
      person: { select: { id: true, name: true } },
      projectOrder: { select: { code: true, name: true } },
    },
  })

  // Grouped by the person who earned it and the period it landed in,
  // because "what did Ruth earn in September" is the only question
  // anybody opens this for.
  const byKey = new Map<string, {
    personId: string | null; name: string; period: string
    amountCents: number; currency: string; lines: { says: string; amountCents: number; order: string }[]
  }>()
  for (const p of postings) {
    const period = p.postedAt.toISOString().slice(0, 7)
    const key = `${p.person?.id ?? 'none'}:${period}`
    const row = byKey.get(key) ?? {
      personId: p.person?.id ?? null,
      name: p.person?.name ?? 'Unattributed',
      period, amountCents: 0, currency: p.currency, lines: [],
    }
    row.amountCents += p.amountCents
    row.lines.push({ says: p.says ?? '', amountCents: p.amountCents, order: p.projectOrder?.code ?? '—' })
    byKey.set(key, row)
  }
  const earnings = [...byKey.values()].sort((a, b) => b.period.localeCompare(a.period) || b.amountCents - a.amountCents)
  const total = earnings.reduce((n, e) => n + e.amountCents, 0)

  const agents = await prisma.buyContract.count({
    where: { companyId, commissionType: { not: null }, state: { in: ['IN_PROGRESS', 'VERIFIED', 'DRAFT'] } },
  })

  return NextResponse.json({
    data: {
      earnings, agents,
      mayRun: hasPermission(caller.permissions, 'payroll.run'),
      summary: agents === 0
        ? 'Nobody is on a commission agreement here yet. A buy contract with a commission type is what puts them on one.'
        : earnings.length === 0
          ? `${agents} ${agents === 1 ? 'person is' : 'people are'} on a commission agreement, and nothing has been run yet.`
          : `$${Math.round(total / 100).toLocaleString('en-US')} earned across ${earnings.length} ${earnings.length === 1 ? 'person-period' : 'person-periods'}.`,
    },
  })
}

/**
 * POST /api/payroll/commissions   { periodStart, periodEnd }
 *
 * The commission run. For every commission-type buy contract at this
 * company, what the agent earned in the period from the sell contracts
 * linked to it — hours approved, margin on those hours, placements that
 * started — posted as COMMISSION against each project order, held under
 * the cap, and written down. Run it again for the same period and it
 * posts nothing twice.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'The commission run')
  if (notStaff) return notStaff
  if (!hasPermission(caller.permissions, 'payroll.run') && !hasPermission(caller.permissions, 'invoices.issue')) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: `The commission run is for whoever runs pay at ${caller.company!.name}.` } }, { status: 403 })
  }
  const companyId = caller.company!.id
  const body = await request.json().catch(() => ({}))
  const periodStart = body.periodStart ? new Date(body.periodStart) : null
  const periodEnd = body.periodEnd ? new Date(body.periodEnd) : null
  if (!periodStart || !periodEnd || Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime()) || periodEnd < periodStart) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Say which period: a start and an end.' } }, { status: 422 })
  }
  const periodKey = periodEnd.toISOString().slice(0, 10)

  const agents = await prisma.buyContract.findMany({
    where: { companyId, commissionType: { not: null }, state: { in: ['IN_PROGRESS', 'VERIFIED', 'DRAFT'] } },
    include: {
      candidates: { where: { state: 'ACTIVE' }, select: { personId: true, person: { select: { name: true } } }, take: 1 },
      sellLinks: {
        include: {
          sellContract: {
            select: {
              id: true, billRate: true, billCurrency: true, startDate: true,
              timesheets: {
                where: { status: 'APPROVED', periodEnd: { gte: periodStart }, periodStart: { lte: periodEnd } },
                select: { totalHours: true, acceptedHours: true },
              },
              // What the delivering side is paid, for the margin.
              buyLinks: {
                include: { buyContract: { select: { commissionType: true, candidates: { where: { state: 'ACTIVE' }, select: { payRate: true }, take: 1 } } } },
              },
            },
          },
        },
      },
    },
  })

  const posted: { agent: string; buyContractId: string; amountCents: number; says: string }[] = []
  const skipped: { buyContractId: string; why: string }[] = []

  for (const bc of agents) {
    const agent = bc.candidates[0] ?? null
    const already = await prisma.orderPosting.aggregate({ where: { buyContractId: bc.id, kind: 'COMMISSION', reversalOfId: null }, _sum: { amountCents: true } })
    let hours = 0
    let marginCents = 0
    let placementsStarted = 0
    const orders: { sellContractId: string; orderId: string; currency: string }[] = []
    for (const link of bc.sellLinks) {
      const sc = link.sellContract
      const h = sc.timesheets.reduce((s, t) => s + Number(t.acceptedHours ?? t.totalHours), 0)
      const payRate = sc.buyLinks.find((l) => !l.buyContract.commissionType)?.buyContract.candidates[0]?.payRate ?? 0
      hours += h
      marginCents += Math.round(h * Math.max(0, sc.billRate - payRate))
      if (sc.startDate >= periodStart && sc.startDate <= periodEnd) placementsStarted++
      const orderId = await orderFor(sc.id)
      if (orderId) orders.push({ sellContractId: sc.id, orderId, currency: sc.billCurrency })
    }
    const result = commissionFor({
      type: bc.commissionType!, rate: bc.commissionRate ?? 0, capCents: bc.commissionCap,
      alreadyCents: Math.abs(already._sum.amountCents ?? 0), hours, marginCents, placementsStarted,
    })
    if (result.amountCents === 0 || orders.length === 0) {
      skipped.push({ buyContractId: bc.id, why: orders.length === 0 ? 'No project order behind the linked contracts.' : result.says })
      continue
    }
    // Spread across the orders the linked contracts bill to, evenly.
    const share = Math.floor(result.amountCents / orders.length)
    let remainder = result.amountCents - share * orders.length
    for (const o of orders) {
      const cents = share + (remainder > 0 ? 1 : 0)
      if (remainder > 0) remainder--
      try {
        await postCommission({
          projectOrderId: o.orderId, companyId, personId: agent?.personId ?? null, buyContractId: bc.id, sellContractId: o.sellContractId,
          amountCents: cents, postedAt: periodEnd, sourceId: `commission:${bc.id}:${periodKey}:${o.sellContractId}`,
          says: `${agent?.person.name ?? 'Commission'} — ${result.says}`, txCurrency: o.currency, createdById: caller.person.id,
        })
      } catch (e) {
        if (e instanceof NoRate) { skipped.push({ buyContractId: bc.id, why: e.message }); continue }
        throw e
      }
    }
    posted.push({ agent: agent?.person.name ?? 'Commission', buyContractId: bc.id, amountCents: result.amountCents, says: result.says })
  }

  await prisma.automationLog.create({
    data: {
      companyId,
      action: 'COMMISSION_RUN',
      summary: posted.length
        ? `Commissions for the period to ${periodKey}: ${posted.map((p) => `${p.agent} $${(p.amountCents / 100).toFixed(2)}`).join('; ')}.`
        : `Commissions for the period to ${periodKey}: nothing earned.`,
      reason: `Run by ${caller.person.name} for ${periodStart.toISOString().slice(0, 10)} to ${periodKey}.`,
      payload: { periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString(), posted, skipped },
      reversible: true,
    },
  })

  return NextResponse.json({
    data: {
      posted, skipped,
      says: posted.length
        ? `${posted.length} commission${posted.length === 1 ? '' : 's'} posted for the period to ${periodKey}.`
        : 'Nothing earned this period.',
    },
  })
}
