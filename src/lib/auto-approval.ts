/**
 * Approving a timesheet because nobody said no.
 *
 * A contractor works a week, submits, and the manager who has to approve
 * it is on holiday. Two weeks later the vendor still cannot invoice, the
 * contractor still cannot be paid, and nobody did anything wrong.
 *
 * So the agreement says how long the client has, and after that silence
 * counts as approval. Every VMS does this and it is the single term that
 * keeps cash moving through a contingent programme.
 *
 * ── Three rules that make it safe ────────────────────────────────────
 *
 * **It is recorded as automatic, never as a person.** An auto-approved
 * sheet that names a manager is a forged signature. The ledger says
 * nobody looked, which is the truth, and which is what somebody needs
 * when the invoice is disputed four months later.
 *
 * **It never fires on a sheet with a question over it.** The anomaly
 * score exists to hold the odd ones — sixty hours in a week, a day
 * logged on a public holiday, hours after an assignment ended. Those
 * wait for a person however long it takes, because auto-approving the
 * one sheet that is actually wrong is how a client stops trusting all of
 * it.
 *
 * **It only ever approves the client's side.** The client agreed to the
 * window in their own agreement, so silence is consent to a term they
 * signed. The employer accepting is their own money leaving, and nobody
 * signed anything that says it may leave unattended.
 */

/** Where no agreement says otherwise. */
export const DEFAULT_WINDOW_DAYS = 5

/** Below this, a sheet is held for a person however long it takes. */
export const ANOMALY_HOLD_BELOW = 60

export interface Sheet {
  id: string
  personName: string
  submittedAt: Date
  totalHours: number
  /** Already approved by a person, or by a previous run. */
  clientApprovedAt: Date | null
  /** Confidence the hours are ordinary. Null means never assessed. */
  anomalyScore: number | null
  anomalyReason: string | null
  /** Days the client has, from the agreement. Null falls back to the default. */
  windowDays: number | null
  /** Whether the agreement turns this on at all. */
  autoApproves: boolean
  clientName: string
}

export type Verdict =
  | 'APPROVE'
  /** Still inside the window. */
  | 'WAITING'
  /** Held on an anomaly, whatever the window says. */
  | 'HELD'
  /** The agreement does not allow it. */
  | 'NOT_ALLOWED'
  /** Somebody already approved it. */
  | 'ALREADY'

export interface Decision {
  sheetId: string
  verdict: Verdict
  /** Days since it was submitted. */
  waitedDays: number
  /** In words, for the ledger and for the person who asks why. */
  says: string
}

/**
 * Whether silence has run long enough to count.
 *
 * Deliberately pure and deliberately explicit about every path. This is
 * the function that moves money without a human, and every branch of it
 * should be readable by somebody who does not write code.
 */
export function decide(s: Sheet, now: Date): Decision {
  const waitedDays = Math.floor((now.getTime() - s.submittedAt.getTime()) / 86_400_000)
  const window = s.windowDays ?? DEFAULT_WINDOW_DAYS

  const base = { sheetId: s.id, waitedDays }

  if (s.clientApprovedAt) {
    return { ...base, verdict: 'ALREADY', says: 'Already approved.' }
  }

  if (!s.autoApproves) {
    return {
      ...base,
      verdict: 'NOT_ALLOWED',
      says: `${s.clientName} has not agreed to automatic approval. This waits for a person.`,
    }
  }

  // Checked before the window, because an odd sheet should never be
  // approved by the passage of time no matter how much time passes.
  if (s.anomalyScore != null && s.anomalyScore < ANOMALY_HOLD_BELOW) {
    return {
      ...base,
      verdict: 'HELD',
      says:
        `Held for a person: ${s.anomalyReason ?? 'these hours look unusual'}. ` +
        `Automatic approval does not apply to a sheet with a question over it.`,
    }
  }

  if (waitedDays < window) {
    const left = window - waitedDays
    return {
      ...base,
      verdict: 'WAITING',
      says: `${s.clientName} has ${left} more day${left === 1 ? '' : 's'} to approve this.`,
    }
  }

  return {
    ...base,
    verdict: 'APPROVE',
    says:
      `Approved automatically. ${s.personName} submitted ${s.totalHours} hours ` +
      `${waitedDays} days ago and ${s.clientName} agreed to a ${window} day window. ` +
      `Nobody looked at it.`,
  }
}

/**
 * What to write down when it fires.
 *
 * `byId` is deliberately null. An auto-approved sheet that names a
 * manager is a forged signature, and the whole value of the record is
 * that somebody can tell the two apart four months later when the
 * invoice is disputed.
 */
export function signature(at: Date): {
  clientApprovedAt: Date
  clientApprovedById: null
  autoApproved: true
} {
  return { clientApprovedAt: at, clientApprovedById: null, autoApproved: true }
}

export interface RunSummary {
  approved: number
  waiting: number
  held: number
  notAllowed: number
  says: string
}

/**
 * The line the overnight job reports.
 *
 * Leads with what was held, because approving forty sheets is the
 * ordinary case and the two that need a person are the news.
 */
export function summarise(decisions: Decision[]): RunSummary {
  const n = (v: Verdict) => decisions.filter((d) => d.verdict === v).length
  const approved = n('APPROVE')
  const waiting = n('WAITING')
  const held = n('HELD')
  const notAllowed = n('NOT_ALLOWED')

  if (decisions.length === 0) {
    return { approved, waiting, held, notAllowed, says: 'No timesheets waiting on a client.' }
  }

  const bits: string[] = []
  if (held) bits.push(`${held} held for a person`)
  if (approved) bits.push(`${approved} approved automatically`)
  if (waiting) bits.push(`${waiting} still inside the window`)
  if (notAllowed) bits.push(`${notAllowed} waiting on a client who has not agreed to this`)

  return { approved, waiting, held, notAllowed, says: bits.join(', ') + '.' }
}

/**
 * How a client would say the term in their own agreement.
 *
 * Written out because a number in a settings field means nothing, and
 * somebody has to be able to check it says what they signed.
 */
export function termSentence(windowDays: number | null, autoApproves: boolean): string {
  if (!autoApproves) {
    return 'Timesheets wait for a person however long that takes. Nothing is ever approved automatically.'
  }
  const d = windowDays ?? DEFAULT_WINDOW_DAYS
  return (
    `Timesheets are approved automatically if nobody has responded within ` +
    `${d} working day${d === 1 ? '' : 's'}. Anything that looks unusual is held for a person regardless.`
  )
}
