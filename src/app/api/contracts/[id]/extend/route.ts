import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, refusalFor } from '@/lib/api-context'
import { planCyclesFor, extensionPlan } from '@/lib/contract-cycles'
import { localKey } from '@/lib/cycle-generator'
import { prisma } from '@/lib/db'
import { emit } from '@/lib/events'
import { endsPastLimit, evaluateGovernance } from '@/lib/governance'
import { loadContractHolidays } from '@/lib/holidays'
import { resolvedEndClientId } from '@/lib/resolve-end-client'
import { ORDER_HEADER_SELECT, termsFor } from '@/lib/money/order-terms'
import { extensionPapers, mayExtendOnPapers } from '@/lib/contract-clearance'
import { extensionEnd } from '@/lib/money/extension-end'
import { anotherWindowSays, earlierEnds, movedSays, noPayLineInForce, PAY_LINES_DOOR, payLineInForce, windowsAtNewEnd } from '@/lib/money/extension-windows'
import { formatDay } from '@/lib/format-date'
import { extendGate } from './gate'
import { gateRefusal, DOING, NEEDS } from '../activate/gate'
import { whoHereMaySays } from '@/lib/money/who-raises-bills'
import { contractSide } from '@/lib/resolve-client-company'
import { recordRefusal, accessActor } from '@/lib/access-log'

/**
 * POST /api/contracts/:id/extend
 *
 * Extends a sell contract to a new last day.
 * Body: { newEndDate?: 'YYYY-MM-DD', months?: number, note?: string,
 *         reason?: string, limitReason?: string }
 *
 * `newEndDate` is the day the person picked (the contracts drawer, since
 * 2026-10-22). Without it, `months` — three by default — as the older
 * buttons ask. `note` is why it is extended, kept with the extension
 * whatever else is said. `reason` answers a paper ending before the new
 * end and `limitReason` answers the client's time limit; each is asked
 * for by this route, in a sentence, only when it applies, and a screen
 * sends it only once it has shown that sentence.
 *
 * Only IN_PROGRESS or PAUSED contracts can be extended.
 *
 * Who may is the same question `activate` answers, and this route was not
 * asking it: it checked that somebody was signed in and then moved
 * whatever contract id it was handed. An extension carries the end date
 * forward and writes the billing and pay cycles behind it, so an account
 * with no connection to either company could put months of money on
 * somebody else's placement.
 */
/**
 * GET /api/contracts/:id/extend — may this reader extend this placement,
 * and if not, the sentence the press would be refused with. The drawer
 * asks it before it draws Extend, so a button the route refuses is never
 * drawn. A buy line is extended from its sell line.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { id } = await params
  const contract = await prisma.sellContract.findUnique({
    where: { id },
    select: {
      personId: true, state: true, companyId: true, clientCompanyId: true, endClientCompanyId: true,
      company: { select: { name: true } },
      clientCompany: { select: { name: true } },
      endClientCompany: { select: { name: true } },
    },
  })
  if (!contract) {
    const buy = await prisma.buyContract.findUnique({ where: { id }, select: { id: true } })
    return NextResponse.json({
      data: {
        may: false,
        says: buy
          ? 'A pay line is extended with its placement. Open the placement under Sell contracts and extend it there.'
          : 'This contract is not on the record.',
      },
    })
  }
  const gate = extendGate(caller, contract)
  if (!gate.ok && gate.code === 'NOT_FOUND') {
    await recordRefusal([contract.personId], {
      ...accessActor(caller), action: 'CONTRACT_VIEW',
      reason: 'A client asked whether it may extend the line between its supplier and a firm below it.',
    })
    return NextResponse.json({ error: { code: gate.code, message: gate.says } }, { status: gate.status })
  }
  // Ending the placement is asked of the same gate the end press goes
  // through (`gateRefusal`), so the panel draws "Complete" only where the
  // press will take it. A seat refused for its role reads who may, in the
  // press's own sentence.
  const ending = gateRefusal(caller, contract, 'complete')
  const endSays = ending?.error.code === 'FORBIDDEN'
    ? await whoHereMaySays(caller, { doing: DOING.complete, needs: NEEDS.complete })
    : null
  return NextResponse.json({
    data: { ...(gate.ok ? { may: true, says: null } : { may: false, says: gate.says }), mayEnd: ending === null, endSays },
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const actor = { id: caller.person.id }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : ''

  const contract = await prisma.sellContract.findUnique({
    where: { id },
    include: {
      person: { select: { id: true, name: true } },
      clientCompany: { select: { id: true, name: true } },
      endClientCompany: { select: { id: true, name: true } },
      workLocation: { select: { id: true, name: true, city: true, state: true, isRemote: true } },
      company: { select: { id: true, name: true, templatePack: true } },
      // The document this placement is on. Its terms are what the
      // added months will be billed under, and its window is what the
      // added months have to fit inside.
      workOrder: { select: ORDER_HEADER_SELECT },
    },
  })

  if (!contract) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Contract not found' } },
      { status: 404 }
    )
  }

  // A stranger is told so in words; a party missing the permission is told
  // which one, because "forbidden" on a button on their own screen reads
  // as a fault. The same answer the drawer asks before it draws Extend.
  const gate = extendGate(caller, contract)
  if (!gate.ok) {
    if (gate.code === 'NOT_FOUND') {
      await recordRefusal([contract.personId], {
        ...accessActor(caller), action: 'CONTRACT_VIEW',
        reason: 'A client tried to extend the line between its supplier and a firm below it.',
      })
    }
    return NextResponse.json({ error: { code: gate.code, message: gate.says } }, { status: gate.status })
  }

  const oldEnd = contract.endDate
  const baseDate = oldEnd ?? new Date()
  // The day it now ends: the one somebody picked, or so many months on.
  const asked = extensionEnd({ oldEnd, today: new Date(), months: body.months, newEndDate: body.newEndDate })
  if (!asked.ok) {
    return NextResponse.json(
      { error: { code: asked.code, message: asked.message, field: asked.field } },
      { status: 422 }
    )
  }
  const newEnd = asked.newEnd
  const months = asked.months
  const newEndSays = formatDay(newEnd)

  // ── Governance check on extension ──
  const endClientId = resolvedEndClientId(contract)

  const governance = await evaluateGovernance({
    personId: contract.personId,
    endClientCompanyId: endClientId,
    vendorCompanyId: contract.companyId,
    triggerPoint: 'EXTENSION',
    subjectType: 'SELL_CONTRACT',
    subjectId: id,
    billRate: contract.billRate,
  })

  if (!governance.canProceed) {
    return NextResponse.json(
      {
        error: {
          code: 'GOVERNANCE_BLOCK',
          message: governance.summary,
          evaluations: governance.evaluations,
        },
      },
      { status: 403 }
    )
  }

  // Warnings: proceed but include in response
  // (contract extensions are critical for compliance — tenure warnings here are especially important)

  // A line moved past the client's time limit is refused (founder's
  // decision, 2026-10-06). Where the client only warns, a reason is asked
  // for and kept on the log.
  const past = await endsPastLimit({ personId: contract.personId, clientId: endClientId, contractId: contract.id, endDate: newEnd })
  if (past?.outcome === 'BLOCK') {
    return NextResponse.json({ error: { code: 'TIME_LIMIT', message: past.says } }, { status: 422 })
  }
  const limitReason = typeof body.limitReason === 'string' ? body.limitReason.trim() : ''
  if (past?.outcome === 'WARN' && !limitReason) {
    return NextResponse.json(
      { error: { code: 'TIME_LIMIT_REASON', message: `${past.says} Give a reason to go ahead.`, field: 'limitReason' } },
      { status: 422 }
    )
  }

  // ── The papers that must last to the new end ───────────────────────
  //
  // Read the way the start reads them: the person's own checks and the
  // selling firm's. A paper that lets the person work at all (work
  // authorization, the I-94, a visa or work permit, the right to work, an
  // I-9 reverification) ending before the new end refuses the extension in
  // a sentence; any other paper ending first asks for a reason, kept with
  // the extension. Regulatory's rule (`extensionPapers`), money's door.
  // The start too: a paper that only begins after the new end lasts to
  // none of it, so it cannot answer for the months the extension adds.
  const paperRows = { type: true, status: true, validFrom: true, expiresAt: true } as const
  const startsInTime = (r: { validFrom: Date | null }) => !r.validFrom || r.validFrom.getTime() <= newEnd.getTime()
  const [personPapers, supplierPapers] = (await Promise.all([
    prisma.verification.findMany({ where: { personId: contract.personId }, select: paperRows }),
    prisma.verification.findMany({ where: { companyId: contract.companyId, personId: null }, select: paperRows }),
  ])).map((rows) => rows.filter(startsInTime))
  const papers = extensionPapers({
    personName: contract.person.name,
    supplierName: contract.company.name,
    newEnd,
    person: personPapers,
    supplier: supplierPapers,
  })
  const onPapers = mayExtendOnPapers(papers, typeof body.reason === 'string' ? body.reason : null)
  if (!onPapers.ok) {
    return NextResponse.json(
      {
        error: {
          code: onPapers.code,
          message: onPapers.code === 'PAPERS_NEED_A_REASON' ? `${onPapers.message} Give a reason to go ahead.` : onPapers.message,
          ...(onPapers.code === 'PAPERS_NEED_A_REASON' ? { field: 'reason' } : {}),
        },
      },
      { status: 422 }
    )
  }

  // ── The months added need their due dates ──────────────────────────
  //
  // This route moved `endDate`, wrote a log line saying it had extended
  // the placement, and stopped. The comment above it claimed it wrote
  // the billing and pay cycles behind it; it never did. So a placement
  // extended by three months had no hours due, no pay day and no invoice
  // date for any of them — the work carried on and nothing asked for a
  // timesheet or raised a bill.
  //
  // The buy leg moves with the sell leg for the same reason it does on
  // activation: a contract to pay somebody for work that is no longer
  // under contract is the pair disagreeing about when the job ends.
  //
  // The window her hours are paid through moves too (2026-11-16). Payroll
  // narrows every week to the days a link covers (`daysFor`), and this
  // route left the link and her row on the pay line at the first end, so
  // every hour after it read as nobody's. A window whose last day is the
  // end being extended follows it (lib/money/extension-windows). A window a
  // replacement or a change of sub-vendor closed stays closed. A window an
  // extension made before this rule left at an earlier end is not moved —
  // what was paid on it may not name the days — and is named in the log.
  const [linked, earlier] = await Promise.all([
    prisma.sellContract.findUnique({
      where: { id },
      select: { buyLinks: { select: { id: true, buyContractId: true, effectiveFrom: true, effectiveTo: true } } },
    }),
    prisma.automationLog.findMany({
      where: { action: 'CONTRACT_EXTENDED', payload: { path: ['contractId'], equals: id } },
      select: { payload: true },
    }),
  ])
  const links = linked?.buyLinks ?? []
  const before = earlierEnds(earlier.map((l) => (l.payload as { oldEndDate?: string | null } | null)?.oldEndDate))
  // The pay line in force at the end, never "the first link".
  const buyId = payLineInForce(links, oldEnd, before)
  // Where none is, nothing on the pay side moves: not the window, not the
  // line's end, not its pay dates. Said in the log and the reply, with the
  // windows named, never left silent.
  const noLine = buyId ? null : noPayLineInForce(links, oldEnd, before, contract.person.name)
  const buy = buyId
    ? await prisma.buyContract.findUnique({
        where: { id: buyId },
        select: { id: true, contractType: true, vendorCompanyId: true, endDate: true },
      })
    : null
  // The pay line's own end, where it moves: out to the new end, never in.
  const buyLineMoved = buy && (buy.endDate === null || buy.endDate.getTime() < newEnd.getTime())
    ? { id: buy.id, from: buy.endDate?.toISOString().slice(0, 10) ?? null, to: newEnd.toISOString().slice(0, 10) }
    : null

  // What is already on the books, keyed the way the generator keys it.
  const written = await prisma.cycle.findMany({
    where: { OR: [{ sellContractId: id }, ...(buyId ? [{ buyContractId: buyId }] : [])] },
    select: { id: true, sellContractId: true, buyContractId: true, kind: true, dueOn: true, periodStart: true, periodEnd: true, completedAt: true },
  })
  // Her rows on the pay lines this placement reaches, and nobody else's.
  const rows = links.length
    ? await prisma.buyContractCandidate.findMany({
        where: { buyContractId: { in: links.map((l) => l.buyContractId) }, personId: contract.personId },
        select: { id: true, buyContractId: true, endDate: true },
      })
    : []
  const windows = windowsAtNewEnd({ links, rows, oldEnd, earlier: before, newEnd })
  // Every window or row left where it was, each with why, named once.
  const leftBehind = {
    links: [
      ...(noLine?.windows ?? []),
      ...windows.leftBehind.links.filter((l) => !(noLine?.windows ?? []).some((w) => w.id === l.id)),
    ],
    rows: windows.leftBehind.rows,
  }
  const notMovedSays = noLine?.says ?? anotherWindowSays(contract.person.name, windows)
  const already = new Map<string, Set<string>>()
  for (const c of written) {
    const days = already.get(c.kind) ?? new Set<string>()
    days.add(localKey(c.dueOn))
    already.set(c.kind, days)
  }

  const holidays = await loadContractHolidays(
    contract.company.id,
    contract.clientCompany.id,
    (contract.startDate ?? baseDate).getFullYear(),
    newEnd.getFullYear()
  )

  const added = await prisma.$transaction(async (tx) => {
    await tx.sellContract.update({ where: { id }, data: { endDate: newEnd } })
    // The pay line's end moves out to meet it, never in: a line that holds
    // other people may already run later.
    if (buyLineMoved) {
      await tx.buyContract.updateMany({
        where: { id: buyLineMoved.id, OR: [{ endDate: null }, { endDate: { lt: newEnd } }] },
        data: { endDate: newEnd },
      })
    }
    // The window her hours are paid through, and her row on the pay line,
    // in the same save. Each update names the value it moves from, as it
    // was read; a window or a row changed since undoes the whole save,
    // so the log never says a window moved that did not.
    let moved = 0
    for (const l of windows.links) {
      const was = links.find((x) => x.id === l.id)!.effectiveTo
      moved += (await tx.contractLink.updateMany({ where: { id: l.id, effectiveTo: was }, data: { effectiveTo: newEnd } })).count
    }
    for (const r of windows.rows) {
      const was = rows.find((x) => x.id === r.id)!.endDate
      moved += (await tx.buyContractCandidate.updateMany({ where: { id: r.id, endDate: was }, data: { endDate: newEnd } })).count
    }
    if (moved !== windows.links.length + windows.rows.length) throw new WindowChanged()

    // The document travels with the line, so the dates the added
    // months are generated over go through one door.
    const planInput = {
      sell: { id, startDate: contract.startDate, endDate: newEnd, workOrder: contract.workOrder },
      buy: buy ? { id: buy.id, contractType: buy.contractType, vendorCompanyId: buy.vendorCompanyId } : null,
      packId: contract.company.templatePack ?? 'US_IT',
      holidays,
    }
    // The whole series over the new dates, so the period that held the old
    // end moves its last day out rather than leaving a short cycle behind
    // (the founder, 2026-11-09: the last regular period runs through the
    // contract's end date).
    const full = await planCyclesFor(tx, planInput)
    const planned = await planCyclesFor(tx, {
      ...planInput,
      existing: already,
      // Only the months that were added.
      //
      // Generation still runs over the whole contract, so a fortnightly
      // cycle keeps its original weeks. What is bounded is what may be
      // written: a period that ended on or before the old end date was
      // settled by the first run. Matching on the day a date landed on is
      // not enough on its own — this firm may have changed which way its
      // dates move off a weekend since then, and January regenerated onto
      // the other side of the weekend is in nobody's existing set. Two pay
      // days for one fortnight is money, not tidiness.
      onlyPeriodsAfter: oldEnd,
    })
    const { widen, write, kept } = extensionPlan(written, full.rows, planned.rows)
    for (const w of widen) await tx.cycle.updateMany({ where: { id: w.id, completedAt: null }, data: { periodEnd: w.periodEnd } })
    if (write.length > 0) await tx.cycle.createMany({ data: write })
    const cycles = {
      sell: write.filter((r) => 'sellContractId' in r).length,
      buy: write.filter((r) => 'buyContractId' in r).length,
    }

    await tx.automationLog.create({
      data: {
        companyId: contract.clientCompany.id,
        action: 'CONTRACT_EXTENDED',
        summary: months != null
          ? `${contract.person.name}'s contract at ${contract.endClientCompany?.name ?? contract.clientCompany.name} extended by ${months} month${months !== 1 ? 's' : ''} to ${newEndSays}`
          : `${contract.person.name}'s contract at ${contract.endClientCompany?.name ?? contract.clientCompany.name} extended to ${newEndSays}`,
        reason:
          (cycles.sell + cycles.buy > 0
            ? `Extended by ${caller.person.name}. ${cycles.sell + cycles.buy} new due dates written — hours, pay and bills for the added months.`
            : `Extended by ${caller.person.name}. No new due dates: the contract has no start date, or every date in the new period was already on the books.`) +
          (notMovedSays ? ` ${notMovedSays}` : '') +
          (note ? ` Why: ${note}` : ''),
        payload: {
          contractId: id,
          buyContractId: buyId,
          personId: contract.person.id,
          vendorId: contract.company.id,
          clientId: contract.clientCompany.id,
          oldEndDate: oldEnd?.toISOString() ?? null,
          newEndDate: newEnd.toISOString(),
          months,
          ...(note ? { note } : {}),
          cyclesAdded: { sell: cycles.sell, buy: cycles.buy },
          // What else followed the new end, each from → to: the window her
          // hours are paid through, her row on the pay line, the pay line's
          // own end, and the open periods that held the old end. A period
          // already processed is never widened, and is counted here.
          payLine: buyId,
          windows: {
            links: windows.links,
            rows: windows.rows,
            line: buyLineMoved,
            periodsWidened: widen.length,
            processedLeftAsTheyWere: kept,
            // Not moved, each with why: left at an end an extension before
            // 2026-11-16 moved past, another window claiming the same days,
            // or no single pay line in force at the end. For a person to
            // repair, never moved here by a guess.
            ...(leftBehind.links.length + leftBehind.rows.length > 0 ? { leftBehind } : {}),
            ...(notMovedSays ? { notMoved: notMovedSays } : {}),
          },
          ...(past ? { timeLimit: { says: past.says, reason: limitReason } } : {}),
          ...(onPapers.reason ? { papers: { says: papers.says, reason: onPapers.reason } } : {}),
        },
        reversible: true,
      },
    })

    return cycles
  }).catch((e: unknown) => {
    if (e instanceof WindowChanged) return null
    throw e
  })

  if (!added) {
    return NextResponse.json(
      {
        error: {
          code: 'CHANGED',
          message: `${contract.person.name}'s pay window changed while this was saving, so the placement was not extended. Open it again and extend it.`,
        },
      },
      { status: 409 }
    )
  }

  void emit({
    type: 'contract.extended',
    companyId: contract.clientCompany.id,
    subjectType: 'SellContract',
    subjectId: id,
    actorPersonId: actor?.id ?? null,
    payload: {
      personId: contract.person.id,
      vendorCompanyId: contract.company.id,
      // The end client, not the payer. Tenure accrues where the person
      // works, so this is the id that matters downstream.
      endClientCompanyId: contract.endClientCompany?.id ?? contract.clientCompany.id,
      oldEndDate: oldEnd?.toISOString() ?? null,
      newEndDate: newEnd.toISOString(),
      months,
    },
  })

  const warnings = governance.evaluations.filter((e) => e.outcome === 'WARN')

  // ── Past the end of the paper that authorizes it ───────────────────
  //
  // A placement extended beyond its purchase order's end date is not
  // refused — the work is real and somebody senior decided it — but
  // every invoice raised for those months fails the three-way match,
  // because an expired order cannot be billed against (`poBalance`). It
  // is said here, in words, rather than discovered when the bill bounces
  // a month later.
  const order = termsFor('SELL', { startDate: contract.startDate, endDate: newEnd, workOrder: contract.workOrder })
  const pastTheOrder =
    order.outsideOrderWindow && order.orderWindow?.end
      ? `This now runs to ${newEndSays}, past ${order.orderNumber ?? 'the order'}, which ends ${formatDay(order.orderWindow.end)}. Raise a new order or extend that one, or the months after it cannot be billed.`
      : null

  return NextResponse.json({
    data: {
      id,
      personName: contract.person.name,
      newEndDate: newEnd.toISOString(),
      // The pay window left where it was is said where the extension is,
      // never only in the log.
      message: withSentence(
        withSentence(
          months != null ? `Contract extended by ${months} month${months !== 1 ? 's' : ''}, to ${newEndSays}` : asked.says,
          movedSays(windows, newEnd),
        ),
        notMovedSays,
      ),
      ...(notMovedSays ? { payWindow: notMovedSays } : {}),
      // Where to check it: the pay lines, for the selling firm only.
      ...(notMovedSays && contractSide(caller, contract) === 'SUPPLIER' ? { payWindowDoor: PAY_LINES_DOOR } : {}),
      ...(note ? { note } : {}),
      ...(pastTheOrder ? { pastTheOrder } : {}),
      // A paper ending before the new end, gone ahead on the reason given.
      ...(onPapers.reason ? { papers: { says: papers.says, reason: onPapers.reason } } : {}),
      ...(warnings.length > 0 && {
        governanceWarnings: warnings.map((w) => ({
          ruleType: w.ruleType,
          reason: w.reason,
        })),
      }),
    },
  })
}

/** A window or a row changed between the read and the save: the save is undone. */
class WindowChanged extends Error {
  constructor() {
    super('The pay window changed while the extension was saving.')
  }
}

/** A reply and one more sentence after it, the first closed with a full stop where it is not. */
function withSentence(said: string, more: string | null): string {
  if (!more) return said
  return `${/[.!?]$/.test(said) ? said : `${said}.`} ${more}`
}
