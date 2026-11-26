/**
 * The act each kind of row asks for, in the trade's words (record 130).
 * Pure. The card's heading is always the act ("Approve timesheet"), never
 * "Open"; its button is the verb ("Approve") where the row has a one-press
 * act, and the row's own words where it only opens a page.
 *
 * Every kind the decisions list can hold is here. A test reads the sources
 * that write rows and fails on a kind with no entry, so a new kind of row
 * cannot reach a card without a name.
 */

export interface ActName {
  /** The heading: the act and its object. */
  act: string
  /** The button where one press does it. Where absent, the route's own label is used. */
  verb?: string
}

export const ACTS: Readonly<Record<string, ActName>> = {
  TIMESHEET_APPROVAL: { act: 'Approve timesheet', verb: 'Approve' },
  EXPENSE_APPROVAL: { act: 'Approve expense', verb: 'Approve' },
  EXPENSE_ACCEPTANCE: { act: 'Accept expense', verb: 'Accept' },
  REQUISITION_APPROVAL: { act: 'Approve job request', verb: 'Approve' },
  SUPPLIER_REVIEW: { act: 'Approve supplier', verb: 'Approve' },
  SUBMISSION_REVIEW: { act: 'Review candidates' },
  INVOICE_RECEIPT_TO_PAY: { act: 'Pay invoice', verb: 'Pay' },
  INVOICE_RECEIPT_HELD: { act: 'Clear held invoice' },
  INVOICE_OVERDUE: { act: 'Chase invoice' },
  BILL_DISPUTED: { act: 'Answer bill dispute' },
  BILL_SEND: { act: 'Send bill', verb: 'Send' },
  PAPER_TO_CHECK: { act: 'Check paper' },
  ROLLOFF_ACTION: { act: 'Extend or end contract' },
  CONTRACT_PAPERING: { act: 'Paper contract' },
  CONTRACT_START: { act: 'Start contract' },
  START_HELD: { act: 'Clear start' },
  NO_AGREEMENT: { act: 'Add agreement' },
  RATE_CONFIRMATION: { act: 'Confirm rate', verb: 'Confirm' },
  TWIN_QUESTION: { act: 'Answer question' },
  OWNER_ASK: { act: 'Answer Owner request' },
  LINK_REQUEST: { act: 'Answer link request' },
  JOIN_ASK: { act: 'Answer bench request' },
  DECISION_ITEM: { act: 'Decide request' },
  OWN_PAPER: { act: 'Sign papers' },
  // A worker's own queue (twin/worker `WorkerAct`).
  FILE_WEEK: { act: 'File my week' },
  SEND_WEEK: { act: 'Send my week' },
  FIX_WEEK: { act: 'Fix my week' },
  PAPER: { act: 'Sign papers' },
  INTERVIEW: { act: 'Answer interview' },
  RENEW: { act: 'Renew bench stay' },
  CONSENT_ASK: { act: 'Answer bench request' },
}

/** What a kind nobody named reads: still an act, never "Open". */
export const UNNAMED_ACT = 'Decide'

/**
 * A week the firm accepts from the person below it reads "Accept timesheet";
 * the one it approves reads "Approve timesheet".
 */
export function actHeading(type: string, title: string | null | undefined, routeLabel: string | null | undefined): string {
  if (type === 'TIMESHEET_APPROVAL' && /^Accept\b/.test(title ?? '')) return 'Accept timesheet'
  return ACTS[type]?.act ?? (routeLabel && !/^Open\b/.test(routeLabel) ? routeLabel : UNNAMED_ACT)
}

/** The button of a one-press card: the verb, else the route's own label. */
export function actVerb(type: string, title: string | null | undefined, routeLabel: string): string {
  if (type === 'TIMESHEET_APPROVAL' && /^Accept\b/.test(title ?? '')) return 'Accept'
  return ACTS[type]?.verb ?? routeLabel
}
