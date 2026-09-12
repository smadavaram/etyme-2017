/**
 * Whether a counterparty is safe to keep trading with.
 *
 * ── Why this is not the insurance gate ───────────────────────────────
 *
 * `src/lib/governance.ts` already refuses a placement through a supplier
 * whose cover has lapsed. That is a legal bar with a rule behind it and
 * it BLOCKS.
 *
 * This is the other thing, and it is commercial judgement: is this firm
 * one we should still be relying on? It never blocks anybody. It WARNS,
 * names somebody who has to act, and puts a date on when the judgement
 * gets made again. A risk judgement with no re-look date is a judgement
 * nobody will remake, and six months later it is being quoted as if it
 * were current.
 *
 * ── The data was already here, in three places nobody joined ─────────
 *
 *   **Insurance standing.** `Verification` rows against the counterparty's
 *   company, with an expiry. Lapsed, expiring, unverified, or absent.
 *
 *   **Payment behaviour.** Two different facts that must never be added
 *   together: what THEY did with money they owed us (invoice due date
 *   against the day the cash arrived), and what WE did with money we owed
 *   them (`VendorBill.dueAt` against `paidAt`). The second is a fact about
 *   us. Reporting it as theirs would be the most misleading thing on the
 *   screen — a supplier accused of paying late because we paid them late.
 *
 *   **The register.** `Counterparty.riskLevel` and `riskReviewBy` — what
 *   a person decided, and when they said they would decide it again.
 *
 * ── Nobody has looked is an answer ───────────────────────────────────
 *
 * The one thing this file exists to refuse: a supplier with nothing on
 * record coming out green. An empty file is not a clean file. It is a
 * question nobody has asked, and it is reported as exactly that — with a
 * date to ask it by.
 *
 * ── Nothing here is named after an industry ──────────────────────────
 *
 * Cover types are strings the caller supplies with their own labels. A
 * staffing firm holds general liability; a nursing agency holds
 * professional indemnity and malpractice; a laboratory holds product
 * liability. This file has an opinion about expiry dates and no opinion
 * about what a certificate is called.
 *
 * ── Units ────────────────────────────────────────────────────────────
 *
 * Minor units throughout — cents, pence. Conversion happens at the edge,
 * in the route. No database import here.
 */

const DAY = 86_400_000

/** Whole days between two instants, floored, the way ageing counts them. */
export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY)
}

/**
 * How long before an expiry is worth raising.
 *
 * Thirty days because a broker needs a fortnight and the firm needs a
 * reason to ring them before that.
 */
export const RENEWAL_WINDOW_DAYS = 30

/**
 * Inside this many days, an expiry is not a reminder any more.
 *
 * A fortnight is what a broker needs. Past that line the cover will lapse
 * before anybody gets round to it, so it warns rather than notes.
 */
export const URGENT_EXPIRY_DAYS = 14

/**
 * Settled obligations needed before an average means anything.
 *
 * Three payments is not a payment culture. Below this the counts are
 * reported and the average is withheld, because a mean of two is a
 * number somebody will quote in a supplier review.
 */
export const ENOUGH_SETTLEMENTS = 4

// ── Insurance and other cover ─────────────────────────────────────────

/** One certificate on file, whatever trade it belongs to. */
export interface Cover {
  /** The caller's own code — INSURANCE_GL, MALPRACTICE, PRODUCT_LIABILITY. */
  type: string
  /** What a person would call it. Falls back to the code, tidied. */
  label?: string
  /** CLEAR · CONDITIONAL · PENDING · IN_PROGRESS · EXPIRED · FAILED · FLAGGED */
  status: string
  /** Null where none was recorded, which is not the same as permanent. */
  expiresAt: Date | null
}

export type CoverState =
  /** Was valid, is not now. */
  | 'LAPSED'
  /** Valid, and not for much longer. */
  | 'EXPIRING'
  /** On file, nobody has confirmed it. */
  | 'UNVERIFIED'
  /** Confirmed, with no expiry written down. Neither a countdown nor a tick. */
  | 'NO_EXPIRY_RECORDED'
  /** Confirmed and in date. */
  | 'CURRENT'

export interface CoverLine {
  type: string
  label: string
  state: CoverState
  /** Negative where it has already gone. Null where no date was recorded. */
  daysToExpiry: number | null
  says: string
}

export interface InsuranceStanding {
  /** The worst of what is on file, or nothing on file at all. */
  state: CoverState | 'NOTHING_ON_FILE'
  covers: CoverLine[]
  worst: CoverLine | null
  says: string
}

const VERIFIED = ['CLEAR', 'CONDITIONAL']

/** Worst first. The aggregate takes the head of this order. */
const COVER_ORDER: CoverState[] = [
  'LAPSED',
  'EXPIRING',
  'UNVERIFIED',
  'NO_EXPIRY_RECORDED',
  'CURRENT',
]

function readable(type: string, label?: string): string {
  return label ?? type.toLowerCase().replace(/_/g, ' ')
}

function coverLine(c: Cover, now: Date): CoverLine {
  const label = readable(c.type, c.label)

  if (c.status === 'EXPIRED' || c.status === 'FAILED') {
    const days = c.expiresAt ? daysBetween(c.expiresAt, now) : null
    return {
      type: c.type,
      label,
      state: 'LAPSED',
      daysToExpiry: days == null ? null : -days,
      says:
        days == null
          ? `${label} is recorded as no longer valid.`
          : `${label} lapsed ${days} day${days === 1 ? '' : 's'} ago.`,
    }
  }

  if (!VERIFIED.includes(c.status)) {
    return {
      type: c.type,
      label,
      state: 'UNVERIFIED',
      daysToExpiry: c.expiresAt ? -daysBetween(c.expiresAt, now) : null,
      says:
        `${label} is on file and nobody has confirmed it. A certificate somebody ` +
        `uploaded is not cover until it has been checked.`,
    }
  }

  if (c.expiresAt == null) {
    return {
      type: c.type,
      label,
      state: 'NO_EXPIRY_RECORDED',
      daysToExpiry: null,
      says:
        `${label} is confirmed with no expiry date recorded. Either it does not expire ` +
        `or nobody wrote the date down, and this cannot tell which — so it is shown as ` +
        `a gap rather than as cover that never runs out.`,
    }
  }

  const days = -daysBetween(c.expiresAt, now)

  if (days < 0) {
    return {
      type: c.type,
      label,
      state: 'LAPSED',
      daysToExpiry: days,
      says: `${label} expired ${-days} day${-days === 1 ? '' : 's'} ago.`,
    }
  }

  if (days <= RENEWAL_WINDOW_DAYS) {
    return {
      type: c.type,
      label,
      state: 'EXPIRING',
      daysToExpiry: days,
      says:
        `${label} runs out in ${days} day${days === 1 ? '' : 's'}. Asking now costs one ` +
        `email; asking after it lapses costs a placement.`,
    }
  }

  return {
    type: c.type,
    label,
    state: 'CURRENT',
    daysToExpiry: days,
    says: `${label} is current for another ${days} days.`,
  }
}

/**
 * What is actually on file, and what the worst of it is.
 *
 * An empty list returns NOTHING_ON_FILE and never CURRENT. The difference
 * between "we checked and they are covered" and "we have never asked" is
 * the whole point of this function.
 */
export function insuranceStanding(covers: Cover[], now: Date): InsuranceStanding {
  if (covers.length === 0) {
    return {
      state: 'NOTHING_ON_FILE',
      covers: [],
      worst: null,
      says:
        'No certificate of any kind is on file for them. That is not a clean record — ' +
        'it is a question nobody has asked.',
    }
  }

  const lines = covers.map((c) => coverLine(c, now))
  const worst =
    lines
      .slice()
      .sort((a, b) => COVER_ORDER.indexOf(a.state) - COVER_ORDER.indexOf(b.state))[0] ?? null

  return {
    state: worst?.state ?? 'CURRENT',
    covers: lines,
    worst,
    says: worst ? worst.says : 'Nothing to report.',
  }
}

// ── Payment behaviour ─────────────────────────────────────────────────

/** Whose conduct a settlement is evidence of. */
export type Whose =
  /** They owed us. Their behaviour. */
  | 'THEIRS'
  /** We owed them. Ours, and never reported as theirs. */
  | 'OURS'

export interface Settlement {
  id: string
  whose: Whose
  /** When it fell due. Null makes the row unmeasurable, never on time. */
  dueAt: Date | null
  /** When the money actually moved. Null while it has not. */
  settledAt: Date | null
  amountMinor: number | null
  currency: string
}

export interface PaymentBehaviour {
  whose: Whose
  settled: number
  open: number
  /** Rows with no due date. Counted, never averaged, never called on time. */
  unmeasurable: number
  /** Mean days late across settled rows. Null below the threshold. */
  meanLateDays: number | null
  worstLateDays: number | null
  /** Still unpaid and already past due. */
  openOverdue: number
  openOverdueMaxDays: number | null
  /** What is sitting past due, where it is all one currency. */
  openOverdueMinor: number | null
  currency: string | null
  enough: boolean
  says: string
}

/**
 * How one side of a relationship actually settles.
 *
 * `whose` is carried through to the answer because the two directions are
 * different facts and the screen must never merge them. A supplier we pay
 * forty days late has told us nothing about themselves.
 */
export function paymentBehaviour(rows: Settlement[], whose: Whose, now: Date): PaymentBehaviour {
  const mine = rows.filter((r) => r.whose === whose)
  const unmeasurable = mine.filter((r) => r.dueAt == null).length
  const measurable = mine.filter((r) => r.dueAt != null)

  const settled = measurable.filter((r) => r.settledAt != null)
  const open = measurable.filter((r) => r.settledAt == null)

  const lates = settled.map((r) => daysBetween(r.dueAt as Date, r.settledAt as Date))
  const enough = settled.length >= ENOUGH_SETTLEMENTS

  const overdue = open.filter((r) => daysBetween(r.dueAt as Date, now) > 0)
  const overdueDays = overdue.map((r) => daysBetween(r.dueAt as Date, now))

  const overdueCurrencies = Array.from(new Set(overdue.map((r) => r.currency)))
  const oneCurrency = overdueCurrencies.length === 1 ? overdueCurrencies[0] : null
  const openOverdueMinor =
    oneCurrency && overdue.every((r) => r.amountMinor != null)
      ? overdue.reduce((n, r) => n + (r.amountMinor as number), 0)
      : null

  const meanLateDays = enough
    ? Math.round(lates.reduce((n, d) => n + d, 0) / lates.length)
    : null
  const worstLateDays = lates.length ? Math.max(...lates) : null

  return {
    whose,
    settled: settled.length,
    open: open.length,
    unmeasurable,
    meanLateDays,
    worstLateDays,
    openOverdue: overdue.length,
    openOverdueMaxDays: overdueDays.length ? Math.max(...overdueDays) : null,
    openOverdueMinor,
    currency: oneCurrency,
    enough,
    says: behaviourSays(whose, settled.length, meanLateDays, worstLateDays, overdue.length, overdueDays, unmeasurable),
  }
}

function behaviourSays(
  whose: Whose,
  settled: number,
  mean: number | null,
  worst: number | null,
  overdue: number,
  overdueDays: number[],
  unmeasurable: number
): string {
  const who = whose === 'THEIRS' ? 'They' : 'We'
  const parts: string[] = []

  if (settled === 0) {
    parts.push(
      whose === 'THEIRS'
        ? 'Nothing of theirs has settled yet, so there is no payment record to read.'
        : 'Nothing has been paid to them yet, so there is nothing to read about our own conduct.'
    )
  } else if (mean == null) {
    parts.push(
      `${who} have settled ${settled} time${settled === 1 ? '' : 's'}` +
        (worst != null && worst > 0 ? `, worst by ${worst} day${worst === 1 ? '' : 's'}` : '') +
        `. Fewer than ${ENOUGH_SETTLEMENTS} is not a payment culture, so no average is offered.`
    )
  } else if (mean > 0) {
    parts.push(
      `${who} settle about ${mean} day${mean === 1 ? '' : 's'} late on average across ` +
        `${settled}, worst by ${worst} day${worst === 1 ? '' : 's'}.`
    )
  } else {
    parts.push(
      `${who} settle on time or early across ${settled} — average ${Math.abs(mean)} day` +
        `${Math.abs(mean) === 1 ? '' : 's'} ${mean === 0 ? 'on the day' : 'early'}.`
    )
  }

  if (overdue > 0) {
    const max = Math.max(...overdueDays)
    parts.push(
      `${overdue} still unpaid and past due, the oldest by ${max} day${max === 1 ? '' : 's'}.`
    )
  }

  if (unmeasurable > 0) {
    parts.push(
      `${unmeasurable} row${unmeasurable === 1 ? '' : 's'} had no due date and ${
        unmeasurable === 1 ? 'was' : 'were'
      } left out rather than counted as on time.`
    )
  }

  return parts.join(' ')
}

// ── The judgement ─────────────────────────────────────────────────────

export interface CounterpartyRegister {
  id: string
  name: string
  /** What they are to us: CLIENT · SUPPLIER · PRIME · MSP. */
  relationship: string
  /** PROSPECT · ACTIVE · DORMANT · BLOCKED */
  status: string
  /** OK · WATCH · AT_RISK, or null where nobody has looked. */
  riskLevel: string | null
  riskReviewBy: Date | null
}

export interface Owner {
  name: string
  /** What they do here — Procurement, Controller, Managing Director. */
  role: string
}

/**
 * Who is expected to hand us a certificate in the first place.
 *
 * A supplier gives us proof of cover. A client does not — cover flows the
 * other way, and marking a client at risk for having no certificate on
 * file would put every customer on the watchlist on day one, which is how
 * a watchlist stops being read.
 *
 * Deliberately explicit rather than a default. Where the relationship is
 * a word this does not know, nothing is claimed about their cover and the
 * gap is reported instead.
 */
export const COVER_EXPECTED_FROM = ['SUPPLIER']

/** The relationships the register knows how to reason about. */
export const KNOWN_RELATIONSHIPS = ['CLIENT', 'SUPPLIER', 'PRIME', 'MSP']

export interface RiskInput {
  counterparty: CounterpartyRegister
  covers: Cover[]
  settlements: Settlement[]
  /** Who has to act on this. Null is itself reported. */
  owner: Owner | null
}

export type RiskVerdict =
  | 'AT_RISK'
  | 'WATCH'
  /** Nothing on file, no settled history, nobody's judgement. Never CLEAR. */
  | 'NOTHING_ON_RECORD'
  | 'CLEAR'

export interface Signal {
  code: string
  severity: 'NOTE' | 'WARN'
  says: string
}

/** How often the judgement gets made again, by what it currently says. */
export const CADENCE_DAYS: Record<RiskVerdict, number> = {
  AT_RISK: 30,
  WATCH: 90,
  NOTHING_ON_RECORD: 14,
  CLEAR: 180,
}

export interface SupplierRisk {
  counterpartyId: string
  name: string
  relationship: string
  status: string
  verdict: RiskVerdict
  /**
   * Always false, and present so nobody has to read the code to be sure.
   * The legal bars live in governance; this is commercial judgement and
   * blocking on it would stop work over somebody's opinion.
   */
  blocks: false
  action: 'WARN'
  signals: Signal[]
  insurance: InsuranceStanding
  theyPayUs: PaymentBehaviour
  wePayThem: PaymentBehaviour
  owner: Owner | null
  ownerSays: string
  /** When this gets decided again. Never null — that is the whole point. */
  reviewBy: Date
  cadenceDays: number
  /** How late the register's own review date is. Null where it is not. */
  reviewOverdueDays: number | null
  confidence: 'LOW' | 'MEDIUM' | 'HIGH'
  basis: string[]
  unknowns: string[]
  says: string
}

/** Late enough to be a judgement rather than an admin slip. */
const LATE_WARN_DAYS = 30
const LATE_NOTE_DAYS = 10
const OVERDUE_WARN_DAYS = 60
const OVERDUE_NOTE_DAYS = 30

/**
 * One counterparty, judged on what is on record.
 *
 * Warns, names an owner, and dates the next look. Never blocks.
 */
export function supplierRisk(input: RiskInput, now: Date): SupplierRisk {
  const { counterparty: cp, covers, settlements, owner } = input

  const insurance = insuranceStanding(covers, now)
  const theyPayUs = paymentBehaviour(settlements, 'THEIRS', now)
  const wePayThem = paymentBehaviour(settlements, 'OURS', now)

  const signals: Signal[] = []
  const basis: string[] = []
  const unknowns: string[] = []

  // ── What the certificates say ───────────────────────────────────────
  const expectsCover = COVER_EXPECTED_FROM.includes(cp.relationship)

  if (!KNOWN_RELATIONSHIPS.includes(cp.relationship)) {
    unknowns.push(
      `Nothing is claimed about cover, because it is not known whether a ` +
        `${cp.relationship.toLowerCase()} is expected to give us a certificate.`
    )
  }

  if (insurance.state === 'NOTHING_ON_FILE') {
    if (!expectsCover) {
      unknowns.push(
        `No certificates on file for them, which is ordinary — a ` +
          `${cp.relationship.toLowerCase()} does not give us proof of cover. Their risk is ` +
          `in how they pay, not in what they insure.`
      )
    } else {
      signals.push({
        code: 'NOTHING_ON_FILE',
        severity: cp.status === 'PROSPECT' ? 'NOTE' : 'WARN',
        says:
          cp.status === 'PROSPECT'
            ? `Nothing on file for ${cp.name}, which is ordinary for a prospect. It stops ` +
              `being ordinary the day somebody is placed through them.`
            : `Nothing on file for ${cp.name} and they are ${cp.status.toLowerCase()}. ` +
              `Nobody has looked, and an empty file is not a clean one.`,
      })
      unknowns.push('No certificate of any kind has been recorded against them.')
    }
  } else {
    basis.push(`${insurance.covers.length} certificate${insurance.covers.length === 1 ? '' : 's'} on file.`)
    if (insurance.state === 'LAPSED') {
      signals.push({ code: 'COVER_LAPSED', severity: 'WARN', says: insurance.says })
    } else if (insurance.state === 'EXPIRING') {
      // A fortnight is the line. Beyond it this is a renewal reminder;
      // inside it, work stops before anybody gets round to it.
      const days = insurance.worst?.daysToExpiry ?? RENEWAL_WINDOW_DAYS
      signals.push({
        code: 'COVER_EXPIRING',
        severity: days <= URGENT_EXPIRY_DAYS ? 'WARN' : 'NOTE',
        says: insurance.says,
      })
    } else if (insurance.state === 'UNVERIFIED') {
      signals.push({ code: 'COVER_UNVERIFIED', severity: 'NOTE', says: insurance.says })
      unknowns.push('A certificate is on file that nobody has confirmed.')
    } else if (insurance.state === 'NO_EXPIRY_RECORDED') {
      signals.push({ code: 'COVER_NO_EXPIRY', severity: 'NOTE', says: insurance.says })
      unknowns.push('Cover is confirmed with no expiry date, so it cannot be watched.')
    }
  }

  // ── What they do with money they owe us ─────────────────────────────
  if (theyPayUs.settled > 0 || theyPayUs.open > 0) {
    basis.push(
      `${theyPayUs.settled} settled and ${theyPayUs.open} open on their side of the ledger.`
    )
  }

  if (theyPayUs.meanLateDays != null && theyPayUs.meanLateDays >= LATE_WARN_DAYS) {
    signals.push({
      code: 'PAYS_US_LATE',
      severity: 'WARN',
      says:
        `${cp.name} settles about ${theyPayUs.meanLateDays} days late across ` +
        `${theyPayUs.settled}. That is a month of somebody else's payroll carried on our facility.`,
    })
  } else if (theyPayUs.meanLateDays != null && theyPayUs.meanLateDays >= LATE_NOTE_DAYS) {
    signals.push({
      code: 'PAYS_US_LATE',
      severity: 'NOTE',
      says: `${cp.name} settles about ${theyPayUs.meanLateDays} days late on average. Worth a conversation, not an alarm.`,
    })
  }

  if (theyPayUs.openOverdue > 0 && theyPayUs.openOverdueMaxDays != null) {
    const d = theyPayUs.openOverdueMaxDays
    if (d >= OVERDUE_WARN_DAYS) {
      signals.push({
        code: 'OVERDUE_TO_US',
        severity: 'WARN',
        says:
          `${theyPayUs.openOverdue} unpaid and past due, the oldest by ${d} days. Money ` +
          `this old usually needs a person rather than another reminder.`,
      })
    } else if (d >= OVERDUE_NOTE_DAYS) {
      signals.push({
        code: 'OVERDUE_TO_US',
        severity: 'NOTE',
        says: `${theyPayUs.openOverdue} unpaid and past due, the oldest by ${d} days.`,
      })
    }
  }

  if (theyPayUs.settled > 0 && !theyPayUs.enough) {
    unknowns.push(
      `Only ${theyPayUs.settled} settled payment${theyPayUs.settled === 1 ? '' : 's'} from them. ` +
        `An average starts at ${ENOUGH_SETTLEMENTS}.`
    )
  }

  // ── What we do with money we owe them ───────────────────────────────
  //
  // Reported as ours. A supplier is not late because we are.
  if (wePayThem.meanLateDays != null && wePayThem.meanLateDays >= LATE_NOTE_DAYS) {
    signals.push({
      code: 'WE_PAY_THEM_LATE',
      severity: 'NOTE',
      says:
        `We settle with ${cp.name} about ${wePayThem.meanLateDays} days late. That is our ` +
        `conduct, not theirs, and it is the reason a good supplier stops answering first.`,
    })
  }

  // ── What somebody already decided, and when they said they would
  //    decide it again ────────────────────────────────────────────────
  let reviewOverdueDays: number | null = null

  if (cp.riskLevel == null) {
    unknowns.push('Nobody has recorded a risk level for them.')
  } else {
    basis.push(`The register says ${cp.riskLevel}.`)

    if (cp.riskReviewBy == null) {
      signals.push({
        code: 'JUDGEMENT_UNDATED',
        severity: 'NOTE',
        says:
          `Somebody marked them ${cp.riskLevel} and set no date to look again. A judgement ` +
          `with no re-look date is one nobody remakes, and it gets quoted a year later as ` +
          `if it were current.`,
      })
    } else if (cp.riskReviewBy < now) {
      reviewOverdueDays = daysBetween(cp.riskReviewBy, now)
      signals.push({
        code: 'JUDGEMENT_STALE',
        severity: 'NOTE',
        says:
          `The review of ${cp.name} was due ${reviewOverdueDays} day` +
          `${reviewOverdueDays === 1 ? '' : 's'} ago. Until it is done, ${cp.riskLevel} is ` +
          `what somebody thought, not what is true.`,
      })
    }

    if (cp.riskLevel === 'AT_RISK') {
      signals.push({
        code: 'REGISTER_AT_RISK',
        severity: 'WARN',
        says: `Somebody here has already put ${cp.name} down as at risk.`,
      })
    } else if (cp.riskLevel === 'WATCH') {
      signals.push({
        code: 'REGISTER_WATCH',
        severity: 'NOTE',
        says: `Somebody here has already put ${cp.name} on watch.`,
      })
    }
  }

  // ── Verdict ─────────────────────────────────────────────────────────
  const nothingKnown =
    insurance.state === 'NOTHING_ON_FILE' &&
    theyPayUs.settled === 0 &&
    theyPayUs.open === 0 &&
    wePayThem.settled === 0 &&
    wePayThem.open === 0 &&
    cp.riskLevel == null

  const verdict: RiskVerdict = nothingKnown
    ? 'NOTHING_ON_RECORD'
    : signals.some((s) => s.severity === 'WARN')
      ? 'AT_RISK'
      : signals.length > 0
        ? 'WATCH'
        : 'CLEAR'

  // ── When this gets decided again ────────────────────────────────────
  const cadenceDays = CADENCE_DAYS[verdict]
  const byCadence = new Date(now.getTime() + cadenceDays * DAY)
  // An earlier date somebody already committed to wins. A cadence should
  // never push a promised review further out.
  const reviewBy =
    cp.riskReviewBy && cp.riskReviewBy > now && cp.riskReviewBy < byCadence
      ? cp.riskReviewBy
      : byCadence

  // ── Who acts ────────────────────────────────────────────────────────
  if (owner == null) {
    signals.push({
      code: 'NO_OWNER',
      severity: 'NOTE',
      says:
        `Nobody is named for ${cp.name}. A risk with no owner is a risk nobody remakes — ` +
        `put a name against them in the register.`,
    })
  }

  const ownerSays =
    owner == null
      ? `No named owner. Whoever runs procurement here should take ${cp.name}.`
      : `${owner.name} (${owner.role}) owns this one and has until ` +
        `${reviewBy.toISOString().slice(0, 10)} to look again.`

  // Only the evidence that applies to this kind of counterparty counts.
  // A client is never going to hand us a certificate, so holding none
  // against them should not hold the confidence down for ever.
  const evidence: boolean[] = [
    ...(expectsCover ? [insurance.state !== 'NOTHING_ON_FILE'] : []),
    theyPayUs.enough,
  ]
  const confidence: 'LOW' | 'MEDIUM' | 'HIGH' = evidence.every(Boolean)
    ? 'HIGH'
    : evidence.some(Boolean)
      ? 'MEDIUM'
      : 'LOW'

  return {
    counterpartyId: cp.id,
    name: cp.name,
    relationship: cp.relationship,
    status: cp.status,
    verdict,
    blocks: false,
    action: 'WARN',
    signals,
    insurance,
    theyPayUs,
    wePayThem,
    owner,
    ownerSays,
    reviewBy,
    cadenceDays,
    reviewOverdueDays,
    confidence,
    basis,
    unknowns,
    says: verdictSays(cp.name, verdict, signals, cp.status),
  }
}

function verdictSays(
  name: string,
  verdict: RiskVerdict,
  signals: Signal[],
  status: string
): string {
  if (verdict === 'NOTHING_ON_RECORD') {
    return status === 'PROSPECT'
      ? `Nothing is on record for ${name}. Ordinary for a prospect, and the day they ` +
          `supply somebody it is not.`
      : `Nothing is on record for ${name} — no certificate, no settled payment, nobody's ` +
          `judgement. That is not a pass; it is a gap with a date on it.`
  }
  if (verdict === 'CLEAR') {
    return `Nothing outstanding against ${name} on what we hold. Diarised rather than closed.`
  }
  const worst = signals.find((s) => s.severity === 'WARN') ?? signals[0]
  return `${worst.says}`
}

// ── The watchlist ─────────────────────────────────────────────────────

/** Worst first. Unknown outranks fine, because unknown is not fine. */
const VERDICT_ORDER: RiskVerdict[] = ['AT_RISK', 'WATCH', 'NOTHING_ON_RECORD', 'CLEAR']

export interface Watchlist {
  rows: SupplierRisk[]
  atRisk: number
  watch: number
  nothingOnRecord: number
  clear: number
  /** How many have a review date somebody has already missed. */
  reviewsOverdue: number
  says: string
}

/**
 * Everything worth a person's attention, in the order they should read it.
 *
 * Counts what could not be judged separately, because a screen showing
 * "nine clear" over a book of forty is a lie of omission.
 */
export function watchlist(rows: SupplierRisk[]): Watchlist {
  const ordered = [...rows].sort((a, b) => {
    const va = VERDICT_ORDER.indexOf(a.verdict)
    const vb = VERDICT_ORDER.indexOf(b.verdict)
    if (va !== vb) return va - vb
    const oa = a.reviewOverdueDays ?? -1
    const ob = b.reviewOverdueDays ?? -1
    if (oa !== ob) return ob - oa
    return a.name.localeCompare(b.name)
  })

  const count = (v: RiskVerdict) => ordered.filter((r) => r.verdict === v).length
  const atRisk = count('AT_RISK')
  const watch = count('WATCH')
  const nothingOnRecord = count('NOTHING_ON_RECORD')
  const clear = count('CLEAR')
  const reviewsOverdue = ordered.filter((r) => r.reviewOverdueDays != null).length

  return {
    rows: ordered,
    atRisk,
    watch,
    nothingOnRecord,
    clear,
    reviewsOverdue,
    says:
      ordered.length === 0
        ? 'Nobody in the register yet. This fills as you record who you trade with.'
        : `${atRisk} at risk, ${watch} on watch, ${nothingOnRecord} nobody has looked at, ` +
          `${clear} with nothing outstanding` +
          (reviewsOverdue > 0
            ? `. ${reviewsOverdue} review${reviewsOverdue === 1 ? '' : 's'} already overdue.`
            : '.'),
  }
}
