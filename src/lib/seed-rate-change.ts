/**
 * A pay rise in the middle of a placement, on the seeded world.
 *
 * ── What the founder asked to see ────────────────────────────────────
 *
 * A consultant's pay changing after six months, from $66 an hour to
 * $70, with five months of weeks behind it. The product has handled
 * that since 2026-09-29 — every hour is paid at the rate in force on the
 * day it was worked (`priceByDay` in lib/contract-rate), a rate change
 * closes the one before it the day before (lib/rate-line), and a payroll
 * run pays its own period once (lib/payroll-paid). None of it could be
 * seen on the demo, because no seeded line had ever changed its pay.
 *
 * ── Who ──────────────────────────────────────────────────────────────
 *
 * Rosa Delgado, a warehouse systems analyst at Northbend Athletic's
 * distribution center, on Brightmoor Staffing's own payroll (W2). Billed
 * at $112, paid $66, non-exempt, time and a half after forty. Brightmoor
 * because it already sells to Northbend from its own payroll and is the
 * one supplier whose desks are all seated: its AP & payroll desk accepts
 * her weeks and runs her pay, and the rise is proposed by one desk and
 * approved by another, as the approval route insists.
 *
 * Not CloudEPA, though it was offered: CloudEPA sells only to the prime
 * above it, and a direct line from CloudEPA to Northbend would be the
 * sub going round its prime — the one thing the prime's NDA exists to
 * stop, on the same client whose door shows that story.
 *
 * ── How each row is written ──────────────────────────────────────────
 *
 * As the product writes it today, and through the product's own
 * functions where one exists:
 *
 *   the job        raised by Northbend and charged to its Distribution
 *                  department, which the award carries onto her line as
 *                  a whole-line allocation (lib/seed-coding)
 *   the week       filed by her, signed by Northbend's hiring manager
 *                  at the bill rate, then accepted by Brightmoor at the
 *                  pay rate in force on the first day worked — never the
 *                  bill rate (`payRateOn` in the approve route)
 *   the rise       proposed at $70 with `previousRate` the $66 in force,
 *                  held for approval because it is over five per cent
 *                  (`assessRateChange`), approved by another desk, and
 *                  settled by `settleApproved` — the $66 opening row
 *                  written and closed the day before
 *   the pay run    one processed run for the month before the rise,
 *                  each day at its own rate, recorded in the run's own
 *                  log shape so `paidBook` reads it back
 *   the exemption  screened by `screenExemption`, checked by
 *                  `checkAssertion`, as `POST /api/contracts/:id/exempt`
 *
 * No bill is raised for her weeks. The founder asked for pay, and a
 * seeded invoice series is its own piece of money work; her placement's
 * bill dates stay open, which is what an unbilled placement looks like.
 *
 * ── Dates ────────────────────────────────────────────────────────────
 *
 * Every date counts from the world's birthday (lib/seed-days), so a
 * second seeding on any later day finds every row the first one wrote.
 * The placement starts on the Monday on or before 213 days before that
 * day. The rise takes effect on the first Wednesday on or after the day
 * five calendar months later — the start of month six.
 */

import { prisma as db } from '@/lib/db'
import { day } from '@/lib/seed-days'
import { holidayKeys } from '@/lib/seed-calendar'
import { writeCyclesFor } from '@/lib/contract-cycles'
import { completeCycle } from '@/lib/cycle-complete'
import { rateInForce, ratePeriods, priceByDay, assessRateChange } from '@/lib/contract-rate'
import { lineFor, settleApproved, payPeriodsReached } from '@/lib/rate-line'
import { periodFor, hoursInPeriod, type Terms } from '@/lib/periods'
import { periodTermsFor } from '@/lib/money/order-terms'
import { paidBook, paidKey, type PaidLine } from '@/lib/payroll-paid'
import { screenExemption, checkAssertion } from '@/lib/worker-classification'
import { rate as perHour, totals } from '@/lib/money-display'
import { departmentAt, codeTheLine, type SeedDepartment } from '@/lib/seed-coding'
import type { SeedContext } from '@/lib/seed-order-to-cash'

const DAY = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)
const plus = (d: Date, n: number) => new Date(d.getTime() + n * DAY)
const atHour = (d: Date, h: number) => new Date(d.getTime() + h * 3_600_000)

/** The person, by the address her demo door sits at. */
export const RATE_CHANGE_PERSON = {
  name: 'Rosa Delgado',
  email: 'rosa.delgado@seed.etyme.invalid',
}

/** What she is billed and paid, in cents an hour. */
export const RATE_CHANGE_RATES = { bill: 11_200, pay: 66_00, raise: 70_00 }

const ROLE = {
  title: 'Warehouse systems analyst',
  skills: ['Warehouse management', 'RF scanning', 'SQL'],
  loc: 'Tualatin, OR',
}

/**
 * Where her job is charged at Northbend: the distribution center's own
 * department, under Operations. Not Apps — she works at the warehouse.
 */
export const RATE_CHANGE_DEPARTMENT: SeedDepartment = { name: 'Distribution', code: 'DIST' }

/** The desk that proposes the rise. Brightmoor's Admin role, which nobody else holds. */
const ADMIN = { desk: 'admin', name: 'Harriet Mwangi', role: 'Admin' }

/**
 * The dates the story hangs on, from the world's birthday.
 *
 * Exported so the test reads the same days the seed wrote rather than
 * working them out a second way.
 */
export function rateChangeDates() {
  const back = day(-213)
  const start = plus(back, -((back.getUTCDay() + 6) % 7)) // the Monday on or before
  const fiveOn = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 5, start.getUTCDate()))
  const rise = plus(fiveOn, (3 - fiveOn.getUTCDay() + 7) % 7) // the Wednesday on or after
  // The calendar month before the rise's month: the one payroll run.
  const runMonthStart = new Date(Date.UTC(rise.getUTCFullYear(), rise.getUTCMonth() - 1, 1))
  const runMonthEnd = new Date(Date.UTC(rise.getUTCFullYear(), rise.getUTCMonth(), 0))
  const runMonth = iso(runMonthStart).slice(0, 7)
  return {
    start,
    end: plus(start, 364),
    rise,
    /** The Monday of the week the rise lands in. */
    straddleWeek: plus(rise, -2),
    proposedAt: atHour(plus(rise, -8), 15),
    approvedAt: atHour(plus(rise, -7), 18),
    runMonth,
    runMonthStart,
    runMonthEnd,
    runAt: atHour(plus(runMonthEnd, 10), 17),
  }
}

/** When a week is filed, signed by the client and accepted by the employer. */
function weekTimes(monday: Date) {
  const friday = plus(monday, 4)
  return {
    submittedAt: atHour(friday, 22),
    clientAt: atHour(plus(friday, 3), 16),
    employerAt: atHour(plus(friday, 4), 17),
  }
}

export interface RateChangeSeed {
  weeks: number
  written: boolean
}

export async function seedRateChange(ctx: SeedContext): Promise<RateChangeSeed> {
  const firm = ctx.firmBySlug.get('brightmoor')
  const client = ctx.firmBySlug.get('nike')
  const owner = ctx.seatBySlug.get('brightmoor')
  const clientOwner = ctx.seatBySlug.get('nike')
  if (!firm || !client || !owner || !clientOwner) return { weeks: 0, written: false }

  const deskAt = (slug: string, desk: string) =>
    db.person.findUnique({ where: { primaryEmail: `${ctx.prefix}${slug}-${desk}@${ctx.domain}` }, select: { id: true, name: true } })
  const hiring = await deskAt('nike', 'hiring')
  const payroll = await deskAt('brightmoor', 'payroll')
  if (!hiring || !payroll) return { weeks: 0, written: false }

  const d = rateChangeDates()
  const holidays = holidayKeys()

  // ── The second desk that may decide a pay rate ──────────────────────
  //
  // A pay change needs `consultants.cost` to propose and to decide, and
  // at a staffing supplier only the Owner and Admin roles hold it — the
  // Contract Manager papers rate changes and may not see what anybody
  // costs. Brightmoor seated its Owner and nine other desks and nobody
  // at Admin, so nobody but the owner could have decided the rise, and
  // the owner cannot approve her own proposal. Admin runs the company
  // day to day; she proposes, the owner approves.
  const adminRole = await db.role.findFirst({ where: { companyId: firm.id, name: ADMIN.role }, select: { id: true } })
  if (!adminRole) return { weeks: 0, written: false }
  const adminEmail = `${ctx.prefix}brightmoor-${ADMIN.desk}@${ctx.domain}`
  const admin = await db.person.upsert({
    where: { primaryEmail: adminEmail },
    update: { name: ADMIN.name },
    create: { name: ADMIN.name, primaryEmail: adminEmail },
  })
  if (!(await db.context.findFirst({ where: { personId: admin.id, companyId: firm.id } }))) {
    await db.context.create({
      data: {
        personId: admin.id, companyId: firm.id, roleId: adminRole.id, type: 'EMPLOYEE',
        grantReason: `Seeded supplier desk — ${ADMIN.role}`,
      },
    })
  }

  // ── Rosa, on Brightmoor's payroll ───────────────────────────────────
  const person = await db.person.upsert({
    where: { primaryEmail: RATE_CHANGE_PERSON.email },
    update: {},
    create: { name: RATE_CHANGE_PERSON.name, primaryEmail: RATE_CHANGE_PERSON.email },
  })
  if (!(await db.consultantProfile.findFirst({ where: { personId: person.id } }))) {
    await db.consultantProfile.create({
      data: { personId: person.id, skills: ROLE.skills, location: ROLE.loc, visibility: 'VERIFIED', workAuth: 'USC' },
    })
  }
  // Her own seat, so she can sign in and file her own week. The same
  // seat every other seeded worker at a supplier holds.
  if (!(await db.context.findFirst({ where: { personId: person.id, companyId: firm.id, type: 'CONSULTANT' } }))) {
    await db.context.create({
      data: { personId: person.id, companyId: firm.id, type: 'CONSULTANT', side: 'SELL', grantReason: 'On the payroll — W2' },
    })
  }

  // The budget the job is charged to, as Northbend coded it when the
  // job was raised. The award carries it onto the line below.
  const coding = await departmentAt({
    clientId: client.id, clientSlug: 'nike', ownerId: clientOwner.personId,
    dept: RATE_CHANGE_DEPARTMENT, billCents: RATE_CHANGE_RATES.bill,
  })
  const requirement =
    (await db.requirement.findFirst({ where: { companyId: client.id, title: ROLE.title } })) ??
    (await db.requirement.create({
      data: {
        companyId: client.id, title: ROLE.title, skills: ROLE.skills, location: ROLE.loc,
        billMin: 10_000, billMax: 12_000, months: 12, headcount: 1,
        status: 'FILLED', approvalState: 'AUTO_APPROVED', source: 'MANUAL',
        neededBy: d.start, raisedById: hiring.id, hoursPerWeek: 40,
        costCenterId: coding.costCenterId, orgUnitId: coding.orgUnitId,
        createdAt: plus(d.start, -30),
      },
    }))
  // Brightmoor's own employee, so INTERNAL: the employment is the
  // consent, and there is no bench listing behind it.
  if (!(await db.submission.findFirst({ where: { requirementId: requirement.id, personId: person.id } }))) {
    await db.submission.create({
      data: {
        requirementId: requirement.id, personId: person.id,
        fromCompanyId: firm.id, toCompanyId: client.id, kind: 'INTERNAL',
        rate: RATE_CHANGE_RATES.bill, status: 'PLACED', checkState: 'SENT',
        submittedAt: plus(d.start, -24), decidedAt: plus(d.start, -14),
      },
    })
  }

  // Cleared to work: the I-9 that blocks, the background check that
  // warns, both on the person and ordered by her employer.
  for (const v of [
    { type: 'I9_EVERIFY' as const, provider: 'E-Verify', expiresAt: null },
    { type: 'BACKGROUND_CHECK' as const, provider: 'Sterling', expiresAt: plus(d.start, 730), orderedByCompanyId: firm.id, orderedAt: plus(d.start, -12) },
  ]) {
    if (await db.verification.findFirst({ where: { personId: person.id, type: v.type } })) continue
    await db.verification.create({
      data: {
        personId: person.id, ...v, status: 'CLEAR', issuedAt: plus(d.start, -8),
        uploadedById: owner.personId, verifiedById: owner.personId, verifiedAt: plus(d.start, -7),
        result: { outcome: 'CLEAR' },
      },
    })
  }

  // ── The line: sold at $112, paid $66 ────────────────────────────────
  let sell = await db.sellContract.findFirst({
    where: { companyId: firm.id, clientCompanyId: client.id, personId: person.id, requirementId: requirement.id },
  })
  let buy = sell
    ? await db.buyContract.findFirst({ where: { companyId: firm.id, sellLinks: { some: { sellContractId: sell.id } } } })
    : null
  if (!sell || !buy) {
    const msa =
      (await db.masterAgreement.findFirst({ where: { vendorId: firm.id, clientId: client.id } })) ??
      (await db.masterAgreement.create({
        data: { vendorId: firm.id, clientId: client.id, paymentTerms: 45, currency: 'USD', signedAt: day(-400) },
      }))
    const eng =
      (await db.engagement.findFirst({ where: { msaId: msa.id, title: ROLE.title } })) ??
      (await db.engagement.create({ data: { msaId: msa.id, title: ROLE.title, invoiceCycle: 'MONTHLY' } }))
    sell = await db.sellContract.create({
      data: {
        companyId: firm.id, clientCompanyId: client.id, endClientCompanyId: client.id,
        personId: person.id, requirementId: requirement.id, engagementId: eng.id, msaId: msa.id,
        hiringManagerId: hiring.id, orgUnitId: coding.orgUnitId,
        billRate: RATE_CHANGE_RATES.bill, billCurrency: 'USD', paymentTerms: 45, state: 'IN_PROGRESS',
        startDate: d.start, endDate: d.end,
      },
    })
    buy = await db.buyContract.create({
      data: {
        companyId: firm.id, vendorCompanyId: null, payCurrency: 'USD', contractType: 'W2',
        state: 'IN_PROGRESS', startDate: d.start, endDate: d.end,
        // The overtime line on the pay side: hours over forty in a week
        // are paid at time and a half of the rate in force that day.
        overtimeAfterHours: 40, overtimeMultiplierBps: 15_000,
      },
    })
    await db.buyContractCandidate.create({
      data: {
        buyContractId: buy.id, personId: person.id, payRate: RATE_CHANGE_RATES.pay, payCurrency: 'USD',
        startDate: d.start, endDate: d.end,
      },
    })
    await db.contractLink.create({
      data: { sellContractId: sell.id, buyContractId: buy.id, effectiveFrom: d.start, effectiveTo: d.end },
    })
    // Her hours-due, pay-to-calculate and pay-day dates, from the pack.
    await writeCyclesFor(db, { sell, buy, packId: 'US_IT', holidays })
  }
  const sellId = sell.id
  const buyId = buy.id

  // The coding the award writes: the job's cost center and department,
  // the department on the line, and the whole line allocated to the cost
  // center. Without the allocation Northbend signed every one of her
  // weeks and its budget counted none of them. Written here as well as
  // on create, so a world seeded before the coding existed gains it.
  await codeTheLine({ requirementId: requirement.id, sellContractId: sellId, ...coding })

  // ── Non-exempt, as the employer asserts it ──────────────────────────
  if (!(await db.exemptAssertion.findFirst({ where: { buyContractId: buyId, personId: person.id } }))) {
    const screen = screenExemption({ payModel: buy.payModel ?? 'FIXED_HOURLY', payRateCents: RATE_CHANGE_RATES.pay, paidOnSalaryBasis: false, weeklySalaryCents: null }, 'US_FLSA')
    const assertedAt = atHour(plus(d.start, -7), 16)
    const verdict = checkAssertion({
      status: 'NONEXEMPT', basis: null, screen, note: null,
      assertedByCompanyId: firm.id, employerCompanyId: firm.id,
      assertedByCompanyName: 'Brightmoor Staffing', assertedAt, reviewBy: null,
    })
    if (verdict.ok) {
      await db.exemptAssertion.create({
        data: {
          buyContractId: buyId, personId: person.id, assertedByCompanyId: firm.id, assertedById: owner.personId,
          status: 'NONEXEMPT', basis: null, wageRule: 'US_FLSA',
          screenOutcome: screen.outcome, screenRulesOut: screen.rulesOut, screenSays: screen.says,
          note: null, assertedAt, reviewBy: verdict.reviewBy,
        },
      })
    }
  }

  // ── The weeks, in the order they happened ───────────────────────────
  //
  // Monday to Friday, eight hours a day, nothing on a public holiday.
  // The second clean week after the rise runs nine hours a day, so it
  // goes five hours over forty. The rise is written into the history at
  // the moment it was approved, so every week accepted after that reads
  // it, exactly as the approve route would have.
  const mondays: Date[] = []
  for (let m = d.start; plus(m, 4) <= day(-5); m = plus(m, 7)) mondays.push(m)
  const clean = (m: Date) => [0, 1, 2, 3, 4].every((i) => !holidays.has(iso(plus(m, i))))
  const longWeek = mondays.filter((m) => m > d.straddleWeek && clean(m))[1] ?? null

  let riseWritten = false
  let runWritten = false
  const writeRiseIfDue = async (before: Date) => {
    if (riseWritten || d.approvedAt > before) return
    await seedTheRise(buyId, owner.personId, admin.id, d)
    riseWritten = true
  }
  const writeRunIfDue = async (before: Date) => {
    if (runWritten || d.runAt > before) return
    await seedTheRun(firm.id, buyId, payroll, d)
    runWritten = true
  }

  let weeks = 0
  for (const monday of mondays) {
    const t = weekTimes(monday)
    await writeRiseIfDue(t.employerAt)
    await writeRunIfDue(t.employerAt)

    const perDay = longWeek && +monday === +longWeek ? 9 : 8
    const days: Record<string, number> = {}
    for (let i = 0; i < 5; i++) {
      const on = iso(plus(monday, i))
      if (!holidays.has(on)) days[on] = perDay
    }
    const total = Object.values(days).reduce((a, b) => a + b, 0)
    weeks++

    if (await db.timesheet.findFirst({ where: { sellContractId: sellId, periodStart: monday } })) continue

    // The rate the employer's acceptance carries: her pay rate in force
    // on the first day worked, from the history as it stood that day.
    const rows = await db.rateHistory.findMany({
      where: { contractType: 'BUY', contractId: buyId },
      select: { id: true, rate: true, fromDate: true, toDate: true, approvalState: true },
    })
    const firstWorked = Object.keys(days).sort()[0] ?? iso(monday)
    const payRate = rateInForce(RATE_CHANGE_RATES.pay, ratePeriods(rows), new Date(`${firstWorked}T00:00:00Z`)).rateCents

    const ts = await db.timesheet.create({
      data: {
        sellContractId: sellId, personId: person.id, periodStart: monday, periodEnd: plus(monday, 4),
        days, totalHours: total, status: 'APPROVED', submittedAt: t.submittedAt,
        approvedAt: t.clientAt, approvedById: hiring.id,
        clientApprovedAt: t.clientAt, clientApprovedById: hiring.id,
        employerAcceptedAt: t.employerAt, employerAcceptedById: payroll.id,
      },
    })
    await db.workAssertion.create({
      data: {
        timesheetId: ts.id, companyId: client.id, role: 'CLIENT_APPROVAL', hours: total,
        rateCents: RATE_CHANGE_RATES.bill, state: 'LIVE', byId: hiring.id, auto: false, at: t.clientAt,
      },
    })
    await db.workAssertion.create({
      data: {
        timesheetId: ts.id, companyId: firm.id, role: 'EMPLOYER_ACCEPTANCE', hours: total,
        rateCents: payRate, state: 'LIVE', byId: payroll.id, auto: false, at: t.employerAt,
      },
    })
    // Both signatures in: the week's hours-to-approve date is done.
    await completeCycle(db, { sellContractId: sellId, kind: 'TIMESHEET_APPROVE', periodEnd: plus(monday, 4), at: t.employerAt })
  }
  await writeRiseIfDue(day(0))
  await writeRunIfDue(day(0))

  return { weeks, written: true }
}

/**
 * The rise, as `POST /api/rate-history` and then
 * `POST /api/rate-history/:id/approve` record it. Once.
 */
async function seedTheRise(
  buyId: string,
  approverId: string,
  proposerId: string,
  d: ReturnType<typeof rateChangeDates>
) {
  if (await db.rateHistory.findFirst({ where: { contractType: 'BUY', contractId: buyId, fromDate: d.rise } })) return
  const line = await lineFor('BUY', buyId)
  if (!line) return

  // What the route compares against: the rate in force the day the
  // change starts, from approved rows, else the line's own.
  const live = await db.rateHistory.findMany({
    where: { contractType: 'BUY', contractId: buyId, approvalState: 'APPROVED' },
  })
  const previous = rateInForce(line.recordedRateCents, ratePeriods(live), d.rise).rateCents
  const assessment = assessRateChange(previous, RATE_CHANGE_RATES.raise, line.currency)
  const why = 'Six-month review. Steady weeks, and the going rate for warehouse systems work has moved.'

  const row = await db.rateHistory.create({
    data: {
      contractType: 'BUY', contractId: buyId, rate: RATE_CHANGE_RATES.raise, rateType: 'HOURLY',
      fromDate: d.rise, toDate: null, reason: why, changedById: proposerId, previousRate: previous,
      // Over five per cent, so it waits for a second desk.
      approvalState: assessment.needsApproval ? 'PROPOSED' : 'APPROVED',
      approvedById: assessment.needsApproval ? null : proposerId,
      approvedAt: assessment.needsApproval ? null : d.proposedAt,
      createdAt: d.proposedAt,
    },
  })
  if (!assessment.needsApproval) {
    await settleApproved(db, row, line, proposerId)
    return
  }

  const approved = await db.rateHistory.update({
    where: { id: row.id },
    data: {
      approvalState: 'APPROVED', approvedById: approverId, approvedAt: d.approvedAt,
      reason: `${why} · Approved: agreed at her review, from the first Wednesday of month six.`,
    },
  })
  await settleApproved(db, approved, line, approverId)
  // The opening row carries the moment it was written down, which is the
  // approval — not the second this seed happened to run.
  await db.rateHistory.updateMany({
    where: { contractType: 'BUY', contractId: buyId, id: { not: row.id }, previousRate: null, fromDate: line.startDate },
    data: { approvedAt: d.approvedAt, createdAt: d.approvedAt },
  })

  const reached = await payPeriodsReached(buyId, d.rise, null)
  const approver = await db.person.findUnique({ where: { id: approverId }, select: { name: true } })
  const bc = await db.buyContract.findUniqueOrThrow({ where: { id: buyId }, select: { companyId: true } })
  await db.automationLog.create({
    data: {
      companyId: bc.companyId,
      action: 'RATE_AMENDMENT_APPROVED',
      summary: `${approver?.name ?? 'Somebody'} approved a rate change to ${perHour(RATE_CHANGE_RATES.raise, line.currency)} effective ${iso(d.rise)}`,
      reason: assessment.reason,
      payload: {
        rateHistoryId: row.id, contractId: buyId,
        fromCents: previous, toCents: RATE_CHANGE_RATES.raise,
        effectiveFrom: d.rise.toISOString(),
        invoiceLinesAffected: 0,
        payPeriodsAffected: reached.map((p) => p.label),
      },
      reversible: true,
      at: d.approvedAt,
    },
  })
}

/**
 * One processed payroll run for the month before the rise, as
 * `POST /api/payroll/run` records it: every day it paid, at the rate in
 * force that day, so the next run — and her own page — subtracts it.
 */
async function seedTheRun(
  companyId: string,
  buyId: string,
  runBy: { id: string; name: string },
  d: ReturnType<typeof rateChangeDates>
) {
  const runs = await db.automationLog.findMany({
    where: { companyId, action: 'PAYROLL_RUN' },
    select: { payload: true },
  })
  const already = runs.some((r) =>
    ((r.payload as { contracts?: { buyContractId?: string }[] } | null)?.contracts ?? []).some((c) => c.buyContractId === buyId)
  )
  if (already) return

  const bc = await db.buyContract.findUniqueOrThrow({
    where: { id: buyId },
    include: {
      candidates: { include: { person: { select: { id: true, name: true } } } },
      sellLinks: {
        include: {
          sellContract: {
            select: {
              timesheets: {
                where: {
                  assertions: { some: { role: 'EMPLOYER_ACCEPTANCE', state: 'LIVE', at: { lte: d.runAt } } },
                },
                select: { id: true, personId: true, totalHours: true, days: true, periodStart: true, periodEnd: true },
              },
            },
          },
        },
      },
    },
  })
  const cand = bc.candidates[0]
  if (!cand) return
  // The history as it stood when the run was pressed. Rows are written
  // in the order they happened, so what is in the table now is that.
  const periods = ratePeriods(
    await db.rateHistory.findMany({
      where: { contractType: 'BUY', contractId: buyId },
      select: { id: true, rate: true, fromDate: true, toDate: true, approvalState: true },
    })
  )
  const terms: Terms = { ...periodTermsFor('BUY', { ...bc, workOrder: null } as never), startedOn: cand.startDate }
  const period = periodFor(new Date(`${d.runMonth}-01T00:00:00Z`), terms)
  const book = await paidBook(companyId, [buyId])

  const lines: PaidLine[] = []
  let alreadyPaid = 0
  for (const t of bc.sellLinks.flatMap((l) => l.sellContract.timesheets)) {
    if (t.personId !== cand.personId) continue
    const days = (t.days ?? {}) as Record<string, number>
    const totalHours = Object.values(days).reduce((a, b) => a + Number(b || 0), 0)
    const share = hoursInPeriod(
      { id: t.id, periodStart: t.periodStart, periodEnd: t.periodEnd, days, totalHours },
      period,
      terms.straddle
    )
    if (!share || share.hours <= 0) continue
    const priced = priceByDay({
      contractRateCents: cand.payRate, periods, days, hours: null,
      within: share.partial ? period : null, periodStart: t.periodStart, periodEnd: t.periodEnd,
    })
    for (const x of priced.days) {
      const before = book.paid.get(paidKey(buyId, cand.personId, t.id, x.day)) ?? 0
      const left = Math.round((x.hours - before) * 100) / 100
      alreadyPaid += Math.min(before, x.hours)
      if (left > 0) lines.push({ personId: cand.personId, timesheetId: t.id, day: x.day, hours: left, rateCents: x.rateCents })
    }
  }
  lines.sort((a, b) => a.day.localeCompare(b.day))
  const byRate = new Map<number, number>()
  for (const l of lines) byRate.set(l.rateCents, (byRate.get(l.rateCents) ?? 0) + l.hours)
  const grossPay = [...byRate.entries()].reduce((n, [r, h]) => n + Math.round(Math.round(h * 100) / 100 * r), 0)
  const hours = Math.round(lines.reduce((n, l) => n + l.hours, 0) * 100) / 100

  // The pay dates that fall due for this period, and only those.
  await db.cycle.updateMany({
    where: {
      buyContractId: buyId, kind: 'SALARY_PAY', completedAt: null,
      dueOn: { gte: period.start, lte: plus(period.end, 4) },
    },
    data: { completedAt: d.runAt },
  })

  const action = 'process'
  await db.automationLog.create({
    data: {
      companyId,
      action: 'PAYROLL_RUN',
      summary: `Payroll process: 1 contracts, ${totals([{ minor: grossPay, currency: bc.payCurrency }])} gross total`,
      reason: `Payroll process initiated by ${runBy.name}`,
      payload: {
        // What the run was asked to do, read back by `paidBook`: only a
        // processed run paid anybody.
        action,
        period: d.runMonth,
        contracts: [{
          buyContractId: buyId,
          person: cand.person.name,
          payPeriod: { start: iso(period.start), end: iso(period.end), label: period.label },
          hours,
          grossPay,
          currency: bc.payCurrency,
          refused: null,
          paid: lines,
        }],
        runBy: runBy.id,
        runAt: d.runAt.toISOString(),
      } as never,
      reversible: false,
      at: d.runAt,
    },
  })
}
