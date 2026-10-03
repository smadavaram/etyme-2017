import { NextRequest, NextResponse } from 'next/server'
import { blankShortWages, type RunPaidTotal } from '@/lib/payroll-export'
import { paidOnDay } from '@/lib/money/pay-day-period'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { hasPermission } from '@/lib/permissions'
import { paidRunHours } from '@/lib/payroll-paid'
import {
  yearEndPack, yearEndCsv, depositSchedule, depositDeadline, depositPayDays,
  datePaidWages, dropReversed, receiptPayments, WAGES_YEAR_PAID, RECEIPT_CONTRACT_TYPES,
  WAGE_CONTRACT_TYPES, BUREAU_NOTICE, type DatablePosting,
} from '@/lib/payroll-export'

/**
 * The statutory handoff — prepared here, filed by the bureau.
 *
 * ── The boundary, and why it is the whole feature ────────────────────
 *
 * Etyme never files anything. Not a 941, not a state deposit, not a W-2,
 * not a 1099. Withholding and year-end are somebody's whole business,
 * regulated differently in every state, and a staffing platform that
 * grows a filing engine inside it becomes a bad filing engine attached to
 * a good staffing platform.
 *
 * What we have and the bureau does not is what was ACTUALLY earned and by
 * whom — hours somebody accepted, at a rate somebody agreed, posted to a
 * period. That is the input to every return, and it is the part that is
 * usually wrong, because it reaches the bureau as a spreadsheet by email.
 *
 * So "done" is not "we file". It is that the handoff is real, the numbers
 * come from postings rather than a rate card, and every screen and file
 * says on its face who files it.
 *
 * ── The corp-to-corp rule ────────────────────────────────────────────
 *
 * A C2C sub-vendor gets an invoice, gets paid, and gets no 1099-NEC —
 * payments to a corporation for services are outside the
 * information-reporting requirement. Issuing one anyway asserts a
 * relationship with an individual that the arrangement does not have,
 * which is the shape of a misclassification finding. The amount is still
 * shown, because somebody will ask.
 */

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Statutory')
  if (notStaff) return notStaff
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'Wages are paid by a company' } },
      { status: 403 }
    )
  }
  if (!hasPermission(caller.permissions, 'payroll.run')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'Seeing what everybody earned in a year needs payroll.run',
        },
      },
      { status: 403 }
    )
  }

  const companyId = caller.company.id
  const url = new URL(request.url)
  const year = Number(url.searchParams.get('year') ?? new Date().getUTCFullYear())
  const format = url.searchParams.get('format')

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'That is not a tax year', field: 'year' } },
      { status: 422 }
    )
  }

  const from = new Date(Date.UTC(year, 0, 1))
  const to = new Date(Date.UTC(year + 1, 0, 1))

  // Wages come from PAY postings and from nowhere else. A rate card says
  // what somebody should have earned; a posting says what they did, and
  // those differ every time a timesheet is reversed, a rate amendment
  // lands late, or an off-cycle payment is made.
  //
  // Wages go on the W-2 for the year they were PAID, not the year the
  // hours were worked (US law; the founder's standing rule follows it).
  // A posting is dated by the week worked, so postings from before the
  // year are read too — a December week paid in January is this year's —
  // and each is re-dated below by the run that paid it.
  const readFrom = new Date(from.getTime() - 400 * 86_400_000)
  const rows = await prisma.orderPosting.findMany({
    where: {
      companyId,
      kind: 'PAY',
      postedAt: { gte: readFrom, lt: to },
      reversalOfId: null,
      personId: { not: null },
    },
    select: {
      id: true, source: true, sourceId: true, buyContractId: true,
      // The amount in the currency it was paid in. `amountCents` is the
      // order's currency, and labeling it with the pay currency put a
      // dollar figure under a rupee sign wherever the two differed.
      txAmountCents: true, txCurrency: true, postedAt: true,
      person: { select: { id: true, name: true } },
      buyContract: { select: { contractType: true } },
    },
    take: 20_000,
  })

  // Reversals are excluded above by `reversalOfId: null`, which drops the
  // reversing row. The row it cancelled is dropped here, so a corrected
  // month does not appear twice on somebody's W-2.
  const reversed = await prisma.orderPosting.findMany({
    where: { companyId, kind: 'PAY', reversalOfId: { not: null } },
    select: { reversalOfId: true },
  })
  const cancelled = new Set(reversed.map((r) => r.reversalOfId))

  // ── Taxpayer identification numbers ─────────────────────────────────
  //
  // We do not hold them, deliberately. There is no column for a social
  // security or employer identification number anywhere in this schema
  // and there should not be: a TIN is the single most damaging field a
  // staffing platform could leak, it is needed only at the moment of
  // filing, and the bureau collects it on a W-9 as part of the job it is
  // already paid for.
  //
  // So every reportable payee reads as "the bureau needs a number we do
  // not hold", which is true. It is stated at the top of the response
  // rather than left to look like a data-quality problem.
  // The id is selected now: without it this filter matched nothing, and a
  // reversed posting stayed on somebody's W-2 beside its correction.
  const live = dropReversed(rows, cancelled)

  // The week behind each timesheet posting, from its acceptance.
  const assertionIds = live
    .filter((r) => r.source === 'TIMESHEET' && r.sourceId)
    .map((r) => r.sourceId as string)
  const assertions = assertionIds.length
    ? await prisma.workAssertion.findMany({
        where: { id: { in: assertionIds } },
        select: { id: true, timesheetId: true, hours: true },
      })
    : []
  const weekOf = new Map(assertions.map((a) => [a.id, a]))

  const datable: DatablePosting[] = live.map((r) => ({
    id: r.id,
    personId: r.person!.id,
    personName: r.person!.name,
    hasTaxId: false,
    contractType: r.buyContract?.contractType ?? 'UNKNOWN',
    amountCents: r.txAmountCents,
    currency: r.txCurrency,
    postedAt: r.postedAt,
    source: r.source,
    sourceId: r.sourceId ?? '',
    buyContractId: r.buyContractId,
    timesheetId: r.source === 'TIMESHEET' ? weekOf.get(r.sourceId ?? '')?.timesheetId ?? null : null,
    acceptedHours: r.source === 'TIMESHEET' ? Number(weekOf.get(r.sourceId ?? '')?.hours ?? 0) || null : null,
  }))

  // What each processed run paid, and the day it ran.
  const paid = await paidRunHours(companyId)
  const dated = datePaidWages(datable, paid.runs, paid.unrecorded)

  // 1099 and corp-to-corp: what the supplier's invoice receipts were paid,
  // in the year each payment was made. A 1099-NEC reports the year paid,
  // as a W-2 does. Receipts fully paid before the year are not read.
  const bills = await prisma.vendorBill.findMany({
    where: {
      companyId,
      status: { not: 'CANCELLED' },
      receivedAt: { lt: to },
      buyContract: { contractType: { in: [...RECEIPT_CONTRACT_TYPES] } },
      OR: [{ paidAt: null }, { paidAt: { gte: from } }],
    },
    select: {
      id: true, number: true, currency: true, totalCents: true, paidCents: true, paidAt: true, status: true,
      vendorCompany: { select: { id: true, name: true } },
      buyContract: {
        select: { contractType: true, candidates: { select: { person: { select: { id: true, name: true } } } } },
      },
      paymentRunItems: { select: { amountCents: true, run: { select: { status: true, paidAt: true } } } },
    },
    take: 20_000,
  })
  const receipts = receiptPayments(
    bills.map((b) => {
      const type = b.buyContract?.contractType ?? 'UNKNOWN'
      const people = b.buyContract?.candidates ?? []
      // A 1099-NEC is the person's where the line pays one person; a
      // corporation is the payee on a corp-to-corp line.
      const payee = type === 'IND_1099' && people.length === 1
        ? { id: people[0].person.id, name: people[0].person.name }
        : { id: `company:${b.vendorCompany.id}`, name: b.vendorCompany.name }
      return {
        id: b.id, number: b.number, contractType: type,
        payeeId: payee.id, payeeName: payee.name, currency: b.currency,
        totalCents: b.totalCents, paidCents: b.paidCents, paidAt: b.paidAt, status: b.status,
        runPayments: b.paymentRunItems
          .filter((i) => i.run.status === 'PAID' && i.run.paidAt)
          .map((i) => ({ amountCents: i.amountCents, paidAt: i.run.paidAt! })),
      }
    })
  )

  const postings = [...dated.postings, ...receipts.postings]

  // What the runs themselves paid each W-2 worker in the year, dated by
  // the pay day each run settled (paidOnDay), from the runs' own lines.
  // Where it is more than the wage postings hold, the W-2 figure is
  // blanked with a sentence rather than shown short (blankShortWages).
  const runContractIds = [...new Set(paid.runs.map((r) => r.buyContractId))]
  const runLines = runContractIds.length
    ? await prisma.buyContract.findMany({
        where: { id: { in: runContractIds }, companyId, contractType: { in: [...WAGE_CONTRACT_TYPES] } },
        select: {
          id: true, payCurrency: true,
          buyCycles: { where: { kind: 'SALARY_PAY' }, select: { dueOn: true, completedAt: true } },
        },
      })
    : []
  const lineOf = new Map(runLines.map((l) => [l.id, l]))
  const runPeople = await prisma.person.findMany({
    where: { id: { in: [...new Set(paid.runs.map((r) => r.personId))] } },
    select: { id: true, name: true },
  })
  const nameOf = new Map(runPeople.map((p) => [p.id, p.name]))
  const byPerson = new Map<string, RunPaidTotal>()
  for (const r of paid.runs) {
    const line = lineOf.get(r.buyContractId)
    if (!line || r.paidCents == null) continue
    const on = paidOnDay(r.paidAt, line.buyCycles)
    if (Number(on.slice(0, 4)) !== year) continue
    const currency = r.currency ?? line.payCurrency
    const k = `${r.personId}|${currency}`
    const t = byPerson.get(k) ?? { personId: r.personId, personName: nameOf.get(r.personId) ?? 'Somebody', currency, paidCents: 0 }
    t.paidCents += r.paidCents
    byPerson.set(k, t)
  }
  const { pack, short: wagesShort } = blankShortWages(yearEndPack(postings, year), [...byPerson.values()])

  // Wages accepted and not yet paid, and wages whose paid day cannot be
  // known, are in no year. Said, never dropped silently.
  const aside = (list: typeof dated.unpaid, what: string) => {
    if (list.length === 0) return null
    const people = [...new Set(list.map((l) => l.personName))]
    const currencies = [...new Set(list.map((l) => l.currency))]
    const sum = currencies.length === 1
      ? ` (${(list.reduce((n, l) => n + l.amountCents, 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencies[0]})`
      : ''
    return `${people.length} ${people.length === 1 ? 'person has' : 'people have'} ${what}${sum}: ${people.slice(0, 5).join(', ')}${people.length > 5 ? ', and others' : ''}.`
  }
  const unpaidSays = aside(dated.unpaid, 'W-2 wages accepted and not yet paid, which count in the year a run pays them')
  const undatedSays = aside(
    dated.undated,
    'W-2 wages paid by a run that recorded only a total, so the day they were paid is not known and they are in no year until somebody records it'
  )
  const receiptsWaitingSays = aside(
    receipts.waiting,
    'invoice receipts not yet paid, which count toward a 1099 in the year they are paid'
  )
  const receiptsUndatedSays = aside(
    receipts.undated,
    'invoice receipts paid in part with no payment date recorded, so that part is in no year until the payment is dated'
  )

  if (format === 'csv') {
    return new NextResponse(yearEndCsv(pack), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="etyme-year-end-${year}.csv"`,
      },
    })
  }

  // The deposit calendar for the paydays in the year. Also the bureau's
  // job — held here so a firm can tell whether the bureau is doing what
  // it is paid for, which it cannot do without knowing the dates.
  // Wages only. A payment to a corporation or a 1099 contractor carries
  // no employment tax, so it neither sets a deposit nor counts toward
  // the lookback that picks the schedule.
  const lookback = postings
    .filter((p) => p.postedAt >= from && p.postedAt < to)
    .filter((p) => (WAGE_CONTRACT_TYPES as readonly string[]).includes(p.contractType))
    .reduce((n, p) => n + Math.abs(p.amountCents), 0)
  // A rough employment-tax proxy at the published default burden. Named
  // as a proxy rather than presented as a liability figure, because the
  // real one is the bureau's and we do not hold it.
  const proxyLiability = Math.round(lookback * 0.12)
  const schedule = depositSchedule(proxyLiability)

  const holidays = await prisma.holiday.findMany({
    where: { companyId, date: { gte: from, lt: to } },
    select: { date: true },
  })

  // The pay days on the lines, not the dates hours were posted. Reading
  // postings listed a deposit for every week of hours — Mondays at one
  // firm, Saturdays at another — for workers paid once a month. A pay
  // day is a SALARY_PAY cycle: settled, it is dated the day the run paid
  // it; open, it is dated when it is due (already moved to the working
  // day before a weekend by the generator) and says it is not yet paid.
  const payCycles = await prisma.cycle.findMany({
    where: {
      kind: 'SALARY_PAY',
      buyContract: { companyId, contractType: { in: [...WAGE_CONTRACT_TYPES] } },
      OR: [
        { completedAt: { gte: from, lt: to } },
        { completedAt: null, dueOn: { gte: from, lt: to } },
      ],
    },
    select: { dueOn: true, completedAt: true, buyContract: { select: { contractType: true } } },
    take: 20_000,
  })
  const paydays = depositPayDays(
    payCycles.map((c) => ({ dueOn: c.dueOn, completedAt: c.completedAt, contractType: c.buyContract?.contractType ?? 'UNKNOWN' })),
    year,
    new Date()
  )
    .slice(-12)
    .map((d) => ({ ...depositDeadline(d.payDay, schedule.schedule, holidays.map((h) => h.date)), paid: d.paid }))

  return NextResponse.json({
    data: {
      year,
      notice: BUREAU_NOTICE,
      taxIdNote:
        'Nothing here holds a taxpayer identification number, and nothing should. A TIN is ' +
        'the single most damaging field a staffing platform could leak, it is needed only ' +
        'at the moment of filing, and the bureau collects it on a W-9 as part of the job it ' +
        'is already paid for. Every reportable payee below is therefore listed as needing ' +
        'one — that is the truth about this system, not a gap in the data.',
      pack: {
        summaries: pack.summaries,
        w2Count: pack.w2Count,
        necCount: pack.necCount,
        noForm: pack.noForm,
        blocked: pack.blocked,
        totalReportableCents: pack.totalReportableCents,
        currency: pack.currency,
        says: pack.says,
        // One line where the figure is shown.
        yearPaidSays: WAGES_YEAR_PAID,
        unpaidSays,
        undatedSays,
        receiptsWaitingSays,
        receiptsUndatedSays,
        // People the runs paid more than the wage postings hold, each with
        // the sentence saying so. Their figure is blank, never short.
        wagesShort,
      },
      deposits: {
        schedule: schedule.schedule,
        scheduleSays: schedule.says,
        proxyLiabilityCents: proxyLiability,
        proxySays:
          'The lookback figure here is wages at the published default burden, not your ' +
          'measured employment-tax liability — that number is the bureau’s and we do not ' +
          'hold it. It decides which schedule to show; it is not a liability.',
        deadlines: paydays,
        payDaysSay:
          'One date for each pay day on a W-2 line: the day a run paid it, or the day it is due ' +
          'where it is not paid yet. Payments to a corporation or a 1099 contractor are not wages ' +
          'and set no deposit.',
      },
      csvUrl: `/api/payroll/statutory?year=${year}&format=csv`,
    },
  })
}
