/**
 * The skill registry (records 123, 125). Pure data: no database, no network.
 *
 * Each thing an agent does is one named skill. A skill says what it takes,
 * what it gives back, how sensitive its data is, which tier of model (if any)
 * it may use, whether it may send, and the checker that grades it against
 * the record. An agent is a plan of skills (`lib/agents/plans`), never its
 * own pile of code.
 *
 * What cannot be registered: a skill that moves money, signs, awards,
 * extends or ends a placement, decides about a person, or publishes
 * compliance copy. Lane C data (tax ID, bank details, social security
 * number, W-4, W-9, voided check, identity papers) reaches no model, so a
 * Lane C skill is a rules skill. No price appears anywhere here (record 127
 * is not published to code).
 */

export type DataClass = 'NON_SENSITIVE' | 'TENANT_BUSINESS' | 'LANE_C'
/** RULES: no model. LOW and HIGH are the two model tiers; steps name a tier, never a model. */
export type Tier = 'RULES' | 'LOW' | 'HIGH'
export const TIERS: readonly Tier[] = ['RULES', 'LOW', 'HIGH']

/** What a skill does to the world. The last seven are never registered. */
export type SkillAct =
  | 'READ'
  | 'DRAFT'
  | 'OPEN_CARD'
  | 'WRITE_ROW'
  | 'SEND'
  | 'MOVE_MONEY'
  | 'SIGN'
  | 'AWARD'
  | 'EXTEND'
  | 'END_PLACEMENT'
  | 'DECIDE_ABOUT_PERSON'
  | 'PUBLISH_COMPLIANCE_COPY'

export const FORBIDDEN_ACTS: readonly SkillAct[] = [
  'MOVE_MONEY', 'SIGN', 'AWARD', 'EXTEND', 'END_PLACEMENT', 'DECIDE_ABOUT_PERSON', 'PUBLISH_COMPLIANCE_COPY',
]

/**
 * Papers that are Lane C by type. The gateway refuses these by type first
 * and scrubs patterns second (record 125); `document.read` is for every
 * other type only.
 */
export const LANE_C_DOC_TYPES: readonly string[] = [
  'W4', 'W9', 'VOIDED_CHECK', 'SSA_CARD', 'I9', 'I9_LIST_A', 'I9_LIST_B', 'I9_LIST_C',
  'PASSPORT', 'DRIVERS_LICENSE', 'NATIONAL_ID', 'WORK_PERMIT',
]

/** Whether a paper of this type may be read by any model. A Lane C type goes to rules or to a person. */
export const paperMayReachModel = (documentType: string): boolean => {
  const squash = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return !LANE_C_DOC_TYPES.some((t) => squash(t) === squash(documentType))
}

export interface Skill {
  key: string
  /** The trade's name for it, in plain words. */
  name: string
  /** What one unit of this skill is, for Planned and Actual. */
  unit: string
  inputs: readonly string[]
  /** What it gives back, in a few words. */
  output: string
  dataClass: DataClass
  /** The tier it starts on. */
  tier: Tier
  /** A failed inline key may move it from the low tier to the high tier once. */
  mayEscalate: boolean
  acts: readonly SkillAct[]
  /** True only for a skill that sends, and then `taskKinds` names the approved tasks it may send under. */
  maySend: boolean
  taskKinds: readonly string[]
  /** The agents that use it. */
  usedBy: readonly string[]
  /** The checker that grades it, and what that checker re-reads. A checker never takes the agent's report. */
  answerKey: { checker: string; says: string }
}

const TENANT: DataClass = 'TENANT_BUSINESS'
const CHASE_AGENTS = ['timesheet-chase', 'money-owed-chase', 'confirmation-tracker', 'interview-chase', 'census-keeper', 'outreach-batch']
const CHASE_KINDS = [
  'TIMESHEET_CHASE', 'MONEY_OWED_CHASE', 'SUBMISSION_CHASE', 'INTERVIEW_CHASE',
  'DORMANT_OUTREACH_CUSTOMER', 'DORMANT_OUTREACH_SUPPLIER', 'OUTREACH_BATCH',
]

const rule = (s: Omit<Skill, 'dataClass' | 'tier' | 'mayEscalate' | 'maySend' | 'taskKinds' | 'acts'> & Partial<Skill>): Skill => ({
  dataClass: TENANT, tier: 'RULES', mayEscalate: false, acts: ['READ', 'WRITE_ROW'], maySend: false, taskKinds: [], ...s,
})
const model = (s: Omit<Skill, 'dataClass' | 'tier' | 'mayEscalate' | 'maySend' | 'taskKinds' | 'acts'> & Partial<Skill>): Skill => ({
  dataClass: TENANT, tier: 'LOW', mayEscalate: true, acts: ['READ', 'DRAFT'], maySend: false, taskKinds: [], ...s,
})

export const SKILLS: readonly Skill[] = [
  rule({ key: 'census.classify', name: 'Active and dormant count', unit: 'company', inputs: ['companyId', 'week'], output: 'active and dormant counts', usedBy: ['census-keeper'],
    answerKey: { checker: 'census.classify', says: 'one CENSUS_WEEKLY row for the week; its active and dormant counts equal censusFacts re-read by the checker' } }),
  rule({ key: 'weekly.summary', name: 'Weekly summary line', unit: 'summary', inputs: ['companyId', 'week'], output: 'the week’s figures in one line', usedBy: ['weekly-summary'],
    answerKey: { checker: 'weekly.summary', says: 'the Monday’s week re-read from the readers: customers and suppliers active and dormant (censusFacts), consultants billing, hours accepted and hours filed and waiting; each figure on the ledger line equals the re-read' } }),
  rule({ key: 'tenure.watch', name: 'Tenure limit watch', unit: 'person', inputs: ['companyId', 'today'], output: 'open cards at 90, 60 and 30 days', acts: ['READ', 'OPEN_CARD'], usedBy: ['compliance-watch'],
    answerKey: { checker: 'tenure.watch', says: 'an OPEN card exactly for people standingAgainstLimit puts at 90, 60 or 30 days or past; none where the client has no limit' } }),
  rule({ key: 'notice.clock', name: 'Notice period', unit: 'notice', inputs: ['companyId', 'today'], output: 'notice ended rows', usedBy: ['compliance-watch'],
    answerKey: { checker: 'notice.clock', says: 'NOTICE_PERIOD_ENDED exists exactly where 10 working days passed on the company calendar' } }),
  rule({ key: 'access-file.track', name: 'Public access file due', unit: 'petition', inputs: ['companyId', 'today'], output: 'one due date per filed petition', usedBy: ['compliance-watch'],
    answerKey: { checker: 'access-file.track', says: 'one due-date row per filed petition' } }),
  rule({ key: 'checklist.list', name: 'Checklist lines', unit: 'line', inputs: ['companyId', 'record'], output: 'one line per supported record', usedBy: ['contracts-checklist', 'immigration-checklist'],
    answerKey: { checker: 'checklist.list', says: 'one line per supported record; none for a missing paper; no line deleted or relabeled against the prior snapshot' } }),
  rule({ key: 'drift.flag', name: 'Agreed vs actual', unit: 'field', inputs: ['companyId', 'record'], output: 'open decision where actual differs from agreed', acts: ['READ', 'OPEN_CARD'], usedBy: ['contracts-checklist', 'reconciliation'],
    answerKey: { checker: 'drift.flag', says: 'an OPEN decision exactly where the re-read actual differs from agreed; never two on the same record and field' } }),
  rule({ key: 'card.open', name: 'Open decision card', unit: 'card', inputs: ['companyId', 'kind', 'recordId', 'role'], output: 'one open card', acts: ['READ', 'OPEN_CARD'], usedBy: ['every card-opening agent'],
    answerKey: { checker: 'card.open', says: 'exactly one OPEN card per kind and record; owedTo equals seatFor(role) re-read, else the Owner' } }),
  rule({ key: 'confirmation.match', name: 'Confirmation on thread', unit: 'confirmation', inputs: ['companyId', 'submissionId', 'messageId'], output: 'confirmation tied to its submission', usedBy: ['confirmation-tracker'],
    answerKey: { checker: 'confirmation.match', says: 'the messageId exists on the submission’s own thread and its status is not DRAFT' } }),
  rule({ key: 'dual-auth.block', name: 'Duplicate submission', unit: 'pair', inputs: ['companyId', 'submissionId'], output: 'blocked pair', acts: ['READ', 'OPEN_CARD'], usedBy: ['confirmation-tracker'],
    answerKey: { checker: 'dual-auth.block', says: 'each blocked pair is one person, one job, overlapping dates' } }),
  rule({ key: 'payment.match', name: 'Payment to bill match', unit: 'payment', inputs: ['companyId', 'paymentId'], output: 'matched or carded payment', acts: ['READ', 'WRITE_ROW', 'OPEN_CARD'], usedBy: ['reconciliation'],
    answerKey: { checker: 'payment.match', says: 'matched amount equals the bill to the cent in the bill’s currency; each short pay, overpay or mismatch has a card carrying both figures' } }),
  rule({ key: 'payroll.draft', name: 'Payroll draft', unit: 'person', inputs: ['companyId', 'period'], output: 'a draft, never a run', usedBy: ['payroll-draft'],
    answerKey: { checker: 'payroll.draft', says: 'people, hours and gross equal a fresh runPayroll dry run; no pay day marked; no run logged' } }),
  model({ key: 'match.rank', name: 'Match ranking', unit: 'row', inputs: ['requirementId', 'candidates'], output: 'ranked rows with factors, basis, confidence and unknowns', usedBy: ['match-ranker'],
    answerKey: { checker: 'match.rank', says: 'every row has factors, basis, confidence and unknowns; scoredBy equals the AgentRun model' } }),
  model({ key: 'skills.evidence', name: 'CV skill evidence', unit: 'quote', inputs: ['submissionId', 'cvText'], output: 'quotes that support each skill', usedBy: ['submission check'],
    answerKey: { checker: 'skills.evidence', says: 'every returned quote appears verbatim in the source' } }),
  model({ key: 'document.read', name: 'Read a paper into fields', unit: 'paper', inputs: ['documentType', 'pages'], output: 'fields with the quote behind each', usedBy: ['extract callers'],
    answerKey: { checker: 'document.read', says: 'every value has its quote on the page; no Lane C pattern in the sent or returned text' } }),
  model({ key: 'site.voice', name: 'Storefront wording', unit: 'draft', inputs: ['facts'], output: 'a storefront draft', mayEscalate: false, usedBy: ['storefront'],
    answerKey: { checker: 'site.voice', says: 'every number, proper noun and email appears in the facts handed over; no currency figure; no Person.name' } }),
  model({ key: 'bio.write', name: 'Consultant bio', unit: 'bio', inputs: ['personId'], output: 'a bio from her own record', mayEscalate: false, usedBy: ['consultant-portfolio'],
    answerKey: { checker: 'bio.write', says: 'every number and proper noun appears on her own record; no currency; no company outside her own placements' } }),
  model({ key: 'ask.answer', name: 'Ask Etyme answer', unit: 'answer', inputs: ['question', 'data'], output: 'an answer from the data beside it', mayEscalate: false, usedBy: ['twin read'],
    answerKey: { checker: 'ask.answer', says: 'every number in the answer appears in the data payload handed to the model' } }),
  rule({ key: 'chase.propose', name: 'Propose chase task', unit: 'task', inputs: ['companyId', 'record', 'plan'], output: 'a proposed task and an open card', acts: ['READ', 'WRITE_ROW', 'OPEN_CARD'], usedBy: CHASE_AGENTS,
    answerKey: { checker: 'chase.propose', says: 'AgentTask PROPOSED with its plan, a card OPEN, any amount equals the ledger figure' } }),
  rule({ key: 'chase.send', name: 'Send approved letter', unit: 'letter', inputs: ['taskId', 'letter'], output: 'a letter on the mail ledger', acts: ['READ', 'SEND'], maySend: true, taskKinds: CHASE_KINDS, usedBy: CHASE_AGENTS,
    answerKey: { checker: 'chase.send', says: 'each mail row ties to an APPROVED task; count at or under plan; none on Drafts only or with outreach off' } }),
  rule({ key: 'chase.close', name: 'Close on arrival', unit: 'task', inputs: ['taskId'], output: 'a closed task', usedBy: CHASE_AGENTS,
    answerKey: { checker: 'chase.close', says: 'task CLOSED_BY_ARRIVAL and the arrival row exists' } }),
]

export const skillKeys = (): string[] => SKILLS.map((s) => s.key)
export function skillOf(key: string): Skill | null {
  return SKILLS.find((s) => s.key === key) ?? null
}

/**
 * What is wrong with a list of skills, one sentence each. Empty means the
 * list may stand. The build test reads this and names every gap.
 */
export function registryGaps(skills: readonly Skill[] = SKILLS): string[] {
  const gaps: string[] = []
  const seen = new Set<string>()
  for (const s of skills) {
    const at = `Skill ${s.key || '(no key)'}`
    if (!s.key) gaps.push('A skill has no key.')
    if (s.key && seen.has(s.key)) gaps.push(`${at} is registered twice.`)
    seen.add(s.key)
    if (!s.name) gaps.push(`${at} has no name.`)
    if (!s.unit) gaps.push(`${at} names no unit.`)
    if (!s.dataClass) gaps.push(`${at} names no data class.`)
    if (!TIERS.includes(s.tier)) gaps.push(`${at} names no tier.`)
    if (!s.answerKey?.checker || !s.answerKey?.says) gaps.push(`${at} has no checker, so nothing grades it.`)
    if (s.dataClass === 'LANE_C' && s.tier !== 'RULES') gaps.push(`${at} handles Lane C data, so it can only be a rules skill.`)
    if (s.tier === 'RULES' && s.mayEscalate) gaps.push(`${at} is a rules skill and has no tier to escalate from.`)
    if (s.tier === 'HIGH' && s.mayEscalate) gaps.push(`${at} is already on the high tier and cannot escalate.`)
    const bad = s.acts.filter((a) => FORBIDDEN_ACTS.includes(a))
    if (bad.length) gaps.push(`${at} would ${bad.join(', ')}, which no skill may do.`)
    if (s.maySend && s.taskKinds.length === 0) gaps.push(`${at} may send and names no task kind, so it could send outside an approved task.`)
    if (s.maySend && !s.acts.includes('SEND')) gaps.push(`${at} may send and does not list sending among its acts.`)
    if (!s.maySend && (s.acts.includes('SEND') || s.taskKinds.length > 0)) gaps.push(`${at} sends or names a task kind and is not marked as one that may send.`)
  }
  return gaps
}
