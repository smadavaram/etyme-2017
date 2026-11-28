import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { planCyclesFor } from '@/lib/contract-cycles'
import { localKey } from '@/lib/cycle-generator'
import { loadContractHolidays } from '@/lib/holidays'
import { ORDER_HEADER_SELECT } from '@/lib/money/order-terms'
import { paidBook } from '@/lib/payroll-paid'
import { whoHereMaySays } from '@/lib/money/who-raises-bills'
import { notAtACompany } from '@/app/api/people/not-at-a-company'
import { accessActor, recordAccess, recordRefusal } from '@/lib/access-log'
import {
  planRepair, repairCycles, repairLogSays, repairedSays, REPAIRING_THE_WINDOW, type PaidDay,
} from '@/lib/money/window-repair'

/**
 * POST /api/payroll/window-repair
 *
 * Body: { sellContractId, buyContractId, personId } — the placement, the
 * pay line the held row is on, and the person (`windowRepairBody`).
 *
 * Moves a pay window an extension made before 2026-11-16 left at the
 * first end, and her row on the pay line, to the placement's own end, in
 * one save; widens the open pay cycles through the generator's own door,
 * never a completed one; and writes one activity-log row with from → to
 * and who did it. Refused, moving nothing, where a processed pay run
 * recorded a day after the window's end: that week is named, and a person
 * checks it against what was paid out first (lib/money/window-repair).
 *
 * Who may: the seat that runs payroll, by the permission the run itself
 * asks for (`payroll.run`). Any other seat is told who here may, from the
 * seats the firm has filled.
 *
 * It reads her weeks and what pay runs paid her, so every press writes an
 * access-log row with her as the subject: a refusal's row before the
 * refusal is sent (`recordRefusal`), and the repair's own row in the same
 * save as the move (`recordAccess`).
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const sellContractId = typeof body.sellContractId === 'string' ? body.sellContractId : ''
  const buyContractId = typeof body.buyContractId === 'string' ? body.buyContractId : ''
  const personId = typeof body.personId === 'string' ? body.personId : ''
  // Her, where the press names her; a press naming nobody read nobody.
  const refused = (reason: string) =>
    recordRefusal(personId ? [personId] : [], { ...accessActor(caller), action: 'PAYROLL_VIEW', reason: `Repair the pay window: ${reason}` })

  if (!hasPermission(caller.permissions, 'payroll.run')) {
    await refused('refused, this seat may not run payroll.')
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: await whoHereMaySays(caller, { doing: REPAIRING_THE_WINDOW, needs: 'payroll.run' }) } },
      { status: 403 }
    )
  }
  const companyId = caller.company?.id
  if (!companyId) {
    await refused('refused, the caller is not at a company.')
    return NextResponse.json({ error: { code: 'NO_CONTEXT', message: notAtACompany('Payroll') } }, { status: 403 })
  }

  if (!sellContractId || !buyContractId || !personId) {
    const field = !sellContractId ? 'sellContractId' : !buyContractId ? 'buyContractId' : 'personId'
    return NextResponse.json(
      { error: { code: 'VALIDATION', field, message: 'Open Payroll again and press Repair the pay window on the held row.' } },
      { status: 422 }
    )
  }

  // The pay line is this firm's own, and she is on it; the placement is
  // this firm's own and pays through it. Anything else is not on this
  // firm's payroll.
  const [buy, sell] = await Promise.all([
    prisma.buyContract.findFirst({
      where: { id: buyContractId, companyId },
      select: {
        id: true, contractType: true, vendorCompanyId: true,
        candidates: { where: { personId }, select: { id: true, endDate: true, person: { select: { name: true } } } },
      },
    }),
    prisma.sellContract.findUnique({
      where: { id: sellContractId },
      select: {
        id: true, personId: true, companyId: true, clientCompanyId: true, startDate: true, endDate: true,
        company: { select: { templatePack: true } },
        workOrder: { select: ORDER_HEADER_SELECT },
        buyLinks: { select: { id: true, buyContractId: true, effectiveFrom: true, effectiveTo: true } },
        timesheets: { where: { personId }, select: { id: true, days: true } },
      },
    }),
  ])
  if (
    !buy || buy.candidates.length === 0 || !sell || sell.companyId !== companyId || sell.personId !== personId ||
    !sell.buyLinks.some((l) => l.buyContractId === buy.id)
  ) {
    await refused('refused, the pay line or the placement is not on this firm\'s payroll.')
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'This pay line is not on your payroll.' } },
      { status: 404 }
    )
  }
  const personName = buy.candidates[0].person.name

  // What processed pay runs recorded paying her on this pay line.
  const book = await paidBook(companyId, [buy.id])
  const paid: PaidDay[] = []
  for (const [k, hours] of book.paid) {
    const [b, p, timesheetId, day] = k.split('|')
    if (b === buy.id && p === personId && hours > 0) paid.push({ timesheetId, day, hours })
  }

  const plan = planRepair({
    personName,
    buyContractId: buy.id,
    links: sell.buyLinks,
    sellEnd: sell.endDate,
    rows: buy.candidates.map((c) => ({ id: c.id, endDate: c.endDate })),
    paid,
    sheets: sell.timesheets.map((t) => ({ id: t.id, days: t.days as Record<string, unknown> | null })),
    unrecordedOn: book.unrecorded.get(buy.id) ?? null,
  })
  if (!plan.ok) {
    await refused(`refused, ${plan.code}. ${plan.says}`)
    return NextResponse.json({ error: { code: plan.code, message: plan.says } }, { status: plan.status })
  }

  const from = new Date(`${plan.endedOn}T00:00:00.000Z`)
  const to = new Date(`${plan.sellEnds}T00:00:00.000Z`)
  const stored = await prisma.cycle.findMany({
    where: { buyContractId: buy.id },
    select: { id: true, sellContractId: true, buyContractId: true, kind: true, dueOn: true, periodStart: true, periodEnd: true, completedAt: true },
  })
  const already = new Map<string, Set<string>>()
  for (const c of stored) {
    const days = already.get(c.kind) ?? new Set<string>()
    days.add(localKey(c.dueOn))
    already.set(c.kind, days)
  }
  const holidays = await loadContractHolidays(
    sell.companyId,
    sell.clientCompanyId,
    (sell.startDate ?? from).getFullYear(),
    to.getFullYear()
  )

  const moved = await prisma.$transaction(async (tx) => {
    // Each update names the value it moves from, as it was read, so a
    // window or a row changed since is left alone and the save undone.
    // Undone by throwing: a transaction whose function returns commits
    // whatever it had already moved.
    let count = 0
    for (const l of plan.links) {
      count += (await tx.contractLink.updateMany({ where: { id: l.id, effectiveTo: from }, data: { effectiveTo: to } })).count
    }
    for (const r of plan.rows) {
      count += (await tx.buyContractCandidate.updateMany({ where: { id: r.id, personId, endDate: from }, data: { endDate: to } })).count
    }
    if (count !== plan.links.length + plan.rows.length) throw new WindowChanged()

    // The open pay cycles, through the generator's own door: the series
    // over the placement's dates, and what it writes after the window's end.
    const planInput = {
      sell: { id: sell.id, startDate: sell.startDate, endDate: sell.endDate, workOrder: sell.workOrder },
      buy: { id: buy.id, contractType: buy.contractType, vendorCompanyId: buy.vendorCompanyId },
      packId: sell.company.templatePack ?? 'US_IT',
      holidays,
    }
    const full = await planCyclesFor(tx, planInput)
    const added = await planCyclesFor(tx, { ...planInput, existing: already, onlyPeriodsAfter: from })
    const { widen, write, kept } = repairCycles(buy.id, stored, full.rows, added.rows)
    for (const w of widen) await tx.cycle.updateMany({ where: { id: w.id, completedAt: null }, data: { periodEnd: w.periodEnd } })
    if (write.length > 0) await tx.cycle.createMany({ data: write })

    const said = repairLogSays({ personName, byName: caller.person.name, from: plan.endedOn, to: plan.sellEnds })
    await tx.automationLog.create({
      data: {
        companyId,
        action: 'PAY_WINDOW_REPAIRED',
        summary: said.summary,
        reason: said.reason,
        payload: {
          sellContractId: sell.id,
          buyContractId: buy.id,
          personId,
          by: { personId: caller.person.id, name: caller.person.name },
          from: plan.endedOn,
          to: plan.sellEnds,
          // Each window and row moved, from → to; the open periods widened,
          // the new ones written, and the completed ones left as they were.
          links: plan.links,
          rows: plan.rows,
          periodsWidened: widen.length,
          cyclesAdded: write.length,
          processedLeftAsTheyWere: kept,
          // The days processed runs had paid on this pay line, read before
          // the move: none after the window's end, or it was refused.
          paidDaysRead: paid.length,
        },
        // Nothing undoes it: the activity log does not, and no screen does.
        reversible: false,
      },
    })
    // Her weeks and her paid days were read to decide it: the row commits
    // with the move, or neither does.
    await recordAccess([personId], {
      ...accessActor(caller),
      action: 'PAYROLL_VIEW',
      reason: `Repair the pay window: read her weeks and what pay runs paid her, and moved the window from ${plan.endedOn} to ${plan.sellEnds}.`,
    }, tx)
    return { links: plan.links, rows: plan.rows, periodsWidened: widen.length, cyclesAdded: write.length, kept }
  }).catch((e: unknown) => {
    if (e instanceof WindowChanged) return null
    throw e
  })

  if (!moved) {
    await refused('refused, the pay window changed while it was saving, and nothing was moved.')
    return NextResponse.json(
      { error: { code: 'CHANGED', message: `${personName}'s pay window changed while this was saving, so nothing was moved. Open Payroll again.` } },
      { status: 409 }
    )
  }

  return NextResponse.json({
    data: {
      says: repairedSays(personName, plan.sellEnds),
      from: plan.endedOn,
      to: plan.sellEnds,
      ...moved,
    },
  })
}

/** A window or a row changed between the read and the save: the save is undone. */
class WindowChanged extends Error {
  constructor() {
    super('The pay window changed while the repair was saving.')
  }
}
