import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { ownPageFor } from '@/lib/portfolio-data'
import { rungsToFile, openWeeks, checkWeek, placementLines, tieOf, returnedWeek } from '@/lib/consultant-portfolio'
import { POST as createTimesheet } from '@/app/api/timesheets/route'
import { POST as submitTimesheet } from '@/app/api/timesheets/[id]/submit/route'

/**
 * GET /api/me/work
 *
 * A consultant's own view: where they work, what they are owed, what is
 * ending, and what somebody has shared about them.
 *
 * Every screen before this one belongs to a company. This one belongs to a
 * person, and it is where the money chain actually starts — nobody has been
 * able to enter an hour, and every control downstream rests on an approved
 * timesheet.
 *
 * Scoped to the signed-in person throughout. There is no companyId here to
 * get wrong: a consultant sees their own rows or nothing.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const personId = caller.person.id
  const now = new Date()

  // Why this page is theirs at all, in their own situation's words.
  //
  // The same answer their own page and the shell already use
  // (`ownPage`), asked once here rather than decided a second way in the
  // browser — two answers to one question drift, and this one decides
  // what somebody with no work yet is told instead of four zeros.
  const standing = await ownPageFor(personId)

  const contracts = await prisma.sellContract.findMany({
    where: { personId },
    include: {
      company: { select: { id: true, name: true } },        // who pays them
      clientCompany: { select: { id: true, name: true } },  // who buys this rung
      endClientCompany: { select: { id: true, name: true } }, // where they work
      workLocation: { select: { name: true, city: true } },
    },
    orderBy: { startDate: 'desc' },
  })

  const timesheets = await prisma.timesheet.findMany({
    where: { personId },
    include: { invoiceLines: { select: { id: true } } },
    orderBy: { periodStart: 'desc' },
    take: 26,
  })

  // When the next one is due.
  //
  // A consultant asking "when do I have to submit by" had nowhere to
  // look, and the answer already existed: cycle dates are generated per
  // contract and already shifted off weekends and the company's own
  // holidays. Not showing them meant the one party with a deadline was
  // the only party who could not see it.
  const cycles = await prisma.cycle.findMany({
    where: {
      sellContractId: { in: contracts.map((c) => c.id) },
      completedAt: null,
      // Both deadlines, because a consultant asked for both: when they
      // must submit, and when it should have been signed off. The second
      // is somebody else's deadline and still theirs to know — an
      // approval that has not happened is money that has not started
      // moving.
      kind: { in: ['TIMESHEET_SUBMIT', 'TIMESHEET_APPROVE'] },
    },
    orderBy: { dueOn: 'asc' },
    take: 12,
  })

  // What has been sent about them, and to whom. A consultant should not
  // have to ask whether their passport went to a stranger.
  const sharedAbout = await prisma.documentShare.findMany({
    where: { subjectPersonId: personId },
    include: { company: { select: { name: true } }, _count: { select: { accesses: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })


  // What they can file, and against which contract.
  //
  // Station 6: the worker files their own week. This page listed weeks
  // and offered to send an open one, and nothing let them write one —
  // so a consultant's view was read-only and every approval downstream
  // waited on a week somebody else typed. In a chain only the bottom
  // rung takes hours (`rungsToFile`), so Helena files on CloudEPA's
  // contract and never on the one Computer Systems sells to Northbend.
  const today = now.toISOString().slice(0, 10)
  const toFile = rungsToFile(
    contracts.map((c) => ({
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
  const filedOn = toFile.length
    ? await prisma.timesheet.findMany({
        where: { sellContractId: { in: toFile.map((c) => c.id) }, personId },
        select: { id: true, sellContractId: true, periodStart: true, periodEnd: true, status: true, days: true },
      })
    : []
  // Why each open week came back, where it did. The reject step writes
  // the reason on the automation log against the week's id; an OPEN week
  // with no such row was saved and never sent, and is offered under
  // "Hours to send" instead.
  const reasons = await returnReasons(filedOn.filter((t) => t.status === 'OPEN').map((t) => t.id))
  const filing = toFile.map((r) => {
    const c = contracts.find((x) => x.id === r.id)!
    const filed = filedOn
      .filter((t) => t.sellContractId === r.id)
      .map((t) => ({
        periodStart: t.periodStart.toISOString().slice(0, 10),
        periodEnd: t.periodEnd.toISOString().slice(0, 10),
      }))
    return {
      contractId: r.id,
      site: c.endClientCompany?.name ?? c.company.name,
      payer: c.company.name,
      startDate: r.startDate,
      endDate: r.endDate,
      filed,
      weeks: openWeeks(r, filed, today),
      // Weeks sent back, to correct and send again over the same row.
      returned: filedOn
        .filter((t) => t.sellContractId === r.id && t.status === 'OPEN' && reasons.has(t.id))
        .map((t) => {
          const mine = { periodStart: t.periodStart.toISOString().slice(0, 10), periodEnd: t.periodEnd.toISOString().slice(0, 10) }
          const others = filed.filter((f) => f.periodStart !== mine.periodStart)
          return returnedWeek(
            { id: t.id, ...mine, days: (t.days ?? {}) as Record<string, number> },
            r,
            others,
            today,
            reasons.get(t.id) ?? null
          )
        })
        .filter((w) => w !== null),
    }
  })

  // What they are actually paid, from the agreement that pays them.
  //
  // This screen showed billRate — what the vendor charges the client. It
  // is not their rate, and showing it hands them the markup regardless of
  // what the vendor decided about disclosure, which Addendum D makes a
  // per-requirement choice for the vendor to make.
  const payLines = await prisma.buyContractCandidate.findMany({
    where: { personId: caller.person.id, state: 'ACTIVE' },
    select: {
      payRate: true, payCurrency: true, startDate: true,
      buyContract: { select: { companyId: true, supplierSellContractId: true, contractType: true } },
    },
  })

  // ── Only the leg that reaches the person ───────────────────────────
  //
  // Every rung of a chain has a sell contract naming the person, and the
  // query above pulls all of them, so this list has a row per rung. Every
  // rung also has a `BuyContractCandidate` with that person's name on it
  // — award writes one at each hop — and at every rung but the bottom its
  // `payRate` is what one firm pays another firm for that person's hours.
  // That is a sell-side price one rung down. Showing it to the person as
  // "your pay" hands them a markup, which is the same defect as reading
  // `Submission.rate` on their own screen.
  //
  // `supplierSellContractId` is exactly the rung below, and null means
  // there is none: this firm pays the person (or their own corporation)
  // directly, so the figure is theirs. Anything else is withheld with a
  // sentence rather than shown — including the rare case of a
  // corp-to-corp consultant whose own company happens to hold a sell
  // contract here, where a blank is the safe direction to be wrong in.
  const paysAnybody = new Map(payLines.map(l => [l.buyContract.companyId, l]))
  const payByCompany = new Map(
    payLines
      .filter(l => l.buyContract.supplierSellContractId === null)
      .map(l => [l.buyContract.companyId, l])
  )

  // One placement per chain, naming every firm in it (`placementLines`).
  // The worker knows the complete chain — decided 2026-09-28 — and the
  // rungs above theirs were listed as placements of their own, so Helena
  // read Northbend Athletic twice. Her pay is read off her own rung only.
  const lines = placementLines(
    contracts.map((c) => ({
      id: c.id,
      personId: c.personId,
      companyId: c.companyId,
      clientCompanyId: c.clientCompanyId,
      state: c.state,
      startDate: c.startDate.toISOString().slice(0, 10),
      endDate: c.endDate?.toISOString().slice(0, 10) ?? null,
      companyName: c.company.name,
      clientName: c.clientCompany?.name ?? c.company.name,
      endClientName: c.endClientCompany?.name ?? null,
    })),
    (companyId) => tieOf(payByCompany.get(companyId)?.buyContract.contractType)
  )
  const byId = new Map(contracts.map((c) => [c.id, c]))
  const livePlacements = lines.filter((l) => l.own.state === 'IN_PROGRESS' || l.own.state === 'VERIFIED')

  return NextResponse.json({
    data: {
      person: { id: caller.person.id, name: caller.person.name },
      standing: { ok: standing.ok, because: standing.because, says: standing.says },
      placements: lines.map((l) => {
        const c = byId.get(l.own.id)!
        return {
          id: c.id,
          // The whole chain, in order, from the site down to whoever pays
          // them: "Northbend Athletic · through Computer Systems ·
          // employed by CloudEPA".
          chain: l.says,
          through: l.through,
          payer: l.employer,
          site: l.site,
          location: c.workLocation ? (c.workLocation.city ?? c.workLocation.name) : null,
          // Their pay, from their own rung, or nothing. No rung above
          // theirs is priced here: those are prices between two firms.
          payRate: payByCompany.get(c.companyId)?.payRate ?? null,
          payCurrency: payByCompany.get(c.companyId)?.payCurrency ?? null,
          rateNote: payByCompany.has(c.companyId)
            ? null
            : paysAnybody.has(c.companyId)
              // A line the walk could not reach the bottom of: this firm
              // buys them from somebody else, so its figure is not theirs.
              ? 'This firm buys you from another supplier, so what it pays is a ' +
                'price between two firms and not your rate. Yours is on the agreement ' +
                'with whoever employs you.'
              : 'Your rate is not recorded on Etyme for this placement. ' + l.employer + ' has it.',
          state: c.state,
          startDate: c.startDate.toISOString().slice(0, 10),
          endDate: c.endDate?.toISOString().slice(0, 10) ?? null,
          daysLeft: c.endDate
            ? Math.ceil((c.endDate.getTime() - now.getTime()) / 86_400_000)
            : null,
        }
      }),
      // One entry per contract they file on, with the weeks still open.
      // Empty where they have nothing to file, which the page says in a
      // sentence rather than showing an empty form.
      filing,
      today,
      timesheets: timesheets.map(t => ({
        id: t.id,
        period: `${t.periodStart.toISOString().slice(0, 10)} → ${t.periodEnd.toISOString().slice(0, 10)}`,
        periodStart: t.periodStart.toISOString().slice(0, 10),
        hours: Number(t.totalHours),
        status: t.status,
        // Billed means the client has been invoiced for it. That is the
        // question behind "when do I get paid", so it is answered rather
        // than left to be inferred from a status word.
        // Any hop having billed for it. The consultant does not care
        // which one, and in a chain there is more than one.
        billed: t.invoiceLines.length > 0,
      })),
      sharedAboutMe: sharedAbout.map(s => ({
        by: s.company.name,
        to: s.recipientEmail,
        purpose: s.purpose,
        openedCount: s._count.accesses,
        expiresAt: s.expiresAt.toISOString().slice(0, 10),
        withdrawn: s.revokedAt !== null,
      })),
      summary: {
        // Placements, not rungs: a chain of three is one place to be.
        livePlacements: livePlacements.length,
        // Their own hours, not billing. Somebody working two contracts
        // wants one number.
        hoursThisMonth: timesheets
          .filter(t => t.periodStart.getMonth() === now.getMonth() && t.periodStart.getFullYear() === now.getFullYear())
          .reduce((n, t) => n + Number(t.totalHours), 0),
        awaitingApproval: timesheets.filter(t => t.status === 'SUBMITTED').length,
        // The one that matters: approved work nobody has invoiced.
        approvedNotBilled: timesheets.filter(t => t.status === 'APPROVED' && t.invoiceLines.length === 0).length,
        endingSoon: livePlacements.filter((l) => l.own.endDate && (toMs(l.own.endDate) - now.getTime()) / 86_400_000 <= 60).length,
      },

      // Deadlines, soonest first, and only the ones still open.
      due: cycles.map((c) => ({
        contractId: c.sellContractId,
        whose: c.kind === 'TIMESHEET_SUBMIT' ? 'YOU' : 'THEM',
        what:
          c.kind === 'TIMESHEET_SUBMIT'
            ? 'Your hours are due'
            : 'They should have approved it by',
        dueOn: c.dueOn.toISOString().slice(0, 10),
        daysAway: Math.ceil((c.dueOn.getTime() - now.getTime()) / 86_400_000),
        overdue: c.dueOn < now,
      })),

      // What they are owed for work already signed off.
      //
      // Approved hours at their own pay rate, and only approved: a
      // submitted timesheet is a claim, an approved one is a debt, and
      // showing the two as one number would tell somebody they are owed
      // money that nobody has agreed to yet.
      //
      // Silent where the rate is not recorded rather than guessed. A
      // consultant planning around a number this product invented is
      // worse off than one who knows it is not here.
      owed: (() => {
        const byContract = new Map(contracts.map((c) => [c.id, c.companyId]))
        let cents = 0
        let hours = 0
        let unknownRate = 0
        for (const t of timesheets) {
          if (t.status !== 'APPROVED') continue
          const pay = payByCompany.get(byContract.get(t.sellContractId) ?? '')
          if (!pay?.payRate) { unknownRate++; continue }
          hours += Number(t.totalHours)
          cents += Number(t.totalHours) * pay.payRate
        }
        return {
          hours,
          cents,
          currency: contracts[0] ? payByCompany.get(contracts[0].companyId)?.payCurrency ?? null : null,
          // Weeks whose rate is not on Etyme, so the figure is short and
          // says so rather than quietly under-reporting.
          weeksWithNoRate: unknownRate,
          says:
            hours === 0 && unknownRate === 0
              ? 'Nothing approved and unpaid right now.'
              : unknownRate > 0
                ? `${hours} approved hours here. ${unknownRate} more week${unknownRate === 1 ? '' : 's'} ` +
                  `approved with no rate recorded on Etyme — your agency has those.`
                : `${hours} approved hours, not yet paid.`,
        }
      })(),
    },
  })
}

/**
 * POST /api/me/work — the worker files their own week and sends it.
 *
 * Body: { contractId, periodStart, hours: { "2026-09-22": 8, … } }
 *
 * ── Why this is here and not a form over POST /api/timesheets ─────────
 *
 * The timesheets door is the one place a week is written, and it stays
 * that: this route writes nothing itself and hands the week to it, then
 * to its submit step, so the anomaly flag, the cycle completion and every
 * other rule on that door run exactly as they do for anybody else.
 *
 * What it adds is the worker's side of the rules, checked by the server
 * rather than trusted from a page: only their own contract, only the rung
 * of a chain that takes hours, only days that have happened, that the
 * placement covers and that no sheet already claims (`checkWeek` in
 * lib/consultant-portfolio). The timesheets door checks who may enter; it
 * does not check any of those, and says so in the report back.
 *
 * Scoped to the signed-in person. A contract that is not theirs answers
 * 404, the same as one that does not exist.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const contractId = typeof body.contractId === 'string' ? body.contractId : ''
  const periodStart = typeof body.periodStart === 'string' ? body.periodStart.slice(0, 10) : ''
  const hours = body.hours && typeof body.hours === 'object' ? (body.hours as Record<string, number>) : {}

  const personId = caller.person.id
  const now = new Date()
  const today = now.toISOString().slice(0, 10)

  const mine = await prisma.sellContract.findMany({
    where: { personId },
    select: { id: true, personId: true, companyId: true, clientCompanyId: true, state: true, startDate: true, endDate: true },
  })
  const rungs = mine.map((c) => ({
    id: c.id,
    personId: c.personId,
    companyId: c.companyId,
    clientCompanyId: c.clientCompanyId,
    state: c.state,
    startDate: c.startDate.toISOString().slice(0, 10),
    endDate: c.endDate?.toISOString().slice(0, 10) ?? null,
  }))

  if (!rungs.some((r) => r.id === contractId)) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'That is not one of your placements.' } },
      { status: 404 }
    )
  }

  const rung = rungsToFile(rungs, today).find((r) => r.id === contractId)
  if (!rung) {
    const r = rungs.find((x) => x.id === contractId)!
    return NextResponse.json(
      {
        error: {
          code: 'NOT_THIS_CONTRACT',
          message:
            r.state === 'IN_PROGRESS' || r.state === 'ENDED'
              ? 'Your hours go on the contract with the firm that employs you, not this one. Choose that placement.'
              : 'This placement is not taking hours. Ask the firm that employs you.',
        },
      },
      { status: 409 }
    )
  }

  const sheets = await prisma.timesheet.findMany({
    where: { sellContractId: contractId, personId },
    select: { id: true, status: true, days: true, periodStart: true, periodEnd: true },
  })
  const asDates = (t: { periodStart: Date; periodEnd: Date }) => ({
    periodStart: t.periodStart.toISOString().slice(0, 10),
    periodEnd: t.periodEnd.toISOString().slice(0, 10),
  })

  // A week sent back is filed again over its own row: judged against
  // every other week, never against itself. The timesheets door decides
  // whether that row may still be written (not billed, not decided on).
  const again = sheets.find((t) => t.status === 'OPEN' && asDates(t).periodStart === periodStart)
  const filed = sheets.filter((t) => t !== again).map(asDates)

  const week = again
    ? returnedWeek(
        { id: again.id, ...asDates(again), days: (again.days ?? {}) as Record<string, number> },
        rung,
        filed,
        today,
        null
      )
    : openWeeks(rung, filed, today).find((w) => w.periodStart === periodStart)
  if (!week) {
    return NextResponse.json(
      {
        error: {
          code: 'WEEK_CLOSED',
          message: 'That week is not open to file — it is already filed, not yet started, or outside your placement. Reload to see the weeks you can send.',
        },
      },
      { status: 409 }
    )
  }

  const check = checkWeek({ week, hours, contract: rung, filed, today })
  if (!check.ok) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: check.says, field: 'hours' } }, { status: 422 })
  }

  // The one door that writes a week, then the one that sends it.
  // The caller's own headers — their session cookie and the seat they
  // chose — so the door asks the same "who is this" and gets the same
  // answer. The length is the new body's, not theirs.
  const headers = new Headers(request.headers)
  headers.delete('content-length')
  headers.set('content-type', 'application/json')
  const forward = (url: string, payload: unknown) =>
    new NextRequest(new URL(url, request.url), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })

  const created = await createTimesheet(
    forward('/api/timesheets', {
      sellContractId: contractId,
      periodStart: week.periodStart,
      periodEnd: week.periodEnd,
      days: check.days,
    })
  )
  const createdBody = await created.json().catch(() => null)
  if (!created.ok) {
    return NextResponse.json(createdBody ?? { error: { code: 'INTERNAL', message: 'The week could not be saved.' } }, {
      status: created.status,
    })
  }
  const timesheetId: string = createdBody.data.timesheet.id

  const sent = await submitTimesheet(forward(`/api/timesheets/${timesheetId}/submit`, {}), {
    params: Promise.resolve({ id: timesheetId }),
  })
  const sentBody = await sent.json().catch(() => null)
  if (!sent.ok) {
    // Saved and not sent: say both, so they know the week exists and
    // what is left to do. The page offers Send on an open week.
    return NextResponse.json(
      {
        data: {
          timesheetId,
          status: 'OPEN',
          message: `Saved ${check.totalHours} hours for ${week.label}, but it was not sent: ${sentBody?.error?.message ?? 'try Send for approval below.'}`,
        },
      },
      { status: 201 }
    )
  }

  return NextResponse.json(
    {
      data: {
        timesheetId,
        status: 'SUBMITTED',
        anomaly: createdBody.data.timesheet.anomalyReason ?? null,
        message: `Sent ${check.totalHours} hours for ${week.label} ${again ? 'again, corrected, ' : ''}for approval.`,
      },
    },
    { status: 201 }
  )
}

function toMs(iso: string): number {
  return Date.parse(iso + 'T00:00:00Z')
}

/**
 * Why each of these weeks was sent back, newest reason per week.
 *
 * Read from what the reject step writes (`TIMESHEET_REJECTED`, with the
 * week's id and the signer's reason in the payload). The worker's own
 * week, so it is theirs to read; the name of the desk that returned it is
 * in the log's reason and travels with it.
 */
async function returnReasons(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (ids.length === 0) return out
  const rows = await prisma.automationLog.findMany({
    where: {
      action: 'TIMESHEET_REJECTED',
      OR: ids.map((id) => ({ payload: { path: ['timesheetId'], equals: id } })),
    },
    select: { payload: true, reason: true, at: true },
    orderBy: { at: 'desc' },
  })
  for (const r of rows) {
    const p = (r.payload ?? {}) as { timesheetId?: string; rejectionReason?: string }
    if (!p.timesheetId || out.has(p.timesheetId)) continue
    out.set(p.timesheetId, r.reason ?? (p.rejectionReason ? `Sent back: ${p.rejectionReason}` : 'Sent back.'))
  }
  return out
}
