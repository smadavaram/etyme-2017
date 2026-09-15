import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { mayApprove, approvingOwnHours } from '@/lib/timesheet-authority'
import { prisma } from '@/lib/db'
import { completeCycle } from '@/lib/cycle-complete'
import { gates, maySign, acceptWith, type Sheet } from '@/lib/timesheet-signatures'
import { emit } from '@/lib/events'
import { notify } from '@/lib/notify'
import {
  policyOf, splitWeeks, valueOf, weekStart, weeksAwaitingDecision, saysAwaiting,
  mayDecide, mayChange, priceChoice, isTreatment, treatmentSays,
  type Decision, type Treatment,
} from '@/lib/overtime'
import { accrualFor, balanceOf, drawFor, hoursIn, type Entry } from '@/lib/time-off'

/**
 * POST /api/timesheets/:id/approve
 *
 * BUILD.md: "writes the ledger, increments payable"
 *
 * Approver approves a submitted timesheet.
 * Timesheets are on the sell side — billRate comes from the SellContract.
 *
 * ── Overtime is decided here, and nowhere else ───────────────────────
 *
 * A week over the contract's threshold used to bill at the contract's
 * multiplier on its own: a 45-hour week at $100 with a 40-hour limit
 * produced $4,750 and nobody had agreed to the $750. So hours over the
 * line now stop this route until whoever signs the week says what
 * happens to them — paid flat, paid at a premium, or banked as time off.
 *
 * The decision is written in the same transaction as the signature,
 * because a signature on a week whose money is undecided is a signature
 * on nothing, and a decision with no signature behind it is a number
 * with no author.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const { id } = await params
  const person = { id: caller.person.id, name: caller.person.name }

  const timesheet = await prisma.timesheet.findUnique({
    where: { id },
    include: {
      person: { select: { id: true, name: true } },
      sellContract: {
        select: {
          id: true, billRate: true, billCurrency: true, companyId: true,
          clientCompanyId: true, endClientCompanyId: true,
          overtimeAfterHours: true, overtimeMultiplierBps: true,
          company: { select: { name: true } },
          clientCompany: { select: { name: true } },
          endClientCompany: { select: { name: true } },
        },
      },
      // What has already been said about this sheet's overtime weeks,
      // on this leg. A sub-vendor's sheet is a different row and never
      // reads these.
      overtimeDecisions: true,
    },
  })

  if (!timesheet) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Timesheet not found' } },
      { status: 404 }
    )
  }

  // An approved timesheet is the goods receipt: the invoice, the
  // three-way match, the payment and the margin all rest on it. This
  // required nothing but a session, so any account on the platform could
  // approve any timesheet at any company.
  const parties = {
    personId: timesheet.personId,
    vendorCompanyId: timesheet.sellContract.companyId,
    clientCompanyId: timesheet.sellContract.clientCompanyId,
    endClientCompanyId: timesheet.sellContract.endClientCompanyId,
  }

  if (approvingOwnHours({ personId: caller.person.id, companyId: caller.company?.id, permissions: caller.permissions }, parties)) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Nobody approves their own hours.' } },
      { status: 403 }
    )
  }

  const allowed = mayApprove(
    { personId: caller.person.id, companyId: caller.company?.id, permissions: caller.permissions },
    parties
  )
  if (!allowed.ok) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: allowed.reason } },
      { status: 403 }
    )
  }

  if (timesheet.status !== 'SUBMITTED') {
    return NextResponse.json(
      { error: { code: 'INVALID_STATE', message: `Timesheet is ${timesheet.status}, can only approve from SUBMITTED` } },
      { status: 409 }
    )
  }

  const hours = Number(timesheet.totalHours)
  const now = new Date()

  // ── Which signature is this ─────────────────────────────────────────
  //
  // The client approves that the work happened; the employer accepts
  // what it will pay for. Different assertions, and in a forwarding
  // chain almost never the same company — so the caller's position on
  // this contract decides which one they are making.
  const body = await request.json().catch(() => ({}))
  const employer = timesheet.sellContract.companyId
  const client = timesheet.sellContract.endClientCompanyId ?? timesheet.sellContract.clientCompanyId
  const isEmployer = caller.company?.id === employer
  const isClient = caller.company?.id === client
  const direct = employer === client

  const sheet: Sheet = {
    totalHours: hours,
    clientApproved: timesheet.clientApprovedAt
      ? { at: timesheet.clientApprovedAt, byId: timesheet.clientApprovedById! }
      : null,
    employerAccepted: timesheet.employerAcceptedAt
      ? { at: timesheet.employerAcceptedAt, byId: timesheet.employerAcceptedById! }
      : null,
    acceptedHours: timesheet.acceptedHours ? Number(timesheet.acceptedHours) : null,
    acceptedNote: timesheet.acceptedNote,
    direct,
  }

  const asParty = body?.as === 'EMPLOYER' ? 'EMPLOYER' : isClient ? 'CLIENT' : 'EMPLOYER'
  const may = maySign(asParty, sheet, isClient, isEmployer)
  if (!may.ok) {
    return NextResponse.json(
      { error: { code: 'CANNOT_SIGN', message: may.reason } },
      { status: 409 }
    )
  }

  // Accepting a different number needs a reason. Somebody finding out
  // from their payslip is the fastest way to lose a good contractor.
  const accepted = acceptWith(
    hours,
    body?.acceptedHours != null ? Number(body.acceptedHours) : null,
    typeof body?.note === 'string' ? body.note : null
  )
  if (!accepted.ok) {
    return NextResponse.json(
      { error: { code: 'NEEDS_REASON', message: accepted.reason, field: 'note' } },
      { status: 422 }
    )
  }

  // ── What happens to the hours over the line ─────────────────────────
  //
  // Everything from here to the transaction is refusal, not writing.
  // Nothing about this sheet moves until the weeks that went over the
  // threshold have an answer each, from somebody entitled to give one.

  const policy = policyOf(timesheet.sellContract)
  const leaveDays = (timesheet.leaveDays as Record<string, number>) ?? {}
  const priorDecisions: Decision[] = timesheet.overtimeDecisions.map((d) => ({
    weekOf: d.weekOf.toISOString().slice(0, 10),
    treatment: d.treatment as Treatment,
    appliedBps: d.appliedBps,
    overtimeHours: Number(d.overtimeHours),
    accrualBps: d.accrualBps,
  }))

  /** What the caller answered this time, one per week. */
  const answers = new Map<string, { treatment: Treatment; multiplierBps: number | null; reason: string | null }>()
  const rawAnswers = Array.isArray(body?.overtime) ? body.overtime : []
  for (const a of rawAnswers) {
    if (!a || typeof a.weekOf !== 'string' || !isTreatment(a.treatment)) continue
    answers.set(weekStart(a.weekOf), {
      treatment: a.treatment,
      multiplierBps: a.multiplierBps == null ? null : Number(a.multiplierBps),
      reason: typeof a.reason === 'string' ? a.reason : null,
    })
  }

  // The split as it stands: prior decisions applied, this call's answers
  // not yet. A prior decision whose week has since been amended is stale
  // and reads as undecided, which is what makes an amendment ask again.
  const standing = splitWeeks((timesheet.days as Record<string, number>) ?? {}, policy, {
    leaveDays,
    decisions: priorDecisions,
  })

  const awaiting = weeksAwaitingDecision(standing)
  const unanswered = awaiting.filter((w) => !answers.has(w.weekOf))
  if (unanswered.length > 0) {
    return NextResponse.json(
      {
        error: {
          code: 'OVERTIME_UNDECIDED',
          message: saysAwaiting(unanswered, timesheet.person.name, policy),
          // Enough for the screen to ask the question without a second
          // round trip: the week, the hours, and what it would cost.
          weeks: unanswered.map((w) => ({
            weekOf: w.weekOf,
            workedHours: w.workedHours,
            overtimeHours: w.pendingHours,
            afterHours: policy.afterHours,
            multiplierBps: policy.multiplierBps,
            rateCents: timesheet.sellContract.billRate,
          })),
        },
      },
      { status: 422 }
    )
  }

  // ── Every answer given is checked before any of them is written ─────

  interface Writing {
    weekOf: string
    treatment: Treatment
    appliedBps: number
    accrualBps: number
    overtimeHours: number
    reason: string | null
    priorId: string | null
    priorWas: { treatment: string; appliedBps: number; overtimeHours: number } | null
  }
  const writing: Writing[] = []

  for (const [weekOf, answer] of answers) {
    const week = standing.weeks.find((w) => w.weekOf === weekOf)
    if (!week || week.overHours <= 0) {
      // Answering a week that is not over the line is not an error worth
      // refusing a signature for; there is simply nothing to decide.
      continue
    }

    const may = mayDecide(
      { personId: caller.person.id, companyId: caller.company?.id },
      {
        personId: timesheet.personId,
        employerCompanyId: timesheet.sellContract.companyId,
        clientCompanyId: timesheet.sellContract.clientCompanyId,
        endClientCompanyId: timesheet.sellContract.endClientCompanyId,
        clientName:
          timesheet.sellContract.endClientCompany?.name ?? timesheet.sellContract.clientCompany?.name,
        employerName: timesheet.sellContract.company?.name,
      }
    )
    if (!may.ok) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: may.says } }, { status: 403 })
    }

    const prior = timesheet.overtimeDecisions.find(
      (d) => d.weekOf.toISOString().slice(0, 10) === weekOf
    )
    // Once a week has been billed, what was decided about it is history.
    const changeable = mayChange(prior)
    if (prior && !changeable.ok) {
      const same =
        prior.treatment === answer.treatment &&
        Number(prior.overtimeHours) === week.overHours &&
        (answer.multiplierBps == null || prior.appliedBps === answer.multiplierBps)
      if (!same) {
        return NextResponse.json(
          { error: { code: 'ALREADY_BILLED', message: changeable.says } },
          { status: 409 }
        )
      }
      continue
    }

    const priced = priceChoice(
      { treatment: answer.treatment, multiplierBps: answer.multiplierBps, reason: answer.reason },
      policy
    )
    if (!priced.ok) {
      return NextResponse.json(
        { error: { code: 'NEEDS_REASON', message: priced.says, field: 'reason', weekOf } },
        { status: 422 }
      )
    }

    writing.push({
      weekOf,
      treatment: answer.treatment,
      appliedBps: priced.appliedBps,
      accrualBps: priced.accrualBps,
      // The hours as they are now, not as they were when somebody last
      // looked. This snapshot is what makes an amended sheet ask again.
      overtimeHours: week.overHours,
      reason: answer.reason,
      priorId: prior?.id ?? null,
      priorWas: prior
        ? { treatment: prior.treatment, appliedBps: prior.appliedBps, overtimeHours: Number(prior.overtimeHours) }
        : null,
    })
  }

  // ── What the week is actually worth, once the answers are in ────────
  //
  // Priced from each decision's own `appliedBps`, never from the
  // contract's multiplier, and with nothing undecided in it. A sheet
  // that still holds pending hours never reaches here — the refusal
  // above returned long ago — so this figure is always one somebody
  // agreed to.
  const settled: Decision[] = [
    ...priorDecisions.filter((d) => !writing.some((w) => w.weekOf === d.weekOf)),
    ...writing.map((w) => ({
      weekOf: w.weekOf,
      treatment: w.treatment,
      appliedBps: w.appliedBps,
      overtimeHours: w.overtimeHours,
      accrualBps: w.accrualBps,
    })),
  ]
  const finalSplit = splitWeeks((timesheet.days as Record<string, number>) ?? {}, policy, {
    leaveDays,
    decisions: settled,
  })
  const value = valueOf(finalSplit, timesheet.sellContract.billRate)
  const billAmount = value.totalCents / 100

  // On a direct placement the two parties are one company, so one press
  // signs both — and the record still carries two signatures, which is
  // why the invoice engine cannot tell a direct sheet from one approved
  // three companies away.
  const signatures: Record<string, unknown> = direct
    ? {
        clientApprovedById: person.id, clientApprovedAt: now,
        employerAcceptedById: person.id, employerAcceptedAt: now,
      }
    : asParty === 'CLIENT'
      ? { clientApprovedById: person.id, clientApprovedAt: now }
      : {
          employerAcceptedById: person.id, employerAcceptedAt: now,
          acceptedHours: accepted.hours, acceptedNote: body?.note ?? null,
        }

  const after: Sheet = {
    ...sheet,
    clientApproved: signatures.clientApprovedAt
      ? { at: now, byId: person.id }
      : sheet.clientApproved,
    employerAccepted: signatures.employerAcceptedAt
      ? { at: now, byId: person.id }
      : sheet.employerAccepted,
    acceptedHours: (signatures.acceptedHours as number | null) ?? sheet.acceptedHours,
  }

  const g = gates(after, {
    client: timesheet.sellContract.clientCompanyId,
    employer: timesheet.sellContract.companyId,
  })

  // The ledger is the record now. The columns below stay in step so the
  // two-party history still reads, but nothing derives from them.
  const assertion = await prisma.workAssertion.create({
    data: {
      timesheetId: id,
      companyId: caller.company!.id,
      role: direct
        ? asParty === 'CLIENT' ? 'CLIENT_APPROVAL' : 'EMPLOYER_ACCEPTANCE'
        : asParty === 'CLIENT' ? 'CLIENT_APPROVAL' : 'EMPLOYER_ACCEPTANCE',
      hours: accepted.hours ?? hours,
      rateCents: timesheet.sellContract.billRate,
      state: 'LIVE',
      byId: person.id,
      auto: false,
      note: typeof body?.note === 'string' ? body.note : null,
    },
  }).then(
    (row) => row,
    () => {
      // A second assertion from the same party is refused by the ledger
      // rules, not by a crash here. The column update below still runs so
      // the two records do not drift apart on a retry.
      return null
    }
  )

  // On a direct placement one press is both parties, so the ledger needs
  // both rows — otherwise billing sees an approval and payroll sees
  // nothing, on a placement where they are the same company.
  if (direct) {
    await prisma.workAssertion.create({
      data: {
        timesheetId: id,
        companyId: caller.company!.id,
        role: 'EMPLOYER_ACCEPTANCE',
        hours: accepted.hours ?? hours,
        rateCents: timesheet.sellContract.billRate,
        state: 'LIVE',
        byId: person.id,
        auto: false,
        note: null,
      },
    }).catch(() => {})
  }

  // ── The signature, the decision and the bank, together or not at all ──
  //
  // One transaction. A decision written without the signature it was
  // made alongside is a number with no author; a signature written
  // without the decision is a week whose money is still an open
  // question. Either both land or neither does.
  //
  // The bank of banked hours is the employer's books on this leg — the
  // company that employs and pays the consultant. A person's bank at one
  // supplier is not their bank at another, so nothing here aggregates
  // across firms the way tenure does.
  const bankCompanyId = timesheet.sellContract.companyId
  const leaveAsked = hoursIn(leaveDays)
  const touchesBank = leaveAsked > 0 || writing.some((w) => w.treatment === 'TIME_OFF' || w.priorWas?.treatment === 'TIME_OFF')

  /** A refusal raised inside the transaction, so nothing half-lands. */
  class Refusal extends Error {
    constructor(public says: string) { super(says) }
  }

  let bankedNow = 0
  let drewNow = 0

  try {
    await prisma.$transaction(async (tx) => {
      await tx.timesheet.update({
        where: { id },
        data: {
          // APPROVED only once both are in. A sheet with one signature is
          // half done, and calling it approved is what let a prime bill on
          // a signature it never collected.
          status: g.mayInvoice && g.mayPay ? 'APPROVED' : 'SUBMITTED',
          ...signatures,
          // The old single field, kept in step so anything still reading it
          // sees the client's approval rather than nothing.
          ...(signatures.clientApprovedAt ? { approvedById: person.id, approvedAt: now } : {}),
        },
      })

      await tx.automationLog.create({
        data: {
          companyId: timesheet.sellContract.companyId,
          action: 'TIMESHEET_APPROVED',
          // Says what is billable, which is no longer hours × rate: an
          // hour over the line is worth what somebody decided it was
          // worth, and an undecided hour is worth nothing yet.
          summary:
            `Timesheet approved: ${hours}h filed, ` +
            `${finalSplit.regularHours + finalSplit.leaveHours + finalSplit.overtimeHours}h billable ` +
            `at $${(timesheet.sellContract.billRate / 100).toFixed(2)}/hr = $${billAmount.toFixed(2)}` +
            (finalSplit.bankedHours > 0 ? `, ${finalSplit.bankedHours}h banked as time off` : '') +
            (finalSplit.pendingHours > 0 ? `, ${finalSplit.pendingHours}h still undecided` : ''),
          reason: `Approved by ${person.name} — ${allowed.reason}`,
          payload: {
            timesheetId: id,
            hours,
            billRate: timesheet.sellContract.billRate,
            billAmount,
            billableHours: finalSplit.regularHours + finalSplit.leaveHours + finalSplit.overtimeHours,
            bankedHours: finalSplit.bankedHours,
          },
          reversible: true,
        },
      })

      if (writing.length === 0 && !touchesBank) return

      // ── The lock ──────────────────────────────────────────────────────
      //
      // Two sheets approved in the same second read the same balance and
      // both pass, and the bank goes negative. READ COMMITTED allows it,
      // so the person's rows are locked for the rest of this transaction
      // before anything is read off them.
      if (touchesBank) {
        await tx.$queryRaw`SELECT id FROM "TimeOffEntry" WHERE "personId" = ${timesheet.personId} AND "companyId" = ${bankCompanyId} FOR UPDATE`
      }

      const ledger = touchesBank
        ? await tx.timeOffEntry.findMany({
            where: { personId: timesheet.personId, companyId: bankCompanyId },
            select: { id: true, kind: true, hours: true, effectiveOn: true, decisionId: true, drawnByTimesheetId: true },
          })
        : []

      const balanceNow = balanceOf(
        ledger.map((e) => ({ kind: e.kind as Entry['kind'], hours: Number(e.hours), effectiveOn: e.effectiveOn })),
        now
      )

      // What this sheet's decisions would add to or take out of the bank,
      // net of whatever they banked last time round.
      let delta = 0
      for (const w of writing) {
        const fresh = accrualFor({ treatment: w.treatment, overtimeHours: w.overtimeHours, accrualBps: w.accrualBps })
        const before = w.priorId ? ledger.find((e) => e.decisionId === w.priorId) : undefined
        delta += fresh - (before ? Number(before.hours) : 0)
      }

      const alreadyDrawn = ledger
        .filter((e) => e.kind === 'DRAW' && e.drawnByTimesheetId === id)
        .reduce((n, e) => n + -Number(e.hours), 0)

      const draw = drawFor({
        personName: timesheet.person.name,
        leaveDays,
        balanceHours: balanceNow + delta,
        alreadyDrawnHours: alreadyDrawn,
      })
      if (!draw.ok) throw new Refusal(draw.says)

      if (balanceNow + delta - draw.hours < 0) {
        throw new Refusal(
          `${timesheet.person.name} has already taken time off that these hours paid for, so this ` +
            'week cannot be changed now. Adjust the bank first, then decide the week again.'
        )
      }

      // ── The decisions ─────────────────────────────────────────────────
      for (const w of writing) {
        const data = {
          treatment: w.treatment,
          overtimeHours: w.overtimeHours,
          afterHours: policy.afterHours ?? 0,
          multiplierBps: policy.multiplierBps,
          appliedBps: w.appliedBps,
          accrualBps: w.accrualBps,
          decidedById: person.id,
          decidedByCompanyId: caller.company!.id,
          decidedAt: now,
          reason: w.reason,
        }

        const row = await tx.overtimeDecision.upsert({
          where: { timesheetId_sellContractId_weekOf: {
            timesheetId: id,
            sellContractId: timesheet.sellContractId,
            weekOf: new Date(`${w.weekOf}T00:00:00.000Z`),
          } },
          create: {
            timesheetId: id,
            sellContractId: timesheet.sellContractId,
            weekOf: new Date(`${w.weekOf}T00:00:00.000Z`),
            // One signature cannot stand alongside two weeks — the column
            // is unique — so it is linked only where this call decided a
            // single week.
            workAssertionId: writing.length === 1 ? assertion?.id ?? null : null,
            ...data,
          },
          update: data,
          select: { id: true },
        })

        // ── The bank, once per decision, ever ───────────────────────────
        //
        // Keyed on the decision, which is unique on the entry: approval
        // running twice — a retry, a second signature, a re-approval
        // after an amendment — cannot bank the same week twice.
        const hoursBanked = accrualFor({ treatment: w.treatment, overtimeHours: w.overtimeHours, accrualBps: w.accrualBps })
        const existing = ledger.find((e) => e.decisionId === row.id)
        if (hoursBanked > 0 || existing) {
          await tx.timeOffEntry.upsert({
            where: { decisionId: row.id },
            create: {
              personId: timesheet.personId,
              companyId: bankCompanyId,
              sellContractId: timesheet.sellContractId,
              kind: 'ACCRUAL',
              hours: hoursBanked,
              decisionId: row.id,
              effectiveOn: new Date(`${w.weekOf}T00:00:00.000Z`),
              byId: person.id,
              reason: w.reason ?? `Overtime in the week of ${w.weekOf} banked as time off`,
            },
            update: { hours: hoursBanked },
          })
          bankedNow += hoursBanked - (existing ? Number(existing.hours) : 0)
        }
      }

      // ── The leave this sheet takes back out ───────────────────────────
      if (draw.hours > 0) {
        await tx.timeOffEntry.create({
          data: {
            personId: timesheet.personId,
            companyId: bankCompanyId,
            sellContractId: timesheet.sellContractId,
            kind: 'DRAW',
            hours: -draw.hours,
            drawnByTimesheetId: id,
            effectiveOn: timesheet.periodStart,
            byId: person.id,
            reason: `Paid time off taken in ${timesheet.periodStart.toISOString().slice(0, 10)} – ${timesheet.periodEnd.toISOString().slice(0, 10)}`,
          },
        })
        drewNow = draw.hours
      }
    })
  } catch (err) {
    if (err instanceof Refusal) {
      return NextResponse.json(
        { error: { code: 'TIME_OFF_SHORT', message: err.says } },
        { status: 409 }
      )
    }
    throw err
  }

  // Both signatures in: the "hours to approve" cycle for this week is done.
  if (g.mayInvoice && g.mayPay) {
    await completeCycle(prisma, {
      sellContractId: timesheet.sellContractId,
      kind: 'TIMESHEET_APPROVE',
      periodEnd: timesheet.periodEnd,
    })
  }

  // The goods receipt. Everything downstream — the match, the invoice,
  // the payment — dates from this moment, so it is the event an ERP
  // integration cares about most.
  void emit({
    type: 'timesheet.approved',
    companyId: timesheet.sellContract.companyId,
    subjectType: 'Timesheet',
    subjectId: id,
    actorPersonId: person?.id ?? null,
    payload: {
      personId: timesheet.personId,
      sellContractId: timesheet.sellContractId,
      hours,
      billRateCents: timesheet.sellContract.billRate,
      billAmount,
      // ── The audit trail for the overtime answer ──────────────────────
      //
      // What was decided, and what it replaced. A decision that can be
      // changed without trace is not a decision, and the prior answer is
      // the thing a reader in four months will want and cannot get from
      // the row, which now holds only the latest one.
      overtime: writing.map((w) => ({
        weekOf: w.weekOf,
        treatment: w.treatment,
        appliedBps: w.appliedBps,
        overtimeHours: w.overtimeHours,
        reason: w.reason,
        replaced: w.priorWas,
      })),
      billableHours: finalSplit.regularHours + finalSplit.leaveHours + finalSplit.overtimeHours,
      bankedHours: finalSplit.bankedHours,
      leaveHours: finalSplit.leaveHours,
    },
  })

  // Notify the timesheet owner that their timesheet was approved
  notify({
    personId: timesheet.personId,
    companyId: timesheet.sellContract.companyId,
    type: 'TIMESHEET',
    title: 'Timesheet approved',
    // Hours, not the amount billed. What the client is charged is the
    // vendor's number, and Addendum D makes disclosing it a per-requirement
    // decision the vendor takes — not something a notification does for
    // them.
    body: `Your timesheet for ${timesheet.periodStart.toISOString().slice(0, 10)} – ${timesheet.periodEnd.toISOString().slice(0, 10)} (${hours}h) was approved`,
    entityId: id,
    data: { hours, approvedBy: person.name },
  })

  // Hours going into the bank instead of onto the invoice are the
  // consultant's money changing shape, so they hear it in their own
  // words rather than finding out from a balance.
  if (bankedNow > 0 || drewNow > 0) {
    const lines: string[] = []
    if (bankedNow > 0) lines.push(`${bankedNow}h of overtime went into your time-off bank`)
    if (drewNow > 0) lines.push(`${drewNow}h of paid time off was taken from it`)
    notify({
      personId: timesheet.personId,
      companyId: timesheet.sellContract.companyId,
      type: 'TIMESHEET',
      title: 'Your time-off bank changed',
      body: `${lines.join(', and ')} for ${timesheet.periodStart.toISOString().slice(0, 10)} – ${timesheet.periodEnd.toISOString().slice(0, 10)}.`,
      entityId: id,
      data: { bankedHours: bankedNow, drawnHours: drewNow },
    })
  }

  return NextResponse.json({
    data: {
      id,
      status: g.mayInvoice && g.mayPay ? 'APPROVED' : 'SUBMITTED',
      totalHours: hours,
      billAmount,
      approvedBy: person.name,
      overtime: writing.map((w) => ({
        weekOf: w.weekOf,
        hours: w.overtimeHours,
        says: treatmentSays(w.treatment, w.appliedBps),
      })),
      bankedHours: bankedNow,
      message:
        writing.length > 0
          ? `Approved ${hours}h — $${billAmount.toFixed(2)} billable. ` +
            writing.map((w) => `${w.overtimeHours}h over: ${treatmentSays(w.treatment, w.appliedBps).toLowerCase()}`).join('; ') + '.'
          : `Approved ${hours}h — $${billAmount.toFixed(2)} billable`,
    },
  })
}
