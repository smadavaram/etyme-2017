import { NextRequest, NextResponse } from 'next/server'
import { mayReadBillRate, billTrail, BILL_WITHHELD_SAYS } from '@/lib/money/pay-visibility'
import { writeBillTrail } from '@/lib/money/pay-trail'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { payerScope, seatedDesk } from '@/lib/resolve-client-company'
import { endClientFilter } from '@/lib/resolve-end-client'
import { payerRung } from '@/lib/chain-top'
import { isConsultantSeat } from '@/lib/seat'
import { mayEnter, mayApprove, approvingOwnHours } from '@/lib/timesheet-authority'
import { mayFile, rungVerdict } from './filing'
import { weekFlag, flaggedFirst } from '@/lib/timesheet-flag'
import { weekTurn } from './ladder'
import { rungsToFile, openWeeks } from '@/lib/consultant-portfolio'
import { maySign, type Sheet } from '@/lib/timesheet-signatures'
import {
  policyOf, splitWeeks, valueOf, weeksAwaitingDecision, saysAwaiting, treatmentSays,
  type Decision, type Treatment,
} from '@/lib/overtime'

/**
 * GET /api/timesheets
 *
 * Timesheets live on the sell side — they track billable hours
 * against a SellContract.
 *
 * ── Whose rate is on the row ─────────────────────────────────────────
 *
 * Three seats read this list and they are owed three different numbers.
 *
 * A vendor is owed what it bills. That is the rate on its own contract
 * and there is nothing to work out.
 *
 * A client is owed what it pays. In a chain the hours hang off the
 * bottom rung — the leg where the employer is — so reading the rate off
 * the timesheet's own contract printed CloudEPA's $118 on Nike's screen
 * beside the $145 Nike is billed, and the difference is the prime's
 * entire margin. The rows stay, because a client signs the hours of
 * people it never contracted with; the rate is walked up the chain to
 * the contract the client actually pays.
 *
 * A consultant is owed their own pay rate and never the bill rate. This
 * page is not in their nav and their session opens it anyway, and it
 * handed them the markup taken out of their own week.
 *
 * Where the paper cannot say, the rate is null and the row says why. A
 * plausible wrong rate on a timesheet is worse than a blank.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const url = request.nextUrl
  const status = url.searchParams.get('status')
  const sellContractId = url.searchParams.get('sellContractId')
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)))

  const onBench = isConsultantSeat(caller)

  // Resolve the desk before anything is scoped or gated.
  //
  // A seated coordinator is reading the client's weeks, not its own
  // firm's: the office employs nobody on the site, so `payerScope` on
  // its own company returned nothing and the page read as "no hours
  // have been filed" on a program with fourteen people on it.
  const desk = onBench ? null : await seatedDesk(caller)
  const acting = desk?.acting ?? caller
  const asClient = !onBench && (desk?.seat != null || caller.company?.kind === 'CLIENT')
  // The company whose site these hours were worked at, when this reader
  // is on the buying side of them.
  const buyerCompanyId = desk?.companyId ?? caller.company?.id ?? null

  // Which rows. A client signs the hours of everybody on its sites,
  // whoever employs them, so the rows are the end-client's — and only
  // the rows. What each one costs is settled below, at the rung this
  // client pays, never at the rung underneath it.
  const scope = asClient && buyerCompanyId ? endClientFilter(buyerCompanyId) : payerScope(caller)
  if (!scope) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'No company context' } },
      { status: 403 }
    )
  }

  const where: any = { sellContract: scope }
  if (status) where.status = status.toUpperCase()
  if (sellContractId) where.sellContractId = sellContractId

  // ── Flagged first, across the whole list ──────────────────────────
  //
  // The page says "Flagged entries are shown first" and the list was
  // ordered by date alone. A week's flag is read against its contract
  // (`weekFlag`), which the database cannot order by, so every matching
  // week is ranked on a few columns and the page is cut from that.
  const ranked = flaggedFirst(
    (
      await prisma.timesheet.findMany({
        where,
        select: {
          id: true, totalHours: true, periodStart: true, periodEnd: true, anomalyScore: true, anomalyReason: true,
          sellContract: { select: { endDate: true, requirement: { select: { hoursPerWeek: true } } } },
        },
      })
    ).map((t) => ({
      id: t.id,
      periodStart: t.periodStart,
      flag: weekFlag({
        hours: Number(t.totalHours),
        hoursPerWeek: t.sellContract.requirement?.hoursPerWeek ?? null,
        periodEnd: t.periodEnd,
        contractEnd: t.sellContract.endDate,
        anomalyScore: t.anomalyScore,
        anomalyReason: t.anomalyReason,
      }),
    }))
  )
  const pageIds = ranked.slice((page - 1) * limit, page * limit).map((r) => r.id)
  const flagOf = new Map(ranked.map((r) => [r.id, r.flag]))
  const total = ranked.length

  const timesheets = (
    await prisma.timesheet.findMany({
      where: { id: { in: pageIds } },
      include: {
        person: { select: { id: true, name: true } },
        sellContract: {
          select: {
            id: true,
            personId: true,
            companyId: true,
            clientCompanyId: true,
            endClientCompanyId: true,
            startDate: true,
            endDate: true,
            billRate: true,
            billCurrency: true,
            overtimeAfterHours: true,
            overtimeMultiplierBps: true,
            // The employer, by name. A week is SUBMITTED until both
            // sides have signed, and a row that says "waiting on the
            // other party" is not a sentence anybody can act on.
            company: { select: { id: true, name: true } },
            clientCompany: { select: { id: true, name: true } },
            endClientCompany: { select: { id: true, name: true } },
            engagement: { select: { id: true, title: true } },
          },
        },
        // The list has to be able to say "this one has a question on it"
        // before anybody clicks Approve and is refused.
        overtimeDecisions: {
          select: { weekOf: true, treatment: true, appliedBps: true, overtimeHours: true },
        },
      },
    })
  ).sort((a, b) => pageIds.indexOf(a.id) - pageIds.indexOf(b.id))

  const priced = await priceFor(caller, timesheets, { asClient, onBench, buyerCompanyId })

  // Who this reader is, for the purpose of "may you approve this week".
  // Under a seat that is the client's company holding the client's
  // permissions — which is precisely what the seat is — and the person
  // is still the real person at the office, because nobody approves
  // their own hours and that is answered against a person.
  const actor = {
    personId: caller.person.id,
    companyId: asClient && buyerCompanyId ? buyerCompanyId : caller.company?.id,
    permissions: acting.permissions,
    // Only for the refusal: which desks sign hours depends on the kind
    // of firm, and under a seat the desk is the client's.
    companyKind: asClient ? 'CLIENT' : caller.company?.kind ?? null,
    companyName: desk?.companyName ?? caller.company?.name ?? null,
  }

  const filingFor = await ownFiling(caller.person.id)

  // Whose turn it is on each chain week, for this reader — the approve
  // route's own question (`./chain-turn`), so the list never offers a
  // firm a button before the week has reached it, and offers the firm in
  // the middle the one it now has. A week with one firm on each side
  // needs no walk.
  const turnFirm = asClient && buyerCompanyId ? buyerCompanyId : caller.company?.id ?? null
  const turns = new Map<string, Awaited<ReturnType<typeof weekTurn>>['turn']>()
  if (turnFirm && !onBench) {
    await Promise.all(
      timesheets
        .filter((t) => t.status === 'SUBMITTED')
        .filter((t) => t.sellContract.companyId !== (t.sellContract.endClientCompanyId ?? t.sellContract.clientCompanyId))
        .map(async (t) => turns.set(t.id, (await weekTurn(t, turnFirm)).turn))
    )
  }

  return NextResponse.json({
    data: {
      timesheets: timesheets.map((t) => {
        const seen = priced.get(t.id)!
        const parties = {
          personId: t.sellContract.personId,
          vendorCompanyId: t.sellContract.companyId,
          clientCompanyId: t.sellContract.clientCompanyId,
          endClientCompanyId: t.sellContract.endClientCompanyId,
        }
        // The same two checks the approve route makes, in the same
        // order, so the screen never offers a button the server will
        // refuse. A consultant opening their own week is the case this
        // was drawn for: the hours are theirs and the decision is not.
        const own = approvingOwnHours(actor, parties)
        const entitled = own
          ? { ok: false, reason: 'Nobody approves their own hours.' }
          : mayApprove(actor, parties)
        const enter = mayEnter(actor, parties)

        // ── Which signature is still missing, and whose ─────────────
        //
        // A week carries two: the client approving that the work
        // happened, and the employer accepting what it will pay for. It
        // stays SUBMITTED until both are in — by design — and nothing on
        // the screen said so. A client that had signed on Monday opened
        // the list on Tuesday, read SUBMITTED, was offered the tick
        // again, was counted in "3 need review", pressed it and got
        // "Already approved." in a red toast. The status model is right;
        // the row was not saying what it knew.
        const employerId = t.sellContract.companyId
        const clientId = t.sellContract.endClientCompanyId ?? t.sellContract.clientCompanyId
        const isClientSide = actor.companyId === clientId
        const isEmployerSide = actor.companyId === employerId
        const sheet: Sheet = {
          totalHours: Number(t.totalHours),
          clientApproved: t.clientApprovedAt
            ? { at: t.clientApprovedAt, byId: t.clientApprovedById! }
            : null,
          employerAccepted: t.employerAcceptedAt
            ? { at: t.employerAcceptedAt, byId: t.employerAcceptedById! }
            : null,
          acceptedHours: t.acceptedHours ? Number(t.acceptedHours) : null,
          acceptedNote: t.acceptedNote,
          direct: employerId === clientId,
        }
        // The same choice the approve route makes, so the screen and the
        // server cannot disagree about which signature this press is.
        const asParty = isClientSide ? 'CLIENT' : 'EMPLOYER'
        const turn = turns.get(t.id)
        // In a chain the turn decides, not the two-party rule: a firm in
        // the middle has no column to sign and an employer waits its turn.
        const signable = turn
          ? { ok: turn.ok, reason: turn.ok ? 'Your turn.' : turn.says }
          : maySign(asParty, sheet, isClientSide, isEmployerSide)
        const otherParty = isClientSide
          ? t.sellContract.company?.name ?? 'the supplier'
          : seen.clientCompany.name
        const mine = isClientSide ? sheet.clientApproved : isEmployerSide ? sheet.employerAccepted : null
        // A tick this side has already given is not offered again, and
        // the row says who it is now waiting on in their own name.
        const approve =
          turn && entitled.ok
            ? turn.ok
              ? { ok: true, reason: turn.signer.role === 'PASS_THROUGH' ? 'Accepting what you pay, in your turn.' : entitled.reason }
              : { ok: false, reason: turn.says }
            : entitled.ok && !signable.ok && mine
              ? { ok: false, reason: waitingSentence(isClientSide, otherParty) }
              : entitled
        const signature = {
          youSigned: mine != null,
          youSignedAt: mine?.at.toISOString() ?? null,
          waitingOnYou: entitled.ok && signable.ok && t.status === 'SUBMITTED',
          waitingOn: mine != null && t.status === 'SUBMITTED' ? otherParty : null,
          says:
            mine == null
              ? null
              : t.status === 'SUBMITTED'
                ? waitingSentence(isClientSide, otherParty)
                : isClientSide
                  ? 'Approved, and the supplier has accepted it.'
                  : 'Accepted, and the client has approved it.',
        }

        return {
          id: t.id,
          person: t.person,
          sellContract: {
            id: t.sellContract.id,
            // Whose paper this row is read against. For a client in a
            // chain that is its own contract, not its supplier's.
            clientCompany: seen.clientCompany,
            endClientCompany: t.sellContract.endClientCompany,
            engagement: seen.engagement,
          },
          rate: seen.rate,
          periodStart: t.periodStart.toISOString(),
          periodEnd: t.periodEnd.toISOString(),
          totalHours: Number(t.totalHours),
          status: t.status,
          anomalyScore: t.anomalyScore,
          anomalyReason: t.anomalyReason,
          // What is wrong with the week, in a sentence, or null. The
          // reason it is listed first.
          flag: flagOf.get(t.id) ?? null,
          approvedAt: t.approvedAt?.toISOString() ?? null,
          mayApprove: approve.ok,
          mayApproveWhyNot: approve.ok ? null : approve.reason,
          maySubmit: enter.ok,
          signature,
          overtime: overtimeOf(t, seen),
        }
      }),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      // ── Whether this reader files a week at all ─────────────────
      //
      // A button the route will refuse is a button that lies — the nav
      // rule, one layer down. "+ New" was hidden from a client and shown
      // to everybody else, so a program office seated at a client's desk
      // was offered it and refused on press: `mayEnter` admits the
      // person whose hours they are and the agency that employs them,
      // and an office that places nobody is neither.
      // Whose book was read. A program office at a client's desk is
      // reading the client's weeks, and the page heads itself the way
      // the client would head it (`lib/page-framing`).
      desk: {
        companyId: buyerCompanyId,
        companyName: desk?.companyName ?? caller.company?.name ?? null,
        seated: !!desk?.seat,
        says: desk?.seat
          ? `You are at ${desk.companyName}'s desk. These are the weeks worked at ${desk.companyName}'s sites, not ${caller.company?.name ?? 'your firm'}'s.`
          : null,
      },
      // ── Whether this reader files a week at all ─────────────────
      //
      // Only the worker files, and only on the rung the door will take:
      // their own contracts `rungsToFile` lists, with the weeks still
      // open on each and the weeks sent back to them, which they file
      // again over themselves. A firm is told who files, not offered a
      // form the door would refuse.
      filing: {
        may: filingFor.length > 0,
        rungs: filingFor,
        says:
          filingFor.length > 0
            ? null
            : asClient
              ? `Hours are filed by the person who worked them, from their own page. ` +
                `${desk?.companyName ?? caller.company?.name ?? 'This desk'} buys the work and signs for it.`
              : `Hours are filed by the person who worked them, from their own page. ` +
                `${caller.company?.name ?? 'Your firm'} accepts them once the client has signed.`,
      },
    },
  })
}

/**
 * What a row says to the side that has already signed it.
 *
 * Their word for what they did — a client approves that the work
 * happened, an employer accepts what it will pay — and the other firm by
 * name, because "waiting on the other party" is not a sentence anybody
 * can act on.
 */
function waitingSentence(isClientSide: boolean, other: string): string {
  return isClientSide
    ? `You approved this week. Waiting on ${other} to accept what it pays.`
    : `You accepted this week for pay. Waiting on ${other} to approve it for billing.`
}

/**
 * What this reader is allowed to see a rate for, and which rate.
 *
 * One pass over the page's rows, two extra queries at most — never a
 * lookup per row.
 */
interface Seen {
  rate: {
    cents: number | null
    currency: string | null
    basis: 'BILL' | 'PAY'
    label: string
    says: string | null
  }
  afterHours: number | null
  multiplierBps: number | null
  clientCompany: { id: string; name: string }
  engagement: { id: string; title: string } | null
}

type Row = {
  id: string
  sellContract: {
    id: string
    personId: string
    companyId: string
    clientCompanyId: string
    startDate: Date
    endDate: Date | null
    billRate: number
    billCurrency: string
    overtimeAfterHours: number | null
    overtimeMultiplierBps: number | null
    clientCompany: { id: string; name: string }
    engagement: { id: string; title: string } | null
  }
}

async function priceFor(
  caller: NonNullable<Awaited<ReturnType<typeof getCallerContext>>['caller']>,
  rows: Row[],
  seat: { asClient: boolean; onBench: boolean; buyerCompanyId: string | null }
): Promise<Map<string, Seen>> {
  const out = new Map<string, Seen>()
  if (rows.length === 0) return out

  const asIs = (r: Row): Seen => ({
    rate: {
      cents: r.sellContract.billRate,
      currency: r.sellContract.billCurrency,
      basis: 'BILL',
      label: 'Bill rate',
      says: null,
    },
    afterHours: r.sellContract.overtimeAfterHours,
    multiplierBps: r.sellContract.overtimeMultiplierBps,
    clientCompany: r.sellContract.clientCompany,
    engagement: r.sellContract.engagement,
  })

  // ── The person whose week it is ────────────────────────────────────
  //
  // Their pay, from the agreement that pays them, or nothing. The bill
  // rate is what their agency charges for them and it is not theirs to
  // read — /api/me/work was fixed for exactly this and the fix did not
  // reach the other page the same seat can open.
  if (seat.onBench) {
    const lines = await prisma.buyContractCandidate.findMany({
      where: { personId: caller.person.id, state: 'ACTIVE' },
      select: { payRate: true, payCurrency: true, buyContract: { select: { companyId: true } } },
    })
    const byCompany = new Map(lines.map((l) => [l.buyContract.companyId, l]))
    for (const r of rows) {
      const pay = byCompany.get(r.sellContract.companyId)
      out.set(r.id, {
        rate: {
          cents: pay?.payRate ?? null,
          currency: pay?.payCurrency ?? null,
          basis: 'PAY',
          label: 'Your rate',
          says: pay
            ? null
            : 'Your rate is not recorded on Etyme for this placement. Your agency has it.',
        },
        afterHours: r.sellContract.overtimeAfterHours,
        multiplierBps: r.sellContract.overtimeMultiplierBps,
        clientCompany: r.sellContract.clientCompany,
        engagement: r.sellContract.engagement,
      })
    }
    return out
  }

  if (!seat.asClient || !seat.buyerCompanyId) {
    // ── A firm's own staff ──────────────────────────────────────────
    //
    // What a line bills at is the price desk's and the billing desk's
    // (`mayReadBillRate`, lib/money/pay-visibility) — never every seat at
    // the firm. A delivery engineer who files his own week read what the
    // client is billed for each colleague. The row stays, with its hours
    // and its overtime split; the rate and the value made from it are
    // withheld with one sentence, and every rate read or withheld about
    // somebody else is on the trail.
    const viewer = {
      permissions: caller.permissions,
      companyId: caller.company?.id ?? null,
      companyKind: caller.company?.kind ?? null,
      personId: caller.person.id,
    }
    const lineOf = (r: Row) => ({ sellerId: r.sellContract.companyId, clientId: r.sellContract.clientCompanyId })
    for (const r of rows) {
      const seen = asIs(r)
      if (!mayReadBillRate(viewer, lineOf(r))) {
        seen.rate = { ...seen.rate, cents: null, currency: null, says: BILL_WITHHELD_SAYS }
      }
      out.set(r.id, seen)
    }
    await writeBillTrail(caller, billTrail(viewer, rows.map((r) => ({ ...lineOf(r), personId: r.sellContract.personId }))))
    return out
  }

  // ── The client ─────────────────────────────────────────────────────
  //
  // Every rung of every chain these people are on at this client, so
  // each row can be walked up to the contract this client is billed on.
  const rungs = await prisma.sellContract.findMany({
    where: {
      ...endClientFilter(seat.buyerCompanyId),
      personId: { in: [...new Set(rows.map((r) => r.sellContract.personId))] },
    },
    select: {
      id: true, personId: true, companyId: true, clientCompanyId: true,
      startDate: true, endDate: true, billRate: true, billCurrency: true,
      overtimeAfterHours: true, overtimeMultiplierBps: true,
      clientCompany: { select: { id: true, name: true } },
      engagement: { select: { id: true, title: true } },
    },
  })

  for (const r of rows) {
    const top = payerRung(r.sellContract, rungs)
    if (!top) {
      // Two legs above this week covering the same days. There is no one
      // contract to price it at, and a guess here is the prime's margin
      // on the client's screen or the client's rate on nobody's.
      out.set(r.id, {
        rate: {
          cents: null,
          currency: null,
          basis: 'BILL',
          label: 'Bill rate',
          says:
            'More than one of your contracts covers this week, so there is no single ' +
            'rate to price it at. Check the contracts for this person.',
        },
        afterHours: null,
        multiplierBps: null,
        clientCompany: r.sellContract.clientCompany,
        engagement: r.sellContract.engagement,
      })
      continue
    }
    out.set(r.id, {
      rate: {
        cents: top.billRate,
        currency: top.billCurrency,
        basis: 'BILL',
        label: 'Bill rate',
        says: null,
      },
      afterHours: top.overtimeAfterHours,
      multiplierBps: top.overtimeMultiplierBps,
      clientCompany: top.clientCompany,
      engagement: top.engagement,
    })
  }
  return out
}

/**
 * What this sheet still has to be asked, and what it was already told.
 *
 * A week over the threshold cannot be approved until somebody says what
 * happens to the hours, so the list says which rows hold a question
 * before anybody clicks Approve and is refused. The sentence is the
 * same one the approval route would return, written once in
 * `lib/overtime` so the screen and the refusal cannot disagree.
 *
 * Hours are a fact and money is a reading of it. Where the reader is
 * owed no rate — a consultant whose pay is not recorded, a week two
 * contracts both cover — the hours still split and the value is null.
 */
function overtimeOf(
  t: {
    person: { name: string }
    days: unknown
    leaveDays: unknown
    overtimeDecisions: { weekOf: Date; treatment: string; appliedBps: number; overtimeHours: unknown }[]
  },
  seen: Seen
) {
  const policy = policyOf({
    overtimeAfterHours: seen.afterHours,
    overtimeMultiplierBps: seen.multiplierBps,
  })
  const decisions: Decision[] = t.overtimeDecisions.map((d) => ({
    weekOf: d.weekOf.toISOString().slice(0, 10),
    treatment: d.treatment as Treatment,
    appliedBps: d.appliedBps,
    overtimeHours: Number(d.overtimeHours),
  }))
  const split = splitWeeks((t.days as Record<string, number>) ?? {}, policy, {
    leaveDays: (t.leaveDays as Record<string, number>) ?? {},
    decisions,
  })
  const waiting = weeksAwaitingDecision(split)

  return {
    afterHours: policy.afterHours,
    multiplierBps: policy.multiplierBps,
    rateCents: seen.rate.cents,
    /**
     * What the sheet is worth at this reader's own rate, priced from
     * each week's own decision. Hours nobody has decided are not in it
     * — a screen that prints 45 billed hours with 40 hours of money
     * against them is the bug this whole feature exists to remove.
     */
    billableCents: seen.rate.cents == null ? null : valueOf(split, seen.rate.cents).totalCents,
    pendingHours: split.pendingHours,
    bankedHours: split.bankedHours,
    leaveHours: split.leaveHours,
    weeks: waiting.map((w) => ({
      weekOf: w.weekOf,
      workedHours: w.workedHours,
      overtimeHours: w.pendingHours,
    })),
    decided: split.weeks
      .filter((w) => w.treatment != null)
      .map((w) => ({
        weekOf: w.weekOf,
        hours: w.overtimeHours + w.bankedHours,
        says: treatmentSays(w.treatment!, w.appliedBps ?? 10_000),
      })),
    says: waiting.length > 0 ? saysAwaiting(waiting, t.person.name, policy) : null,
  }
}

/**
 * POST /api/timesheets
 *
 * Create a timesheet against a sell contract.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const body = await request.json()
  const { sellContractId, periodStart, periodEnd, days, leaveDays } = body

  if (!sellContractId) return err('sellContractId is required', 'sellContractId')
  if (!periodStart) return err('periodStart is required', 'periodStart')
  if (!periodEnd) return err('periodEnd is required', 'periodEnd')
  if (!days || typeof days !== 'object') return err('days object is required (e.g. {"2026-08-01": 8})', 'days')

  const sellContract = await prisma.sellContract.findUnique({
    where: { id: sellContractId },
    select: {
      id: true, personId: true, state: true, billRate: true,
      companyId: true, clientCompanyId: true, endClientCompanyId: true,
      startDate: true, endDate: true,
      person: { select: { name: true } },
    },
  })

  if (!sellContract) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Sell contract not found' } },
      { status: 404 }
    )
  }

  // Whose hours these are. The worker's, and nobody else files them —
  // not the firm that employs them either (founder, 2026-09-28; CLAUDE.md
  // "One week, filed once by the worker, signed at the top").
  const allowed = mayEnter(
    { personId: caller.person.id, companyId: caller.company?.id, permissions: caller.permissions },
    {
      personId: sellContract.personId,
      personName: sellContract.person.name,
      vendorCompanyId: sellContract.companyId,
      clientCompanyId: sellContract.clientCompanyId,
      endClientCompanyId: sellContract.endClientCompanyId,
    }
  )
  if (!allowed.ok) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: allowed.reason } },
      { status: 403 }
    )
  }

  // ── Which rung, which days ──────────────────────────────────────────
  //
  // Asked here, at the door, and not only on the worker's page: the page
  // asked and the door did not, so a week could go on a rung above the
  // worker's employer — a second copy of one week, billed twice — or onto
  // days that had not happened, fell outside the placement, or another
  // week already held. `./filing` says why, and reuses supply's rules.
  const today = new Date().toISOString().slice(0, 10)
  const theirs = await prisma.sellContract.findMany({
    where: { personId: sellContract.personId },
    select: { id: true, personId: true, companyId: true, clientCompanyId: true, state: true, startDate: true, endDate: true },
  })
  const wrongRung = rungVerdict(
    theirs.map((c) => ({
      id: c.id,
      personId: c.personId,
      companyId: c.companyId,
      clientCompanyId: c.clientCompanyId,
      state: c.state,
      startDate: c.startDate.toISOString().slice(0, 10),
      endDate: c.endDate?.toISOString().slice(0, 10) ?? null,
    })),
    sellContract.id,
    today
  )
  if (wrongRung && !wrongRung.ok) {
    return NextResponse.json({ error: { code: wrongRung.code, message: wrongRung.says } }, { status: 409 })
  }

  const onFile = await prisma.timesheet.findMany({
    where: { sellContractId: sellContract.id },
    select: {
      id: true, periodStart: true, periodEnd: true, status: true,
      _count: { select: { invoiceLines: true, overtimeDecisions: true, timeOffDraws: true } },
    },
  })
  const filing = mayFile({
    periodStart: String(periodStart).slice(0, 10),
    periodEnd: String(periodEnd).slice(0, 10),
    hours: days as Record<string, number>,
    contract: {
      startDate: sellContract.startDate.toISOString().slice(0, 10),
      endDate: sellContract.endDate?.toISOString().slice(0, 10) ?? null,
    },
    onFile: onFile.map((t) => ({
      id: t.id,
      status: t.status,
      periodStart: t.periodStart.toISOString().slice(0, 10),
      periodEnd: t.periodEnd.toISOString().slice(0, 10),
      actedOn: t._count.invoiceLines + t._count.overtimeDecisions + t._count.timeOffDraws > 0,
    })),
    today,
  })
  if (!filing.ok) {
    return NextResponse.json(
      { error: { code: filing.code, message: filing.says, field: filing.code === 'VALIDATION' ? 'days' : 'periodStart' } },
      { status: filing.code === 'ALREADY_FILED' ? 409 : 422 }
    )
  }

  // The hours as checked: blanks and zeros dropped, every day open.
  const totalHours = filing.totalHours

  // ── Which of those hours were paid leave ────────────────────────────
  //
  // Leave sits inside the day's hours rather than beside them: the
  // consultant is paid for the day either way, and what changes is that
  // the hours were not worked. Recorded per day, because the overtime
  // threshold is judged per week and a sheet total cannot say which
  // week the leave fell in — and leave that counted toward the
  // threshold would manufacture overtime, which would bank more leave.
  const leave: Record<string, number> = {}
  for (const [dayKey, h] of Object.entries((leaveDays ?? {}) as Record<string, unknown>)) {
    const n = Number(h)
    if (!Number.isFinite(n) || n <= 0) continue
    const worked = Number(filing.days[dayKey] ?? 0)
    if (worked <= 0) {
      return err(`There are no hours on ${dayKey} for the leave to come out of.`, 'leaveDays')
    }
    leave[dayKey] = Math.min(n, worked)
  }

  // Simple anomaly detection: > 12 hours in a day or > 60 hours in a week
  let anomalyScore: number | null = null
  let anomalyReason: string | null = null

  const dayValues = Object.values(filing.days)
  const maxDay = Math.max(...dayValues.map((v) => (typeof v === 'number' ? v : 0)))

  if (maxDay > 12) {
    anomalyScore = 30
    anomalyReason = `Day with ${maxDay} hours exceeds 12-hour threshold`
  } else if (totalHours > 60) {
    anomalyScore = 50
    anomalyReason = `Total ${totalHours} hours exceeds 60-hour weekly threshold`
  }

  try {
    const timesheet = filing.replaces
      ? // Filed again over a week that was sent back. The same row, so
        // the rejection on the log still points at it; both signatures
        // cleared, because they were given on hours that are no longer
        // the hours. `./filing` says why this and not a reopen step.
        await prisma.timesheet.update({
          where: { id: filing.replaces },
          data: {
            periodEnd: new Date(periodEnd),
            days: filing.days as any,
            leaveDays: Object.keys(leave).length > 0 ? (leave as any) : Prisma.DbNull,
            totalHours,
            status: 'OPEN',
            anomalyScore,
            anomalyReason,
            submittedAt: null,
            clientApprovedById: null, clientApprovedAt: null, autoApproved: false,
            employerAcceptedById: null, employerAcceptedAt: null,
            acceptedHours: null, acceptedNote: null,
            approvedById: null, approvedAt: null,
          },
        })
      : await prisma.timesheet.create({
          data: {
            sellContractId,
            personId: sellContract.personId,
            periodStart: new Date(periodStart),
            periodEnd: new Date(periodEnd),
            days: filing.days as any,
            leaveDays: Object.keys(leave).length > 0 ? (leave as any) : undefined,
            totalHours,
            status: 'OPEN',
            anomalyScore,
            anomalyReason,
          },
        })

    return NextResponse.json({
      data: {
        timesheet: {
          id: timesheet.id,
          totalHours: Number(timesheet.totalHours),
          status: timesheet.status,
          anomalyScore,
          anomalyReason,
          periodStart: timesheet.periodStart.toISOString(),
          periodEnd: timesheet.periodEnd.toISOString(),
        },
        replaced: filing.replaces !== null,
        message: anomalyReason
          ? `Timesheet ${filing.replaces ? 'filed again' : 'created'} with anomaly detected: ${anomalyReason}`
          : filing.replaces
            ? `Filed again: ${totalHours} hours. Send it for approval when it is right.`
            : `Timesheet created: ${totalHours} hours`,
      },
    }, { status: filing.replaces ? 200 : 201 })
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return NextResponse.json(
        { error: { code: 'DUPLICATE', message: 'A timesheet already exists for this contract and period' } },
        { status: 409 }
      )
    }
    throw e
  }
}

function err(message: string, field: string) {
  return NextResponse.json(
    { error: { code: 'VALIDATION', message, field } },
    { status: 422 }
  )
}

/**
 * The rungs this person files on, each with the weeks still open and the
 * weeks sent back to them.
 *
 * The same answer the door gives: `rungsToFile` for the rung, `openWeeks`
 * for the days, and a week sent back (OPEN, nothing acted on it) offered
 * to be filed again over itself. Empty for anybody who is not a worker,
 * which is every firm's desk.
 */
async function ownFiling(personId: string) {
  const today = new Date().toISOString().slice(0, 10)
  const mine = await prisma.sellContract.findMany({
    where: { personId },
    select: {
      id: true, personId: true, companyId: true, clientCompanyId: true, state: true, startDate: true, endDate: true,
      company: { select: { name: true } },
      endClientCompany: { select: { name: true } },
      clientCompany: { select: { name: true } },
    },
  })
  if (mine.length === 0) return []
  const rungs = rungsToFile(
    mine.map((c) => ({
      id: c.id,
      personId: c.personId,
      companyId: c.companyId,
      clientCompanyId: c.clientCompanyId,
      state: c.state,
      startDate: c.startDate.toISOString().slice(0, 10),
      endDate: c.endDate?.toISOString().slice(0, 10) ?? null,
    })),
    today
  )
  if (rungs.length === 0) return []
  const weeks = await prisma.timesheet.findMany({
    where: { sellContractId: { in: rungs.map((r) => r.id) } },
    select: {
      id: true, sellContractId: true, periodStart: true, periodEnd: true, status: true,
      _count: { select: { invoiceLines: true, overtimeDecisions: true, timeOffDraws: true } },
    },
  })
  return rungs.map((r) => {
    const c = mine.find((x) => x.id === r.id)!
    const here = weeks.filter((w) => w.sellContractId === r.id)
    const filed = here.map((w) => ({
      periodStart: w.periodStart.toISOString().slice(0, 10),
      periodEnd: w.periodEnd.toISOString().slice(0, 10),
    }))
    const sentBack = here
      .filter((w) => w.status === 'OPEN' && w._count.invoiceLines + w._count.overtimeDecisions + w._count.timeOffDraws === 0)
      .map((w) => {
        const periodStart = w.periodStart.toISOString().slice(0, 10)
        const periodEnd = w.periodEnd.toISOString().slice(0, 10)
        const days: string[] = []
        for (let d = Date.parse(periodStart); d <= Date.parse(periodEnd); d += 86_400_000) {
          days.push(new Date(d).toISOString().slice(0, 10))
        }
        return { periodStart, periodEnd, days, label: `${periodStart} – ${periodEnd}`, again: true }
      })
    return {
      contractId: r.id,
      site: c.endClientCompany?.name ?? c.clientCompany?.name ?? c.company.name,
      employer: c.company.name,
      weeks: [...sentBack, ...openWeeks(r, filed, today).map((w) => ({ ...w, again: false }))],
    }
  })
}
