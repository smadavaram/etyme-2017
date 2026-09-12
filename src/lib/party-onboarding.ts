/**
 * Onboarding is an L3 that happens five times, and this is its ledger.
 *
 * One word, five processes — the matrix settled that. What was still
 * missing is the thing an operations person actually wants on a Monday:
 * for THIS client, THIS supplier, THIS consultant, THIS assignment,
 * what is set up, what is missing, and who is blocked by it.
 *
 * So this is a checklist DERIVED from real state, never a stored list of
 * ticked boxes. A stored checklist and the database drift apart within a
 * month; a derived one is wrong for exactly one commit — the same rule
 * that turned the delivery matrix and the ownership map into tests.
 *
 * Every item names what it reads, so "why is this red" has an answer
 * that is a screen somebody can go to, not a shrug.
 */

export type Party = 'CLIENT' | 'SUPPLIER' | 'CONSULTANT' | 'ASSIGNMENT'

export type ItemState = 'DONE' | 'MISSING' | 'STALE' | 'NOT_APPLICABLE'

export interface ChecklistItem {
  key: string
  label: string
  state: ItemState
  /** Why it matters, in the words you would use to whoever has to do it. */
  why: string
  /** Where to go to fix it. */
  href: string
}

export interface Checklist {
  party: Party
  subject: string
  items: ChecklistItem[]
  /** Required items done, out of required items applicable. */
  done: number
  of: number
  ready: boolean
  says: string
}

function summarise(party: Party, subject: string, items: ChecklistItem[]): Checklist {
  const applicable = items.filter((i) => i.state !== 'NOT_APPLICABLE')
  const done = applicable.filter((i) => i.state === 'DONE').length
  const missing = applicable.filter((i) => i.state !== 'DONE')

  return {
    party,
    subject,
    items,
    done,
    of: applicable.length,
    ready: missing.length === 0,
    says:
      missing.length === 0
        ? `${subject} is fully set up.`
        : missing.length === 1
          ? `${subject}: one thing left — ${missing[0].label.toLowerCase()}.`
          : `${subject}: ${done} of ${applicable.length} done. Next: ${missing[0].label.toLowerCase()}.`,
  }
}

// ── The four checklists, each from facts ──────────────────────────────

export interface ClientFacts {
  name: string
  onRegister: boolean
  contacts: number
  msaSigned: boolean
  costCenters: number
  holidayCalendar: boolean
  approvalRules: boolean
}

/**
 * A client is onboarded when the sales handover is finished: the things
 * the first invoice and the first requisition will need, ready before
 * either exists. Every one of these read at invoice time instead is a
 * surprise at the worst moment there is.
 */
export function clientChecklist(f: ClientFacts): Checklist {
  const items: ChecklistItem[] = [
    {
      key: 'register', label: 'On the counterparty register',
      state: f.onRegister ? 'DONE' : 'MISSING',
      why: 'Who they are to you. Without the row, nothing else can find them.',
      href: '/dashboard/contacts',
    },
    {
      key: 'contact', label: 'Somebody to call',
      state: f.contacts > 0 ? 'DONE' : 'MISSING',
      why: 'A counterparty with nobody to call is a logo, not a relationship.',
      href: '/dashboard/contacts',
    },
    {
      key: 'msa', label: 'Master agreement on file',
      state: f.msaSigned ? 'DONE' : 'MISSING',
      why: 'Terms, margin floor and payment days. Every contract inherits them.',
      href: '/dashboard/agreements',
    },
    {
      key: 'costCenters', label: 'Cost objects recorded',
      state: f.costCenters > 0 ? 'DONE' : 'MISSING',
      why: 'Their finance team reconciles against their own codes. Captured now, or chased at invoice time.',
      href: '/dashboard/settings',
    },
    {
      key: 'calendar', label: 'Holiday calendar',
      state: f.holidayCalendar ? 'DONE' : 'MISSING',
      why: 'Cycle dates shift on business days. February finds the firms that skipped this.',
      href: '/dashboard/settings',
    },
    {
      key: 'approvals', label: 'Approval rules set',
      state: f.approvalRules ? 'DONE' : 'MISSING',
      why: 'Most requisitions must clear without a human. No rules means every one waits on one.',
      href: '/dashboard/settings',
    },
  ]
  return summarise('CLIENT', f.name, items)
}

export interface SupplierFacts {
  name: string
  onRegister: boolean
  contacts: number
  msaSigned: boolean
  insuranceCurrent: boolean | null // null = nothing on file, which is not "current"
  w9OnFile: boolean
  remitToOnFile: boolean
}

/** Due diligence, and the two documents money cannot move without. */
export function supplierChecklist(f: SupplierFacts): Checklist {
  const items: ChecklistItem[] = [
    {
      key: 'register', label: 'On the counterparty register',
      state: f.onRegister ? 'DONE' : 'MISSING',
      why: 'Who they are to you.',
      href: '/dashboard/contacts',
    },
    {
      key: 'contact', label: 'Somebody to call',
      state: f.contacts > 0 ? 'DONE' : 'MISSING',
      why: 'The person you chase when a certificate lapses.',
      href: '/dashboard/contacts',
    },
    {
      key: 'msa', label: 'Master agreement on file',
      state: f.msaSigned ? 'DONE' : 'MISSING',
      why: 'The paper the first submission needs.',
      href: '/dashboard/agreements',
    },
    {
      key: 'insurance', label: 'Insurance current',
      // Null is MISSING, not unknown-therefore-fine. The 2017 bug, again.
      state: f.insuranceCurrent === true ? 'DONE' : 'MISSING',
      why: 'A lapse blocks their submissions, by rule. Better found today than on one.',
      href: '/dashboard/packets',
    },
    {
      key: 'w9', label: 'W-9 on file',
      state: f.w9OnFile ? 'DONE' : 'MISSING',
      why: 'How they get set up to be paid at all.',
      href: '/dashboard/packets',
    },
    {
      key: 'remit', label: 'Where the money goes',
      state: f.remitToOnFile ? 'DONE' : 'MISSING',
      why: 'A payment run cannot include a bill with no account to send it to.',
      href: '/dashboard/settings',
    },
  ]
  return summarise('SUPPLIER', f.name, items)
}

export interface ConsultantFacts {
  name: string
  profileComplete: boolean
  listingGranted: boolean
  buyContract: boolean
  payModelSet: boolean
  packetsComplete: boolean | null // null = none asked for yet
}

/** The employment formality, and the one consent that is theirs alone. */
export function consultantChecklist(f: ConsultantFacts): Checklist {
  const items: ChecklistItem[] = [
    {
      key: 'profile', label: 'Profile complete',
      state: f.profileComplete ? 'DONE' : 'MISSING',
      why: 'Skills and location are what matching runs on. A blank profile matches nothing.',
      href: '/dashboard/consultants',
    },
    {
      key: 'listing', label: 'Bench listing granted',
      state: f.listingGranted ? 'DONE' : 'MISSING',
      why: 'Their consent, not your record. Nobody is submitted without it.',
      href: '/dashboard/consultants',
    },
    {
      key: 'buy', label: 'Engagement papers',
      state: f.buyContract ? 'DONE' : 'MISSING',
      why: 'The buy contract is how they get paid. No paper, no payroll.',
      href: '/dashboard/contracts',
    },
    {
      key: 'payModel', label: 'Pay model agreed',
      state: f.payModelSet ? 'DONE' : 'MISSING',
      why: 'Fixed or a share, and of what. The difference decides who absorbs a green card.',
      href: '/dashboard/contracts',
    },
    {
      key: 'packets', label: 'Documents collected',
      state: f.packetsComplete === null ? 'NOT_APPLICABLE' : f.packetsComplete ? 'DONE' : 'MISSING',
      why: 'What the award stage lawfully collects — identity at award, never at application.',
      href: '/dashboard/packets',
    },
  ]
  return summarise('CONSULTANT', f.name, items)
}

export interface AssignmentFacts {
  label: string
  contractActive: boolean
  cleared: boolean
  startConfirmed: boolean
  firstTimesheetIn: boolean
}

/**
 * A badge and a laptop, and the one fact billing stands on: somebody
 * confirmed the person actually started. Billing before that is billing
 * on a guess.
 */
export function assignmentChecklist(f: AssignmentFacts): Checklist {
  const items: ChecklistItem[] = [
    {
      key: 'active', label: 'Contract active',
      state: f.contractActive ? 'DONE' : 'MISSING',
      why: 'A DRAFT contract bills nothing, deliberately.',
      href: '/dashboard/contracts',
    },
    {
      key: 'cleared', label: 'Compliance cleared',
      state: f.cleared ? 'DONE' : 'MISSING',
      why: 'Work authorisation blocks; the rest warns. Either way, before day one.',
      href: '/dashboard/compliance',
    },
    {
      key: 'start', label: 'Start confirmed',
      state: f.startConfirmed ? 'DONE' : 'MISSING',
      why: 'Somebody said they actually walked in. The fact every invoice stands on.',
      href: '/dashboard/onboarding',
    },
    {
      key: 'timesheet', label: 'First timesheet in',
      state: f.firstTimesheetIn ? 'DONE' : 'MISSING',
      why: 'The habit is set in week one or chased forever.',
      href: '/dashboard/timesheets',
    },
  ]
  return summarise('ASSIGNMENT', f.label, items)
}
