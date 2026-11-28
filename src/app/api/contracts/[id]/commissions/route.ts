import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { recordRefusal, accessActor } from '@/lib/access-log'
import { writeRateTrail } from '@/lib/money/pay-trail'
import { commissionReader, setCommission } from '@/lib/money/commission-write'
import { commissionAccruals, monthPeriod } from '@/lib/money/commission-accrual'
import { termsSay, KIND_WORD, SETS_COMMISSIONS } from '@/lib/money/commission-rows'

/**
 * GET  /api/contracts/:id/commissions   the commissions on a line
 * POST /api/contracts/:id/commissions   set one, or change one ({ id })
 *
 * `:id` is a sell line or a buy line. On a sell line the answer is the
 * placement's: the sales commissions on the line and the recruiting
 * commissions on the buy line behind it (`ContractLink`), each with what it
 * earned this month.
 *
 * Who reads (founder, 2026-11-08): the Owner, a Contract Manager and
 * whoever reads payroll read the firm's; anyone else at the firm reads
 * their own rows and no other recruiter's; a firm not the line's, a client
 * first, reads nothing, refused in a sentence after the refusal is logged.
 * Who sets: the Owner or a Contract Manager at the line's firm.
 */

async function lineOf(id: string) {
  const sell = await prisma.sellContract.findUnique({
    where: { id },
    select: {
      id: true, companyId: true, personId: true, billCurrency: true, startDate: true,
      company: { select: { name: true } },
      buyLinks: { select: { buyContract: { select: { id: true, companyId: true, payCurrency: true } } } },
    },
  })
  if (sell) {
    const buys = sell.buyLinks.map((l) => l.buyContract).filter((b) => b.companyId === sell.companyId)
    return { side: 'SELL' as const, id: sell.id, companyId: sell.companyId, companyName: sell.company.name, personId: sell.personId, startDate: sell.startDate, currency: sell.billCurrency ?? 'USD', sellId: sell.id, buyIds: buys.map((b) => b.id) }
  }
  const buy = await prisma.buyContract.findUnique({
    where: { id },
    select: {
      id: true, companyId: true, payCurrency: true, startDate: true,
      company: { select: { name: true } },
      candidates: { select: { personId: true }, take: 1 },
      sellLinks: { select: { sellContractId: true, sellContract: { select: { companyId: true } } } },
    },
  })
  if (!buy) return null
  const sells = buy.sellLinks.filter((l) => l.sellContract.companyId === buy.companyId).map((l) => l.sellContractId)
  return { side: 'BUY' as const, id: buy.id, companyId: buy.companyId, companyName: buy.company.name, personId: buy.candidates[0]?.personId ?? null, startDate: buy.startDate, currency: buy.payCurrency ?? 'USD', sellId: sells[0] ?? null, buyIds: [buy.id] }
}

async function roleName(roleId: string | null): Promise<string | null> {
  if (!roleId) return null
  return (await prisma.role.findUnique({ where: { id: roleId }, select: { name: true } }))?.name ?? null
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { id } = await params
  const line = await lineOf(id)
  if (!line) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That line is not on the record.' } }, { status: 404 })

  const role = await roleName(caller.context.roleId)
  const reads = commissionReader({
    callerCompanyId: caller.company?.id ?? null, lineCompanyId: line.companyId, roleName: role,
    readsPayroll: hasPermission(caller.permissions, 'payroll.read'),
  })
  if (reads === 'NONE') {
    await recordRefusal(line.personId ? [line.personId] : [], {
      ...accessActor(caller), action: 'PAYROLL_VIEW',
      reason: 'Asked for the commissions on a line at a firm not party to them.',
    })
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Commissions are the firm’s own pay to its own people, and only that firm reads them.' } },
      { status: 403 },
    )
  }

  const rows = await prisma.contractCommission.findMany({
    where: {
      companyId: line.companyId,
      OR: [{ sellContractId: line.side === 'SELL' ? line.id : '__none__' }, { buyContractId: { in: line.buyIds } }],
    },
    include: { earnedBy: { select: { id: true, name: true } }, setBy: { select: { id: true, name: true } } },
    orderBy: [{ kind: 'asc' }, { fromDate: 'asc' }],
  })
  const shown = reads === 'FIRM' ? rows : rows.filter((r) => r.earnedById === caller.person.id)
  const withheld = rows.filter((r) => !shown.includes(r)).map((r) => r.earnedById)
  await writeRateTrail(caller, { read: [...new Set(shown.map((r) => r.earnedById).filter((p) => p !== caller.person.id))], refused: [...new Set(withheld)] }, {
    action: 'PAYROLL_VIEW',
    refused: 'A colleague’s commission withheld: only the Owner, a Contract Manager and payroll read the firm’s.',
    read: 'Commissions on a line read by the Owner, a Contract Manager or payroll.',
  })

  const period = monthPeriod(new Date())
  const accruals = line.sellId && shown.length
    ? await commissionAccruals(line.companyId, period, { sellContractIds: [line.sellId] })
    : []
  const mayEdit = (SETS_COMMISSIONS as readonly string[]).includes(role ?? '')
  const people = mayEdit
    ? await prisma.context.findMany({
        where: { companyId: line.companyId, revokedAt: null, roleId: { not: null } },
        select: { person: { select: { id: true, name: true } } },
        take: 300,
      })
    : []

  return NextResponse.json({
    data: {
      side: line.side,
      sellContractId: line.sellId,
      buyContractIds: line.buyIds,
      currency: line.currency,
      startDate: line.startDate,
      onlyYours: reads === 'OWN',
      mayEdit,
      people: [...new Map(people.map((p) => [p.person.id, p.person])).values()].sort((a, b) => a.name.localeCompare(b.name)),
      rows: shown.map((r) => {
        const a = accruals.find((x) => x.id === r.id)
        return {
          id: r.id, kind: r.kind, kindSays: KIND_WORD[r.kind], basis: r.basis, rateBps: r.rateBps, amountCents: r.amountCents,
          capCents: r.capCents, fromDate: r.fromDate, toDate: r.toDate, accrueOn: r.accrueOn,
          sellContractId: r.sellContractId, buyContractId: r.buyContractId,
          earnedBy: r.earnedBy, setBy: r.setBy, setAt: r.setAt, reason: r.reason,
          termsSay: termsSay(r, line.currency),
          thisMonth: a ? { amountCents: a.postedCents ?? a.accrual.amountCents, currency: a.accrual.currency, state: a.state, says: a.accrual.says } : null,
        }
      }),
      says: shown.length === 0
        ? reads === 'OWN' ? 'No commission on this line is yours.' : 'No commission is set on this line.'
        : reads === 'OWN' ? 'Only your own commission on this line is shown.' : null,
    },
  })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { id } = await params
  const line = await lineOf(id)
  if (!line) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That line is not on the record.' } }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  // The panel says which side; a sales commission goes on the sell line and
  // a recruiting one on the buy line behind it, whichever page it is set from.
  const kind = typeof body.kind === 'string' ? body.kind : null
  const onBuy = kind === 'RECRUITING'
  const buyContractId = onBuy ? (typeof body.buyContractId === 'string' && line.buyIds.includes(body.buyContractId) ? body.buyContractId : line.buyIds[0] ?? null) : null
  if (onBuy && !buyContractId) {
    return NextResponse.json({ error: { code: 'VALIDATION', field: 'kind', message: 'This placement has no buy line at your firm, so there is no line for a recruiting commission to sit on.' } }, { status: 422 })
  }
  const result = await setCommission(
    {
      id: typeof body.id === 'string' ? body.id : null,
      sellContractId: onBuy ? null : line.side === 'SELL' ? line.id : line.sellId,
      buyContractId,
      earnedById: body.earnedById, kind, basis: body.basis,
      rateBps: body.rateBps ?? null, amountCents: body.amountCents ?? null, capCents: body.capCents ?? null,
      fromDate: body.fromDate ?? null, toDate: body.toDate ?? null, accrueOn: body.accrueOn ?? null, reason: body.reason ?? null,
    },
    {
      personId: caller.person.id, companyId: caller.company?.id ?? null,
      companyName: caller.company?.name ?? 'your firm', roleName: await roleName(caller.context.roleId),
    },
  )
  if (!result.ok) {
    if (result.status === 403) {
      await recordRefusal(line.personId ? [line.personId] : [], {
        ...accessActor(caller), action: 'PAYROLL_VIEW', reason: 'Tried to set a commission on a line without the role that sets them.',
      })
    }
    return NextResponse.json({ error: { code: result.status === 403 ? 'FORBIDDEN' : result.status === 404 ? 'NOT_FOUND' : 'VALIDATION', field: result.field, message: result.says } }, { status: result.status })
  }
  return NextResponse.json({ data: { id: result.id, says: `${KIND_WORD[result.terms.kind]} set: ${termsSay(result.terms, line.currency)}.` } })
}
