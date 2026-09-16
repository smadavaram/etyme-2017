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
 *                rung on the ladder. Thirteen of them.
 *   ENFORCEMENT  The system decided what a person was allowed to do —
 *                refused, warned, or let through. Governance, not
 *                autonomy: a BLOCK on a tenure limit is aimed at
 *                somebody who asked for something. Three of them.
 *   ATTRIBUTED   A person did this and the row is the record that they
 *                did. Eighty-two of them.
 *
 * That last number is the finding. Most of what is in the automation log
 * is an audit trail of human acts, not automation. Giving those a rung
 * would inflate every claim we make.
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

// ── The thirteen things we do that nobody asked for ────

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
    says: 'A document that has run out is asked for again, from the company that owes it. Asking is all it does.',
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
  CONTRACTS_ENDED: {
    rung: 'L5',
    basis: 'RULE',
    says: 'A contract whose last day has passed is ended, both sides, with nobody asked. It is a date comparison, and it is what break-in-service and tenure are counted from.',
  },
}

// ── The three things that are governance, not autonomy ───

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
  COLLEAGUE_JOINED: {
    outcome: 'PERMIT',
    basis: 'RULE',
    says: 'Somebody was let into this company without an admin approving them, because their work email is on a domain this company had already claimed. A permit is a governance decision and is logged like a refusal.',
  },
}

// ── The eighty-two things a person did ─────────────
//
// The row already carries a plain-English summary and reason written by
// the code that made it, so there is nothing to add here but the fact
// that a person is behind it — and, where it matters, what did the work.

const ATTRIBUTED: Record<string, { basis: Basis }> = {}
const RULE_ATTRIBUTED = [
  'ACCESS_GRANTED', 'ADDRESS_CHANGED', 'ALUMNI_ASK_BACK', 'API_KEY_ISSUED',
  'API_KEY_REVOKED', 'APPROVAL_RULE_CREATED', 'APPROVAL_RULE_DEACTIVATED',
  'BENCH_CONSENT_DECLINED', 'BENCH_CONSENT_GIVEN', 'BENCH_LISTING_GRANTED',
  'BENCH_LISTING_REQUESTED', 'BENCH_LISTING_REVOKED', 'BLACKLIST_ADD',
  'BLACKLIST_LIFT', 'CANDIDATE_AWARDED', 'COMMISSION_RUN', 'COMPANY_CREATED',
  'COMPANY_SETTINGS_CHANGED', 'CONSULTANT_CREATED', 'CONTRACT_CREATED',
  'CONTRACT_EXTENDED', 'CREDIT_LIMIT_CHANGED', 'CREDIT_LIMIT_SET',
  'CUSTOM_DOMAIN_ADDED', 'CUSTOM_DOMAIN_REMOVED', 'DOCUMENTS_SHARED',
  'DOCUMENT_SHARE_REVOKED', 'DOMAIN_CLAIMED', 'DUNNING_SENT', 'HOLIDAYS_ADDED',
  'IMPORT_COMMITTED', 'INTERVIEW_ACCEPTED', 'INTERVIEW_DECLINED',
  'INVITATION_ACCEPTED', 'INVITATION_DECLINED', 'INVITATION_WITHDRAWN',
  'INVOICE_GENERATED', 'INVOICE_MATCH_OVERRIDDEN',
  'INVOICE_MATCH_OVERRIDE_WITHDRAWN', 'INVOICE_SUBMITTED', 'LEADS_READ',
  'LEAD_KEPT_APART_BY_PERSON', 'LEAD_MERGED_BY_PERSON', 'OPENING_WRITTEN_UP',
  'ORDER_LOCKED', 'ORDER_SETTLED', 'ORDER_UNLOCKED', 'OUTBOUND_PACK_SENT',
  'OWN_DOCUMENT_RECORDED', 'PACKET_REQUESTED', 'PAYMENT_RECORDED',
  'PAYROLL_OFF_CYCLE', 'PAYROLL_RUN', 'PERSON_INVITED', 'PLACEMENT_CONVERTED',
  'PLACEMENT_REPLACED', 'PURCHASE_ORDER_CHANGED', 'PURCHASE_ORDER_RAISED',
  'RATE_AMENDMENT_APPROVED', 'RATE_AMENDMENT_REJECTED', 'REMIT_TO_ADDED',
  'REMIT_TO_CHANGED', 'REQUIREMENT_DISTRIBUTED', 'REQUIREMENT_STATUS_CHANGED',
  'REQUISITION_APPROVED', 'REQUISITION_CANCELLED', 'REQUISITION_CHANGED',
  'REQUISITION_DISTRIBUTED', 'REVERSAL', 'ROLE_PERMISSIONS_CHANGED',
  'ROLLOFF_CLAIMED', 'ROLLOFF_INITIATED', 'ROLLOFF_RESOLVED',
  'SUBMISSION_STATUS_CHANGED', 'SUPPLIER_APPROVED', 'SUPPLIER_DECLINED',
  'SUPPLIER_ITEM_MARKED', 'TEMPLATE_PACK_APPLIED',
  'TIMESHEET_APPROVED', 'TIMESHEET_REJECTED', 'WEBHOOK_ADDED',
]
for (const a of RULE_ATTRIBUTED) ATTRIBUTED[a] = { basis: 'RULE' }

// A person pressed the button, but a model may have done the work — and
// which one it was changes run to run, so the row has to say.
ATTRIBUTED.MATCH_RUN = { basis: 'RECORDED' }
ATTRIBUTED.SITE_WRITTEN = { basis: 'RECORDED' }
ATTRIBUTED.DATA_IMPORTED = { basis: 'RECORDED' }

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

// ── The fourteen jobs that run whether or not anybody is looking ───

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
    says: 'Asks again for documents that have run out, from the company that owes them.',
    writes: ['PACKET_REOPENED'],
  },
  'auto-approve': {
    job: 'auto-approve',
    rung: 'L4',
    basis: 'RULE',
    says: 'Approves the weeks nobody answered, but only where the client agreed in a setting that silence counts. Anything it is unsure of it holds for a person instead.',
    writes: ['TIMESHEET_AUTO_APPROVED', 'TIMESHEET_HELD_FOR_PERSON'],
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
