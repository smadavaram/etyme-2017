import { totals, rate } from '@/lib/money-display'
import { reportError } from '@/lib/alerts'
import { prisma } from '@/lib/db'
import { daysFor } from '@/lib/contract-links'
import { periodFor, hoursInPeriod, type Period, type Terms } from '@/lib/periods'
import { priceByDay, ratePeriods } from '@/lib/contract-rate'
import { ORDER_HEADER_SELECT, periodTermsFor } from '@/lib/money/order-terms'
import { paidBook, paidKey, type PaidLine } from '@/lib/payroll-paid'
import { sheetOvertime, premiumByDay, overtimeSaysFor, wageLineFor, EXEMPT_SELECT } from '@/lib/money/sheet-overtime'
import { methodFor } from '@/lib/money/overtime-method'
import { payLineOn, payLineSays, weeklyWorked, heldForExemption, withoutHeldWeeks, heldSays, type HeldWeek } from '@/lib/money/pay-line'
import { acceptanceForPay, paySheet, payCutSays, straightTimeWeeks } from '@/lib/money/pay-hours'
import { cutOvertimeFor } from '@/lib/cut-overtime-choice'
import { payDaysToMark, companyPayDaysToMark } from '@/lib/money/pay-day-period'
import { companyPayPeriods } from '@/lib/money/company-pay-periods'
import { periodHolding } from '@/lib/money/pay-periods'
import { paidByPayroll, notPayrollSays } from '@/lib/money/paid-through'
import { weekStart } from '@/lib/overtime'
import { daySpan, plainDate } from '@/lib/plain-date'
import { workedOutKeys, isWorkedOut, notWorkedOutSays, payCovers, type NotWorkedOut } from '@/lib/money/payroll-worked-out'
import { overtimeNotPaidFor, type OvertimeNotPaid } from '@/lib/money/overtime-not-paid'
import { repostPayFor } from '@/lib/order-postings'
import { windowBehind, daysPastWindow, weeksPastWindow, hoursIn, windowHeldSays } from '@/lib/money/outside-pay-window'

/**
 * The payroll run's own work, in one place (moved out of
 * app/api/payroll/run/route.ts on 2026-11-23, text unchanged but for the
 * reply shape and `dryRun`): the route asks who may run it and calls this,
 * and the payroll draft agent calls the same function with `dryRun`, so a
 * draft and a run are worked out by one computation and never two.
 *
 * `dryRun` works the figures out and writes nothing: no cycle is marked
 * complete and no PAYROLL_RUN log row is written. It is allowed for
 * `calculate` only. Who may run, and the verified-Owner gate on approve and
 * process, stay with the caller (the route).
 */
const reply = (body: unknown, init?: { status?: number }) => ({ body: body as any, status: init?.status ?? 200 })

export interface PayrollRunInput {
  companyId: string
  buyContractIds: string[]
  period: unknown
  action: 'calculate' | 'approve' | 'process'
  runBy: { id: string; name: string }
  /** Work it out and write nothing. `calculate` only. */
  dryRun?: boolean
}

export async function runPayroll({ companyId, buyContractIds, period, action, runBy, dryRun = false }: PayrollRunInput): Promise<{ body: any; status: number }> {
  if (dryRun && action !== 'calculate') {
    return reply({ error: { code: 'VALIDATION', message: 'A draft only works the figures out. It never approves or pays.' } }, { status: 422 })
  }
  // What the run is for. A 'YYYY-MM' month, an explicit { start, end }, or
  // nothing — in which case each person's period is the one holding their
  // most recent work, the same period the payroll screen shows.
  const asked = readPeriod(period)
  if (asked === 'INVALID') {
    return reply(
      {
        error: {
          code: 'VALIDATION',
          message: 'Say which pay period this run is for, as a month like 2026-07 or as a start and an end date.',
          field: 'period',
        },
      },
      { status: 422 }
    )
  }

  // Verify all buy contracts belong to this company
  const contracts = await prisma.buyContract.findMany({
    where: {
      id: { in: buyContractIds },
      companyId,
    },
    include: {
      candidates: {
        include: { person: { select: { id: true, name: true } } },
      },
      workOrder: { select: ORDER_HEADER_SELECT },
      // What the employer asserted about exemption, which decides whether
      // an hour over the line is owed a premium at all.
      exemptAssertions: { select: EXEMPT_SELECT },
      company: { select: { name: true } },
      // Named in the refusal where the line is paid through a supplier.
      vendorCompany: { select: { name: true } },
      // Where the work is and who pays it, which decides whether the US
      // forty-hour line reaches a worker no contract drew one for.
      entity: { select: { country: true } },
      sellLinks: {
        include: {
          sellContract: {
            include: {
              workLocation: { select: { country: true } },
              // Every pay window on the placement: a week after the last one
              // closed is held and said on the run's row, never dropped
              // silently (lib/money/outside-pay-window), as the page says it.
              buyLinks: { select: { buyContractId: true, effectiveFrom: true, effectiveTo: true } },
              timesheets: {
                // What the employer accepted for pay, which is what a
                // payroll run pays — the same weeks the payroll screen
                // lists. `days`, because a week is divided by day: by the
                // link window, by the pay period and by the rate in force.
                where: { assertions: { some: { role: 'EMPLOYER_ACCEPTANCE', state: 'LIVE' } } },
                select: {
                  id: true, personId: true, totalHours: true, days: true, leaveDays: true, periodStart: true, periodEnd: true,
                  // What the employer accepted for pay — the hours paid,
                  // never the hours filed (lib/money/pay-hours).
                  acceptedHours: true,
                  assertions: {
                    where: { role: 'EMPLOYER_ACCEPTANCE', state: 'LIVE' },
                    select: { companyId: true, role: true, hours: true, coversFrom: true, coversTo: true },
                  },
                },
              },
            },
          },
        },
      },
      supplierSellContract: {
        select: {
          id: true,
          overtimeAfterHours: true,
          workLocation: { select: { country: true } },
          timesheets: {
            where: { assertions: { some: { role: 'EMPLOYER_ACCEPTANCE', state: 'LIVE' } } },
            select: {
                  id: true, personId: true, totalHours: true, days: true, leaveDays: true, periodStart: true, periodEnd: true,
                  // What the employer accepted for pay — the hours paid,
                  // never the hours filed (lib/money/pay-hours).
                  acceptedHours: true,
                  assertions: {
                    where: { role: 'EMPLOYER_ACCEPTANCE', state: 'LIVE' },
                    select: { companyId: true, role: true, hours: true, coversFrom: true, coversTo: true },
                  },
                },
          },
        },
      },
    },
  })

  if (contracts.length !== buyContractIds.length) {
    const found = new Set(contracts.map((c) => c.id))
    const missing = buyContractIds.filter((id: string) => !found.has(id))
    return reply(
      { error: { code: 'NOT_FOUND', message: `Buy contracts not found: ${missing.join(', ')}` } },
      { status: 404 }
    )
  }

  // Payroll pays our own employees and nobody else. A worker paid through
  // a supplier, their own company or their own 1099 invoice is paid on the
  // invoice receipt, so a run asked to pay one refuses in a sentence rather
  // than paying the same week a second time (lib/money/paid-through).
  const notOurs = contracts.filter((bc) => !paidByPayroll(bc))
  if (notOurs.length > 0) {
    return reply(
      {
        error: {
          code: 'NOT_PAYROLL',
          message: notOurs
            .flatMap((bc) =>
              bc.candidates.map((c) =>
                notPayrollSays({ personName: c.person.name, contractType: bc.contractType, vendorName: bc.vendorCompany?.name ?? null })
              )
            )
            .join(' '),
        },
      },
      { status: 422 }
    )
  }

  const now = new Date()

  // Every approved pay change on these lines, read once.
  const rateRows = await prisma.rateHistory.findMany({
    where: { contractType: 'BUY', contractId: { in: contracts.map((c) => c.id) } },
    select: { id: true, contractId: true, rate: true, fromDate: true, toDate: true, approvalState: true },
  })
  // And what earlier runs already paid, so no hour is paid twice.
  const book = await paidBook(companyId, contracts.map((c) => c.id))

  // A run for one of the company's own weekly or two-week periods settles
  // the pay days the company's periods give, not the line's own rhythm: a
  // line's pay days are counted from the company's first period
  // (lib/cycle-generator), and read back the same way here.
  const co = asked && 'start' in asked ? await companyPayPeriods(companyId) : null
  const askedKey = asked && 'start' in asked ? asked.start.toISOString().slice(0, 10) : null
  const askedIsOwn = Boolean(
    co?.byPeriod && askedKey && asked && 'start' in asked &&
      periodHolding(askedKey, co.rhythm, co.rule)?.start === askedKey &&
      periodHolding(askedKey, co.rhythm, co.rule)?.end === asked.end.toISOString().slice(0, 10)
  )
  const companyPeriodOf = (x: Date): Period => {
    const p = periodHolding(x.toISOString().slice(0, 10), co!.rhythm, co!.rule)!
    return { start: new Date(`${p.start}T00:00:00.000Z`), end: new Date(`${p.end}T00:00:00.000Z`), label: daySpan(p.start, p.end) }
  }

  // Pay never goes out before it is worked out (the founder, 2026-10-07,
  // reaffirmed 2026-10-20). What the `calculate` runs worked out, read
  // only when this run pays (lib/money/payroll-worked-out).
  const workedOut =
    action === 'process'
      ? workedOutKeys(
          (
            await prisma.automationLog.findMany({
              where: { companyId, action: 'PAYROLL_RUN', payload: { path: ['action'], equals: 'calculate' } },
              // Oldest first, so the latest calculation of a period is the one that counts.
              orderBy: { at: 'asc' },
              select: { payload: true },
            })
          ).map((r) => r.payload as { contracts?: any[] } | null)
        )
      : null
  // Who would be paid unworked, collected over the whole batch and refused
  // together — nothing in the batch is paid while one of them stands.
  const notWorkedOut: NotWorkedOut[] = []
  // The sheets each person is paid on in this run, for the line that says
  // what was billed as overtime and not paid (lib/money/overtime-not-paid).
  const sheetsRun = new Set<string>()

  try {
    const result = await prisma.$transaction(async (tx) => {
      const processed: Array<{
        buyContractId: string
        buyContractCandidateId: string
        personName: string
        payPeriod: { start: string; end: string; label: string } | null
        totalHours: number
        grossPay: number
        /** Hours in the period an earlier run already paid, left out of this one. */
        alreadyPaidHours: number
        /**
         * The buy contract's own. A batch may span two, and a gross
         * total that adds them is a number nobody can stand behind.
         */
        currency: string
        cyclesCompleted: number
        /** Where the rate changed inside the period, the sentence that says so. */
        rates: string | null
        /** Hours over the weekly line whose premium this run pays. */
        overtimeHours: number
        /** The premium on them, rounded once for the row. Inside `grossPay`. */
        premiumCents: number
        /** What went over the line and how it was priced, or could not be. */
        overtime: string | null
        /** Which weekly line pay was judged on, where that needs saying. */
        payLine: string | null
        /** Where fewer hours were accepted than filed, which hours were paid, in a sentence. */
        accepted: string | null
        /** Each week worked over the line and accepted at or under it, paid at straight time, in a sentence. */
        straightTime: string | null
        /** Each week held off this run because nobody has said whether the person is exempt, in a sentence. */
        exemptHeld?: string | null
        /** Each week held off this run because it is after the pay window ended, in a sentence. */
        windowHeld?: string | null
        /** Why nothing was paid for this person, where nothing was. */
        refused: string | null
        paid: PaidLine[]
        /** What this press covered (`payCovers`), so a later payment can tell whether it changed. */
        covers?: string
      }> = []

      for (const bc of contracts) {
        // Cycles sit on the agreement, so completing them is done once per
        // contract rather than once per person.
        const cycleKind =
          action === 'calculate'
            ? 'SALARY_CALCULATE'
            : 'SALARY_PAY'

        const periods = ratePeriods(rateRows.filter((r) => r.contractId === bc.id))
        const links = bc.sellLinks.map((l) => ({
          buyContractId: bc.id,
          sellContractId: l.sellContractId,
          effectiveFrom: l.effectiveFrom,
          effectiveTo: l.effectiveTo,
        }))
        // The weekly line: the employer's own where the buy line names
        // one, else the sell line's, else — for a nonexempt worker in
        // the US — the law's forty (lib/money/pay-line). The same order
        // the payroll file, the screen and back pay read them in.
        const sheets = [
          ...bc.sellLinks.flatMap((l) =>
            l.sellContract.timesheets.map((ts) => ({
              ts, narrow: true, sell: l.sellContract,
              behind: windowBehind(l.sellContract.buyLinks, l.sellContract.endDate),
            }))
          ),
          ...(bc.supplierSellContract?.timesheets ?? []).map((ts) => ({
            ts, narrow: false, sell: bc.supplierSellContract!,
            behind: null,
          })),
        ]
        const method = methodFor(bc).method

        // A run before 2026-09-29 recorded a total and not which hours,
        // and it paid every approved hour on the contract. What it
        // covered cannot be read back, so this contract is refused
        // rather than paid a second time.
        const unrecorded = book.unrecorded.get(bc.id) ?? null
        // Each period this run pays, with the terms that cut it and the
        // day the line started — what decides which pay days it settles.
        const windows: Array<{ period: Period; terms: Terms; startedOn: Date | null }> = []

        for (const cand of bc.candidates) {
          const row = bc.exemptAssertions.find((a) => a.personId === cand.personId) ?? null
          const mine = sheets
            .filter((x) => x.ts.personId === cand.personId)
            .map(({ ts, narrow, sell, behind }) => {
              const all = (ts.days as Record<string, number>) ?? {}
              const filed = narrow && Object.keys(all).length > 0 ? daysFor(bc.id, links, all) : all
              const line = payLineOn(bc, sell, { name: cand.person.name, payCurrency: cand.payCurrency }, row)
              const leaveDays = (ts.leaveDays as Record<string, number>) ?? {}
              // The hours the employer accepted, cut off the days under
              // the pay line's own rule for a week accepted short — the
              // same rule wageLineFor carries into the premium below.
              const acceptance = acceptanceForPay(ts.assertions, ts, bc.companyId)
              const pay = acceptance === 'MANY'
                ? null
                : paySheet({
                    all, mine: filed, leaveDays, afterHours: line.afterHours, accepted: acceptance,
                    cutOvertime: cutOvertimeFor(bc).rule,
                  })
              // A week over the line for a person nobody has said is
              // exempt or not is held off this run, never paid at straight
              // time on a guess (lib/money/pay-line, `heldForExemption`).
              const held = pay
                ? heldForExemption({ line, days: filed, leaveDays, accepted: pay.accepted, cutOvertime: cutOvertimeFor(bc).rule })
                : []
              const kept = withoutHeldWeeks(pay?.days ?? {}, held)
              // A week after the last pay window closed, on a placement
              // extended past it: held, never paid here, and said on the row.
              const past = behind && behind.buyContractId === bc.id ? daysPastWindow(all, behind) : {}
              const pastPay = Object.keys(past).length > 0
                ? paySheet({
                    all, mine: past, leaveDays, afterHours: line.afterHours,
                    accepted: acceptance === 'MANY' ? null : acceptance, cutOvertime: cutOvertimeFor(bc).rule,
                  })
                : null
              const windowHeld = pastPay && behind
                ? weeksPastWindow({ ...pastPay.days, ...Object.fromEntries(Object.entries(pastPay.leaveDays).map(([d, h]) => [d, (pastPay.days[d] ?? 0) + h])) }, all, behind.endedOn)
                : []
              return {
                id: ts.id,
                line,
                windowHeld,
                leaveDays,
                periodStart: ts.periodStart,
                periodEnd: ts.periodEnd,
                /** As filed, narrowed to this line — what overtime is judged on. */
                filed,
                /** As accepted — what is paid. Empty where nothing may be paid on a guess; a held week is left out. */
                days: kept.days,
                held,
                heldDays: Object.keys(pay?.days ?? {}).filter((d) => !(d in kept.days)),
                accepted: pay?.accepted ?? null,
                cut: pay?.cut ?? null,
                many: acceptance === 'MANY',
                // Whether the week has a day breakdown is read off the week
                // as filed, never off the days left after the window: a week
                // whose every day falls outside the window this line pays
                // through is owed nothing here, as the payroll page reads it,
                // and not its whole accepted total (2026-11-16).
                totalHours: Object.keys(all).length > 0
                  ? (pay ? Math.round((pay.cut.paid - kept.hoursHeld) * 100) / 100 : 0)
                  : acceptance && acceptance !== 'MANY' ? acceptance.hours : acceptance === 'MANY' ? 0 : Number(ts.totalHours),
              }
            })

          const terms: Terms = { ...periodTermsFor('BUY', bc), startedOn: cand.startDate }
          const anchor = asked
            ? null
            : mine.reduce<Date | null>((latest, t) => (!latest || t.periodEnd > latest ? t.periodEnd : latest), null)
          const payPeriod: Period | null =
            asked && 'month' in asked
              ? periodFor(new Date(`${asked.month}-01T00:00:00Z`), terms)
              : asked && 'start' in asked
                ? asked
                : anchor
                  ? periodFor(anchor, terms)
                  : null

          if (unrecorded) {
            processed.push({
              buyContractId: bc.id,
              buyContractCandidateId: cand.id,
              personName: cand.person.name,
              payPeriod: payPeriod ? shown(payPeriod) : null,
              totalHours: 0,
              grossPay: 0,
              alreadyPaidHours: 0,
              currency: bc.payCurrency,
              cyclesCompleted: 0,
              rates: null,
              overtimeHours: 0,
              premiumCents: 0,
              overtime: null,
              payLine: null,
              accepted: null,
              straightTime: null,
              refused:
                `A payroll run on ${unrecorded} paid ${cand.person.name} without recording which hours it ` +
                `covered, so Etyme cannot tell what is still owed. Settle this contract by hand before ` +
                `running it here again.`,
              paid: [],
            })
            continue
          }

          // Each day in the period, at the rate in force that day, less
          // anything an earlier run already paid.
          const lines: PaidLine[] = []
          let alreadyPaid = 0
          let premiumExact = 0
          const said: string[] = []
          const lineSaid: string[] = []
          const acceptedSaid: string[] = []
          // A week worked over the line and accepted at or under it: paid
          // at straight time, said in its own sentence.
          const straightSaid: string[] = []
          const wageLine = wageLineFor(bc, cand.person.name, row)
          // Each week held in this period, said on the run's row.
          const heldHere: HeldWeek[] = []
          // And each week after the pay window ended, in this period.
          const windowHere: Array<{ weekOf: string; endedOn: string; hours: number; whole: boolean }> = []
          if (payPeriod) {
            const start = payPeriod.start.toISOString().slice(0, 10)
            const end = payPeriod.end.toISOString().slice(0, 10)
            for (const t of mine) {
              for (const w of t.windowHeld) {
                const h = hoursIn(w, start, end)
                if (h <= 0) continue
                const was = windowHere.find((x) => x.weekOf === w.weekOf)
                if (was) { was.hours = Math.round((was.hours + h) * 100) / 100; was.whole = was.whole && w.whole }
                else windowHere.push({ weekOf: w.weekOf, endedOn: w.endedOn, hours: h, whole: w.whole })
              }
            }
            windowHere.sort((a, b) => a.weekOf.localeCompare(b.weekOf))
          }
          if (payPeriod) {
            for (const t of mine) {
              for (const w of t.held) {
                const inside = t.heldDays.some((d) => {
                  const at = new Date(`${d.slice(0, 10)}T00:00:00.000Z`).getTime()
                  return weekStart(d.slice(0, 10)) === w.weekOf && at >= payPeriod.start.getTime() && at <= payPeriod.end.getTime()
                })
                if (inside && !heldHere.some((h) => h.weekOf === w.weekOf)) heldHere.push(w)
              }
              // More than one acceptance standing on the week: nothing
              // says which governs, so it is not paid on a guess.
              if (t.many) {
                const filedShare = hoursInPeriod(
                  { id: t.id, periodStart: t.periodStart, periodEnd: t.periodEnd, days: t.filed, totalHours: 0 },
                  payPeriod,
                  terms.straddle
                )
                if (filedShare && filedShare.hours > 0) {
                  acceptedSaid.push(
                    `${bc.company?.name ?? 'The employer'} has more than one acceptance standing on ${cand.person.name}'s ` +
                      `week of ${plainDate(t.periodStart.toISOString())}, and nothing says which of them governs, so that ` +
                      `week is not paid here rather than paid on a guess. It is paid once all but one are withdrawn.`
                  )
                }
                continue
              }
              const share = hoursInPeriod(
                { id: t.id, periodStart: t.periodStart, periodEnd: t.periodEnd, days: t.days, totalHours: t.totalHours },
                payPeriod,
                terms.straddle
              )
              if (!share || share.hours <= 0) continue
              sheetsRun.add(t.id)
              if (t.cut) {
                const cutNote = payCutSays(t.cut, { personName: cand.person.name, employerName: bc.company?.name ?? null })
                if (cutNote && !acceptedSaid.includes(cutNote)) acceptedSaid.push(cutNote)
              }
              const priced = priceByDay({
                contractRateCents: cand.payRate,
                periods,
                days: t.days,
                hours: Object.keys(t.days).length > 0 ? null : share.hours,
                within: share.partial ? payPeriod : null,
                periodStart: t.periodStart,
                periodEnd: t.periodEnd,
              })
              if (t.cut) {
                for (const w of straightTimeWeeks(t.cut)) {
                  if (!priced.days.some((d) => weekStart(d.day) === w.weekOf)) continue
                  if (!straightSaid.includes(w.says)) straightSaid.push(w.says)
                }
              }
              for (const d of priced.days) {
                const before = book.paid.get(paidKey(bc.id, cand.personId, t.id, d.day)) ?? 0
                const left = Math.round((d.hours - before) * 100) / 100
                alreadyPaid += Math.min(before, d.hours)
                if (left > 0) {
                  lines.push({ personId: cand.personId, timesheetId: t.id, day: d.day, hours: left, rateCents: d.rateCents })
                }
              }

              // ── The premium on the hours over the line ──────────────
              //
              // Priced on the whole week — the regular rate is a fact
              // about the week, whichever period its days fall in — and
              // paid on the days in this period that carry it, less any
              // premium an earlier run already paid on them.
              const weeks = sheetOvertime({
                days: t.filed,
                leaveDays: t.leaveDays,
                accepted: t.accepted,
                afterHours: t.line.afterHours,
                contractRateCents: cand.payRate,
                periods,
                method,
                line: wageLine,
              })
              const inPeriod = new Set(priced.days.map((d) => d.day))
              // Where the line came from, where it is the law's or where
              // the law's forty does not reach — said once per person.
              const lineNote = payLineSays(
                t.line,
                { personName: cand.person.name, employerName: bc.company?.name ?? null },
                weeklyWorked(Object.fromEntries(Object.entries(t.filed).filter(([d]) => inPeriod.has(d.slice(0, 10)))), t.leaveDays)
              )
              if (lineNote && !lineSaid.includes(lineNote)) lineSaid.push(lineNote)
              const note = overtimeSaysFor(weeks, inPeriod)
              if (note) said.push(note)
              for (const [day, p] of premiumByDay(weeks, inPeriod)) {
                const key = paidKey(bc.id, cand.personId, t.id, day)
                const unpaid = Math.round((p.hours - (book.premiumHours.get(key) ?? 0)) * 100) / 100
                if (unpaid <= 0 || p.hours <= 0) continue
                const cents = (p.premiumCents * unpaid) / p.hours
                premiumExact += cents
                const line = lines.find((l) => l.timesheetId === t.id && l.day === day)
                if (line) {
                  line.overtimeHours = unpaid
                  line.premiumCents = cents
                } else {
                  lines.push({
                    personId: cand.personId, timesheetId: t.id, day, hours: 0, rateCents: p.rateCents,
                    overtimeHours: unpaid, premiumCents: cents,
                  })
                }
              }
            }
          }

          // What this press covers: every day still to pay, with its hours
          // and overtime hours. A calculation writes it; a payment pays
          // only while it is still exactly what the latest calculation
          // covered, so a week accepted after Calculate goes back to it
          // (lib/money/payroll-worked-out, walk 2026-11-14).
          const covers = payCovers(lines)
          // Nothing left to pay is not a figure that changed: a second press
          // on a period already paid pays nothing, as before.
          if (
            payPeriod && workedOut &&
            !isWorkedOut(workedOut, {
              buyContractId: bc.id, buyContractCandidateId: cand.id,
              start: payPeriod.start.toISOString(), end: payPeriod.end.toISOString(),
            }, covers === '' ? undefined : covers)
          ) {
            notWorkedOut.push({ personName: cand.person.name, periodLabel: payPeriod.label })
            continue
          }
          if (payPeriod) windows.push({ period: payPeriod, terms, startedOn: cand.startDate ?? null })

          const byRate = new Map<number, number>()
          for (const l of lines) byRate.set(l.rateCents, (byRate.get(l.rateCents) ?? 0) + l.hours)
          // Straight time rounded once per rate, as before; the premium
          // rounded once for the row.
          const premiumCents = Math.round(premiumExact)
          const grossPay =
            [...byRate.entries()].reduce((n, [r, h]) => n + Math.round(Math.round(h * 100) / 100 * r), 0) + premiumCents
          const totalHours = Math.round(lines.reduce((n, l) => n + l.hours, 0) * 100) / 100

          processed.push({
            buyContractId: bc.id,
            buyContractCandidateId: cand.id,
            personName: cand.person.name,
            payPeriod: payPeriod ? shown(payPeriod) : null,
            totalHours,
            grossPay,
            alreadyPaidHours: Math.round(alreadyPaid * 100) / 100,
            currency: bc.payCurrency,
            cyclesCompleted: 0,
            rates:
              byRate.size > 1
                ? `Paid by day across a rate change: ${[...byRate.entries()]
                    .map(([r, h]) => `${Math.round(h * 100) / 100} hours at ${rate(r, bc.payCurrency)}`)
                    .join(' and ')}.`
                : null,
            overtimeHours: Math.round(lines.reduce((n, l) => n + (l.overtimeHours ?? 0), 0) * 100) / 100,
            premiumCents,
            overtime: said.length ? said.join(' ') : null,
            payLine: lineSaid.length ? lineSaid.join(' ') : null,
            accepted: acceptedSaid.length ? acceptedSaid.join(' ') : null,
            straightTime: straightSaid.length ? straightSaid.join(' ') : null,
            exemptHeld: heldSays(cand.person.name, heldHere),
            windowHeld: windowHeldSays(cand.person.name, windowHere),
            refused: payPeriod ? null : `No accepted hours for ${cand.person.name}, so there is no period to pay.`,
            paid: lines,
            covers,
          })
        }

        // Only the pay days of the periods being run. This used to complete
        // every open cycle on the contract, so one press on a placement
        // five months old closed twenty-six pay dates; and then every one
        // from the period's first day to four days after its last, which
        // missed a pay day nine days after the month and settled the
        // month before's. Which period a pay day pays is now read off the
        // line's own pay days (lib/money/pay-day-period): the period
        // holding most of the days since the pay day before it.
        let completed = 0
        if (!dryRun && windows.length > 0) {
          const cycles = await tx.cycle.findMany({
            where: { buyContractId: bc.id, kind: cycleKind },
            select: { id: true, dueOn: true, completedAt: true, periodEnd: true },
          })
          const ids = new Set<string>()
          for (const w of windows) {
            // On one of the company's own periods, the pay day whose period
            // ends inside it (lib/money/pay-day-period).
            const marks = askedIsOwn
              ? companyPayDaysToMark(cycles, w.period, companyPeriodOf, w.startedOn)
              : payDaysToMark(cycles, [w.period], (x: Date) => periodFor(x, w.terms), w.startedOn)
            for (const c of marks) ids.add(c.id)
          }
          if (ids.size > 0) {
            const updated = await tx.cycle.updateMany({
              where: { id: { in: [...ids] }, completedAt: null },
              data: { completedAt: now },
            })
            completed = updated.count
          }
        }
        for (const p of processed) if (p.buyContractId === bc.id) p.cyclesCompleted = completed
      }

      // Somebody would be paid unworked: nothing in the batch is paid, and
      // the cycles marked above roll back with the rest.
      if (notWorkedOut.length > 0) throw new NotWorkedOutYet(notWorkedOutSays(notWorkedOut))

      // Log the payroll run — and, on a run that pays, every day it paid,
      // which is what the next run reads so that no hour is paid twice
      // (lib/payroll-paid).
      // A draft works the figures out and writes nothing: no log, no pay day marked.
      if (!dryRun) {
      await tx.automationLog.create({
          data: {
            companyId,
            action: 'PAYROLL_RUN',
            summary: `Payroll ${action}: ${processed.length} contracts, ${totals(
              processed.map((p) => ({ minor: p.grossPay, currency: p.currency }))
            )} gross total`,
            reason: `Payroll ${action} initiated by ${runBy.name}`,
            payload: {
              action,
              period: period ?? null,
              contracts: processed.map((p) => ({
                buyContractId: p.buyContractId,
                // Which person a calculation worked out, so a payment can
                // ask for that person's and nobody else's.
                buyContractCandidateId: p.buyContractCandidateId,
                person: p.personName,
                payPeriod: p.payPeriod,
                hours: p.totalHours,
                grossPay: p.grossPay,
                currency: p.currency,
                refused: p.refused,
                covers: p.covers ?? null,
                // A week held because it is after the pay window ended: not
                // paid by this run, and said in its record, never dropped
                // without a word (lib/money/outside-pay-window).
                ...(p.windowHeld ? { windowHeld: p.windowHeld } : {}),
                // `premiumsPriced` says this run priced overtime, so a day
                // with no premium on it had none owed — not "unknown".
                ...(action === 'process' && !p.refused ? { paid: p.paid, premiumsPriced: true } : {}),
              })),
              runBy: runBy.id,
              runAt: now.toISOString(),
            } as any,
            reversible: action !== 'process',
          },
        })
      }

      return processed
    })

    const totalGross = result.reduce((s, p) => s + p.grossPay, 0)
    // Said, not added. `totalGrossPay` below is kept for the callers that
    // already read it and is only a sum worth trusting while the batch is
    // one currency, which the sentence is honest about when it is not.
    const grossSays = totals(result.map((p) => ({ minor: p.grossPay, currency: p.currency })))
    const refused = result.filter((p) => p.refused)

    // Every premium this run paid has its posting, once. A week accepted
    // before the exempt answer was posted at straight time; where nothing
    // restated it since, its premium is posted now, so the books and the
    // W-2 hold what the run paid (lib/order-postings, `repostPayFor`).
    const books = { restated: 0, leftAlone: [] as string[] }
    if (action === 'process') {
      const premiumWeeks = new Map<string, { buyContractId: string; personId: string; timesheetIds: Set<string> }>()
      for (const p of result) {
        for (const l of p.paid) {
          if (!((l.premiumCents ?? 0) > 0)) continue
          const k = `${p.buyContractId}|${l.personId}`
          const e = premiumWeeks.get(k) ?? { buyContractId: p.buyContractId, personId: l.personId, timesheetIds: new Set<string>() }
          e.timesheetIds.add(l.timesheetId)
          premiumWeeks.set(k, e)
        }
      }
      for (const w of premiumWeeks.values()) {
        try {
          const done = await repostPayFor({ companyId, buyContractId: w.buyContractId, personId: w.personId, timesheetIds: [...w.timesheetIds] })
          books.restated += done.rebuilt
          for (const l of done.leftAlone) if (!books.leftAlone.includes(l.says)) books.leftAlone.push(l.says)
        } catch (err) {
          // The pay went out; a posting that could not follow it is reported, never a failed run.
          reportError('Posting the overtime premium a run paid failed:', err)
        }
      }
    }

    // Overtime the clients were billed on these weeks that the workers are
    // not paid, because nobody recorded whether they are exempt. The pay
    // rule is not moved here; the gap is said, with the amount.
    let overtimeNotPaid: OvertimeNotPaid | null = null
    try {
      const run = await overtimeNotPaidFor(companyId, { buyContractIds: contracts.map((c) => c.id), timesheetIds: [...sheetsRun] })
      overtimeNotPaid = run.says ? run : null
    } catch (err) {
      // A failed read leaves the line off; it never stops a run that paid.
      reportError('Reading overtime billed and not paid failed:', err)
    }

    return reply({
      data: {
        action,
        contractsProcessed: result.length,
        totalGrossPay: totalGross,
        totalHours: result.reduce((s, p) => s + p.totalHours, 0),
        details: result.map(({ paid, ...rest }) => rest),
        overtimeNotPaid,
        // Weeks whose postings were restated so the premium this run paid
        // is in the books, and any that could not be, each with why.
        books,
        // The pay day of the company's own period this run was for, the
        // day the Payroll row and the pay file name; null for a calendar
        // month, which has no one pay day of the company's.
        payOn: askedIsOwn && askedKey && co ? periodHolding(askedKey, co.rhythm, co.rule)?.payOn ?? null : null,
        message:
          `Payroll ${action} complete: ${result.length} contracts, ${grossSays} gross` +
          (refused.length > 0 ? `. ${refused.length} left out, each with a reason on the row.` : '') +
          (overtimeNotPaid?.says ? `. ${overtimeNotPaid.says}` : ''),
      },
    })
  } catch (err: any) {
    if (err instanceof NotWorkedOutYet) {
      return reply(
        { error: { code: 'NOT_WORKED_OUT', message: err.message } },
        { status: 422 }
      )
    }
    reportError('Payroll run failed:', err)
    return reply(
      { error: { code: 'INTERNAL', message: 'Payroll run failed' } },
      { status: 500 }
    )
  }
}

/** Thrown inside the run's transaction so that nothing it marked is kept. */
class NotWorkedOutYet extends Error {}

type Asked = { month: string } | Period | null | 'INVALID'

function readPeriod(p: unknown): Asked {
  if (p == null || p === '') return null
  if (typeof p === 'string') return /^\d{4}-\d{2}$/.test(p) ? { month: p } : 'INVALID'
  if (typeof p === 'object') {
    const o = p as { start?: string; end?: string }
    const start = o.start ? new Date(`${String(o.start).slice(0, 10)}T00:00:00Z`) : null
    const end = o.end ? new Date(`${String(o.end).slice(0, 10)}T00:00:00Z`) : null
    if (!start || !end || isNaN(+start) || isNaN(+end) || end < start) return 'INVALID'
    return { start, end, label: daySpan(o.start!, o.end!) }
  }
  return 'INVALID'
}

function shown(p: Period) {
  return { start: p.start.toISOString().slice(0, 10), end: p.end.toISOString().slice(0, 10), label: p.label }
}
