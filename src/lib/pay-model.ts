/**
 * What a consultant is actually paid, and the working behind it.
 *
 * ── The dimension the spreadsheet did not have ───────────────────────
 *
 * The 2019 sheet had two columns, rate/hr and salary/hr, and treated the
 * second as a negotiated number. Its own figures say otherwise:
 *
 *     60 / 45      75%          68 / 54.40   80%
 *     62 / 46.50   75%          60 / 48      80%
 *     67 / 50.25   75%          88.50 / 88.50 100%
 *
 * Those are not rates anybody negotiated. They are profit shares wearing
 * an hourly disguise, and because nothing recorded that, three things
 * were invisible:
 *
 *   · who absorbs a green card filing — a consultant on a share of the
 *     deal takes that hit, a consultant on a fixed wage does not;
 *   · why a person's pay moved when the bill rate moved;
 *   · whether the consultant could check their own pay at all.
 *
 * ── Four shapes, per person ──────────────────────────────────────────
 *
 * They vary inside one firm, so the model lives on the person's contract.
 * Every result carries its own arithmetic in plain English, because a
 * consultant paid a percentage of a number has to be able to follow it —
 * and because a pay figure nobody can explain is one somebody argues with.
 */

export type PayModel =
  | 'FIXED_HOURLY'
  | 'SHARE_OF_BILL'
  | 'SHARE_OF_MARGIN'
  | 'SHARE_OF_BILL_LESS_COSTS'

export interface PayInput {
  model: PayModel
  /** Basis points of whatever the model takes a share of. 7500 = 75%. */
  shareBps?: number | null
  /** Agreed cents per hour, for a fixed-rate consultant. */
  fixedRateCents?: number | null
  hours: number
  /** What the client is billed per hour. */
  billRateCents: number
  /** Employer taxes and the rest, in cents for this period. */
  burdenCents?: number
  /**
   * Costs this person caused — an H1B filing, a green card, their own
   * insurance — in cents for this period.
   */
  personalCostCents?: number
  /** Anything the firm spends on the deal that is not about this person. */
  otherCostCents?: number
}

export interface Pay {
  /** What they are owed for this period, in cents. Never negative. */
  payCents: number
  /** Their effective rate per hour, for comparison with the sheet. */
  effectiveRateCents: number
  /** True where a personal cost came out of their money rather than ours. */
  absorbsOwnCosts: boolean
  /** The personal costs actually deducted from their pay. */
  deductedCents: number
  /** The same costs where the firm carried them instead. */
  firmCarriedCents: number
  /**
   * True where this person's pay is a percentage of the bill rate, and so
   * they are entitled to see it.
   */
  mustSeeBillRate: boolean
  /** Line by line, the way a payslip runs gross to net. */
  working: string[]
  says: string
}

/** Who takes the hit on an immigration filing. Follows from the model. */
export function absorbsOwnCosts(model: PayModel): boolean {
  // A consultant on a share of the deal is a partner in it, so a cost
  // caused by them comes out of the deal. A consultant on a wage is not,
  // and the firm carries it. This was told to us as one sentence and it
  // is the whole rule.
  return model !== 'FIXED_HOURLY'
}

/**
 * Whether this person may see the bill rate their pay is worked out from.
 *
 * Their own, and only their own. If somebody's pay is a percentage of a
 * number they cannot see, they are taking it on trust, and that is the
 * thing consultants leave over. It is not a setting, because a hidden
 * basis on a share deal is not a preference.
 */
export function mustSeeBillRate(model: PayModel): boolean {
  return model !== 'FIXED_HOURLY'
}

export function payFor(i: PayInput): Pay {
  const hours = Math.max(0, i.hours)
  const gross = Math.round(hours * i.billRateCents)
  const burden = Math.max(0, i.burdenCents ?? 0)
  const personal = Math.max(0, i.personalCostCents ?? 0)
  const other = Math.max(0, i.otherCostCents ?? 0)
  const share = (i.shareBps ?? 0) / 10_000
  const absorbs = absorbsOwnCosts(i.model)

  const working: string[] = []
  let pay = 0
  let deducted = 0

  switch (i.model) {
    case 'FIXED_HOURLY': {
      const rate = i.fixedRateCents ?? 0
      pay = Math.round(hours * rate)
      working.push(`${hours} hours at ${money(rate)} an hour — ${money(pay)}.`)
      break
    }

    case 'SHARE_OF_BILL': {
      pay = Math.round(gross * share)
      working.push(`Client billed ${money(gross)} for ${hours} hours at ${money(i.billRateCents)}.`)
      working.push(`Your share is ${bps(i.shareBps)} of that — ${money(pay)}.`)
      break
    }

    case 'SHARE_OF_BILL_LESS_COSTS': {
      const beforeCosts = Math.round(gross * share)
      // Never below zero. A month where a filing fee exceeds the share
      // leaves nothing to pay, not a debt collected from a payslip.
      deducted = Math.min(personal, beforeCosts)
      pay = beforeCosts - deducted
      working.push(`Client billed ${money(gross)} for ${hours} hours at ${money(i.billRateCents)}.`)
      working.push(`Your share is ${bps(i.shareBps)} of that — ${money(beforeCosts)}.`)
      if (personal > 0) {
        working.push(`Less ${money(deducted)} of your own costs — ${money(pay)}.`)
      }
      if (personal > beforeCosts) {
        working.push(
          `${money(personal - beforeCosts)} of costs could not come out of this period. ` +
            `It carries to the next one rather than being taken from a payslip.`
        )
      }
      break
    }

    case 'SHARE_OF_MARGIN': {
      const left = gross - burden - personal - other
      const beforeFloor = Math.round(left * share)
      pay = Math.max(0, beforeFloor)
      deducted = personal
      working.push(`Client billed ${money(gross)} for ${hours} hours at ${money(i.billRateCents)}.`)
      if (burden > 0) working.push(`Less ${money(burden)} of employer costs.`)
      if (personal > 0) working.push(`Less ${money(personal)} of your own costs.`)
      if (other > 0) working.push(`Less ${money(other)} of other costs on the deal.`)
      working.push(`Leaves ${money(left)}. Your share is ${bps(i.shareBps)} — ${money(pay)}.`)
      break
    }
  }

  const effective = hours > 0 ? Math.round(pay / hours) : 0

  return {
    payCents: pay,
    effectiveRateCents: effective,
    absorbsOwnCosts: absorbs,
    deductedCents: absorbs ? deducted : 0,
    firmCarriedCents: absorbs ? Math.max(0, personal - deducted) : personal,
    mustSeeBillRate: mustSeeBillRate(i.model),
    working,
    says:
      hours === 0
        ? 'No hours in this period, so nothing is owed for it.'
        : `${money(pay)} for ${hours} hours — ${money(effective)} an hour.`,
  }
}

/**
 * Reads a rate pair the way the old sheet wrote it, and says whether it
 * looks like a share rather than a rate.
 *
 * Not a migration tool. It exists so that when a firm pastes in its own
 * spreadsheet, the ones that are really profit shares can be offered as
 * such rather than frozen into a fixed rate that will be wrong the moment
 * the client's rate changes.
 */
export function looksLikeShare(
  billRateCents: number,
  payRateCents: number
): { share: boolean; bps: number; says: string } | null {
  if (billRateCents <= 0 || payRateCents <= 0) return null

  const ratio = payRateCents / billRateCents
  const asBps = Math.round(ratio * 10_000)

  // Round percentages, and the round ones people actually use. A ratio of
  // 0.7534 is a rate; 0.7500 is a deal.
  const round = asBps % 250 === 0 && asBps >= 5_000 && asBps <= 10_000
  if (!round) return null

  return {
    share: true,
    bps: asBps,
    says:
      `${money(payRateCents)} is exactly ${bps(asBps)} of ${money(billRateCents)}. ` +
      `That reads as a profit share rather than an agreed rate. If it is, say so — ` +
      `their pay then follows the bill rate instead of being retyped every time it moves.`,
  }
}

function bps(b: number | null | undefined): string {
  const n = (b ?? 0) / 100
  return `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}%`
}

function money(cents: number): string {
  const n = Math.abs(cents) / 100
  return `${cents < 0 ? '-' : ''}$${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

// ═════════════════════════════════════════════════════════════════════
// THE CARRY — a promise the calculator made and nothing kept
// ═════════════════════════════════════════════════════════════════════
//
// `payFor` on a SHARE_OF_BILL_LESS_COSTS model already says the right
// thing when a filing fee is bigger than the month's share:
//
//   "$2,400.00 of costs could not come out of this period. It carries to
//    the next one rather than being taken from a payslip."
//
// It was a sentence and nothing else. No period ever read it, the next
// month's calculation started from zero, and the firm quietly absorbed a
// cost the contract says the consultant carries. A promise in a string is
// not a feature.
//
// ── Why it is replayed and not stored ────────────────────────────────
//
// The obvious fix is a `carriedForwardCents` column on the contract,
// updated every run. It is the wrong fix. A stored running total and the
// postings behind it disagree the first time a run is retried, a
// timesheet is reversed, or a cost is posted late — and when they
// disagree, the number somebody argues with is the consultant's payslip.
//
// So the carry is derived: given the periods in order, replay them. The
// same inputs give the same answer every time, a period inserted late
// changes every period after it exactly as it should, and there is no
// second copy of the truth to drift.

export interface CarryPeriod {
  /** A label somebody recognises — "2026-07". */
  label: string
  /** The period the money belongs to. Used for ordering and for posting. */
  periodStart: Date
  hours: number
  billRateCents: number
  /** Basis points of the bill they take. */
  shareBps: number
  /** Their own costs incurred in THIS period — a filing, an insurance. */
  personalCostCents: number
}

export interface CarriedPeriod {
  label: string
  periodStart: Date
  /** Their share of the bill before anything is recovered. */
  shareCents: number
  /** Costs brought forward from earlier periods. */
  carriedInCents: number
  /** Costs newly incurred in this period. */
  newCostCents: number
  /** Taken out of this period's share. */
  recoveredCents: number
  /** What they are actually paid. Never negative. */
  payCents: number
  /** Still owed by them going into the next period. */
  carriedOutCents: number
  working: string[]
  says: string
}

export interface CarryLedger {
  periods: CarriedPeriod[]
  /** What is still carried after the last period. */
  outstandingCents: number
  /** Everything ever recovered, across the run. */
  recoveredCents: number
  says: string
}

/**
 * Every period in order, with the carry applied.
 *
 * Periods are sorted by the date the money belongs to, not the order they
 * were handed in. A March timesheet approved in May is March's, and a
 * carry that recovered itself out of May's share when it should have
 * recovered out of April's is a payslip somebody will query.
 */
export function carryLedger(periods: CarryPeriod[]): CarryLedger {
  const ordered = [...periods].sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime())

  let carriedIn = 0
  let recoveredTotal = 0
  const out: CarriedPeriod[] = []

  for (const p of ordered) {
    const hours = Math.max(0, p.hours)
    const gross = Math.round(hours * p.billRateCents)
    const share = Math.round(gross * (p.shareBps / 10_000))
    const newCost = Math.max(0, p.personalCostCents)
    const owedByThem = carriedIn + newCost

    // Never below zero. A month where the costs exceed the share leaves
    // nothing to pay, not a debt collected from a payslip.
    const recovered = Math.min(share, owedByThem)
    const pay = share - recovered
    const carriedOut = owedByThem - recovered

    const working: string[] = [
      `Client billed ${money(gross)} for ${hours} hours at ${money(p.billRateCents)}.`,
      `Your share is ${bps(p.shareBps)} of that — ${money(share)}.`,
    ]
    if (carriedIn > 0) {
      working.push(`${money(carriedIn)} of your own costs carried in from earlier periods.`)
    }
    if (newCost > 0) {
      working.push(`${money(newCost)} of your own costs this period.`)
    }
    if (recovered > 0) {
      working.push(`Less ${money(recovered)} recovered from this period — ${money(pay)}.`)
    }
    if (carriedOut > 0) {
      working.push(
        `${money(carriedOut)} could not come out of this period. It carries to the next ` +
          `one rather than being taken from a payslip.`
      )
    }

    out.push({
      label: p.label,
      periodStart: p.periodStart,
      shareCents: share,
      carriedInCents: carriedIn,
      newCostCents: newCost,
      recoveredCents: recovered,
      payCents: pay,
      carriedOutCents: carriedOut,
      working,
      says:
        carriedOut > 0
          ? `${money(pay)} paid, ${money(carriedOut)} of your costs still to recover.`
          : recovered > 0
            ? `${money(pay)} paid after ${money(recovered)} of your own costs.`
            : `${money(pay)} paid.`,
    })

    recoveredTotal += recovered
    carriedIn = carriedOut
  }

  return {
    periods: out,
    outstandingCents: carriedIn,
    recoveredCents: recoveredTotal,
    says:
      out.length === 0
        ? 'No periods to replay.'
        : carriedIn > 0
          ? `${money(carriedIn)} of their own costs is still carried after ` +
            `${out.length} period${out.length === 1 ? '' : 's'}. It comes out of the next ` +
            `share that is big enough, and never out of a payslip.`
          : `Everything they owed has been recovered across ` +
            `${out.length} period${out.length === 1 ? '' : 's'}. Nothing carried.`,
  }
}

// ── Off cycle ─────────────────────────────────────────────────────────
//
// A payment outside the run. It happens: somebody was missed, a rate
// amendment landed after the cut-off, a person is leaving on the 12th and
// will not wait until the 30th.
//
// Two things make it safe. It carries a reason, because a payment outside
// the normal process is the one somebody will ask about in an audit. And
// it posts to the PERIOD IT BELONGS TO rather than the day it was made —
// a March underpayment corrected in June is March's cost, and dating it
// June moves margin between two months for no reason and hides the
// original error in both.

export type OffCycleReason =
  | 'MISSED_FROM_RUN'
  | 'CORRECTION_UNDERPAID'
  | 'RATE_AMENDMENT_LATE'
  | 'FINAL_SETTLEMENT'
  | 'ADVANCE'
  | 'COURT_ORDER'

export const OFF_CYCLE_LABEL: Record<OffCycleReason, string> = {
  MISSED_FROM_RUN: 'Left out of the run',
  CORRECTION_UNDERPAID: 'Underpaid, being made up',
  RATE_AMENDMENT_LATE: 'A rate change that landed after the cut-off',
  FINAL_SETTLEMENT: 'Final settlement on leaving',
  ADVANCE: 'An advance against a future run',
  COURT_ORDER: 'Required by a court or an authority',
}

export interface OffCyclePayment {
  amountCents: number
  reason: string
  note?: string | null
  /** The period the money belongs to. */
  periodStart: Date
  /** The day money actually leaves. */
  payOn: Date
}

export interface OffCycleVerdict {
  ok: boolean
  problems: string[]
  /** The date the posting takes. Always the period, never the pay day. */
  postedAt: Date | null
  says: string
}

export function checkOffCycle(p: OffCyclePayment): OffCycleVerdict {
  const problems: string[] = []
  const reason = (Object.keys(OFF_CYCLE_LABEL) as OffCycleReason[]).includes(
    p.reason as OffCycleReason
  )
    ? (p.reason as OffCycleReason)
    : null

  if (!reason) {
    problems.push(
      `"${p.reason}" is not an off-cycle reason. Pick from ` +
        `${Object.keys(OFF_CYCLE_LABEL).join(', ')} — a payment made outside the run is ` +
        `the one an auditor opens with, and "other" is not an answer.`
    )
  }
  if (p.amountCents <= 0) {
    problems.push('An off-cycle payment is a positive amount. To take money back, reverse the original.')
  }
  if (Number.isNaN(p.periodStart.getTime())) {
    problems.push('An off-cycle payment still belongs to a period. Say which one.')
  }
  if (reason === 'ADVANCE' && (!p.note || p.note.trim().length < 10)) {
    problems.push(
      'An advance is money paid before it is earned, so say what it is against. ' +
        'Without that it is indistinguishable from an overpayment, and it will be ' +
        'recovered from somebody who did not expect it.'
    )
  }

  return {
    ok: problems.length === 0,
    problems,
    postedAt: problems.length === 0 ? p.periodStart : null,
    says:
      problems.length === 0
        ? `${money(p.amountCents)} paid on ${iso(p.payOn)}, posted to ` +
          `${iso(p.periodStart)} because that is the period it belongs to — ` +
          `${OFF_CYCLE_LABEL[reason!].toLowerCase()}.`
        : problems[0],
  }
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// ── What the consultant may see ───────────────────────────────────────

export interface OwnPayView {
  /** Their own bill rate, or null where they have no claim on it. */
  billRateCents: number | null
  payCents: number
  /** The arithmetic, line by line. Empty for a fixed-rate consultant. */
  working: string[]
  says: string
  /** Why they can or cannot see the rate, said rather than implied. */
  whyVisible: string
}

/**
 * What one consultant may see about their own assignment.
 *
 * Their own, and only their own. They never see another consultant's
 * rate, another vendor's rate, or what the firm makes on anybody else.
 *
 * ── Why this overrides the per-requirement setting ────────────────────
 *
 * Rate visibility is normally the vendor's call, per requirement, and
 * that stays true for everything else. It cannot be their call here. If
 * somebody's pay is seventy-five per cent of a number, and they cannot
 * see the number, they are taking their own wage on trust — and a hidden
 * basis on a share deal is not a preference, it is the thing consultants
 * leave over.
 *
 * A consultant on a fixed wage has no such claim. Their pay does not
 * depend on the bill rate, so the setting applies to them normally.
 */
export function ownPayView(i: PayInput): OwnPayView {
  const pay = payFor(i)
  const maySee = mustSeeBillRate(i.model)

  return {
    billRateCents: maySee ? i.billRateCents : null,
    payCents: pay.payCents,
    working: maySee ? pay.working : [],
    says: pay.says,
    whyVisible: maySee
      ? 'Your pay is a share of what the client is billed, so you can see that rate. ' +
        'This is your assignment only — you never see anybody else’s.'
      : 'Your pay is an agreed rate per hour and does not depend on what the client is billed, ' +
        'so that rate is your employer’s to share or not.',
  }
}
