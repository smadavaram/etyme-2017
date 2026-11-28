import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { accessActor, logBulkAccess, recordRefusal } from '@/lib/access-log'
import { commissionAccruals, monthPeriod, type RowAccrual } from '@/lib/money/commission-accrual'
import { marginReachFor, sellLinesInReach } from '@/lib/money/margin-reach'
import { ownCommissionRow, ownCommissionsAsk, monthOf } from '@/lib/consultant-portfolio/own-commissions'

/**
 * GET /api/me/commissions?month=YYYY-MM
 *
 * Your own commissions (founder, 2026-11-08: a commission is a row on the
 * line it is earned on, a sales commission on the sell line for the
 * account manager who sold it, a recruiting one on the buy line for the
 * recruiter who recruited the person). For each row: what it earned this
 * period, on which line, under which cap, and where it stands.
 *
 * Yours only. Asking for somebody else's (`?personId=`) is refused in a
 * sentence naming where the firm's are read (Payroll, Commissions,
 * money's page), and the refusal is on the trail before it goes out.
 *
 * The figures are money's `commissionAccruals`, per firm the person earns
 * at, never a second working-out. A share of the margin or of what was
 * billed is said without the margin or the bill unless the seat's own
 * margin reaches that placement (`marginReachFor`, the Owner's grants): a
 * recruiter reads no margin until the Owner says so.
 *
 * The placed people named on the rows are other people's records, so each
 * is on the trail as a contract read under the reader's name.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const url = new URL(request.url)
  const asked = url.searchParams.get('personId')
  const may = ownCommissionsAsk(caller.person.id, asked)
  if (!may.ok) {
    await recordRefusal([asked!], {
      ...accessActor(caller),
      action: 'PAYROLL_VIEW',
      reason: 'another person’s commissions, asked on the own-commissions page',
    })
    return NextResponse.json({ error: { code: 'NOT_YOURS', message: may.says } }, { status: 403 })
  }

  const monthAsked = url.searchParams.get('month')
  const period = monthAsked ? monthOf(monthAsked) : monthPeriod(new Date())
  if (!period) {
    return NextResponse.json(
      { error: { code: 'BAD_MONTH', field: 'month', message: 'Say the month as year and month, like 2026-11.' } },
      { status: 422 }
    )
  }

  // Every firm whose lines carry a row for this person.
  const firms = await prisma.contractCommission.findMany({
    where: { earnedById: caller.person.id },
    select: { companyId: true, company: { select: { name: true } } },
    distinct: ['companyId'],
  })

  // The seat's own margin reach, at the firm it is signed in at. A row at
  // another firm is read with no margin: this seat's grants are this firm's.
  const here = caller.company?.id ?? null
  const reach = here ? await marginReachFor(caller) : null
  const linesHere = here && reach && reach.scope !== 'NONE' ? await sellLinesInReach(here, reach, caller.person.id) : []
  const opens = (companyId: string, sellIds: readonly string[]) =>
    companyId === here && reach != null && reach.scope !== 'NONE' && sellIds.length > 0 &&
    (linesHere == null || sellIds.every((id) => linesHere.includes(id)))

  const rows: ReturnType<typeof ownCommissionRow>[] = []
  const named = new Set<string>()
  for (const f of firms) {
    const accruals: RowAccrual[] = await commissionAccruals(f.companyId, period, { earnedById: caller.person.id })
    for (const a of accruals) {
      if (a.person && a.person.id !== caller.person.id) named.add(a.person.id)
      rows.push(
        ownCommissionRow(
          {
            id: a.id, kind: a.kind, basis: a.basis, accrueOn: a.accrueOn, side: a.side,
            firmName: f.company.name,
            person: a.person, client: a.client,
            rateBps: a.terms.rateBps, fixedCents: a.terms.amountCents, capCents: a.terms.capCents,
            alreadyCents: a.alreadyCents, postedCents: a.postedCents, state: a.state,
            accrual: a.accrual,
          },
          opens(f.companyId, a.sellContractIds)
        )
      )
    }
  }

  if (named.size) {
    logBulkAccess([...named], { ...accessActor(caller), action: 'CONTRACT_VIEW', reason: 'own commissions: the placement each row is earned on' })
  }

  return NextResponse.json({
    data: {
      period: { from: period.from.toISOString().slice(0, 10), to: period.to.toISOString().slice(0, 10) },
      rows,
      empty: rows.length === 0
        ? 'No commission is set for you on any line. The Owner or a Contract Manager sets one on the line you sold or recruited.'
        : null,
    },
  })
}
