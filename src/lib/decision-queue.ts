/**
 * The decision queue's words and rules (record 107, Flow A, A2 to A6).
 *
 * Pure, so the screens and the routes read one description: what the
 * "Open a decision" form posts and what its route reads, what the three
 * acts post, which records a proof may point at and where each opens, and
 * the six agents of record 105, none enabled in week 1. The rules about
 * age, state and who decides are lib/decision-items.
 */

import { OWNER_ROLE, ADMIN_ROLE } from '@/lib/owner-rules'
import { formatDayLong } from '@/lib/format-date'
import { CANNOT_READ_MONTH_RECORD, LOOP_HREF, LOOP_READS } from '@/lib/money-loop'

// ── Who may open one ────────────────────────────────────────────────

/** Opening a decision is the Owner's or an Admin's act. Pure. */
export function mayOpenDecision(roleName: string | null | undefined): string | null {
  return roleName === OWNER_ROLE || roleName === ADMIN_ROLE
    ? null
    : 'Only the firm’s Owner or an Admin opens a decision. Ask one of them to open it.'
}

/** Setting the first screen after sign-in is the Owner's act. Pure. */
export function maySetHomePage(roleName: string | null | undefined): string | null {
  return roleName === OWNER_ROLE ? null : 'Only the firm’s Owner chooses the first screen after sign-in.'
}

// ── What a proof may point at ───────────────────────────────────────

/** The records a proof links to, in the words a person picks from. */
export const PROOF_TYPES = [
  { type: 'Company', label: 'A company' },
  { type: 'SellContract', label: 'A contract' },
  { type: 'Person', label: 'A person on your list' },
  { type: 'VendorBill', label: 'An invoice receipt' },
  { type: 'Invoice', label: 'A bill' },
  { type: 'Offer', label: 'An offer' },
  { type: 'ChecklistItem', label: 'A checklist paper' },
  { type: 'Petition', label: 'An immigration petition' },
  { type: 'NoticePosting', label: 'A posted notice' },
  { type: 'PublicAccessFile', label: 'A public access file' },
  { type: 'SubmissionConfirmation', label: 'A submission confirmation' },
] as const

export type ProofType = (typeof PROOF_TYPES)[number]['type']
/**
 * Everything the record view opens: the proof types, a decision itself,
 * and a consultant's month from timesheet to payment (a MoneyChain, the
 * payroll record of lib/record-ledger). A month is never picked as proof
 * by hand; a disputed month's own decision links to it.
 */
export type RecordType = ProofType | 'DecisionItem' | 'MoneyChain' | 'AgentTask' | 'AgentSwitch' | 'PayrollDraft'

export const RECORD_TYPES: readonly RecordType[] = [...PROOF_TYPES.map((p) => p.type), 'DecisionItem', 'MoneyChain', 'AgentTask', 'AgentSwitch', 'PayrollDraft']

export function isRecordType(t: unknown): t is RecordType {
  return typeof t === 'string' && (RECORD_TYPES as readonly string[]).includes(t)
}

/**
 * The permission a seat holds to read a record of this type, where one is
 * needed beyond a working seat: the one its own list asks for. A decision
 * is read by the proof rule (`mayReadProof` in lib/decision-items). Pure.
 */
export function readNeeds(type: RecordType): 'invoices.read' | 'assignments.read' | 'consultants.read' | 'consultants.write' | 'submissions.read' | typeof LOOP_READS | null {
  if (type === 'MoneyChain' || type === 'PayrollDraft') return LOOP_READS
  if (type === 'Offer' || type === 'SubmissionConfirmation') return 'submissions.read'
  // The paperwork routes read these with the permission that writes them (whoever looks after paperwork).
  if (type === 'ChecklistItem' || type === 'Petition' || type === 'NoticePosting' || type === 'PublicAccessFile') return 'consultants.write'
  if (type === 'Invoice' || type === 'VendorBill') return 'invoices.read'
  if (type === 'SellContract') return 'assignments.read'
  if (type === 'Person') return 'consultants.read'
  return null
}

/** What a seat that does not hold `readNeeds(type)` reads, in a sentence. Pure. */
export function cannotReadSays(type: RecordType): string {
  if (type === 'MoneyChain') return CANNOT_READ_MONTH_RECORD
  if (type === 'Invoice' || type === 'VendorBill') return 'Your seat cannot read bills or invoice receipts.'
  if (type === 'SellContract') return 'Your seat cannot read contracts.'
  if (type === 'Person') return 'Your seat cannot read people’s records.'
  if (type === 'PayrollDraft') return CANNOT_READ_MONTH_RECORD
  if (type === 'Offer' || type === 'SubmissionConfirmation') return 'Your seat cannot read submissions.'
  if (type === 'ChecklistItem' || type === 'Petition' || type === 'NoticePosting' || type === 'PublicAccessFile') return 'Your seat cannot read paperwork records.'
  return 'Your seat cannot read this record.'
}

/** The record's own page, where it already has one. Pure. */
export function ownPageOf(type: RecordType, id: string): { href: string; words: string } {
  switch (type) {
    case 'Company': return { href: '/dashboard/companies', words: 'Open Companies' }
    case 'SellContract': return { href: `/dashboard/placements/${id}`, words: 'Open the contract' }
    case 'Person': return { href: `/dashboard/people/${id}`, words: 'Open the person' }
    case 'VendorBill': return { href: '/dashboard/ap', words: 'Open invoice receipts' }
    case 'Invoice': return { href: `/dashboard/invoices/${id}`, words: 'Open the bill' }
    case 'DecisionItem': return { href: `/dashboard/decisions/${id}`, words: 'Open the decision' }
    case 'Offer':
    case 'SubmissionConfirmation': return { href: '/dashboard/submissions', words: 'Open Submissions' }
    case 'ChecklistItem':
    case 'Petition':
    case 'NoticePosting':
    case 'PublicAccessFile': return { href: '/dashboard/compliance', words: 'Open Compliance' }
    case 'PayrollDraft': return { href: '/dashboard/payroll', words: 'Open Payroll' }
    case 'AgentSwitch':
    case 'AgentTask': return { href: '/dashboard/decisions/agents', words: 'Open Agent control' }
    // The month's own page needs its contract and month, which the route reads (`monthPageOf`); this is the page they are on.
    case 'MoneyChain': return { href: LOOP_HREF, words: 'Open Timesheet to payment' }
  }
}

/** Where the record view for one record is. Pure. */
export function recordViewHref(type: string, id: string): string {
  return `/dashboard/records/${encodeURIComponent(type)}/${encodeURIComponent(id)}`
}

/**
 * The decision queue, an item, agent control and the record view are
 * reached from Today, so their eyebrow is Today's: the page the tab row
 * marks (lib/page-framing reads it off the reader's own menu). Today is
 * the program page at a client and the dashboard elsewhere.
 */
export const QUEUE_EYEBROW_HREFS = ['/dashboard', '/dashboard/program'] as const

/**
 * What a record view with no ledger rows says: the ledger began on the
 * day of the firm's first row, so older work is on the record's own page;
 * or, at a firm with none yet, it starts with the next act. Pure.
 */
export function ledgerBeganSays(firstRowAt: Date | null): string {
  if (!firstRowAt) return 'The ledger starts with the next act on this record.'
  const d = formatDayLong(firstRowAt)
  return `Your firm’s ledger began on ${d}, and nothing has been done on this record through it since. Its earlier history is on its own page.`
}

export const NOT_ON_YOUR_BOOK = 'That record is not on your firm’s book, so it cannot be opened here.'

// ── The "Open a decision" form, and what its route reads ────────────

export interface OpenTyped {
  question: string
  ownerPersonId: string
  /** YYYY-MM-DD, the day it opened. */
  openedOn: string
  actingEntityId: string
  proof: string
  proofLinks: { recordType: string; recordId: string }[]
}

/** The fields the form draws. The entity picker is drawn only where the firm has entities. */
export function openFields(hasEntities: boolean): (keyof OpenTyped)[] {
  return ['question', 'ownerPersonId', 'openedOn', ...(hasEntities ? ['actingEntityId' as const] : []), 'proof', 'proofLinks']
}

/** What the form posts. Pure. */
export function openBody(t: Partial<OpenTyped>) {
  return {
    question: t.question?.trim() ?? '',
    ownerPersonId: t.ownerPersonId ?? '',
    openedOn: t.openedOn ?? '',
    actingEntityId: t.actingEntityId || null,
    proof: t.proof?.trim() ?? '',
    proofLinks: (t.proofLinks ?? []).filter((l) => l.recordType && l.recordId),
  }
}

export interface OpenAsk {
  question: string
  ownerPersonId: string
  openedOn: Date
  actingEntityId: string | null
  proof: string
  proofLinks: { recordType: ProofType; recordId: string }[]
}

/** What the route reads from the body, or the sentence it refuses with. Pure. */
export function readOpenAsk(body: unknown, hasEntities: boolean): { ok: true; ask: OpenAsk } | { ok: false; says: string; field: string } {
  const b = (body ?? {}) as Record<string, unknown>
  const str = (k: string) => (typeof b[k] === 'string' ? (b[k] as string).trim() : '')
  if (!str('question')) return { ok: false, field: 'question', says: 'A decision says its question in a sentence.' }
  if (!str('ownerPersonId')) return { ok: false, field: 'ownerPersonId', says: 'Choose who owes this decision.' }
  const day = str('openedOn')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, field: 'openedOn', says: 'Give the day the decision opened.' }
  const entity = str('actingEntityId') || null
  if (hasEntities && !entity) return { ok: false, field: 'actingEntityId', says: 'This company has legal entities. Choose which one this decision is for.' }
  if (!str('proof')) return { ok: false, field: 'proof', says: 'A decision says what shows it is owed.' }
  const raw = Array.isArray(b.proofLinks) ? b.proofLinks : []
  const links: OpenAsk['proofLinks'] = []
  for (const l of raw) {
    const o = (l ?? {}) as Record<string, unknown>
    const type = o.recordType
    const id = typeof o.recordId === 'string' ? o.recordId.trim() : ''
    if (!isRecordType(type) || type === 'DecisionItem' || type === 'MoneyChain' || type === 'AgentTask' || type === 'AgentSwitch' || type === 'PayrollDraft' || !id) {
      return { ok: false, field: 'proofLinks', says: 'Each proof link names a kind of record from the list and the record itself.' }
    }
    links.push({ recordType: type, recordId: id })
  }
  return {
    ok: true,
    ask: { question: str('question'), ownerPersonId: str('ownerPersonId'), openedOn: new Date(`${day}T00:00:00Z`), actingEntityId: entity, proof: str('proof'), proofLinks: links },
  }
}

// ── The three acts ──────────────────────────────────────────────────

export const VERDICT_BUTTONS = [
  { verdict: 'APPROVE', label: 'Approve' },
  { verdict: 'SEND_BACK', label: 'Send back' },
  { verdict: 'REJECT', label: 'Reject' },
] as const

export type VerdictWord = (typeof VERDICT_BUTTONS)[number]['verdict']

/** What one of the three buttons posts. Pure. */
export function decideBody(verdict: VerdictWord, reason: string, actingEntityId: string) {
  return { verdict, reason: reason.trim() || null, actingEntityId: actingEntityId || null }
}

/** What the decide route reads, or the sentence it refuses with. Pure. */
export function readDecideAsk(body: unknown, hasEntities: boolean):
  | { ok: true; ask: { verdict: VerdictWord; reason: string | null; actingEntityId: string | null } }
  | { ok: false; says: string; field: string } {
  const b = (body ?? {}) as Record<string, unknown>
  const verdict = b.verdict
  if (verdict !== 'APPROVE' && verdict !== 'SEND_BACK' && verdict !== 'REJECT') {
    return { ok: false, field: 'verdict', says: 'Choose Approve, Send back or Reject.' }
  }
  const reason = typeof b.reason === 'string' && b.reason.trim() ? b.reason.trim() : null
  if (verdict === 'REJECT' && !reason) return { ok: false, field: 'reason', says: 'Say in one line why it is rejected.' }
  if (verdict === 'SEND_BACK' && !reason) return { ok: false, field: 'reason', says: 'Say in one line why it is sent back.' }
  const entity = typeof b.actingEntityId === 'string' && b.actingEntityId.trim() ? b.actingEntityId.trim() : null
  if (hasEntities && !entity) return { ok: false, field: 'actingEntityId', says: 'This company has legal entities. Choose which one you decide for.' }
  return { ok: true, ask: { verdict, reason, actingEntityId: entity } }
}

/** A card that only needs acknowledging: it offers Done, never Approve, Send back or Reject. Pure. */
export function onlyAcknowledged(question: string): boolean {
  return /(Read the summary\?|Review the placement now\?|Read the list\.)$/.test(question.trim())
}

/** A proof's text cut at the in-app paths it names, so each path can be drawn as a link. Pure. */
export function proofParts(proof: string): { text: string; href: string | null }[] {
  return proof.split(/(\/dashboard\/[\w/-]+[\w-])/).filter(Boolean).map((t) => (t.startsWith('/dashboard/') ? { text: t, href: t } : { text: t, href: null }))
}

/** The decision, in the words its page prints. Pure. */
export function stateWords(state: string): string {
  return state === 'APPROVED' ? 'Approved' : state === 'REJECTED' ? 'Rejected' : 'Open'
}

/** "412 days", "1 day", "Today". Pure. */
export function ageWords(days: number): string {
  if (days <= 0) return 'Today'
  return days === 1 ? '1 day' : `${days} days`
}

// ── Agent control (A5) ──────────────────────────────────────────────

/** The agents of record 105, and the payroll draft of chain 4. Each is Off until the Owner switches it on (lib/agents/switch). */
export const FIRM_AGENTS = [
  { key: 'chase-and-reconciliation', name: 'Chase and reconciliation' },
  { key: 'digest-scanner', name: 'Digest scanner' },
  { key: 'confirmation-tracker', name: 'Confirmation tracker' },
  { key: 'census-keeper', name: 'Census keeper' },
  { key: 'contracts-checklist', name: 'Contracts checklist' },
  { key: 'immigration-checklist', name: 'Immigration checklist' },
  { key: 'payroll-draft', name: 'Payroll draft' },
  { key: 'timesheet-chase', name: 'Timesheet chase' },
  { key: 'match-ranker', name: 'Match ranker' },
  { key: 'interview-chase', name: 'Interview chase' },
  { key: 'compliance-watch', name: 'Compliance watch' },
  { key: 'money-owed-chase', name: 'Money-owed chase' },
  { key: 'weekly-summary', name: 'Weekly summary' },
] as const

/** Agents named on Agent control that have no step behind them yet: they read "Not live yet" and cannot be switched on. */
export const NOT_LIVE_AGENTS: readonly string[] = ['digest-scanner']

/** The sentence a refused switch says. Pure. */
export function notLiveSays(key: string): string {
  return `${agentNameOf(key)} is not live yet, so it cannot be switched on.`
}

/** An agent's name as a person reads it; an unknown key reads as the key made into words. Pure. */
export function agentNameOf(key: string): string {
  const known = FIRM_AGENTS.find((a) => a.key === key)?.name
  if (known) return known
  const t = key.replace(/[-_]+/g, ' ').trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** Who an agent's row is under: the agent's name, and the person who last set its switch. Pure. */
export function agentByWords(key: string, personName: string): string {
  return `${agentNameOf(key)}, switched on by ${personName}`
}

/** An agent's switch in the words a person reads. */
export const SWITCH_WORDS = { OFF: 'Off', DRAFT_ONLY: 'Drafts only', ON: 'On' } as const
export const AGENT_CAP = 'Not set'
export const BASELINE_LINES = {
  billing: 'Consultants billing: baseline pending',
  margin: 'Blended margin an hour: baseline pending',
} as const

/** What a seat that does not read the firm's ledger reads in its place. */
export const LEDGER_IS_FOR = 'The firm’s ledger is read by its Owner and Admins, and by a seat that reads the activity log.'

/**
 * Each agent's row: its switch (Off where no row), today's count of its
 * acts, and its cap as "N of M today" or "N today · no cap". Pure.
 */
export function agentRows(
  counts: readonly { agentKey: string | null; count: number }[],
  switches: readonly { agentKey: string; state: keyof typeof SWITCH_WORDS; dailyCap: number | null }[] = [],
) {
  return FIRM_AGENTS.map((a) => {
    const today = counts.find((c) => c.agentKey === a.key)?.count ?? 0
    const sw = switches.find((s) => s.agentKey === a.key)
    const cap = sw?.dailyCap ?? null
    return {
      key: a.key, name: a.name, switchState: sw?.state ?? 'OFF', state: NOT_LIVE_AGENTS.includes(a.key) ? 'Not live yet' : SWITCH_WORDS[sw?.state ?? 'OFF'], dailyCap: cap,
      live: !NOT_LIVE_AGENTS.includes(a.key),
      actionsToday: today, meter: `${today} ${today === 1 ? 'action' : 'actions'}`,
      cap: cap === null ? `${today} today · no cap` : `${today} of ${cap} today`,
    }
  })
}

/** The UTC day around a moment, [start, next start). Pure. */
export function dayAround(now: Date): { from: Date; to: Date } {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  return { from, to: new Date(from.getTime() + 86_400_000) }
}

// ── The home setting (A1) ───────────────────────────────────────────

export const HOME_CHOICES = [
  { value: 'USUAL', label: 'The usual one' },
  { value: 'DECISIONS', label: 'The decision queue' },
] as const

/** What the setting route reads, or the sentence it refuses with. Pure. */
export function readHomeAsk(body: unknown, hasEntities: boolean):
  | { ok: true; homePage: 'DECISIONS' | null; actingEntityId: string | null }
  | { ok: false; says: string } {
  const b = (body ?? {}) as Record<string, unknown>
  if (b.homePage !== 'USUAL' && b.homePage !== 'DECISIONS') return { ok: false, says: 'Choose the usual first screen or the decision queue.' }
  const entity = typeof b.actingEntityId === 'string' && b.actingEntityId.trim() ? b.actingEntityId.trim() : null
  if (hasEntities && !entity) return { ok: false, says: 'This company has legal entities. Choose which one this change is made for.' }
  return { ok: true, homePage: b.homePage === 'DECISIONS' ? 'DECISIONS' : null, actingEntityId: entity }
}
