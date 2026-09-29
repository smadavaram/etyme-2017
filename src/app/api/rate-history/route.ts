import { NextRequest, NextResponse } from 'next/server'
import { DEFAULT_CURRENCY } from '@/lib/money-display'
import { getCallerContext } from '@/lib/api-context'
import { isConsultantSeat } from '@/lib/seat'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { assessRateChange, rateInForce, ratePeriods } from '@/lib/contract-rate'
import { proposeBackPay } from '@/lib/money/back-pay'
import { tellWorkerOfPayChange } from '@/lib/money/pay-change-notice'
import { lineFor, settleApproved } from '@/lib/rate-line'
import { prisma } from '@/lib/db'

/**
 * Who may read what a placement has been priced at.
 *
 * `rates.read` — "Price is procurement's to set and to amend", the
 * permission already declared for exactly this and, until now, gating
 * nothing. The desks that hold it are the desks whose job is price:
 * account management, contract management, accounts receivable, a
 * client's procurement lead and program manager, an MSP's supplier
 * manager and AP clerk, and every owner.
 *
 * ── Why this appears now ─────────────────────────────────────────────
 *
 * The release walk of 2026-09-21 signed in as a systems integrator's
 * Validation Engineer — a seat holding `assignments.read` and
 * `timesheets.read` and nothing else — and got 200 from this route:
 * every sell rate on every placement the firm has. The same seat was
 * correctly refused on consultants, invoices, purchase orders and
 * profitability. A rate is the one number in this business nobody
 * shares sideways, and this was the last door left open on it.
 */
const TO_READ = 'rates.read'

/**
 * GET /api/rate-history
 *
 * BUILD.md §6.9: "Rate changes must be versioned or the timesheet valuation
 * is unreliable."
 *
 * LEGACY_RULES.md §2.4: ChangeRate — polymorphic, date-ranged rate versioning.
 *   rate_on(date) queries change_rates where date falls between from_date and
 *   to_date. Falls back to earliest rate if no match.
 *
 * Two modes:
 *   1. Contract-scoped: pass contractId + contractType → returns rate history
 *      for that contract. Pay rates need the desk that reads what
 *      people cost; bill rates need the price desk.
 *   2. Dashboard (no contractId): returns all rate history for the caller's
 *      company, enriched with consultant and contract display names.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  // A person reads their own rate movements without holding the price
  // desk's permission — a consultant paid a share of a number may see
  // that number, on their own assignment only — and both branches below
  // scope a consultant seat to their own rows. Everybody else is asking
  // about somebody else's price.
  if (!hasPermission(caller.permissions, TO_READ) && !isConsultantSeat(caller)) {
    // Which desks those are is read off this company's own roles rather
    // than listed here. A sentence that names four desks by hand is a
    // second copy of the role table, and it is wrong the first time
    // somebody renames one.
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: askTheDesk({
            doing: 'Reading what a placement has been priced at',
            needs: TO_READ,
            kind: caller.company?.kind,
            companyName: caller.company?.name,
          }),
        },
      },
      { status: 403 }
    )
  }

  const url = request.nextUrl
  const contractId = url.searchParams.get('contractId')
  const contractType = url.searchParams.get('contractType') // SELL | BUY

  // ── Dashboard mode: all rate history for the company ──────────
  if (!contractId) {
    const companyId = caller.company?.id
    if (!companyId) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'No company context' } },
        { status: 403 }
      )
    }

    // Collect all contract IDs belonging to the company
    // A consultant on the bench has a context pointing at the agency. Read
    // as employment it showed them six other people's rate movements — the
    // one number in this business nobody shares sideways.
    //
    // ── A worker reads what they are paid, and never what they are sold at ──
    //
    // A consultant's own rows used to be their SELL contracts: the rate
    // the client is billed for them. Priya Raman's page listed $112 and a
    // proposed $117.60 — the client's price, and with her pay beside it,
    // her employer's whole margin. The person named on a sell contract is
    // its subject, not a party to it; the line they are a party to is the
    // buy line that pays them. So a consultant seat reads BUY rows only,
    // on the line that names them and pays them directly — never a line
    // between two firms above them in a chain, which is a price between
    // those firms and not their rate.
    const own = isConsultantSeat(caller)
    const canSeeBuy = own || hasPermission(caller.permissions, 'consultants.cost')
    const [sellContracts, buyContracts] = await Promise.all([
      own
        ? Promise.resolve([] as Array<{ id: string; person: { name: string }; clientCompany: { name: string } | null }>)
        : prisma.sellContract.findMany({
            where: { companyId },
            select: {
              id: true,
              person: { select: { name: true } },
              clientCompany: { select: { name: true } },
            },
          }),
      canSeeBuy
        ? prisma.buyContract.findMany({
            where: own
              ? { candidates: { some: { personId: caller.person.id } }, supplierSellContractId: null }
              : { companyId },
            select: {
              id: true,
              // One agreement can cover several people, so the label lists
              // them rather than assuming a single name.
              candidates: { select: { person: { select: { name: true } } } },
              vendorCompany: { select: { name: true } },
            },
          })
        : Promise.resolve([]),
    ])

    const sellIds = sellContracts.map((c) => c.id)
    const buyIds = buyContracts.map((c) => c.id)

    // Build contract lookup maps
    const contractMap = new Map<string, { personName: string; contractLabel: string }>()
    for (const sc of sellContracts) {
      contractMap.set(`SELL:${sc.id}`, {
        personName: sc.person.name,
        contractLabel: `Sell — ${sc.clientCompany?.name ?? 'Unknown client'}`,
      })
    }
    for (const bc of buyContracts) {
      contractMap.set(`BUY:${bc.id}`, {
        personName: bc.candidates.length === 1
          ? bc.candidates[0].person.name
          : `${bc.candidates.length} people`,
        contractLabel: `Buy — ${bc.vendorCompany?.name ?? 'Direct'}`,
      })
    }

    // Fetch rate history for all company contracts
    const whereConditions: any[] = []
    if (sellIds.length > 0) {
      whereConditions.push({ contractType: 'SELL', contractId: { in: sellIds } })
    }
    if (buyIds.length > 0) {
      whereConditions.push({ contractType: 'BUY', contractId: { in: buyIds } })
    }

    // The lines this seat may change a rate on — exactly the ones POST
    // below accepts from it, so the form offers nothing the route would
    // refuse. Live lines only: a rate on a placement that has ended is
    // not a change anybody makes.
    const changeable = await changeableLines(caller)

    if (whereConditions.length === 0) {
      return NextResponse.json({ data: { rateHistory: [], changeable } })
    }

    const history = await prisma.rateHistory.findMany({
      where: { OR: whereConditions },
      orderBy: { fromDate: 'desc' },
    })

    // Resolve who proposed each change and who decided it. The two are
    // different desks by rule — nobody approves their own — and a screen
    // naming only the proposer cannot show that a second desk said yes.
    const changedByIds = Array.from(
      new Set(history.flatMap((h) => [h.changedById, ...(h.approvedById ? [h.approvedById] : [])]))
    )
    const changedByPersons = changedByIds.length > 0
      ? await prisma.person.findMany({
          where: { id: { in: changedByIds } },
          select: { id: true, name: true },
        })
      : []
    const personNameMap = new Map(changedByPersons.map((p) => [p.id, p.name]))

    return NextResponse.json({
      data: {
        changeable,
        rateHistory: history.map((h) => {
          const info = contractMap.get(`${h.contractType}:${h.contractId}`)
          return {
            id: h.id,
            contractType: h.contractType,
            contractId: h.contractId,
            rate: h.rate,
            rateType: h.rateType,
            fromDate: h.fromDate.toISOString(),
            toDate: h.toDate?.toISOString() ?? null,
            reason: h.reason,
            changedById: h.changedById,
            changedByName: personNameMap.get(h.changedById) ?? 'Unknown',
            previousRate: h.previousRate,
            // A proposed amendment does not bill. Without this the UI cannot
            // tell an agreed rate from one still waiting on procurement,
            // which is the whole point of putting it behind approval.
            approvalState: h.approvalState,
            approvedAt: h.approvedAt?.toISOString() ?? null,
            // Who approved or rejected it. Null while it waits.
            approvedById: h.approvedById,
            approvedByName: h.approvedById ? personNameMap.get(h.approvedById) ?? 'Unknown' : null,
            createdAt: h.createdAt.toISOString(),
            personName: info?.personName ?? 'Unknown',
            contractLabel: info?.contractLabel ?? `${h.contractType} contract`,
          }
        }),
      },
    })
  }

  // ── Contract-scoped mode ──────────────────────────────────────
  if (!contractType) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'contractType (SELL|BUY) is required when contractId is provided' } },
      { status: 422 }
    )
  }

  // A worker's own seat reads their own pay line and nothing else. A
  // sell contract names them as its subject; the price on it is the
  // client's and was never theirs to read.
  const ownSeat = isConsultantSeat(caller)
  if (ownSeat && contractType === 'SELL') {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_FOUND',
          message:
            'What a client is billed for you is between the firms on the contract. ' +
            'Your own rate is on the line that pays you, and that history is yours to read.',
        },
      },
      { status: 404 }
    )
  }

  // Permission check: buy contract rates require consultants.cost — except
  // for the person the line pays, reading their own.
  if (contractType === 'BUY' && !ownSeat && !hasPermission(caller.permissions, 'consultants.cost')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: askTheDesk({
            doing: 'Reading what somebody is paid',
            needs: 'consultants.cost',
            kind: caller.company?.kind,
            companyName: caller.company?.name,
          }),
        },
      },
      { status: 403 }
    )
  }

  // Verify the contract is the caller's to read — their company's, or, for
  // a worker, the line that pays them.
  if (contractType === 'SELL') {
    const sc = await prisma.sellContract.findFirst({
      where: { id: contractId, companyId: caller.company?.id },
    })
    if (!sc) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Sell contract not found' } },
        { status: 404 }
      )
    }
  } else {
    const bc = await prisma.buyContract.findFirst({
      where: ownSeat
        ? { id: contractId, supplierSellContractId: null, candidates: { some: { personId: caller.person.id } } }
        : { id: contractId, companyId: caller.company?.id },
    })
    if (!bc) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Buy contract not found' } },
        { status: 404 }
      )
    }
  }

  const history = await prisma.rateHistory.findMany({
    where: {
      contractType: contractType.toUpperCase(),
      contractId,
    },
    orderBy: { fromDate: 'desc' },
  })

  return NextResponse.json({
    data: {
      rateHistory: history.map((h) => ({
        id: h.id,
        contractType: h.contractType,
        contractId: h.contractId,
        rate: h.rate,
        rateType: h.rateType,
        fromDate: h.fromDate.toISOString(),
        toDate: h.toDate?.toISOString() ?? null,
        reason: h.reason,
        changedById: h.changedById,
        previousRate: h.previousRate,
        approvalState: h.approvalState,
        approvedAt: h.approvedAt?.toISOString() ?? null,
        createdAt: h.createdAt.toISOString(),
      })),
      currentRate: history.length > 0 ? history[0].rate : null,
    },
  })
}

/**
 * POST /api/rate-history
 *
 * Record a rate change. Validates no overlapping date ranges.
 *
 * LEGACY_RULES.md §2.4: "No existing ChangeRate for the same rateable
 * may have overlapping date ranges."
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  if (!hasPermission(caller.permissions, 'assignments.write')) {
    // It named `contracts.write`, which is not a permission this
    // product has — so the one person who might have acted on the key
    // was sent looking for something that does not exist.
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: askTheDesk({
            doing: 'Recording a rate change',
            needs: 'assignments.write',
            kind: caller.company?.kind,
            companyName: caller.company?.name,
          }),
        },
      },
      { status: 403 }
    )
  }

  const body = await request.json()
  // No `overtimeRate` here any more. What an overtime hour is worth is a
  // term of the contract — `overtimeMultiplierBps` on the sell leg for
  // what the client is billed, and on the buy leg for what the worker is
  // paid — in basis points of whatever rate is in force that day. A
  // separate cents-per-hour column was a third copy of the same fact,
  // and a third copy is how two records come to disagree about the one
  // question in this table with a legal consequence.
  const { contractType, contractId, rate, rateType = 'HOURLY', fromDate, toDate, reason } = body

  if (!contractType || !contractId || rate === undefined || !fromDate) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'contractType, contractId, rate, and fromDate are required' } },
      { status: 422 }
    )
  }

  // Which side of the trade, and only those two. The column is a plain
  // string, so anything truthy used to be written and then read back by
  // queries that filter on SELL or BUY — a row belonging to neither leg,
  // invisible to both and counted by nothing.
  if (contractType !== 'SELL' && contractType !== 'BUY') {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'contractType must be SELL or BUY', field: 'contractType' } },
      { status: 422 }
    )
  }

  if (typeof rate !== 'number' || rate < 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'rate must be a non-negative number (cents)' } },
      { status: 422 }
    )
  }

  // ── Only a party to the line may change the rate on it ──────────────
  //
  // This checked the permission and nothing else, so an owner at any
  // firm in the world — who holds every permission at their own —
  // wrote a rate on somebody else's contract and got 201, and a third
  // firm approved it. A rate is a term between two parties. On a BUY
  // line the one who writes it is the payer, whose money it is; the
  // supplier or the worker agrees to it, and nobody else is party. On a
  // SELL line either end of the trade may propose — the firm selling or
  // the client buying — and the other side decides.
  //
  // A stranger is told there is nothing here, the same as for a line
  // that does not exist: saying "not yours" would confirm it does.
  const line = await lineFor(contractType, contractId)
  const mine = caller.company?.id ?? null
  const writers = line ? (contractType === 'BUY' ? [line.payerId] : line.parties) : []
  if (!line || !mine || isConsultantSeat(caller) || !writers.includes(mine)) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_FOUND',
          message:
            contractType === 'BUY'
              ? 'There is no pay line here that your company pays. A pay rate is changed by the firm that pays it.'
              : 'There is no contract here that your company is a party to. A rate is changed only by the firm selling or the client buying.',
        },
      },
      { status: 404 }
    )
  }

  // What somebody is paid is read by the desk that reads what people
  // cost, and a desk that may not read a number may not change it.
  if (contractType === 'BUY' && !hasPermission(caller.permissions, 'consultants.cost')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: askTheDesk({
            doing: 'Changing what somebody is paid',
            needs: 'consultants.cost',
            kind: caller.company?.kind,
            companyName: caller.company?.name,
          }),
        },
      },
      { status: 403 }
    )
  }

  const from = new Date(fromDate)
  const to = toDate ? new Date(toDate) : null

  if (to && to <= from) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'toDate must be after fromDate' } },
      { status: 422 }
    )
  }

  // ── What this change collides with ─────────────────────────────────
  //
  // LEGACY_RULES.md §2.4 forbade overlapping ranges, and this read it as
  // "any row, open or not, that reaches the new date" — so the first
  // change on a line left it open-ended and every change after it was
  // refused as an overlap, forever. And it counted rejected rows, which
  // are not a rate at all.
  //
  // An open row that started earlier is not a collision: it is the rate
  // this change replaces, and approval closes it the day before this one
  // starts (lib/rate-line). What does collide is a change already on the
  // books from a day inside the new one's range, or a fixed-term rate
  // that covers the day this one starts. Rejected rows collide with
  // nothing.
  const type = contractType.toUpperCase()
  const live = await prisma.rateHistory.findMany({
    where: { contractType: type, contractId, approvalState: { not: 'REJECTED' } },
    orderBy: { fromDate: 'asc' },
  })
  const overlap = live.find(
    (r) =>
      (r.fromDate >= from && (to === null || r.fromDate <= to)) ||
      (r.fromDate < from && r.toDate !== null && r.toDate >= from)
  )

  if (overlap) {
    return NextResponse.json(
      {
        error: {
          code: 'OVERLAP',
          message:
            overlap.fromDate >= from
              ? `A rate from ${overlap.fromDate.toISOString().slice(0, 10)} is already on this line. ` +
                `Change or reject that one first, or start this one after it.`
              : `A rate running ${overlap.fromDate.toISOString().slice(0, 10)} to ` +
                `${overlap.toDate!.toISOString().slice(0, 10)} already covers that day. Start this one after it.`,
        },
      },
      { status: 409 }
    )
  }

  // ── The rate this replaces ─────────────────────────────────────────
  //
  // The rate in force the day this change starts, from approved rows
  // only, and the line's own recorded rate where no row covers that day.
  // A pay line used to compare against zero — every pay change read as
  // a 100% rise, and nothing recorded what it replaced — because only a
  // sell line's rate was looked up. A proposal sitting unapproved is not
  // the current price, so it is not what this replaces either.
  const contractCurrency = line.currency ?? DEFAULT_CURRENCY
  const fromCents = rateInForce(
    line.recordedRateCents,
    ratePeriods(live.filter((r) => r.approvalState === 'APPROVED')),
    from
  ).rateCents

  // A rate change is an amendment to the agreement, so its size decides
  // whether it takes effect on its own or waits for somebody.
  const assessment = assessRateChange(fromCents, rate, contractCurrency)
  const approvalState = assessment.needsApproval ? 'PROPOSED' : 'APPROVED'

  const entry = await prisma.$transaction(async (tx) => {
    const row = await tx.rateHistory.create({
      data: {
        approvalState,
        approvedById: assessment.needsApproval ? null : caller.person.id,
        approvedAt: assessment.needsApproval ? null : new Date(),
        contractType: type,
        contractId,
        rate,
        rateType: rateType.toUpperCase(),
        fromDate: from,
        toDate: to,
        reason: reason ?? null,
        changedById: caller.person.id,
        previousRate: fromCents,
      },
    })
    // A change small enough to clear on its own takes its place in the
    // history now, exactly as an approved one does.
    if (approvalState === 'APPROVED') await settleApproved(tx, row, line, caller.person.id)
    return row
  })

  // A change small enough to clear on its own is approved here, so it
  // reaches days already paid exactly as an approved one does: the back
  // pay is worked out and proposed, never paid (lib/money/back-pay).
  const backPay = approvalState === 'APPROVED' && type === 'BUY' ? await proposeBackPay(entry.id) : null
  // Approved on the spot is approved: the worker the line pays is told.
  const told = approvalState === 'APPROVED' && type === 'BUY' ? await tellWorkerOfPayChange(entry.id, backPay) : null

  return NextResponse.json(
    {
      data: {
        rateHistory: { id: entry.id, rate: entry.rate, fromDate: entry.fromDate.toISOString(), approvalState },
        backPay: backPay
          ? {
              totalCents: backPay.applies ? backPay.figure.totalCents : null,
              weeks: backPay.applies ? backPay.figure.weeks : [],
              says: backPay.says,
            }
          : null,
        workerTold: told ? { personId: told.personId, why: told.why } : null,
      },
    },
    { status: 201 }
  )
}


const LIVE_STATES = ['DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'IN_PROGRESS', 'PAUSED'] as const
const LIVE_BUY_STATES = ['DRAFT', 'IN_PROGRESS', 'BENCH_PAID', 'INTERNAL', 'TRAINING'] as const

/**
 * Every live line this seat may change a rate on, with the rate in force
 * today. The same rule as POST: a desk that writes placements, at the
 * payer of a BUY line (and able to read what people cost), or at either
 * end of a SELL line. A worker's own seat changes nothing.
 */
async function changeableLines(caller: Awaited<ReturnType<typeof getCallerContext>>['caller'] & object) {
  const mine = caller.company?.id
  if (!mine || isConsultantSeat(caller) || !hasPermission(caller.permissions, 'assignments.write')) return []
  const seesCost = hasPermission(caller.permissions, 'consultants.cost')
  const [sells, buys] = await Promise.all([
    prisma.sellContract.findMany({
      where: { OR: [{ companyId: mine }, { clientCompanyId: mine }], state: { in: [...LIVE_STATES] } },
      select: {
        id: true, billRate: true, billCurrency: true, companyId: true,
        person: { select: { name: true } },
        company: { select: { name: true } },
        clientCompany: { select: { name: true } },
      },
      take: 500,
    }),
    seesCost
      ? prisma.buyContract.findMany({
          where: { companyId: mine, state: { in: [...LIVE_BUY_STATES] } },
          select: {
            id: true, payCurrency: true,
            candidates: { select: { payRate: true, person: { select: { name: true } } } },
            vendorCompany: { select: { name: true } },
          },
          take: 500,
        })
      : Promise.resolve([]),
  ])
  const rows = await prisma.rateHistory.findMany({
    where: {
      approvalState: 'APPROVED',
      OR: [
        { contractType: 'SELL', contractId: { in: sells.map((c) => c.id) } },
        { contractType: 'BUY', contractId: { in: buys.map((c) => c.id) } },
      ],
    },
  })
  const now = new Date()
  const inForce = (type: string, id: string, recorded: number) =>
    rateInForce(recorded, ratePeriods(rows.filter((r) => r.contractType === type && r.contractId === id)), now).rateCents

  return [
    ...buys
      .filter((b) => b.candidates.length > 0)
      .map((b) => ({
        contractType: 'BUY' as const,
        contractId: b.id,
        label:
          `Pay — ${b.candidates.map((c) => c.person.name).join(', ')}` +
          (b.vendorCompany ? ` through ${b.vendorCompany.name}` : ''),
        rateCents: inForce('BUY', b.id, b.candidates[0].payRate),
        currency: b.payCurrency,
      })),
    ...sells.map((c) => ({
      contractType: 'SELL' as const,
      contractId: c.id,
      label:
        c.companyId === mine
          ? `Bill — ${c.person.name} at ${c.clientCompany?.name ?? 'the client'}`
          : `Bill — ${c.person.name} from ${c.company.name}`,
      rateCents: inForce('SELL', c.id, c.billRate),
      currency: c.billCurrency,
    })),
  ].sort((a, b) => a.label.localeCompare(b.label))
}
