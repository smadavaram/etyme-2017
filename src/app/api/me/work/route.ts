import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { ownPageFor } from '@/lib/portfolio-data'
import {
  rungsToFile, openWeeks, checkWeek, placementLines, tieOf, returnedWeek, owedByWeek, waitingWeek,
  weekSigners, signedAtOf, paidDatesFrom, shortDay, placementSpan, signedWeeksCard, daySpan, plainDate,
  type OwedWeek, type WaitingWeek, type WeekSigner,
} from '@/lib/consultant-portfolio'
import { POST as createTimesheet } from '@/app/api/timesheets/route'
import { rateInForce, ratePeriods } from '@/lib/contract-rate'
import { paidBook, paidKey, PAYROLL_RUN, PAYROLL_OFF_CYCLE } from '@/lib/payroll-paid'
import { acceptanceForPay } from '@/lib/money/pay-hours'
import { amount } from '@/lib/money-display'
import { daysFor } from '@/lib/contract-links'
import { wageLineFor, EXEMPT_SELECT } from '@/lib/money/sheet-overtime'
import { methodFor } from '@/lib/money/overtime-method'
import { payLineOn } from '@/lib/money/pay-line'
import { periodTermsFor, ORDER_HEADER_SELECT } from '@/lib/money/order-terms'
import { POST as submitTimesheet } from '@/app/api/timesheets/[id]/submit/route'
import { personNotice, cityOf, dayOf, holdStands } from '@/lib/internal-moves'

/**
 * A person's moves between their employer's projects, in the words they
 * were told them: coming off a project, held for another, and the next
 * project with its start day and, where the city changes, the cities.
 */
async function movesFor(personId: string, now: Date) {
  const today = dayOf(now)
  const [releases, holds] = await Promise.all([
    prisma.projectRelease.findMany({
      where: { personId, withdrawnAt: null },
      include: {
        company: { select: { name: true } },
        sellContract: {
          select: {
            endDate: true, clientCompany: { select: { name: true } }, endClientCompany: { select: { name: true } },
            workLocation: { select: { city: true } }, requirement: { select: { location: true } },
          },
        },
      },
    }),
    prisma.projectHold.findMany({
      where: { personId, OR: [{ live: 'LIVE' }, { endedHow: 'PLACED', placedStartsOn: { gte: new Date(today.getTime() - 14 * 86_400_000) } }] },
      include: { company: { select: { name: true } }, release: { select: { sellContract: { select: { workLocation: { select: { city: true } }, requirement: { select: { location: true } } } } } } },
      orderBy: { createdAt: 'desc' },
    }),
  ])
  const names = new Map(
    (await prisma.person.findMany({
      where: { id: { in: [...releases.map((r) => r.releasedById), ...holds.map((h) => h.heldById)] } },
      select: { id: true, name: true },
    })).map((p) => [p.id, p.name])
  )
  const placedLines = await prisma.sellContract.findMany({
    where: { id: { in: holds.map((h) => h.placedSellContractId).filter((x): x is string => !!x) } },
    select: { id: true, clientCompany: { select: { name: true } }, endClientCompany: { select: { name: true } }, workLocation: { select: { city: true } } },
  })
  const out: { kind: 'COMING_OFF' | 'HELD' | 'NEXT_PROJECT'; title: string; body: string; cityChange: boolean }[] = []
  for (const r of releases) {
    const placed = holds.some((h) => h.releaseId === r.id && h.endedHow === 'PLACED')
    if (placed && r.rollsOffOn < today) continue
    const n = personNotice(r.confirmedAt ? 'CONFIRM' : 'FLAG', {
      personName: '', firmName: r.company.name, actorName: names.get(r.releasedById) ?? 'Your manager',
      fromClient: r.sellContract.endClientCompany?.name ?? r.sellContract.clientCompany.name,
      fromCity: cityOf(r.sellContract.workLocation) ?? cityOf(r.sellContract.requirement?.location ?? null),
      rollsOffOn: r.rollsOffOn, keepUntil: r.keepUntil,
    })
    out.push({ kind: 'COMING_OFF', title: n.title, body: n.body, cityChange: false })
  }
  for (const h of holds) {
    const fromCity = h.release ? cityOf(h.release.sellContract.workLocation) ?? cityOf(h.release.sellContract.requirement?.location ?? null) : null
    if (h.endedHow === 'PLACED') {
      const line = placedLines.find((l) => l.id === h.placedSellContractId)
      const toCity = line ? cityOf(line.workLocation) : null
      const n = personNotice('MOVE', {
        personName: '', firmName: h.company.name, actorName: names.get(h.heldById) ?? 'Your manager',
        forTitle: h.forTitle, toClient: line ? line.endClientCompany?.name ?? line.clientCompany.name : h.forTitle,
        toCity, fromCity, startsOn: h.placedStartsOn, movedAs: h.placedSubmissionId ? 'SUBMISSION' : 'LINE',
      })
      out.push({ kind: 'NEXT_PROJECT', title: n.title, body: n.body, cityChange: n.body.includes('This moves you from') })
    } else if (holdStands(h, today)) {
      const n = personNotice('HOLD', {
        personName: '', firmName: h.company.name, actorName: names.get(h.heldById) ?? 'A manager',
        forTitle: h.forTitle, until: h.until,
      })
      out.push({ kind: 'HELD', title: n.title, body: n.body, cityChange: false })
    }
  }
  return out
}

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
      workLocation: { select: { name: true, city: true, country: true } },
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
      // The whole buy line, as the payroll run reads it: its weekly line,
      // its overtime multiple and method, who employs them, the exempt
      // position recorded for this person, and the windows it covers.
      buyContract: {
        include: {
          company: { select: { name: true } },
          // The order the line is on, whose straddle and rhythm are read
          // before the line's own copy (`periodTermsFor`), as payroll reads them.
          workOrder: { select: ORDER_HEADER_SELECT },
          // Where the paying entity is, which decides whether the US
          // forty-hour line reaches a worker no contract drew one for.
          entity: { select: { country: true } },
          exemptAssertions: { where: { personId }, select: EXEMPT_SELECT },
          sellLinks: { select: { buyContractId: true, sellContractId: true, effectiveFrom: true, effectiveTo: true } },
          // Her pay days, which a week she is owed falls due on — the same
          // dates the payroll screen calls "next pay".
          buyCycles: { where: { kind: 'SALARY_PAY' }, select: { kind: true, dueOn: true, completedAt: true } },
        },
      },
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

  // ── The rate in force, and what has already been paid ─────────────
  //
  // The line's own `payRate` is its opening rate. A pay rise is an
  // approved, effective-dated row beside it, and the line is never
  // overwritten — so the rate the person is on today, and what each past
  // day is worth, are read through those rows (lib/contract-rate).
  const directIds = [...payByCompany.values()].map((l) => l.buyContract.id)
  const myRates = directIds.length
    ? await prisma.rateHistory.findMany({
        where: { contractType: 'BUY', contractId: { in: directIds } },
      })
    : []
  const periodsOf = (buyContractId: string) => ratePeriods(myRates.filter((r) => r.contractId === buyContractId))
  const rateToday = (companyId: string) => {
    const l = payByCompany.get(companyId)
    return l ? rateInForce(l.payRate, periodsOf(l.buyContract.id), now).rateCents : null
  }

  // Every week she has sent, not only the latest twenty-six the list
  // shows, with every live signature on it: who has signed, who has
  // accepted, and what. A week is owed to her only once her employer has
  // accepted it (the founder, 2026-09-29); before that it is waiting on
  // somebody, and the page says on whom.
  const sentWeeks = await prisma.timesheet.findMany({
    where: { personId, status: { in: ['SUBMITTED', 'APPROVED'] }, sellContractId: { in: contracts.map((c) => c.id) } },
    select: {
      id: true, sellContractId: true, days: true, leaveDays: true, totalHours: true, acceptedHours: true,
      periodStart: true, periodEnd: true, submittedAt: true, clientApprovedAt: true, employerAcceptedAt: true,
      assertions: {
        where: { state: 'LIVE' },
        select: { companyId: true, role: true, hours: true, coversFrom: true, coversTo: true, at: true },
      },
    },
  })
  // And the days a payroll run has already paid, so "owed" is owed.
  const paidBy = new Map<string, Awaited<ReturnType<typeof paidBook>>>()
  for (const l of payByCompany.values()) {
    paidBy.set(l.buyContract.id, await paidBook(l.buyContract.companyId, [l.buyContract.id]))
  }
  // And the day each was paid, read off the same rows (`paidDatesFrom`):
  // the book says how much, and not when.
  const payers = [...new Set([...payByCompany.values()].map((l) => l.buyContract.companyId))]
  const paidDates = payers.length
    ? paidDatesFrom(
        await prisma.automationLog.findMany({
          where: { companyId: { in: payers }, action: PAYROLL_RUN, payload: { path: ['action'], equals: 'process' } },
          select: { at: true, payload: true },
        }),
        await prisma.automationLog.findMany({
          where: { companyId: { in: payers }, action: PAYROLL_OFF_CYCLE },
          select: { at: true, payload: true },
        }),
        directIds,
        paidKey
      )
    : new Map<string, string>()

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

  // What they are owed, and what is still on its way to being owed.
  //
  // Who owes what, and when — the founder, 2026-09-29: once the client
  // approves a week the client owes it to the firm it pays; once her
  // employer accepts it, having checked the client's approval, her
  // employer owes her, due on her own pay schedule. So a week is owed
  // to her only after her employer's acceptance, and until then it is
  // waiting — on the client, or on the firms below it — with hours and
  // a sentence and never a figure. Until 2026-09-29 this counted every
  // week the client had signed as owed.
  //
  // Priced by payroll's own functions (`owedByWeek` asks `sheetPay`
  // and `priceByDay`, as a payroll run does), so a non-exempt worker's
  // forty-five-hour week carries the premium on its five hours here as
  // it does on her pay, and a week her employer cut is priced on the
  // hours it accepted. Each owed week says the pay day it falls due on,
  // read off her own pay line, and a paid one the day it was paid.
  //
  // Silent where the rate is not recorded rather than guessed. A
  // consultant planning around a number this product invented is
  // worse off than one who knows it is not here.
  // Firms that employ them, read off the buy line that pays them. A week
  // on work for one of these is paid by payroll and never billed to them.
  const employedBy = new Set(
    [...payByCompany.entries()].filter(([, l]) => tieOf(l.buyContract.contractType) === 'EMPLOYED').map(([id]) => id)
  )
  const employedWeeks: OwedWeek[] = []
  const employedWaiting: WaitingWeek[] = []

  const owed = (() => {
    const sellOf = new Map(contracts.map((c) => [c.id, c]))

    // Every signature each of her placements needs, in order: the
    // client, each firm between, her employer last.
    const signersOf = new Map<string, WeekSigner[]>()
    for (const l of lines) {
      const top = byId.get(l.rungs[l.rungs.length - 1].id)!
      const client = top.endClientCompany ?? top.clientCompany ?? top.company
      signersOf.set(l.own.id, weekSigners(
        { rungs: l.rungs.map((r) => ({ companyId: r.companyId, companyName: r.companyName })) },
        { id: client.id, name: client.name }
      ))
    }

    // Accepted by her employer, or not yet.
    const acceptedBy = (t: (typeof sentWeeks)[number]) =>
      t.employerAcceptedAt !== null || t.assertions.some((a) => a.role === 'EMPLOYER_ACCEPTANCE')

    const waiting: (WaitingWeek & { payer: string })[] = []
    for (const t of sentWeeks.filter((x) => !acceptedBy(x))) {
      const signers = signersOf.get(t.sellContractId)
      if (!signers) continue
      const w = waitingWeek({
        id: t.id,
        periodStart: t.periodStart,
        periodEnd: t.periodEnd,
        hours: Number(t.totalHours),
        submittedAt: t.submittedAt,
        signers: signers.map((s) => ({ ...s, signedAt: signedAtOf(s, t, t.assertions) })),
      }, now)
      if (w) waiting.push({ ...w, payer: w.employer })
      if (w && employedBy.has(sellOf.get(t.sellContractId)?.companyId ?? '')) employedWaiting.push(w)
    }

    const accepted = sentWeeks.filter(acceptedBy)
    const weeks: (OwedWeek & { payer: string; label: string })[] = []
    let unknownRate = 0
    for (const t of accepted) {
      if (!payByCompany.has(sellOf.get(t.sellContractId)?.companyId ?? '')) unknownRate++
    }
    for (const pay of payByCompany.values()) {
      const bc = pay.buyContract
      const book = paidBy.get(bc.id)
      const row = bc.exemptAssertions.find((a) => a.personId === personId)
      const wage = wageLineFor(bc, caller.person.name, row)
      const mine = accepted.filter((t) => sellOf.get(t.sellContractId)?.companyId === bc.companyId)
      // One call per placement, because the weekly line may be the
      // placement's own where the pay line names none.
      for (const sellId of new Set(mine.map((t) => t.sellContractId))) {
        const sell = sellOf.get(sellId)!
        const linked = bc.sellLinks.some((l) => l.sellContractId === sellId)
        const sheets = mine
          .filter((t) => t.sellContractId === sellId)
          .map((t) => {
            const all = (t.days ?? {}) as Record<string, number>
            // The employer's own acceptance, where the ledger has one.
            const own = t.assertions.find((a) => a.role === 'EMPLOYER_ACCEPTANCE' && a.companyId === bc.companyId)
            return {
              id: t.id,
              // Narrowed to the days this pay line covers, as the run narrows them.
              days: linked && Object.keys(all).length > 0 ? daysFor(bc.id, bc.sellLinks, all) : all,
              allDays: all,
              leaveDays: (t.leaveDays ?? {}) as Record<string, number>,
              // What the employer accepted, read the way payroll reads it.
              accepted: acceptanceForPay(t.assertions, t, bc.companyId),
              acceptedAt: own?.at ?? t.employerAcceptedAt ?? t.assertions.find((a) => a.role === 'EMPLOYER_ACCEPTANCE')?.at ?? null,
              totalHours: Number(t.totalHours),
              periodStart: t.periodStart,
              periodEnd: t.periodEnd,
            }
          })
        const priced = owedByWeek(
          sheets,
          {
            contractRateCents: pay.payRate,
            periods: periodsOf(bc.id),
            // The weekly line payroll judges pay on: the buy line's, else
            // the placement's, else the law's forty for a nonexempt US
            // worker (lib/money/pay-line) — the same call the run makes.
            afterHours: payLineOn(bc, sell, { name: caller.person.name, payCurrency: pay.payCurrency }, row).afterHours,
            method: methodFor(bc).method,
            wage,
            currency: pay.payCurrency,
            payDates: bc.buyCycles,
            // The pay periods and the straddle, through the one door the
            // payroll run reads them through, from the person's own start.
            terms: { ...periodTermsFor('BUY', bc), startedOn: pay.startDate },
          },
          (sheetId, day) => {
            const k = paidKey(bc.id, personId, sheetId, day)
            const e = book?.entries.get(k)
            return e ? { ...e, paidOn: paidDates.get(k) ?? null } : undefined
          },
          now
        )
        for (const w of priced) {
          weeks.push({ ...w, payer: bc.company?.name ?? sell.company.name, label: `Week of ${shortDay(w.weekOf, now)}` })
          if (employedBy.has(bc.companyId)) employedWeeks.push(w)
        }
      }
    }

    const r2 = (n: number) => Math.round(n * 100) / 100
    const hoursWord = (n: number) => `${r2(n).toLocaleString('en-US')} hour${r2(n) === 1 ? '' : 's'}`
    const currency = contracts[0] ? payByCompany.get(contracts[0].companyId)?.payCurrency ?? null : null

    // ── Owed to you: accepted by her employer and not yet paid ─────
    const owedWeeks = weeks.filter((w) => w.priced && w.stage === 'OWED')
    const hours = r2(owedWeeks.reduce((n, w) => n + (w.unpaidHours ?? 0), 0))
    const overtimeHours = r2(owedWeeks.reduce((n, w) => n + (w.unpaidOvertimeHours ?? 0), 0))
    const cents = owedWeeks.reduce((n, w) => n + (w.stillOwedCents ?? 0), 0)
    const overdueCents = owedWeeks.filter((w) => w.overdue).reduce((n, w) => n + (w.stillOwedCents ?? 0), 0)
    const nextDue = owedWeeks
      .filter((w) => !w.overdue && w.dueOn && (w.stillOwedCents ?? 0) > 0)
      .map((w) => w.dueOn!)
      .sort()[0] ?? null
    const paidHours = r2(weeks.reduce((n, w) => n + w.paidHours, 0))
    const notPriced = weeks.filter((w) => !w.priced).length
    // A run from before 2026-09-29 recorded no hours, so what it paid
    // cannot be taken off. Said, rather than showing its hours as owed.
    const unrecorded = [...paidBy.values()].some((b) => b.unrecorded.size > 0)
    const payerNames = [...new Set(weeks.map((w) => w.payer))]
    const byWhom = payerNames.length === 1 ? payerNames[0] : 'your employer'

    const head =
      cents > 0
        ? `${amount(cents, currency ?? undefined)} is owed to you, for ${hoursWord(hours)} ${byWhom} accepted and has not paid yet` +
          (overtimeHours > 0 ? `, ${r2(overtimeHours)} of them overtime` : '') + '.'
        : 'Nothing is owed to you right now.'
    const notes: string[] = []
    if (overdueCents > 0) {
      notes.push(
        overdueCents === cents
          ? 'All of it is past its pay day.'
          : `${amount(overdueCents, currency ?? undefined)} of it is past its pay day.`
      )
    }
    if (nextDue) notes.push(`The next pay day for it is ${shortDay(nextDue, now)}.`)
    if (unknownRate > 0) {
      notes.push(`${unknownRate} more week${unknownRate === 1 ? '' : 's'} accepted with no rate recorded on Etyme — your agency has those.`)
    }
    if (notPriced > 0) {
      notes.push(`${notPriced} week${notPriced === 1 ? ' has' : 's have'} no figure here; each says why.`)
    }
    if (unrecorded) {
      notes.push('A payroll run before this page could see what was paid has been made, so some of these may already be paid — your employer has the record.')
    }

    // ── Not owed yet: waiting on the client, or on her employer ────
    //
    // Hours and whose desk it is on. Never a figure: until her
    // employer accepts a week, nobody owes her anything for it.
    const forClient = waiting.filter((w) => w.stage === 'WAITING_FOR_CLIENT')
    const forEmployer = waiting.filter((w) => w.stage === 'WAITING_FOR_EMPLOYER')
    const who = (ws: typeof waiting) => {
      const names = [...new Set(ws.map((w) => w.waitingOn))]
      return names.length === 1 ? names[0] : 'the firms on them'
    }
    const waitingHours = r2(waiting.reduce((n, w) => n + w.hours, 0))
    const where =
      forClient.length > 0 && forEmployer.length > 0
        ? `${forClient.length} ${forClient.length === 1 ? 'is' : 'are'} waiting for ${who(forClient)} to sign and ` +
          `${forEmployer.length} for ${who(forEmployer)} to accept.`
        : `${waiting.length === 1 ? 'It is' : 'They are'} waiting for ` +
          (forClient.length > 0 ? `${who(forClient)} to sign.` : `${who(forEmployer)} to accept.`)
    const waitingSays =
      waiting.length === 0
        ? null
        : `${waiting.length} week${waiting.length === 1 ? '' : 's'} you sent, ${hoursWord(waitingHours)}, ` +
          `${waiting.length === 1 ? 'is' : 'are'} not owed to you yet. ${where} ` +
          `A week is owed to you once ${[...new Set(waiting.map((w) => w.employer))].join(' or ')} accepts it.`

    return {
      hours,
      overtimeHours,
      cents,
      overdueCents,
      nextDue,
      currency,
      // How many accepted weeks have no rate here — said rather than
      // counted as zero.
      weeksWithNoRate: unknownRate,
      weeksNotPriced: notPriced,
      paidHours,
      // Filed and sent, and not accepted by her employer yet. No money.
      waiting: {
        weeks: waiting.length,
        hours: waitingHours,
        forClient: forClient.length,
        forEmployer: forEmployer.length,
        says: waitingSays,
      },
      // Every week, newest first: the ones waiting, then what her
      // employer accepted — each with its ordinary and overtime hours,
      // the premium, what payroll pays for it, what has been paid and
      // when, and the pay day the rest falls due on. No rate of any
      // rung is on it.
      weeks: [...waiting, ...weeks].sort((a, b) => b.weekOf.localeCompare(a.weekOf)),
      says: [head, ...notes].join(' '),
    }
  })()

  // What became of the weeks the client signed, in the words that fit how
  // they are paid (`signedWeeksCard`): an employee is paid by payroll, so
  // his card says paid, owed to him, or waiting on his employer; somebody
  // paid through a supplier reads the weeks their vendor has still to bill.
  const signedCard = signedWeeksCard({
    notBilled: timesheets.filter(
      (t) => t.status === 'APPROVED' && t.invoiceLines.length === 0 && !employedBy.has(byId.get(t.sellContractId)?.companyId ?? '')
    ).length,
    employed: employedBy.size === 0
      ? null
      : {
          paid: employedWeeks.filter((w) => w.priced && w.stage === 'PAID').length,
          owed: employedWeeks.filter((w) => w.priced && w.stage === 'OWED').length,
          waitingOnEmployer: employedWaiting.filter((w) => w.stage === 'WAITING_FOR_EMPLOYER').length,
          unknown: employedWeeks.filter((w) => !w.priced).length,
          employer: (() => {
            const names = [...new Set([...employedBy].map((id) => payByCompany.get(id)!.buyContract.company?.name).filter(Boolean))]
            return names.length === 1 ? names[0]! : null
          })(),
        },
  })

  // Where their employer is moving them (lib/internal-moves). Told, never
  // asked: the employment is the consent. Read off their own rows only.
  const moves = await movesFor(personId, now)

  return NextResponse.json({
    data: {
      person: { id: caller.person.id, name: caller.person.name },
      moves,
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
          payRate: rateToday(c.companyId),
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
          // "Jun 1 – Aug 31, 2026 · ended", never an ISO day.
          span: placementSpan(
            { startDate: c.startDate.toISOString(), endDate: c.endDate?.toISOString() ?? null, state: c.state },
            today
          ),
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
        // "Jun 1 – Jun 7, 2026" (`daySpan`), never two ISO days.
        period: daySpan(t.periodStart.toISOString(), t.periodEnd.toISOString()),
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
        // What the page prints: "Oct 12, 2026", never the ISO day above.
        until: plainDate(s.expiresAt.toISOString()),
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
        // The card the page draws for the signed weeks, in words that fit
        // how this person is paid. The count above stays for older readers.
        signed: signedCard,
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

      owed,
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
