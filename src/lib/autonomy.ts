/**
 * How much we do unprompted, said in the words a buyer is already being
 * taught.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * Every enterprise buyer evaluating an agentic product right now is being
 * taught SAP's autonomy ladder: Observe, Recommend, Draft, Execute (low
 * risk), Execute (with approval), Fully autonomous (within policy). We
 * already had the behavior and no word for it, so a procurement officer
 * asking "what autonomy level is your auto-approval?" got a paragraph
 * instead of a level and a log.
 *
 * This file is not a capability. Nothing here decides anything. It is a
 * name for what `AutomationLog` already records, and the only new thing
 * it adds is the obligation to keep the naming complete.
 *
 * ── Three axes, not one ──────────────────────────────────────────────
 *
 * `AutomationLog` is doing three jobs, and folding them together would
 * produce a table that looks rigorous and means nothing:
 *
 *   UNPROMPTED   The system did this and nobody asked. Only these have a
 *                rung on the ladder.
 *   ENFORCEMENT  The system decided what a person was allowed to do —
 *                refused, warned, or let through. Governance, not
 *                autonomy: a BLOCK on a tenure limit is aimed at
 *                somebody who asked for something.
 *   ATTRIBUTED   A person did this and the row is the record that they
 *                did. Far more of these than of either other kind, and
 *                that is the finding: most of what is in the automation
 *                log is an audit trail of human acts, not automation.
 *                Giving those a rung would inflate every claim we make.
 *
 * How many of each there are is counted below in `TALLY`, never written
 * into this prose. The prose said thirteen, three and eighty-two, and
 * also eighty-four in one heading and fourteen jobs where there were
 * fifteen — three numbers disagreeing with each other and all of them
 * wrong, because a count in a sentence is stale the first time somebody
 * adds a row and does not reread the paragraph above it.
 *
 * ── Derived, not stored ──────────────────────────────────────────────
 *
 * A rung is a property of the KIND of action, so storing it per row lets
 * two rows of the same action disagree, and there is no reading of that
 * disagreement that is true.
 *
 * The counter-argument is the one made for `appliedBps` — that a later
 * reader should see the value that applied at the time. It fails here.
 * `appliedBps` is a term a counterparty agreed to on a day; an autonomy
 * level is our own description of our own behavior. If we relabel one, we
 * described it wrong before, and we want every historical row to read the
 * corrected level. Derive gives that for free. Store would need a
 * migration and would leave the old rows lying.
 *
 * The honest exception proves the rule: whether a MODEL or a RULE did the
 * work genuinely varies run to run, because the match engine falls back
 * to arithmetic when there is no API key. So that is read from the row,
 * never derived. What we assert about the action is derived; what
 * actually happened on the day is read.
 *
 * ── Honesty about rules ──────────────────────────────────────────────
 *
 * Most of what we do unprompted is a date comparison. `cron/end-contracts`
 * is fully autonomous and is also `endDate < today`. Both are true and the
 * surface says both, because a ladder that made that row look like machine
 * judgment would not survive one technical buyer.
 *
 * Owned by etyme-architect (`lib/autonomy` in `lib/domains.ts`).
 * Held true by `__tests__/invariants/autonomy.test.ts`, which fails when
 * an action or a scheduled job is written without a place here.
 */

// ── The ladder ───────────────────────────────────────

export type Rung = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5'

export const RUNGS: Rung[] = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5']

export interface Level {
  rung: Rung
  /** The name the buyer has already been taught. Do not improve on it. */
  name: string
  /** What it means, to somebody who has never read a ladder. */
  says: string
}

export const LADDER: Record<Rung, Level> = {
  L0: {
    rung: 'L0',
    name: 'Observe',
    says: 'It looked, and it told somebody. It changed nothing.',
  },
  L1: {
    rung: 'L1',
    name: 'Recommend',
    says: 'It suggested something and waited. Nothing happened until a person acted.',
  },
  L2: {
    rung: 'L2',
    name: 'Draft',
    says: 'It prepared the work and put it on somebody’s desk to finish.',
  },
  L3: {
    rung: 'L3',
    name: 'Execute (low risk)',
    says: 'It did it on its own. No money moved, and it can be put back.',
  },
  L4: {
    rung: 'L4',
    name: 'Execute (with approval)',
    says: 'It did it on its own because this company had already agreed, in a setting, that it should.',
  },
  L5: {
    rung: 'L5',
    name: 'Fully autonomous (within policy)',
    says: 'It did it on its own, with a real consequence, because a written rule said the day had come.',
  },
}

// ── What kind of row this is ─────────────────────────

export type ActKind = 'UNPROMPTED' | 'ENFORCEMENT' | 'ATTRIBUTED'

/** The three ways a governance decision can land. Never silently permit. */
export type Outcome = 'BLOCK' | 'WARN' | 'PERMIT'

/**
 * What decided it.
 *
 *   RULE      Deterministic. A date, a threshold, a count.
 *   RECORDED  Could have been either, and the row says which — or admits
 *             it does not know. Never guessed.
 */
export type Basis = 'RULE' | 'RECORDED'

export type Act =
  | { kind: 'UNPROMPTED'; rung: Rung; basis: Basis; says: string }
  | { kind: 'ENFORCEMENT'; outcome: Outcome; basis: Basis; says: string }
  | { kind: 'ATTRIBUTED'; basis: Basis }

// ── The things we do that nobody asked for ─────────────

const UNPROMPTED: Record<string, { rung: Rung; basis: Basis; says: string }> = {
  DUE_CYCLES_SCAN: {
    rung: 'L0',
    basis: 'RULE',
    says: 'Every night it reads which cycles fall due inside a week and tells whoever owns them. It moves nothing.',
  },
  VISA_WATCH: {
    rung: 'L0',
    basis: 'RULE',
    says: 'Every night it counts the days to a petition’s milestones and tells somebody at ninety, sixty and thirty. It files nothing.',
  },
  TIMESHEET_HELD_FOR_PERSON: {
    rung: 'L0',
    basis: 'RULE',
    says: 'It could have approved this week on its own and chose not to, and said why. Holding it back is the whole act.',
  },
  PROACTIVE_MATCH: {
    rung: 'L1',
    basis: 'RECORDED',
    says: 'It scored people against an open role nobody had matched yet. Scores only — nobody is submitted until a recruiter does it.',
  },
  ROLLOFF_SCAN: {
    rung: 'L2',
    basis: 'RULE',
    says: 'A contract ending inside eight weeks gets a rolloff opened for it, ready on somebody’s desk. The desk decides what happens to the person.',
  },
  REQUISITION_ROUTED: {
    rung: 'L2',
    basis: 'RULE',
    says: 'It worked out which desks have to sign this requisition and put it in front of each of them. Every decision is still a person’s.',
  },
  INVITATIONS_EXPIRED: {
    rung: 'L3',
    basis: 'RULE',
    says: 'An invitation nobody answered by the date on it is marked expired. The role can be sent out again.',
  },
  OPENINGS_COLD: {
    rung: 'L3',
    basis: 'RULE',
    says: 'A seat nobody has advertised in six weeks is marked cold, so it stops reading as live work. Advertising it again warms it.',
  },
  PACKET_REOPENED: {
    rung: 'L3',
    basis: 'RULE',
    says:
      'A document that has run out — or that leaves weeks uncovered between one policy ending and the next ' +
      'beginning — is asked for again, from the company that owes it. Asking is all it does.',
  },
  WEBHOOK_DISABLED: {
    rung: 'L3',
    basis: 'RULE',
    says: 'A webhook whose receiver stopped answering is switched off after repeated failures. Switching it back on is one click.',
  },
  TIMESHEET_AUTO_APPROVED: {
    rung: 'L4',
    basis: 'RULE',
    says: 'This week was approved because nobody answered it in time and this client had already agreed, in writing, that silence counts as approval.',
  },
  REQUISITION_AUTO_CLEARED: {
    rung: 'L4',
    basis: 'RULE',
    says: 'This requisition published itself because it sat inside the plan already approved — every desk cleared by rule and by name, nobody signing their own.',
  },
  AGREEMENT_TERM_WATCH: {
    rung: 'L5',
    basis: 'RULE',
    says: 'Every night it reads the end date on every agreement, marks the ones running out, rolls forward the ones whose own paper says they renew themselves, and tells the contracting desk at ninety, sixty and thirty days. Rolling a term forward changes what a firm is trading under, and it happens because a written agreement said the day had come.',
  },
  CONTRACTS_ENDED: {
    rung: 'L5',
    basis: 'RULE',
    says: 'A contract whose last day has passed is ended, both sides, with nobody asked. It is a date comparison, and it is what break-in-service and tenure are counted from.',
  },
  ERASURE_COMPLETE: {
    rung: 'L5',
    basis: 'RULE',
    says:
      'Somebody asked to be forgotten and the last thing standing in the way came free, so it finished on its own: the identity is a tombstone on a domain nothing can be sent to, and the work they did is still on the record under nobody’s name. Nothing puts this back.',
  },
}

// ── The things that are governance, not autonomy ─────────

const ENFORCEMENT: Record<string, { outcome: Outcome; basis: Basis; says: string }> = {
  AWARD_BLOCKED: {
    outcome: 'BLOCK',
    basis: 'RULE',
    says: 'Somebody tried to place a person and was refused, for a reason with a law behind it. This is a refusal aimed at a person who asked — it is not something the system did on its own.',
  },
  SUBMISSION_OFF_BAND: {
    outcome: 'WARN',
    basis: 'RULE',
    says: 'Somebody submitted outside the rate band, was warned, gave a reason and went ahead. Warned and recorded, never silently permitted.',
  },
  HOLIDAY_ADD_REFUSED: {
    outcome: 'BLOCK',
    basis: 'RULE',
    says: 'Somebody tried to put a day off on a calendar that is not theirs to change, and was refused. A day on a calendar moves the pay days behind it, so this is a refusal with money on the other side of it — and it is aimed at a person who asked, which is why it has no level.',
  },
  HOLIDAY_REMOVE_REFUSED: {
    outcome: 'BLOCK',
    basis: 'RULE',
    says: 'Somebody tried to take a day off a calendar that is not theirs to change, and was refused. Removing a day moves a pay day back onto a weekend as surely as adding one moves it off, so the refusal is recorded rather than only said.',
  },
  COLLEAGUE_JOINED: {
    outcome: 'PERMIT',
    basis: 'RULE',
    says: 'Somebody was let into this company without an admin approving them, because their work email is on a domain this company had already claimed. A permit is a governance decision and is logged like a refusal.',
  },
}

// ── The things a person did ─────────────────────────
//
// The row already carries a plain-English summary and reason written by
// the code that made it, so there is nothing to add here but the fact
// that a person is behind it — and, where it matters, what did the work.
//
// ── Weight is not autonomy, and neither is money ─────
//
// Writing a client's debt off and advising a client to stop work are two
// of the heaviest things this product does to a counterparty, and both
// are here with no rung, because a person on a credit desk pressed the
// button. The argument for promoting them is that they feel too
// consequential to sit beside a change of address. The argument against
// is that a rung answers "who started this", and answering a different
// question with it would make the ladder mean two things at once. How
// heavy an act is is already carried by `reversible` and by the row's
// own summary. If we ever need to rank acts by consequence that is a
// fourth axis with a name of its own, not a rung.

const ATTRIBUTED: Record<string, { basis: Basis }> = {}
const RULE_ATTRIBUTED = [
  'ACCESS_GRANTED', 'ACCESS_REINSTATED', 'ACCESS_REVOKED',
  'ACCESS_SUSPENDED', 'ADDRESS_CHANGED', 'AGREEMENT_AMENDED',
  'AGREEMENT_ENDED', 'AGREEMENT_SIGNED', 'ALUMNI_ASK_BACK', 'API_KEY_ISSUED',
  'API_KEY_REVOKED', 'APPROVAL_RULE_CREATED', 'APPROVAL_RULE_DEACTIVATED',
  'BENCH_CONSENT_DECLINED', 'BENCH_CONSENT_GIVEN', 'BENCH_LISTING_GRANTED',
  'BENCH_LISTING_REQUESTED', 'BENCH_LISTING_REVOKED', 'BLACKLIST_ADD',
  'BLACKLIST_LIFT', 'CANDIDATE_AWARDED', 'CLIENT_LISTED',
  'COLLECTIONS_FACTORED', 'COLLECTIONS_OWNER_ASSIGNED',
  'COLLECTIONS_PROMISE_MADE', 'COLLECTIONS_STOP_WORK_ADVISED',
  'COLLECTIONS_WRITTEN_OFF', 'COMMISSION_RUN', 'COMPANY_CREATED',
  'COMPANY_SETTINGS_CHANGED', 'CONSULTANT_CREATED', 'CONTRACT_ACTIVATED',
  'CONTRACT_CANCELLED', 'CONTRACT_COMPLETED', 'CONTRACT_CREATED',
  'CONTRACT_EXTENDED', 'CONTRACT_PAUSED', 'CONTRACT_RESUMED',
  'CONTRACT_VERIFICATION_REQUESTED', 'CREDIT_LIMIT_CHANGED',
  'CREDIT_LIMIT_SET', 'CUSTOM_DOMAIN_ADDED', 'CUSTOM_DOMAIN_REMOVED',
  'DOCUMENTS_SHARED', 'DOCUMENT_SHARE_REVOKED', 'DOMAIN_CLAIMED',
  'DUNNING_SENT', 'EXPENSE_APPROVED', 'EXPENSE_REJECTED',
  'EXPENSE_SUBMITTED', 'HOLIDAYS_ADDED', 'HOLIDAY_REMOVED',
  'IMPORT_COMMITTED', 'INTERVIEW_ACCEPTED', 'INTERVIEW_DECLINED',
  'INVITATION_ACCEPTED', 'INVITATION_DECLINED', 'INVITATION_WITHDRAWN',
  'INVOICE_GENERATED', 'INVOICE_MATCH_OVERRIDDEN',
  'INVOICE_MATCH_OVERRIDE_WITHDRAWN', 'INVOICE_SUBMITTED', 'LEADS_READ',
  'LEAD_KEPT_APART_BY_PERSON', 'LEAD_MERGED_BY_PERSON', 'OPENING_WRITTEN_UP',
  'ORDER_LOCKED', 'ORDER_SETTLED', 'ORDER_UNLOCKED', 'OUTBOUND_PACK_SENT',
  'OWN_DOCUMENT_RECORDED', 'PACKET_REQUESTED', 'PAYMENT_RECORDED',
  'PAYROLL_OFF_CYCLE', 'PAYROLL_RUN', 'PERSON_INVITED',
  'PLACEMENT_CONVERTED', 'PLACEMENT_REPLACED', 'PURCHASE_ORDER_CHANGED',
  'PURCHASE_ORDER_RAISED', 'RATE_AMENDMENT_APPROVED',
  'RATE_AMENDMENT_REJECTED', 'REMIT_TO_ADDED', 'REMIT_TO_CHANGED',
  'REQUIREMENT_STATUS_CHANGED', 'REQUISITION_APPROVED',
  'REQUISITION_CANCELLED', 'REQUISITION_CHANGED',
  'REQUISITION_CHANGES_REQUESTED', 'REQUISITION_DISTRIBUTED',
  'REQUISITION_REJECTED', 'RESERVE_FORFEIT', 'RESERVE_PAY_OUT', 'REVERSAL',
  'ROLE_PERMISSIONS_CHANGED', 'ROLLOFF_CLAIMED', 'ROLLOFF_INITIATED',
  'ROLLOFF_RESOLVED', 'SUBMISSION_STATUS_CHANGED', 'SUPPLIER_APPROVED',
  'SUPPLIER_DECLINED', 'SUPPLIER_ITEM_MARKED', 'TEMPLATE_PACK_APPLIED',
  'TIMESHEET_APPROVED', 'TIMESHEET_REJECTED', 'WEBHOOK_ADDED',
  'WORK_ORDER_RECORDED',
]
for (const a of RULE_ATTRIBUTED) ATTRIBUTED[a] = { basis: 'RULE' }

// A person pressed the button, but a model may have done the work — and
// which one it was changes run to run, so the row has to say.
ATTRIBUTED.MATCH_RUN = { basis: 'RECORDED' }
ATTRIBUTED.SITE_WRITTEN = { basis: 'RECORDED' }
ATTRIBUTED.DATA_IMPORTED = { basis: 'RECORDED' }

// ── Named before anything writes them ────────────────
//
// The ladder's own test holds two promises, and they pull in opposite
// directions the moment a schema lands ahead of the behavior built on
// it. "Every automated action has a level" means a new writer with no
// rung fails the build. "The ladder claims nothing the code does not
// actually write" means a rung with no writer fails it too — an
// inventory listing acts nobody performs overstates what we do, which is
// the more dangerous of the two lies because a buyer reads it.
//
// So an action that is designed but not yet written sits here instead of
// in the inventory above. It is NOT merged into `ACTIONS`, does not
// appear in `ALL_ACTIONS`, and is not counted in `TALLY`, so nothing
// this file claims about the product changes by naming one. What it
// gives is the rung, the basis and the sentence, decided once by whoever
// designed the record, so that the agent who writes the code is not
// inventing a level on a Friday afternoon.
//
// The day something under `src/` writes one of these names, the entry
// moves into `UNPROMPTED`, `ENFORCEMENT` or `ATTRIBUTED` above — in the
// same commit, because `autonomy.test.ts` fails otherwise. That is
// deliberate: it costs one line and it is the only thing that stops this
// list becoming a graveyard of good intentions.
//
// Retention, export, erasure and the breach clock are here because the
// schema for them landed on 2026-09-19 and the behavior is
// etyme-regulatory's next piece of work. Every deletion and every
// anonymization below is `reversible: false` on the row that records it,
// honestly, because nothing puts a deleted record back.

export type PlannedAct =
  | { kind: 'UNPROMPTED'; rung: Rung; basis: Basis; says: string; willBeWrittenBy: string }
  | { kind: 'ENFORCEMENT'; outcome: Outcome; basis: Basis; says: string; willBeWrittenBy: string }
  | { kind: 'ATTRIBUTED'; basis: Basis; says: string; willBeWrittenBy: string }

export const PLANNED: Record<string, PlannedAct> = {
  // ── What the nightly sweep does with nobody watching ───────────────

  RETENTION_DUE_SCAN: {
    kind: 'UNPROMPTED',
    rung: 'L0',
    basis: 'RULE',
    says:
      'Every night it reads which records have passed the end of their retention period and tells whoever owns them. It deletes nothing and is the rung every other retention row is measured against.',
    willBeWrittenBy: 'etyme-regulatory',
  },
  RETENTION_HELD: {
    kind: 'UNPROMPTED',
    rung: 'L0',
    basis: 'RULE',
    says:
      'Records were due for deletion and were left alone, because a legal hold names the person or the company they belong to. Not deleting is the whole act, and the reason the hold gave is recorded with it.',
    willBeWrittenBy: 'etyme-regulatory',
  },
  RETENTION_DELETE: {
    kind: 'UNPROMPTED',
    rung: 'L5',
    basis: 'RULE',
    says:
      'A record whose retention period has run out is deleted, with nobody asked, because a written schedule said the day had come. It cannot be put back. It is a date comparison, and the consequence is permanent — which is why it is at the top of the ladder and not beside ending a contract.',
    willBeWrittenBy: 'etyme-regulatory',
  },
  RETENTION_ANONYMIZE: {
    kind: 'UNPROMPTED',
    rung: 'L5',
    basis: 'RULE',
    says:
      'A record that has to survive for the money or for the client — an invoice line, a signed week, a day on site — kept its amounts and forgot whose they were, because the period for holding the name ran out. The arithmetic still foots and the person is gone from it, and it cannot be put back.',
    willBeWrittenBy: 'etyme-regulatory',
  },

  // ── The clocks ─────────────────────────────────────────────────────

  DATA_REQUEST_CLOCK_WARNED: {
    kind: 'UNPROMPTED',
    rung: 'L0',
    basis: 'RULE',
    says:
      'A request for somebody’s data falls due inside a day and nobody has answered it, so staff were told. It answers nothing itself.',
    willBeWrittenBy: 'etyme-regulatory',
  },
  BREACH_CLOCK_WARNED: {
    kind: 'UNPROMPTED',
    rung: 'L0',
    basis: 'RULE',
    says:
      'A deadline for telling an authority, a customer or the people whose data it was falls inside a day, so staff were told. Once a day, not once a run, and it sends no notice itself — a notice about a breach is written by a person.',
    willBeWrittenBy: 'etyme-regulatory',
  },
  BREACH_CLOCK_MISSED: {
    kind: 'UNPROMPTED',
    rung: 'L0',
    basis: 'RULE',
    says:
      'A deadline passed with no notice recorded against it. It is said out loud, every night, until somebody records the notice or closes the breach — a missed clock that stops being mentioned is a missed clock nobody fixes.',
    willBeWrittenBy: 'etyme-regulatory',
  },

  // ── A refusal aimed at somebody who asked ──────────────────────────

  DATA_REQUEST_REFUSED: {
    kind: 'ENFORCEMENT',
    outcome: 'BLOCK',
    basis: 'RULE',
    says:
      'Somebody asked for a person’s data or for them to be forgotten and was refused — they are not the person, or not the company that holds the record. A refusal aimed at somebody who asked carries no autonomy level, and it is logged as carefully as a grant.',
    willBeWrittenBy: 'etyme-regulatory',
  },

  // ── Acts a person took ─────────────────────────────────────────────

  DATA_EXPORT_REQUESTED: {
    kind: 'ATTRIBUTED',
    basis: 'RULE',
    says: 'A person asked for everything held about them, and a statutory clock started.',
    willBeWrittenBy: 'etyme-regulatory',
  },
  DATA_ERASURE_REQUESTED: {
    kind: 'ATTRIBUTED',
    basis: 'RULE',
    says: 'A person asked to be forgotten, and a statutory clock started.',
    willBeWrittenBy: 'etyme-regulatory',
  },
  DATA_REQUEST_ANSWERED: {
    kind: 'ATTRIBUTED',
    basis: 'RULE',
    says:
      'Somebody answered a request for a person’s data — produced the export, or finished the erasure — and the row says what was kept and why.',
    willBeWrittenBy: 'etyme-regulatory',
  },
  LEGAL_HOLD_PLACED: {
    kind: 'ATTRIBUTED',
    basis: 'RULE',
    says:
      'A company said a person’s or its own records may not be deleted yet, and gave a reason. It suspends every scheduled deletion of that subject, including ones this company would never see.',
    willBeWrittenBy: 'etyme-regulatory',
  },
  LEGAL_HOLD_LIFTED: {
    kind: 'ATTRIBUTED',
    basis: 'RULE',
    says:
      'A company lifted its hold. Anything another company still holds stays held, and the lifted row stays on the record as the answer to why something was still here.',
    willBeWrittenBy: 'etyme-regulatory',
  },
  BREACH_OPENED: {
    kind: 'ATTRIBUTED',
    basis: 'RULE',
    says:
      'Somebody decided that personal data went where it should not have, and opened a breach. The clocks count from when they became aware, not from when it happened.',
    willBeWrittenBy: 'etyme-regulatory',
  },
  BREACH_NOTICE_SENT: {
    kind: 'ATTRIBUTED',
    basis: 'RULE',
    says:
      'A notice about a breach went to an authority, to a customer, or to the people whose data it was, and the row says which and when.',
    willBeWrittenBy: 'etyme-regulatory',
  },
  BREACH_CLOSED: {
    kind: 'ATTRIBUTED',
    basis: 'RULE',
    says: 'A breach was closed out, on a stated basis, by somebody who put their name to it.',
    willBeWrittenBy: 'etyme-regulatory',
  },
}

export const ALL_PLANNED: string[] = Object.keys(PLANNED).sort()

// ── The whole inventory ──────────────────────────────

export const ACTIONS: Record<string, Act> = {}
for (const [action, a] of Object.entries(UNPROMPTED)) {
  ACTIONS[action] = { kind: 'UNPROMPTED', ...a }
}
for (const [action, a] of Object.entries(ENFORCEMENT)) {
  ACTIONS[action] = { kind: 'ENFORCEMENT', ...a }
}
for (const [action, a] of Object.entries(ATTRIBUTED)) {
  ACTIONS[action] = { kind: 'ATTRIBUTED', ...a }
}

export const ALL_ACTIONS: string[] = Object.keys(ACTIONS).sort()

/**
 * How many of each kind there are, counted rather than claimed.
 *
 * This exists because the paragraph at the top of this file used to say
 * thirteen, three and eighty-two, a heading below it said eighty-four,
 * and the jobs heading said fourteen where there were fifteen. Every one
 * of those was written truthfully on the day it was written and none of
 * them was reread when the next row was added. A number in prose is
 * wrong within a month; a number computed from the thing it describes is
 * never wrong.
 */
export const TALLY: Record<ActKind, number> = {
  UNPROMPTED: 0,
  ENFORCEMENT: 0,
  ATTRIBUTED: 0,
}
for (const action of ALL_ACTIONS) TALLY[ACTIONS[action].kind]++

// ── The jobs that run whether or not anybody is looking ───

export interface Job {
  job: string
  rung: Rung
  basis: Basis
  says: string
  /** The actions it writes, if any. A job can act and log nothing. */
  writes: string[]
}

export const JOBS: Record<string, Job> = {
  daily: {
    job: 'daily',
    rung: 'L0',
    basis: 'RULE',
    says: 'It runs the other jobs, one after another, and decides nothing itself. Read the level of each job it runs, not this one.',
    writes: [],
  },
  'due-cycles': {
    job: 'due-cycles',
    rung: 'L0',
    basis: 'RULE',
    says: 'Reads which cycles fall due inside a week and tells somebody. Changes nothing.',
    writes: ['DUE_CYCLES_SCAN'],
  },
  'visa-watch': {
    job: 'visa-watch',
    rung: 'L0',
    basis: 'RULE',
    says: 'Counts days to a petition’s milestones and tells somebody. Files nothing.',
    writes: ['VISA_WATCH'],
  },
  'loose-ends': {
    job: 'loose-ends',
    rung: 'L1',
    basis: 'RULE',
    says: 'Finds the placements missing their buy side and tells whoever should close them. It closes nothing.',
    writes: [],
  },
  'proactive-match': {
    job: 'proactive-match',
    rung: 'L1',
    basis: 'RECORDED',
    says: 'Scores people against open roles nobody has matched. Suggestions only; nobody is submitted.',
    writes: ['PROACTIVE_MATCH'],
  },
  'rolloff-scan': {
    job: 'rolloff-scan',
    rung: 'L2',
    basis: 'RULE',
    says: 'Opens a rolloff for every contract ending inside eight weeks, ready for a desk to work.',
    writes: ['ROLLOFF_SCAN'],
  },
  'cold-openings': {
    job: 'cold-openings',
    rung: 'L3',
    basis: 'RULE',
    says: 'Marks a seat cold when nobody has advertised it in six weeks.',
    writes: ['OPENINGS_COLD'],
  },
  'expire-invitations': {
    job: 'expire-invitations',
    rung: 'L3',
    basis: 'RULE',
    says: 'Expires invitations nobody answered by the date on them.',
    writes: ['INVITATIONS_EXPIRED'],
  },
  'deliver-webhooks': {
    job: 'deliver-webhooks',
    rung: 'L3',
    basis: 'RULE',
    says: 'Sends what is queued, retries what failed, and switches off a receiver that has stopped answering.',
    writes: ['WEBHOOK_DISABLED'],
  },
  'freshness-ping': {
    job: 'freshness-ping',
    rung: 'L3',
    basis: 'RULE',
    says: 'Every fortnight it emails everybody on a bench to ask whether anything has changed. It edits nobody’s record.',
    writes: [],
  },
  watch: {
    job: 'watch',
    rung: 'L3',
    basis: 'RULE',
    says:
      'Asks again for documents that have run out, and for cover for the weeks between one policy ending ' +
      'and the next beginning, from the company that owes them.',
    writes: ['PACKET_REOPENED'],
  },
  'auto-approve': {
    job: 'auto-approve',
    rung: 'L4',
    basis: 'RULE',
    says: 'Approves the weeks nobody answered, but only where the client agreed in a setting that silence counts. Anything it is unsure of it holds for a person instead.',
    writes: ['TIMESHEET_AUTO_APPROVED', 'TIMESHEET_HELD_FOR_PERSON'],
  },
  'agreement-terms': {
    job: 'agreement-terms',
    rung: 'L5',
    basis: 'RULE',
    says: 'Marks an agreement as running out or run out, and rolls an auto-renewing one on for another term. A date comparison against a document both sides signed.',
    writes: ['AGREEMENT_TERM_WATCH'],
  },
  'end-contracts': {
    job: 'end-contracts',
    rung: 'L5',
    basis: 'RULE',
    says: 'Ends contracts whose last day has passed, both sides, with nobody asked. A date comparison with a legal consequence.',
    writes: ['CONTRACTS_ENDED'],
  },
  'reap-demos': {
    job: 'reap-demos',
    rung: 'L5',
    basis: 'RULE',
    says: 'Deletes demo workspaces nobody has come back to in a fortnight. It cannot be undone, and it only ever touches demo data.',
    writes: [],
  },
}

export const ALL_JOBS: string[] = Object.keys(JOBS).sort()

// ── Reading a row ────────────────────────────────────

export function actOf(action: string): Act | null {
  return ACTIONS[action] ?? null
}

/**
 * The rung, or null.
 *
 * Null is the right answer for a refusal and for a person's own act. A
 * level describes what the system did on its own; giving one to an
 * `AWARD_BLOCKED` row would be claiming autonomy for saying no to
 * somebody.
 */
export function rungOf(action: string): Rung | null {
  const act = ACTIONS[action]
  return act && act.kind === 'UNPROMPTED' ? act.rung : null
}

export function kindOf(action: string): ActKind | null {
  return ACTIONS[action]?.kind ?? null
}

/** What a rung means, in a sentence. Never show the code alone. */
export function levelSays(rung: Rung): string {
  return LADDER[rung].says
}

export function levelName(rung: Rung): string {
  return LADDER[rung].name
}

export type Decided =
  | { by: 'RULE'; says: string }
  | { by: 'MODEL'; says: string }
  | { by: 'UNRECORDED'; says: string }

/**
 * What actually decided this row — a rule or a model.
 *
 * Derived where the answer cannot vary. Read from the row where it can,
 * because the match engine and the site writer both fall back to
 * arithmetic when there is no API key, and a week where the key was
 * misconfigured must not read as a week the model got free.
 *
 * Where the action could have been either and the row does not say, this
 * returns UNRECORDED rather than a guess. A plausible wrong answer here
 * is worse than a blank: it is a claim about how much of the product is
 * AI, made to somebody evaluating exactly that.
 */
export function decidedBy(action: string, payload?: unknown): Decided {
  const act = ACTIONS[action]
  if (!act) {
    return { by: 'UNRECORDED', says: 'This action has no place in the ladder yet.' }
  }
  if (act.basis === 'RULE') {
    return { by: 'RULE', says: 'A rule decided this — a date, a threshold or a count. No model was involved.' }
  }

  const p = (payload ?? {}) as Record<string, unknown>
  const marker = p.writtenBy ?? p.decidedBy
  if (marker === 'MODEL') {
    return { by: 'MODEL', says: 'A model did this work, and the row says so.' }
  }
  if (marker === 'RULE') {
    return { by: 'RULE', says: 'A model could have done this, and did not — it fell back to arithmetic, and the row says so.' }
  }
  return {
    by: 'UNRECORDED',
    says: 'A model may have done this work and the row does not say which. We will not guess.',
  }
}

/** Can this still be put back? The row already knows; this says it in words. */
export function undoSays(reversible: boolean, reversedAt: Date | string | null): string {
  if (reversedAt) return 'Already undone.'
  if (reversible) return 'This can still be undone.'
  return 'This cannot be undone.'
}

export interface Read {
  action: string
  kind: ActKind | null
  rung: Rung | null
  levelName: string | null
  levelSays: string | null
  outcome: Outcome | null
  actSays: string | null
  decided: Decided
  undo: string
}

/** Everything the surface needs about one row, with no codes in it. */
export function readRow(row: {
  action: string
  payload?: unknown
  reversible: boolean
  reversedAt?: Date | string | null
}): Read {
  const act = ACTIONS[row.action]
  const rung = rungOf(row.action)
  return {
    action: row.action,
    kind: act?.kind ?? null,
    rung,
    levelName: rung ? LADDER[rung].name : null,
    levelSays: rung ? LADDER[rung].says : null,
    outcome: act && act.kind === 'ENFORCEMENT' ? act.outcome : null,
    actSays: act && act.kind !== 'ATTRIBUTED' ? act.says : null,
    decided: decidedBy(row.action, row.payload),
    undo: undoSays(row.reversible, row.reversedAt ?? null),
  }
}

/** What we say when somebody asks how autonomous this product is. */
export const KIND_SAYS: Record<ActKind, string> = {
  UNPROMPTED: 'The system did this, and nobody asked it to.',
  ENFORCEMENT:
    'Somebody asked to do something and the system decided whether they could. This is governance, not autonomy — it has no level.',
  ATTRIBUTED: 'A person did this. The row is the record that they did, not something the system decided.',
}

// ── Reading the code for the names it can write ──────
//
// The ladder is only true if it knows what the code actually writes, and
// the only way to know that without running every route is to read the
// source for the names in it. That reader lives here, beside the ladder,
// rather than inside the test that uses it, for two reasons: two copies
// of it had already drifted apart by the time this was written, and a
// domain agent who cannot edit this file still has to be able to reason
// about what the check will see.
//
// ── The two traps it used to have, and why they mattered ─────────────
//
// It read the `action:` value to the first comma or the end of the line,
// so a ternary broken over four lines showed one name and hid the rest.
// `api/requisitions/[id]/approve` writes three names across four lines
// and the inventory knew about one of them; the other two — a
// requisition rejected and a requisition sent back — were written to
// production for as long as that route existed and no reader could find
// them. It also took every SCREAMING_SNAKE literal after the first `?`,
// conditions included, so `step === 'FACTORED' ? …` put FACTORED into
// the inventory as an act nobody ever performs. Between them the two
// traps pushed every author toward a single unreadable line and a
// hoisted boolean per branch, which is a scanner deciding how code is
// written.
//
// So this one takes the balanced `action:` value however many lines it
// spans, and reads names from BRANCH positions only — the outcomes a
// ternary can evaluate to, never the tests it makes on the way.
//
// ── What it deliberately cannot see ──────────────────────────────────
//
// A name assembled at runtime, and a name looked up in a table. Both are
// invisible here and both should be: `unnamed` reports them rather than
// passing over them, because the old behavior — no literal read as no
// log at all — is how four money routes and one access route logged
// under names the ladder had never heard of. A lookup table would be
// legible to a person and invisible to this, which is the one shape that
// is worse than an ugly ternary.
//
// There is no regular-expression literal inside any `automationLog.create`
// call and this reader does not try to recognize one; a `/` here is
// division. If that ever stops being true the depth count goes wrong
// loudly rather than quietly, because the call will not close.

/** Advance past a comment, string or template starting at `i`. */
function skipInert(src: string, i: number): number {
  const c = src[i]
  const d = src[i + 1]

  if (c === '/' && d === '/') {
    const nl = src.indexOf('\n', i)
    return nl === -1 ? src.length : nl
  }
  if (c === '/' && d === '*') {
    const end = src.indexOf('*/', i + 2)
    return end === -1 ? src.length : end + 2
  }
  if (c === '"' || c === "'") {
    let j = i + 1
    while (j < src.length) {
      if (src[j] === '\\') { j += 2; continue }
      if (src[j] === c) return j + 1
      j++
    }
    return src.length
  }
  if (c === '`') {
    let j = i + 1
    while (j < src.length) {
      if (src[j] === '\\') { j += 2; continue }
      if (src[j] === '`') return j + 1
      // An interpolation can hold anything, including another template.
      if (src[j] === '$' && src[j + 1] === '{') {
        let depth = 1
        j += 2
        while (j < src.length && depth > 0) {
          const k = skipInert(src, j)
          if (k !== j) { j = k; continue }
          if (src[j] === '{') depth++
          else if (src[j] === '}') depth--
          j++
        }
        continue
      }
      j++
    }
    return src.length
  }
  return i
}

const OPENS = '([{'
const CLOSES = ')]}'

/** Every `automationLog.create(...)` call in a file, as balanced source text. */
export function automationCalls(source: string): string[] {
  const out: string[] = []
  const re = /\bautomationLog\.create\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source))) {
    let i = m.index + m[0].length
    let depth = 1
    while (i < source.length && depth > 0) {
      const k = skipInert(source, i)
      if (k !== i) { i = k; continue }
      const c = source[i]
      if (OPENS.includes(c)) depth++
      else if (CLOSES.includes(c)) depth--
      i++
    }
    out.push(source.slice(m.index, i))
  }
  return out
}

/**
 * The `action:` values in one call, each as balanced source text.
 *
 * Balanced to the comma that ends the property, so a value spanning four
 * lines is one value and not its first line.
 */
export function actionExpressions(call: string): string[] {
  const out: string[] = []
  const word = /[A-Za-z0-9_$]/
  let i = 0
  while (i < call.length) {
    const k = skipInert(call, i)
    if (k !== i) { i = k; continue }
    if (word.test(call[i])) {
      let j = i
      while (j < call.length && word.test(call[j])) j++
      if (call.slice(i, j) === 'action') {
        let c = j
        while (c < call.length && /\s/.test(call[c])) c++
        // `action:` is the key. A bare `action` in a payload is shorthand
        // for a value and names nothing.
        if (call[c] === ':') {
          let v = c + 1
          const start = v
          let depth = 0
          while (v < call.length) {
            const kk = skipInert(call, v)
            if (kk !== v) { v = kk; continue }
            const ch = call[v]
            if (OPENS.includes(ch)) depth++
            else if (CLOSES.includes(ch)) { if (depth === 0) break; depth-- }
            else if (ch === ',' && depth === 0) break
            v++
          }
          out.push(call.slice(start, v).trim())
          i = v
          continue
        }
      }
      i = j
      continue
    }
    i++
  }
  return out
}

/** Whether the whole of `t` is one pair of brackets. */
function wrapped(t: string): boolean {
  if (!t.startsWith('(') || !t.endsWith(')')) return false
  let depth = 0
  let i = 0
  while (i < t.length) {
    const k = skipInert(t, i)
    if (k !== i) { i = k; continue }
    if (OPENS.includes(t[i])) depth++
    else if (CLOSES.includes(t[i])) {
      depth--
      if (depth === 0) return i === t.length - 1
    }
    i++
  }
  return false
}

/**
 * The outcomes an expression can evaluate to.
 *
 * A ternary chain `a ? X : b ? Y : Z` has three outcomes and two tests,
 * and only the outcomes are names. The rule is one line: a segment
 * followed by `?` is a test; every other segment is an outcome. `??` and
 * `?.` are operators, not ternaries, and are stepped over.
 */
export function branchesOf(expr: string): string[] {
  const t = expr.trim()
  if (t === '') return []
  if (wrapped(t)) return branchesOf(t.slice(1, -1))

  const marks: { at: number; ch: '?' | ':' }[] = []
  let depth = 0
  let i = 0
  while (i < t.length) {
    const k = skipInert(t, i)
    if (k !== i) { i = k; continue }
    const c = t[i]
    if (OPENS.includes(c)) depth++
    else if (CLOSES.includes(c)) depth--
    else if (depth === 0 && c === '?') {
      if (t[i + 1] === '?' || t[i + 1] === '.') { i += 2; continue }
      marks.push({ at: i, ch: '?' })
    } else if (depth === 0 && c === ':') {
      marks.push({ at: i, ch: ':' })
    }
    i++
  }
  if (marks.length === 0) return [t]

  const segs: string[] = []
  let from = 0
  for (const mk of marks) {
    segs.push(t.slice(from, mk.at))
    from = mk.at + 1
  }
  segs.push(t.slice(from))

  const out: string[] = []
  for (let s = 0; s < segs.length; s++) {
    if (marks[s]?.ch === '?') continue // a test, not an outcome
    out.push(...branchesOf(segs[s]))
  }
  return out
}

/** A name stated whole: a quoted SCREAMING_SNAKE string and nothing else. */
const WHOLE_NAME = /^(['"`])([A-Z][A-Z0-9_]{2,})\1$/

export interface NamesRead {
  /** Every outcome, as source text. */
  branches: string[]
  /** The names those outcomes state, sorted and deduplicated. */
  names: string[]
  /** Outcomes that are not a name stated whole — assembled, or looked up. */
  unnamed: string[]
}

/** Read one `action:` expression. */
export function namesIn(expr: string): NamesRead {
  const branches = branchesOf(expr)
  const names: string[] = []
  const unnamed: string[] = []
  for (const b of branches) {
    const m = b.match(WHOLE_NAME)
    if (m) names.push(m[2])
    else unnamed.push(b)
  }
  return { branches, names: [...new Set(names)].sort(), unnamed }
}

/** Read a whole file: every name every `automationLog.create` in it can write. */
export function actionsNamedIn(source: string): NamesRead {
  const branches: string[] = []
  const names: string[] = []
  const unnamed: string[] = []
  for (const call of automationCalls(source)) {
    for (const expr of actionExpressions(call)) {
      const read = namesIn(expr)
      branches.push(...read.branches)
      names.push(...read.names)
      unnamed.push(...read.unnamed)
    }
  }
  return { branches, names: [...new Set(names)].sort(), unnamed }
}
