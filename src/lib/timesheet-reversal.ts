/**
 * Putting right a timesheet that was wrong.
 *
 * Hours get approved that should not have been. A contractor logs a day
 * on the wrong assignment, a manager approves forty when it was
 * thirty-two, a client signs off a week that was already billed. It
 * happens constantly and it is not anybody being careless — it is what a
 * process with four parties and a fortnight of lag produces.
 *
 * ── What 2017 did, and what it did not ───────────────────────────────
 *
 * It did not do this. `retire_on_reject_seq` posted a reversal to a
 * Sequence blockchain ledger, its only call site was commented out, and
 * Sequence itself shut down in 2021. So there is nothing to port here,
 * which is worth saying plainly rather than pretending this is a
 * migration.
 *
 * ── The one rule ─────────────────────────────────────────────────────
 *
 * Never edit history. A reversal is a new record that corrects an old
 * one, and both stay. An approved timesheet that quietly becomes a
 * different number is how an invoice stops reconciling and nobody can
 * say when it changed — and by the time anybody notices, the person who
 * changed it has left.
 *
 * ── What is possible depends on how far the money got ────────────────
 *
 * The same mistake is a different problem at each stage, and offering
 * the same button at all five is how somebody credits an invoice that
 * was never sent.
 */

export type Stage =
  /** Submitted, nobody has signed. */
  | 'SUBMITTED'
  /** The client approved it. Billable, not billed. */
  | 'CLIENT_APPROVED'
  /** The employer accepted it. Payable, not paid. */
  | 'EMPLOYER_ACCEPTED'
  /** On an invoice that has gone out. */
  | 'INVOICED'
  /** The invoice has been settled. */
  | 'PAID'
  /** In a payroll file that has been sent to the provider. */
  | 'EXPORTED_TO_PAYROLL'

export type Remedy =
  /** Withdraw and reopen. Nothing left the building. */
  | 'REOPEN'
  /** Withdraw the signature, leave the hours. */
  | 'WITHDRAW_APPROVAL'
  /** The invoice needs a credit note before anything else can move. */
  | 'CREDIT_NOTE'
  /** Money has moved. Correct it on the next cycle. */
  | 'ADJUST_NEXT_CYCLE'

export interface Sheet {
  id: string
  personName: string
  totalHours: number
  periodLabel: string
  stage: Stage
  invoiceNumber: string | null
  invoicePaid: boolean
  payrollExportedAt: Date | null
}

export interface Plan {
  remedy: Remedy
  /** Whether it can be done here and now. */
  immediate: boolean
  /** What else has to happen, and in what order. */
  steps: string[]
  /** Who has to do something about it. */
  tellThem: string[]
  says: string
  /** True where a reason must be given. It always must. */
  needsReason: true
}

/**
 * What putting this right actually involves.
 *
 * Returns a plan rather than doing anything, because at three of the six
 * stages the first step belongs to somebody else and a button that
 * pretends otherwise produces a timesheet out of step with an invoice.
 */
export function planFor(s: Sheet): Plan {
  switch (s.stage) {
    case 'SUBMITTED':
      return {
        remedy: 'REOPEN',
        immediate: true,
        steps: ['Reopen it for the contractor to correct and resubmit.'],
        tellThem: [s.personName],
        says: `Nobody has signed this yet. Reopening it costs nothing.`,
        needsReason: true,
      }

    case 'CLIENT_APPROVED':
      return {
        remedy: 'WITHDRAW_APPROVAL',
        immediate: true,
        steps: [
          'Withdraw the client approval.',
          'Reopen it for the contractor to correct and resubmit.',
        ],
        tellThem: [s.personName],
        says:
          `Approved but not billed. Withdrawing the approval is clean — ` +
          `nothing has left the building.`,
        needsReason: true,
      }

    case 'EMPLOYER_ACCEPTED':
      return {
        remedy: 'WITHDRAW_APPROVAL',
        immediate: true,
        steps: [
          'Withdraw both signatures.',
          'Reopen it for the contractor to correct and resubmit.',
        ],
        tellThem: [s.personName],
        says:
          `Accepted for pay but not yet in a payroll file. Both signatures ` +
          `come off and it goes back.`,
        needsReason: true,
      }

    case 'INVOICED':
      return {
        remedy: 'CREDIT_NOTE',
        immediate: false,
        steps: [
          `Raise a credit note against ${s.invoiceNumber ?? 'the invoice'}.`,
          'Once the credit is issued, the timesheet reopens.',
          'The corrected hours bill on the next invoice.',
        ],
        tellThem: ['whoever owns billing', s.personName],
        says:
          `This is on ${s.invoiceNumber ?? 'an invoice'} that has gone to the client. ` +
          `The timesheet cannot change underneath a document somebody has already read — ` +
          `it needs a credit note first.`,
        needsReason: true,
      }

    case 'PAID':
      return {
        remedy: 'ADJUST_NEXT_CYCLE',
        immediate: false,
        steps: [
          `Raise a credit note against ${s.invoiceNumber ?? 'the invoice'}.`,
          'Agree the correction with the client — they have paid it.',
          'Carry the difference onto the next invoice as an adjustment line.',
        ],
        tellThem: ['whoever owns billing', 'the client', s.personName],
        says:
          `The client has paid this. Nothing here can be unwound quietly — ` +
          `it is a credit and a conversation, then an adjustment next cycle.`,
        needsReason: true,
      }

    case 'EXPORTED_TO_PAYROLL':
      return {
        remedy: 'ADJUST_NEXT_CYCLE',
        immediate: false,
        steps: [
          'Check with payroll whether the run has been processed.',
          'If it has, the correction goes on the next payslip as an adjustment.',
          'If it has not, ask them to pull the line before it does.',
        ],
        tellThem: ['payroll', s.personName],
        says:
          `${s.personName} may already have been paid on these hours. ` +
          `Nothing here reaches into a payroll run — this is a phone call first.`,
        needsReason: true,
      }
  }
}

export interface Reversal {
  sheetId: string
  reason: string
  byId: string
  at: Date
  remedy: Remedy
  /** What the hours were before. Kept because the old row is not edited. */
  hoursBefore: number
  /** What they should be, where that is already known. */
  hoursAfter: number | null
}

/**
 * Whether this reversal may be recorded.
 *
 * A reason is required at every stage without exception. An hours
 * correction with no explanation is the one thing guaranteed to be
 * questioned later, by somebody with less context than whoever did it,
 * and "no reason given" is not an answer anybody accepts.
 */
export function mayReverse(
  s: Sheet,
  reason: string,
  isClient: boolean,
  isEmployer: boolean
): { ok: boolean; says: string } {
  if (reason.trim().length < 5) {
    return {
      ok: false,
      says:
        'Say what was wrong with it. Somebody will ask in three months and ' +
        '"no reason given" is not an answer.',
    }
  }

  if (!isClient && !isEmployer) {
    return { ok: false, says: 'Only a party to this contract can put it right.' }
  }

  // The client withdrawing their own approval is theirs to do. Pulling
  // hours out of a payroll file is not — that belongs to whoever pays.
  if (s.stage === 'EXPORTED_TO_PAYROLL' && !isEmployer) {
    return {
      ok: false,
      says: 'These hours are in a payroll run. Only the employer can correct that.',
    }
  }

  return { ok: true, says: planFor(s).says }
}

/**
 * The line that goes in the log.
 *
 * Written so somebody reading it cold, months later, can tell what
 * happened without opening anything else.
 */
export function logLine(r: Reversal, s: Sheet): string {
  const change =
    r.hoursAfter != null
      ? `${r.hoursBefore} hours corrected to ${r.hoursAfter}`
      : `${r.hoursBefore} hours withdrawn`

  const where =
    r.remedy === 'CREDIT_NOTE'
      ? ` A credit note is needed against ${s.invoiceNumber ?? 'the invoice'}.`
      : r.remedy === 'ADJUST_NEXT_CYCLE'
        ? ' The correction carries to the next cycle.'
        : ''

  return `${s.personName}, ${s.periodLabel}: ${change}. ${r.reason.trim()}${where}`
}

/**
 * What the sheet looks like afterwards.
 *
 * Only the two immediate remedies change it here. The other two leave it
 * exactly as it is until a credit note exists — because a timesheet that
 * reopens while its invoice still stands is a reconciliation somebody
 * spends a day on.
 */
export function afterReversal(s: Sheet, remedy: Remedy): {
  status: string
  clearsClientApproval: boolean
  clearsEmployerAcceptance: boolean
} {
  switch (remedy) {
    case 'REOPEN':
      return { status: 'OPEN', clearsClientApproval: false, clearsEmployerAcceptance: false }
    case 'WITHDRAW_APPROVAL':
      return { status: 'OPEN', clearsClientApproval: true, clearsEmployerAcceptance: true }
    default:
      // Unchanged on purpose. It moves when the credit exists.
      return { status: 'HELD', clearsClientApproval: false, clearsEmployerAcceptance: false }
  }
}

/** Where a sheet has got to, from what is on it. */
export function stageOf(s: {
  clientApprovedAt: Date | null
  employerAcceptedAt: Date | null
  invoiceNumber: string | null
  invoicePaid: boolean
  payrollExportedAt: Date | null
}): Stage {
  if (s.payrollExportedAt) return 'EXPORTED_TO_PAYROLL'
  if (s.invoicePaid) return 'PAID'
  if (s.invoiceNumber) return 'INVOICED'
  if (s.employerAcceptedAt) return 'EMPLOYER_ACCEPTED'
  if (s.clientApprovedAt) return 'CLIENT_APPROVED'
  return 'SUBMITTED'
}
