/**
 * Ask Etyme: what a person types into the chat in Conversations and what
 * comes back. Pure — no database, no model, no network — so the rules are
 * tested as rules (`__tests__/invariants/twin-conversation.test.ts`).
 *
 * The founder named it "Ask Etyme" on 2026-10-12 and put it in
 * Conversations; underneath it is the program manager twin's second door
 * (CLAUDE.md, "The job twin"): rules first, the model second. These are
 * answered from the ledger and the record by plain code before any model
 * is called:
 *
 *   what needs me (today)                 the twin's questions, who else is asked, the time limit
 *   who is near the time limit            the twin's time-limit warnings, newest per person
 *   what did we spend by supplier         invoice receipts billed to you this month, per supplier
 *   which weeks are unsigned              weeks waiting for your signature, oldest first
 *   why <entry>                           the ledger's own rule and rationale
 *   approve <item>                        a confirm card; the chat calls the one approval route
 *   reject <item> because <reason>        the same, with the reason
 *   invoice variance by supplier …        per supplier, from the twin's invoice verdicts
 *
 * Anything else is first held to the transaction (./transaction): a
 * general question, or one about another company's book, is refused in
 * one sentence before any model is called. What is left goes to the
 * model with the ledger lines as context, only where the company turned
 * it on and a key is configured, and an answer that cites none of those
 * lines is not shown (`grounded`). The model describes; it never acts and
 * it is never the gate. Nothing in this file writes state: a yes or a no
 * is sent by the panel to POST /api/twin/approvals/:id, the one door the
 * web and Teams share, and the route keeps the seat's own conversation
 * through lib/ask-etyme-thread and nothing else.
 */

import { formatDay, formatMonth } from '@/lib/format-date'
import { format, fromMinor } from '@/lib/money'
import { desksHolding, type Permission, hasPermission } from '@/lib/permissions'
import { newMasker, type MaskVocabulary } from './mask'
import type { BillCardPayload } from '@/lib/money/supplier-bills'
import { supplierToldSays } from '@/lib/money/invoice-hold'
import { offRecord } from './transaction'

// ── What was asked ───────────────────────────────────────────────────

export type Intent =
  | { kind: 'HELP' }
  | { kind: 'NEEDS' }
  | { kind: 'WHY'; ref: string | null }
  | { kind: 'DECIDE'; decision: 'APPROVED' | 'REJECTED'; ref: string; reason: string | null }
  | { kind: 'VARIANCE' }
  | { kind: 'TIME_LIMIT' }
  | { kind: 'SPEND' }
  | { kind: 'WEEKS' }
  | { kind: 'NEVER'; act: NeverAct }
  | { kind: 'MARGIN' }
  | { kind: 'ASK'; text: string }

/** "#3", "INV-1003.", "'abc'" — a reference as somebody types it, cleaned. */
function cleanRef(s: string): string | null {
  const r = s
    .trim()
    .replace(/[?.!,;:]+$/, '')
    .replace(/^(on|is|about|for|entry|item|number|no\.?)\s+/i, '')
    .replace(/^(the\s+)?(entry|item|receipt|invoice|question)\s+/i, '')
    .replace(/^#/, '')
    .replace(/^['"“‘]|['"”’]$/g, '')
    .trim()
  return r ? r : null
}

/**
 * Read what a person typed into one of the five rule questions, or ASK.
 * Case and trailing punctuation do not matter; word order mostly does,
 * because "approve" at the start is an instruction and in the middle of a
 * sentence is a question about approving.
 */
export function readAsk(raw: string): Intent {
  const text = raw.trim().replace(/\s+/g, ' ')
  if (!text || /^(help|\?|what can you do\??|what do you answer\??)$/i.test(text)) return { kind: 'HELP' }

  const lower = text.toLowerCase()
  if (/\b(mark-?up|margin)s?\b/.test(lower)) return { kind: 'MARGIN' }
  if (
    (/\bvariance\b/.test(lower) && /\bsuppliers?\b/.test(lower)) ||
    // The twin page's own line, "how invoice receipts compare by supplier",
    // and the chip-like "Compare invoice receipts by supplier".
    /\bcompare\b.*\bby suppliers?\b/.test(lower) ||
    /\binvoice receipts? by suppliers?\b/.test(lower) ||
    /\b(don'?t|do not|doesn'?t|does not) match\b|\bmismatch(ed|es)?\b|\bnot clean\b/.test(lower) && !/^why\b/.test(lower)
  ) return { kind: 'VARIANCE' }

  if (
    /^(what|who|anything)\b.*\b(needs?|waiting on|waits? (for|on)|for)\s+me\b/.test(lower) ||
    /^(needs me|my queue|waiting on me|what is waiting( on me)?)\??$/.test(lower) ||
    /^what do i (need|have) to do\b/.test(lower) ||
    /^what('s| is) (on my plate|my day)\b/.test(lower)
  ) return { kind: 'NEEDS' }

  const never = neverAct(text)
  if (never) return { kind: 'NEVER', act: never }

  const why = text.match(/^why\b\s*(.*)$/i)
  if (why) {
    const number = why[1].match(/\b[A-Z]{2,}[A-Z0-9]*(?:-[A-Z0-9]+)+\b/i)
    return { kind: 'WHY', ref: number ? number[0] : cleanRef(why[1]) }
  }

  const approve = text.match(/^(approve|yes to|say yes to)\s+(.+)$/i)
  if (approve) {
    const ref = cleanRef(approve[2])
    if (ref) return { kind: 'DECIDE', decision: 'APPROVED', ref, reason: null }
  }

  const reject = text.match(/^(reject|decline|say no to|no to)\s+(.+?)(?:\s+(?:because|as|since|reason:?)\s+(.+))?$/i)
  if (reject) {
    const ref = cleanRef(reject[2])
    const reason = reject[3]?.trim().replace(/\s+/g, ' ') || null
    if (ref) return { kind: 'DECIDE', decision: 'REJECTED', ref, reason }
  }

  if (/\btime[- ]limits?\b|\btenure\b|\b18[- ]months?\b/.test(lower)) return { kind: 'TIME_LIMIT' }
  if (/\b(spend|spent|spending)\b|\bbilled (us|you)\b|\bhow much have suppliers billed\b/.test(lower)) return { kind: 'SPEND' }
  if (
    /\bunsigned\b/.test(lower) ||
    (/\b(weeks?|timesheets?|hours)\b/.test(lower) && /\b(not signed|to sign|waiting|not approved|unapproved|approval)\b/.test(lower))
  ) return { kind: 'WEEKS' }

  return { kind: 'ASK', text }
}

// ── The never floor ──────────────────────────────────────────────────

/**
 * Acts that are never Etyme's, whatever a role contract says (CLAUDE.md,
 * "The job twin": NEVER TOUCHES; "Ask Etyme is the app"): extending or
 * ending a placement, awarding, rejecting a submission, paying, running
 * payroll and signing. Asked in the chat, each is answered by this rule
 * in one sentence naming the desk that does it, with the page where it is
 * done. It never reaches the model and never becomes a card.
 */
export type NeverAct = 'EXTEND' | 'END' | 'AWARD' | 'REJECT_SUBMISSION' | 'PAY' | 'PAYROLL' | 'SIGN_AGREEMENT' | 'SIGN_WEEK'

/** What a message names, found on the record: a person's placement, or an invoice receipt. */
export interface Named {
  person?: { name: string; contractId: string }
  /** Two or more people the words could mean: Etyme asks which, and links nowhere. */
  ambiguous?: string[]
  receipt?: { number: string; invoiceId: string }
}

/** A person on this company's placements, newest placement first. */
export interface RosterEntry { personId: string; name: string; contractId: string }

const words = (x: string) => x.toLowerCase().normalize('NFC').split(/[^\p{L}\p{M}'’-]+/u).filter(Boolean)

/**
 * Who a message names, from the people on this company's placements.
 * The full name wins. Otherwise a first or last name counts when exactly
 * one person carries it; when several do, the answer is the question
 * "Helena Marsh or Helena Ruiz?", never a guess.
 */
export function matchPerson(text: string, roster: readonly RosterEntry[]): Pick<Named, 'person' | 'ambiguous'> {
  // One entry per person: the newest placement.
  const people = new Map<string, RosterEntry>()
  for (const r of roster) if (!people.has(r.personId)) people.set(r.personId, r)
  const all = [...people.values()].filter((p) => p.name.trim().length > 2)
  const lower = text.toLowerCase()
  const full = all.filter((p) => lower.includes(p.name.trim().toLowerCase()))
  if (full.length === 1) return { person: { name: full[0].name, contractId: full[0].contractId } }
  if (full.length > 1) return { ambiguous: full.map((p) => p.name) }
  const said = new Set(words(text).filter((w) => w.length >= 3))
  const hits = all.filter((p) => {
    const parts = words(p.name)
    return parts.length > 0 && (said.has(parts[0]) || (parts.length > 1 && said.has(parts[parts.length - 1])))
  })
  if (hits.length === 1) return { person: { name: hits[0].name, contractId: hits[0].contractId } }
  if (hits.length > 1) return { ambiguous: hits.map((p) => p.name).sort((a, b) => a.localeCompare(b)) }
  return {}
}

/**
 * Each act's door is the screen that actually draws the control, checked
 * against the page, not the screen where the thing is described. The
 * placement page has no Extend and no Roll off: both are on a line's
 * drawer under Contracts (a client also has them on its dashboard's
 * ending-soon list). Award ("Place") and reject are on Submissions; Pay
 * is on the invoice receipt's own page; "Record the signature" is on the
 * agreement's page; Run payroll on Payroll; Approve on Timesheets.
 */
const NEVER_FLOOR: Record<NeverAct, { verb: string; needs: Permission; where: string; link: Link }> = {
  EXTEND: { verb: 'extends a contract', needs: 'assignments.write', where: 'the line on Contracts', link: { label: 'Open Contracts', href: '/dashboard/contracts' } },
  END: { verb: 'ends a contract', needs: 'assignments.terminate', where: 'the line on Contracts', link: { label: 'Open Contracts', href: '/dashboard/contracts' } },
  AWARD: { verb: 'selects a candidate', needs: 'requirements.write', where: 'the candidate’s submission', link: { label: 'Open Submissions', href: '/dashboard/submissions' } },
  REJECT_SUBMISSION: { verb: 'rejects a candidate', needs: 'requirements.write', where: 'the candidate’s submission', link: { label: 'Open Submissions', href: '/dashboard/submissions' } },
  PAY: { verb: 'pays an invoice', needs: 'payments.record', where: 'the invoice receipt’s page', link: { label: 'Open Invoice receipts', href: '/dashboard/invoices' } },
  PAYROLL: { verb: 'runs payroll', needs: 'payroll.run', where: 'Payroll', link: { label: 'Open Payroll', href: '/dashboard/payroll' } },
  SIGN_AGREEMENT: { verb: 'signs an agreement', needs: 'rates.write', where: 'the agreement’s page', link: { label: 'Open Agreements', href: '/dashboard/program/agreements' } },
  SIGN_WEEK: { verb: 'approves a timesheet', needs: 'timesheets.approve', where: 'Timesheets', link: { label: 'Open Timesheets', href: '/dashboard/timesheets' } },
}

/**
 * Whether a message asks Etyme to do an act on the never floor. Read as
 * an instruction — the verb first, after an optional "please" or "can
 * you" — so a question about the act ("who extended Helena?") is not
 * refused. "Reject 1 because …" stays an answer to Etyme's own question;
 * only a submission or a candidate makes "reject" an act on the floor.
 */
export function neverAct(raw: string): NeverAct | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, ' ')
    .replace(/^(etyme,?\s+)?(please\s+|can you\s+|could you\s+|would you\s+|will you\s+|go ahead and\s+)*/, '')
  if (/^(extend|renew)\b/.test(t)) return 'EXTEND'
  if (/^(end|terminate|roll ?off|let\b.+\bgo\b)/.test(t)) return 'END'
  if (/^(award|hire)\b/.test(t)) return 'AWARD'
  if (/^(reject|decline|turn down)\b/.test(t) && /\b(submission|candidate|applicant)s?\b/.test(t)) return 'REJECT_SUBMISSION'
  if (/^(run|release|process)\b.*\bpayroll\b/.test(t) || /^pay\b.*\b(payroll|salar(y|ies)|wages?)\b/.test(t)) return 'PAYROLL'
  if (/^pay\b/.test(t)) return 'PAY'
  if (/^(sign|countersign|approve)\b.*\b(week|hours|timesheets?)\b/.test(t)) return 'SIGN_WEEK'
  if (/^(sign|countersign|execute)\b/.test(t)) return 'SIGN_AGREEMENT'
  return null
}

/** "Contract Manager or Resource Manager". */
function orNames(xs: readonly string[]): string {
  if (xs.length <= 1) return xs[0] ?? ''
  return `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`
}

/** "Contract Manager", "AP Clerk or Program Manager": at most two desks, so the sentence stays short. */
function twoDesks(desks: readonly string[]): string {
  return orNames(desks.slice(0, 2))
}

/**
 * Which desks pay an invoice receipt, read off lib/permissions.
 *
 * `payments.record` is held by the desk that records money coming in as
 * well as the desk that pays out, so on its own it names Accounts
 * Receivable as somebody who pays. It does not: it bills. A desk that
 * issues bills and runs no payroll is the money-in desk, and is left out.
 * Where that would leave nobody — a firm whose one money desk does both,
 * as at a program office — every holder of `payments.record` is named,
 * because that desk is the one that pays there.
 *
 * Read off the permissions, never a list of names, so a role that gains
 * or loses a permission changes the sentence in the same commit.
 */
export function payingDesks(companyKind: string | null | undefined): string[] {
  const all = desksHolding('payments.record', companyKind)
  const out = all.filter((d) => !billsOnly(d, companyKind))
  return out.length ? out : all
}

/** A desk that issues bills and runs no payroll: the money-in desk. */
function billsOnly(desk: string, companyKind: string | null | undefined): boolean {
  return desksHolding('invoices.issue', companyKind).includes(desk) && !desksHolding('payroll.run', companyKind).includes(desk)
}

/** Whether this seat pays out: the same rule as `payingDesks`, on the seat's own permissions. */
function paysOut(permissions: readonly string[], companyKind: string | null | undefined): boolean {
  if (!hasPermission(permissions, 'payments.record')) return false
  if (!hasPermission(permissions, 'invoices.issue') || hasPermission(permissions, 'payroll.run')) return true
  // A money-in seat pays only where no desk at the company pays out apart from it.
  return desksHolding('payments.record', companyKind).every((d) => billsOnly(d, companyKind))
}

/**
 * The one sentence for an act on the never floor: Etyme never does it,
 * who does, and where — the door.
 */
export function neverSays(
  act: NeverAct,
  companyKind: string | null | undefined,
  permissions: readonly string[] = [],
  named: Named = {},
): { says: string; links: Link[] } {
  const f = NEVER_FLOOR[act]
  const asksWho = act === 'EXTEND' || act === 'END' || act === 'SIGN_WEEK'
  if (asksWho && !named.person && named.ambiguous && named.ambiguous.length > 1) {
    const names = named.ambiguous.slice(0, 4)
    return { says: `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}?`, links: [] }
  }
  // Extend and end are done from the person's line on Contracts, whose
  // drawer holds Extend and Initiate rolloff; the placement page draws
  // neither, so it is never the door. The person's name goes in the
  // sentence; the link is Contracts, where the line is.
  const onTheLine = act === 'EXTEND' || act === 'END'
  const person = onTheLine && named.person ? named.person : null
  const receipt = named.receipt && act === 'PAY' ? named.receipt : null
  const place = person ? `${person.name}’s line on Contracts` : receipt ? `${receipt.number}’s page` : f.where
  const where = `${onTheLine ? 'from' : 'on'} ${place}`
  const desks = act === 'PAY' ? payingDesks(companyKind) : desksHolding(f.needs, companyKind)
  const holds = act === 'PAY' ? paysOut(permissions, companyKind) : permissions.includes(f.needs)
  const who = holds
    ? `you can, ${where}`
    : desks.length
      ? `your ${twoDesks(desks)} does it ${where}`
      : `nobody here has that role yet; it is done ${where}`
  const link: Link = receipt
    ? { label: `Open ${receipt.number}`, href: hrefFor('Invoice', receipt.invoiceId) }
    : f.link
  return { says: `Etyme never ${f.verb}; ${who}.`, links: [link] }
}

/**
 * A read this seat's desk does not hold, refused in one sentence that
 * names the desk that does: "The AP Clerk reads what suppliers billed
 * you; ask them." The door is the person at that desk.
 */
export function deskRefusal(reads: string, needs: Permission | readonly Permission[], companyKind: string | null | undefined): string {
  const desks = desksHolding(needs, companyKind)
  return desks.length
    ? `Your ${twoDesks(desks)} ${reads}; ask them.`
    : `No role at your company ${reads} yet; ask whoever manages roles.`
}

/**
 * Margin is a firm's own (CLAUDE.md, "The model boundary"): refused, with
 * the door to what this reader may see — a client what it pays each
 * supplier, a supplier its own rates.
 */
export function marginRefusal(companyKind: string | null | undefined): { says: string; links: Link[] } {
  return companyKind === 'CLIENT'
    ? { says: 'Etyme never shows a firm’s margin to anybody else; your dashboard shows what you pay each supplier.', links: [{ label: 'Open the dashboard', href: '/dashboard/program' }] }
    : { says: 'Etyme never shows a firm’s margin to anybody else; your own rates are on your contracts.', links: [{ label: 'Open Contracts', href: '/dashboard/contracts' }] }
}

/**
 * The four questions drawn as chips above the box, in the founder's
 * prototype order. Each is answered by rules; none goes to the model.
 */
export const SUGGESTED_QUESTIONS: readonly string[] = [
  'What needs me today?',
  'Who is near the time limit?',
  'What did we spend by supplier this month?',
  'Which timesheets are waiting for approval?',
]

/** The line under the box, word for word from the approved prototype. */
export const FOOTER_LINE =
  'Etyme answers from the record and its rules. It asks before any outside message or money moves, and every act is in the ledger.'

export const WHAT_I_ANSWER =
  'I answer from the record: what needs you, the time limit, spend, timesheets to approve and invoice mismatches. ' +
  'I also answer “Why 1”, “Approve 1” and “Reject 1 because …”.'

/** The honest reply where the rules have no answer: the voice's last rule, word for word at the start. */
export const NOT_YET = 'I cannot answer that yet.'

// ── The voice ────────────────────────────────────────────────────────

/**
 * The thirteen rules every reply is written to (docs/ask-etyme-voice.md,
 * the founder's words from the four-week plan, 2026-10-13, and the
 * trade's phrasing he added on 2026-10-14). One list:
 * the guide prints it, the rules replies are tested against it, and
 * where the model is on, it is the model's instruction.
 */
export const VOICE_RULES: readonly string[] = [
  'Lead with the recommendation, then the fact. The why is one tap away.',
  'Say when you looked: “Checked just now”, or the day of the reading.',
  'A refusal is one sentence, and it names the door: who does it, and where.',
  'No apology words: never sorry, unfortunately or afraid.',
  'No hedging: never might, perhaps, probably or it seems. Say what the record says.',
  'No exclamation marks.',
  'Dry. Never funny about money or people.',
  'Plain English for a global reader: common words, no idioms, every sentence under 20 words.',
  'Use the trade’s words: job request, time limit, invoice receipt, bill.',
  'Say it the way a recruiter, hiring manager or AP clerk says it out loud: who applied, approve a timesheet, pay an invoice.',
  'Never speak for a person. Say what the record shows they did, not what they think.',
  'Never say “I think” about money. A figure comes from the record, or it is not given.',
  'When the record has no answer, say “I cannot answer that yet.” and point to where to look.',
]

/** Words the voice never uses, checked against every rules reply. */
export const VOICE_BANNED: readonly RegExp[] = [
  /\bsorry\b/i, /\bunfortunately\b/i, /\bafraid\b/i, /\bapolog/i,
  /\bmight\b/i, /\bperhaps\b/i, /\bprobably\b/i, /\bit seems\b/i, /\bmaybe\b/i,
  /\bI think\b/i, /!/,
]

/** Sentences in a reply, for the 20-word rule. */
export function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.?;])\s+(?=[A-Z“"$£€0-9])/).map((x) => x.trim()).filter(Boolean)
}

/** Whether a reply keeps the voice; the broken rules, in words, where not. */
export function voiceBreaks(text: string): string[] {
  const out: string[] = []
  for (const re of VOICE_BANNED) if (re.test(text)) out.push(`uses ${re}`)
  for (const sentence of sentencesOf(text)) {
    const n = sentence.split(/\s+/).filter(Boolean).length
    if (n >= 20) out.push(`${n} words: ${sentence}`)
  }
  return out
}

// ── The model ────────────────────────────────────────────────────────

/** Whether a model can be asked on this deployment. The key only, never its value. */
export function modelConfigured(env: Record<string, string | undefined>): boolean {
  return Boolean(env.ANTHROPIC_API_KEY && env.ANTHROPIC_API_KEY.trim())
}

export const NO_MODEL =
  `${NOT_YET} This question needs the model, and it is not set up here. Try a question below.`

/** The company switch is off (lib/model-boundary): the honest reply, with the door. */
export const NO_SWITCH =
  `${NOT_YET} This question needs the model, and your company has not turned it on. An owner or admin can turn it on under Settings.`

/**
 * The model free text goes to: small, by the founder's word ("we don't
 * want a large model"), the smallest of the family this deployment
 * prices in lib/agent-run. One constant; the prompt log names it.
 */
export const SMALL_MODEL = 'claude-haiku-4-5'

/** Who answered a free-text question, and what it cost, for the prompt log. */
export interface ModelReply { text: string; model: string; tokensIn: number | null; tokensOut: number | null }

/** One prompt that left, masked, as the log keeps it (lib/model-boundary's recordModelPrompt). */
export interface PromptLog {
  model: string
  maskedPrompt: string
  maskedAnswer: string
  tokensIn: number | null
  tokensOut: number | null
  /** The real values the masker replaced, so the log can refuse a text that still holds one. Never stored. */
  realValues: string[]
  /** True where the answer cited no line it was given, so the person was shown NOT_GROUNDED instead. */
  replaced?: boolean
}

/** The one sentence the model says for any act. Checked in the test, so it cannot drift. */
export const ASK_THE_DESK = 'I cannot do that; ask the person whose job it is.'

/**
 * The model's instruction: what it is given and may do, then the voice,
 * word for word. Nothing here contradicts the voice; an act of any kind
 * gets the one sentence above, because the model is never the gate.
 */
export const MODEL_SYSTEM = [
  'You answer questions about a company’s contingent workforce program, for a person signed in to Etyme.',
  'You are given lines from Etyme’s log of what it checked and did. They are the only facts you have.',
  'Describe only what is on those lines. Never add a figure that is not on a line.',
  'When you cite a line, give its id in square brackets, exactly as written, like [ck123].',
  `If you are asked to do anything — approve, reject, pay, send, change, end, sign or write — answer exactly: "${ASK_THE_DESK}"`,
  `If the lines do not answer the question, answer exactly: "${NOT_YET}"`,
  'Write in American English, in at most eight lines.',
  'The voice:',
  ...VOICE_RULES.map((r, i) => `${i + 1}. ${r}`),
].join('\n')

export interface LedgerLine {
  id: string
  ts: string
  says: string
  outcome: string
  entityType: string
  entityId: string
  ruleCited: string
  rationale: string
}

/** The context the model is given: one line per entry, newest first, capped. */
export function ledgerContext(lines: readonly LedgerLine[], cap = 60): string {
  return lines
    .slice(0, cap)
    .map((l) => `[${l.id}] ${l.ts.slice(0, 10)} · ${l.outcome} · ${l.says} · ${l.entityType} ${l.entityId} · Rule: ${l.ruleCited} · Why: ${l.rationale}`)
    .join('\n')
}

/**
 * What the person reads where the model's answer cites no line of the
 * record it was given: the voice's last rule, and where to look.
 */
export const NOT_GROUNDED = `${NOT_YET} Open the ledger to read what Etyme checked, or try a question below.`
export const LEDGER_LINK: { label: string; href: string } = { label: 'Open the ledger', href: '/dashboard/twin' }

/** How a replaced answer is kept in the company's prompt log, ahead of what the model wrote (masked). */
export const REPLACED_NOTE = 'Not shown to the person: it cited no line of the record. The model wrote: '

/**
 * Whether a model's answer may be shown: it cites at least one ledger line
 * it was given, or it is the one sentence it says for any act. Anything
 * else — a fluent paragraph with no line behind it, the model's own
 * "cannot answer" — is replaced by NOT_GROUNDED, and only the first is
 * logged as replaced, because "cannot answer" is what it was told to say.
 */
export function grounded(text: string, lines: readonly LedgerLine[]): { show: boolean; replaced: boolean } {
  const said = text.trim()
  if (said === ASK_THE_DESK) return { show: true, replaced: false }
  if (citedIds(said, lines).length > 0) return { show: true, replaced: false }
  return { show: false, replaced: said !== NOT_YET }
}

/** Ids the model cited in square brackets that really are ledger lines it was given. */
export function citedIds(text: string, lines: readonly LedgerLine[]): string[] {
  const known = new Set(lines.map((l) => l.id))
  const out: string[] = []
  for (const m of text.matchAll(/\[([A-Za-z0-9_-]{6,})\]/g)) {
    if (known.has(m[1]) && !out.includes(m[1])) out.push(m[1])
  }
  return out
}

// ── Links ────────────────────────────────────────────────────────────

/**
 * Where a figure's source opens. An invoice receipt opens on its own
 * page, a person on theirs, and anything else on the ledger's entry.
 * `/dashboard/twin` is the architect's twin page; its entries carry the
 * anchor `entry-<id>`.
 */
export function hrefFor(entityType: string, entityId: string, entryId?: string): string {
  if (entityType === 'Invoice') return `/dashboard/invoices/${entityId}`
  if (entityType === 'Person') return `/dashboard/people/${entityId}`
  return entryHref(entryId ?? entityId)
}

export function entryHref(entryId: string): string {
  return `/dashboard/twin#entry-${entryId}`
}

// ── The answers ──────────────────────────────────────────────────────

export interface Link { label: string; href: string }

/**
 * A line of a reply whose words carry their own links: each `text` is a
 * phrase inside `says` ("PR-2026-0441", "7 contractors") that opens
 * `href`. A phrase not found in the sentence is drawn as plain words.
 */
export interface RichLine { says: string; links?: { text: string; href: string }[] }

/** One of the twin's questions this seat may answer. */
export interface WaitingItem {
  /** 1-based, in the order shown; "approve 1" means this one. */
  n: number
  approvalId: string
  entryId: string
  /** What the act does, from the twin's vocabulary. */
  says: string
  /** "INV-1003 from Veritan Talent" · a person's name. */
  title: string
  ruleCited: string
  rationale: string
  href: string
  /** The twin's act asked about, by its key: "invoice_receipt.approve". */
  action?: string
  /** For `bill.send`: the drafted bill, as the card shows it. */
  bill?: BillCardPayload
  /**
   * Why this seat is asked, where it would otherwise not be: the owner Ask
   * Etyme acts for, asked to send its bill because nobody else at the firm
   * sends bills (founder, 2026-10-19). Said under the card's title, so the
   * exception is on the screen. Absent on every other question.
   */
  askedYouBecause?: string
}

export type Verdict = 'CLEAN' | 'MISMATCH' | 'BLOCKED'

export interface VarianceReceipt {
  invoiceId: string
  number: string | null
  supplierName: string | null
  /** The check run at the moment of the question. */
  verdict: Verdict
  /** What the twin's nightly run recorded, where it recorded one. */
  nightly?: Verdict | null
  lines: ReadonlyArray<{ hoursBilled: number; hoursAccepted: number | null; isHours: boolean }>
}

export interface VarianceRow {
  supplier: string
  receipts: number
  clean: number
  mismatch: number
  held: number
  hoursBilled: number
  /** What the paying firm accepted on the weeks it accepted. */
  hoursAccepted: number
  /**
   * Hours billed above the hours accepted, summed over accepted weeks
   * only. Null where no week on any receipt was accepted, because a
   * difference against nothing is not a number anybody can stand behind.
   */
  hoursOverAccepted: number | null
  /** Hours billed on weeks nobody has accepted yet, never folded into the figure above. */
  hoursNotAccepted: number
  /** Each receipt behind the row. */
  receiptLinks: Link[]
}

export type Answer =
  | { kind: 'TEXT'; says: string; links?: Link[] }
  /**
   * What needs this seat. `more` carries who else is asked and the time
   * limit; `greeting` marks the first message of the chat, which the
   * screen opens with the reader's name.
   */
  | { kind: 'NEEDS'; recommend?: RichLine; says: string; saysLinks?: { text: string; href: string }[]; items: WaitingItem[]; held?: HeldBill[]; more?: RichLine[]; links?: Link[]; greeting?: boolean }
  | { kind: 'TIME_LIMIT'; says: string; rows: LimitRow[] }
  | { kind: 'SPEND'; says: string; period: { from: string; to: string; label: string }; rows: SpendRow[] }
  | { kind: 'WEEKS'; says: string; rows: WeekRow[]; more: number; links: Link[] }
  | { kind: 'WHY'; says: string; ruleCited: string; rationale: string; links: Link[] }
  | { kind: 'CONFIRM'; says: string; decision: 'APPROVED' | 'REJECTED'; reason: string | null; item: WaitingItem }
  | { kind: 'VARIANCE'; says: string; period: { from: string; to: string; label: string }; rows: VarianceRow[] }
  | { kind: 'MODEL'; says: string; links: Link[] }

/** Hours as a clerk writes them: "41.5", "40". */
export function hrs(n: number): string {
  return String(Math.round(n * 100) / 100)
}

/** The calendar quarter a day falls in, UTC: [from, to) and "Q4 2026". */
export function quarterOf(now: Date): { from: Date; to: Date; label: string } {
  const y = now.getUTCFullYear()
  const q = Math.floor(now.getUTCMonth() / 3)
  return {
    from: new Date(Date.UTC(y, q * 3, 1)),
    to: new Date(Date.UTC(y, q * 3 + 3, 1)),
    label: `Q${q + 1} ${y}`,
  }
}

const NO_SUPPLIER = 'Supplier not named on the record'

/**
 * Invoice variance by supplier: one row per supplier, from the twin's
 * verdict on each receipt. Hours are rounded only when shown.
 */
export function varianceBySupplier(receipts: readonly VarianceReceipt[]): VarianceRow[] {
  const by = new Map<string, VarianceRow & { anyAccepted: boolean }>()
  for (const r of receipts) {
    const key = r.supplierName?.trim() || NO_SUPPLIER
    const row = by.get(key) ?? {
      supplier: key, receipts: 0, clean: 0, mismatch: 0, held: 0,
      hoursBilled: 0, hoursAccepted: 0, hoursOverAccepted: 0, hoursNotAccepted: 0,
      receiptLinks: [], anyAccepted: false,
    }
    row.receipts++
    if (r.verdict === 'CLEAN') row.clean++
    else if (r.verdict === 'MISMATCH') row.mismatch++
    else row.held++
    for (const l of r.lines) {
      if (!l.isHours) continue
      row.hoursBilled += l.hoursBilled
      if (l.hoursAccepted == null) {
        row.hoursNotAccepted += l.hoursBilled
        continue
      }
      row.anyAccepted = true
      row.hoursAccepted += l.hoursAccepted
      row.hoursOverAccepted = (row.hoursOverAccepted ?? 0) + Math.max(0, l.hoursBilled - l.hoursAccepted)
    }
    row.receiptLinks.push({ label: r.number ?? 'Invoice receipt', href: hrefFor('Invoice', r.invoiceId) })
    by.set(key, row)
  }
  return [...by.values()]
    .map(({ anyAccepted, ...row }) => ({ ...row, hoursOverAccepted: anyAccepted ? row.hoursOverAccepted : null }))
    .sort((a, b) => (b.mismatch + b.held) - (a.mismatch + a.held) || a.supplier.localeCompare(b.supplier))
}

/** "clean" or "not clean", for a verdict in a sentence. */
const verdictWord = (v: Verdict) => (v === 'CLEAN' ? 'matched' : 'did not match')

/** Receipts whose nightly verdict the live check no longer agrees with. */
export function staleVerdicts(receipts: readonly VarianceReceipt[]): VarianceReceipt[] {
  return receipts.filter((r) => r.nightly != null && verdictWord(r.nightly) !== verdictWord(r.verdict))
}

/**
 * The reply over the variance table: the recommendation where a receipt
 * fails, then the count, then when it was checked, then any nightly
 * verdict the live check overturned.
 */
export function varianceSays(rows: readonly VarianceRow[], label: string, stale: readonly VarianceReceipt[] = [], checked: readonly VarianceReceipt[] = []): string {
  if (rows.length === 0) return `No supplier sent you an invoice in ${label}. Checked just now.`
  const receipts = rows.reduce((s, r) => s + r.receipts, 0)
  const off = rows.reduce((s, r) => s + r.mismatch + r.held, 0)
  const over = rows.reduce((s, r) => s + (r.hoursOverAccepted ?? 0), 0)
  const parts: string[] = []
  const failing = checked.filter((r) => r.verdict !== 'CLEAN')
  if (failing.length === 1) parts.push(`Pay ${failing[0].number ?? 'the invoice that does not match'} only after ${failing[0].supplierName ?? 'the supplier'} corrects it.`)
  else if (off > 0) parts.push(`Pay none of the invoices that do not match until their suppliers correct them.`)
  parts.push(`${counted(receipts, 'invoice')} from ${counted(rows.length, 'supplier').toLowerCase()} ${receipts === 1 ? 'was' : 'were'} received in ${label}.`)
  parts.push(off === 0
    ? `All match.`
    : `${counted(off, 'invoice')} ${off === 1 ? 'does' : 'do'} not match${over > 0 ? `: ${hrs(over)} hours billed over the approved hours` : ''}.`)
  parts.push('Counted by invoice date, and checked just now against the three-way check.')
  for (const r of stale) {
    parts.push(`Last night’s check said ${r.number ?? 'one invoice'} ${verdictWord(r.nightly!)}; ${r.verdict === 'CLEAN' ? 'it matches now' : 'it does not match now'}.`)
  }
  return parts.join(' ')
}

/** The page that lists every decision a seat owes, most urgent first. */
export const DECISIONS_HREF = '/dashboard/decisions'

/** The words in the headline that open that page. */
export const DECISIONS_LINK_TEXT = 'open the list'

/**
 * The headline, where the decisions queue was read: "Five things need
 * you; open the list to see them, most urgent first." No menu entry is
 * named: Needs attention left the menu on 2026-10-13, so the sentence
 * says what the link opens rather than where to find it. The number is
 * GET /api/decisions' own `total` for this seat — the figure on the Ask
 * Etyme mark — never counted a second way here. The twin's own questions
 * are not in that queue, so they are said after it as "also". Null where
 * the queue owes nothing, so the caller says what it said before.
 */
export function needsCountSays(needs: number, items: readonly WaitingItem[]): { says: string; links: { text: string; href: string }[] } | null {
  if (needs <= 0) return null
  // Where every one of them is a card below, the list adds nothing and is not offered.
  const allBelow = items.length === needs
  const head = allBelow
    ? `${counted(needs, 'thing')} ${needs === 1 ? 'needs' : 'need'} you.`
    : needs === 1
      ? `One thing needs you; ${DECISIONS_LINK_TEXT} to see it.`
      : `${counted(needs, 'thing')} need you; ${DECISIONS_LINK_TEXT} to see them, most urgent first.`
  // The queue counts the twin's questions this seat may answer (section 6
  // of GET /api/decisions), so where the count holds them they are said as
  // part of it, never as something on top of it.
  const within = items.length <= needs
  const one = items.length === 1
  const also = items.length === 0 ? ''
    : allBills(items)
      ? within
        ? ` ${one ? (needs === 1 ? 'It is the bill' : 'One of them is the bill') : `${numberWord(items.length)} of them are bills`} Etyme drafted; ${one ? 'send it' : 'send each'} below, or say not now.`
        : ` Etyme also drafted ${one ? 'one bill' : counted(items.length, 'bill').toLowerCase()} for you to send; ${one ? 'send it' : 'send each'} below, or say not now.`
      : within
        ? ` ${one ? (needs === 1 ? 'It is a question' : 'One of them is a question') : `${numberWord(items.length)} of them are questions`} from Etyme; ${one ? 'approve it' : 'approve each'} below, or reject it with a reason.`
        : one
          ? ' Etyme is also asking you one thing; approve it below, or reject it with a reason.'
          : ` Etyme is also asking you ${counted(items.length, 'thing').toLowerCase()}; approve each below, or reject it with a reason.`
  return { says: head + also, links: allBelow ? [] : [{ text: DECISIONS_LINK_TEXT, href: DECISIONS_HREF }] }
}

/** A notice this person has not read, as the greeting says it. */
export interface NoticeLine {
  id: string
  /** The notice's own title, as it was written when it was sent. */
  title: string
  /** The page the notice opened, the same one the notifications page and the email link to. */
  href: string
}

/** Notices said in one greeting, at most; the rest wait for the next one. */
export const NOTICES_SHOWN = 5

export const SINCE_HEADING = 'Since you last looked:'

/**
 * "Since you last looked", one line per notice, each linking to the page
 * it is about. Two notices with the same title and page are one line
 * with a count. `older` is how many unread notices were not shown; they
 * are said in one line and shown the next time. Empty when there is
 * nothing, so the greeting draws no heading at all.
 */
export function sinceSays(notices: readonly NoticeLine[], older = 0): RichLine[] {
  if (notices.length === 0) return []
  const groups: { title: string; href: string; n: number }[] = []
  for (const n of notices) {
    const title = n.title.replace(/[\s.!:;,]+$/u, '').replace(/!/g, '').trim() || 'A notice'
    const same = groups.find((g) => g.title === title && g.href === n.href)
    if (same) same.n++
    else groups.push({ title, href: n.href, n: 1 })
  }
  const out: RichLine[] = [{ says: SINCE_HEADING }]
  for (const g of groups) {
    out.push({ says: g.n > 1 ? `${g.title} (${g.n} times).` : `${g.title}.`, links: [{ text: g.title, href: g.href }] })
  }
  if (older > 0) {
    out.push({ says: `${counted(older, 'older update')} ${older === 1 ? 'is' : 'are'} waiting; ${older === 1 ? 'it shows' : 'they show'} the next time you open Ask Etyme.` })
  }
  return out
}

/** The twin's questions, as the fact line of a reply. */
export function needsSays(items: readonly WaitingItem[]): string {
  if (items.length === 0) return 'Nothing from Etyme is waiting on you.'
  if (allBills(items)) {
    return items.length === 1
      ? 'Etyme drafted one bill for you to send; send it below, or say not now.'
      : `Etyme drafted ${counted(items.length, 'bill').toLowerCase()} for you to send; send each below, or say not now.`
  }
  return items.length === 1
    ? 'Etyme is asking you one thing; approve it below, or reject it with a reason.'
    : `Etyme is asking you ${counted(items.length, 'thing').toLowerCase()}; approve each below, or reject it with a reason.`
}

// ── Today: who else is asked, and the time limit ─────────────────────

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine']
/** "Two", "12". Sentence case, for the start of a line. */
function numberWord(n: number): string {
  return String(n < NUMBER_WORDS.length ? NUMBER_WORDS[n] : n)
}
/** "Two invoice receipts", "12 questions". Sentence case, for the start of a line. */
function counted(n: number, noun: string): string {
  return `${n < NUMBER_WORDS.length ? NUMBER_WORDS[n] : n} ${noun}${n === 1 ? '' : 's'}`
}

/** Every question waiting is a drafted bill to send, so the line says send rather than approve. */
function allBills(items: readonly WaitingItem[]): boolean {
  return items.length > 0 && items.every((i) => i.action === 'bill.send' && !!i.bill)
}

/** "a", "a and b", "a, b and c". */
function listed(xs: readonly string[]): string {
  if (xs.length <= 1) return xs[0] ?? ''
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
}

/** A question the twin asked that somebody else answers, from where this reader sits. */
export interface OtherWaiting {
  /** "PR-2026-0441" · a person's name. */
  title: string
  /** "invoice receipt", "bill" or "question". */
  noun: string
  /** The desks that hold the permission it needs, in the trade's words. */
  desks: string[]
  /** True where it was asked on this reader's own authority, so nobody here signs it. */
  own: boolean
  href: string
  /** The people at this company who hold that desk, by name. */
  people?: string[]
}

/**
 * Who else is being asked, grouped by the desk that answers, in one line
 * per desk: "Two invoice receipts are waiting for the AP Clerk:
 * PR-2026-0441 and PR-2026-0443. Neither is yours to sign." Where Etyme
 * asked on this reader's own authority — the program manager, whose
 * authority the twin acts under — the line says why it is not theirs.
 */
export function othersSay(others: readonly OtherWaiting[]): RichLine[] {
  const out: RichLine[] = []
  const byDesk = new Map<string, OtherWaiting[]>()
  for (const o of others) {
    const desk = o.desks.length ? `the ${twoDesks(o.desks)}` : 'somebody else'
    const key = `${desk}\u0000${o.own ? 'own' : ''}`
    byDesk.set(key, [...(byDesk.get(key) ?? []), o])
  }
  for (const [key, xs] of byDesk) {
    const [desk, own] = key.split('\u0000')
    const noun = xs.every((x) => x.noun === xs[0].noun) ? xs[0].noun : 'question'
    const verb = noun === 'bill' ? 'send' : 'approve'
    const not = xs.length === 1 ? `It is not yours to ${verb}` : xs.length === 2 ? `Neither is yours to ${verb}` : `None is yours to ${verb}`
    out.push({
      says: `${counted(xs.length, noun)} ${xs.length === 1 ? 'is' : 'are'} waiting for ${desk}: ${listed(xs.map((x) => x.title))}. ` +
        `${not}${own ? ': Etyme asked on your authority.' : '.'}`,
      links: xs.map((x) => ({ text: x.title, href: x.href })),
    })
  }
  return out
}

/**
 * Who to ask, for the receipts and questions waiting on another desk:
 * "Ask Renata Kowal, AP Clerk, to approve PR-2026-0441 and
 * IN-XSWQQZ-20260901." Names come from the seats that hold the desk;
 * where nobody holds it, the desk alone.
 */
export function askOthersSays(others: readonly OtherWaiting[]): RichLine | null {
  if (others.length === 0) return null
  const first = others[0]
  const same = others.filter((o) => o.desks.join() === first.desks.join())
  const verb = same.every((o) => o.noun === 'invoice receipt') ? 'approve' : same.every((o) => o.noun === 'bill') ? 'send' : 'answer'
  const desk = first.desks.length ? twoDesks(first.desks) : null
  const people = (first.people ?? []).slice(0, 2)
  const who = people.length ? (desk ? `${orNames(people)}, ${desk},` : orNames(people)) : desk ? `your ${desk}` : 'whoever answers it'
  const titles = same.slice(0, 3).map((o) => o.title)
  return {
    says: `Ask ${who} to ${verb} ${listed(titles)}${same.length > 3 ? ` and ${same.length - 3} more` : ''}.`,
    links: same.slice(0, 3).map((o) => ({ text: o.title, href: o.href })),
  }
}

/** A time-limit warning as the twin recorded it in its ledger. */
export interface LimitEntry {
  personId: string
  personName: string | null
  /** The day the limit is reached, as recorded. */
  limitOn: string
  capMonths: number | null
  suppliers: string[]
  /** When the twin recorded it. */
  recordedAt: string
}

export interface LimitRow {
  personId: string
  name: string
  /** Days from today to the limit; zero or less at or past it. */
  daysToLimit: number
  /** YYYY-MM-DD. */
  limitOn: string
  capMonths: number | null
  suppliers: string[]
  /** The day of the reading this row comes from, YYYY-MM-DD. */
  readOn: string
  href: string
}

const DAY_MS = 86_400_000
const utcMidnight = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())

/**
 * The people near the time limit, from the twin's own warnings: the
 * newest warning per person, days counted from today to the day the
 * warning names, nearest first. A warning with no readable day is left
 * out rather than guessed at.
 */
export function nearLimit(entries: readonly LimitEntry[], now: Date): LimitRow[] {
  const newest = new Map<string, LimitEntry>()
  for (const e of entries) {
    const had = newest.get(e.personId)
    if (!had || had.recordedAt < e.recordedAt) newest.set(e.personId, e)
  }
  const rows: LimitRow[] = []
  for (const e of newest.values()) {
    const on = new Date(e.limitOn)
    if (Number.isNaN(on.getTime())) continue
    rows.push({
      personId: e.personId,
      name: e.personName ?? 'A person on site',
      daysToLimit: Math.round((utcMidnight(on) - utcMidnight(now)) / DAY_MS),
      limitOn: on.toISOString().slice(0, 10),
      capMonths: e.capMonths,
      suppliers: e.suppliers,
      readOn: e.recordedAt.slice(0, 10),
      href: hrefFor('Person', e.personId),
    })
  }
  return rows.sort((a, b) => a.daysToLimit - b.daysToLimit || a.name.localeCompare(b.name))
}

/** "the 18-month time limit", or "the time limit" where the warning did not say. */
function limitWords(capMonths: number | null): string {
  return capMonths ? `the ${capMonths}-month time limit` : 'the time limit'
}

/** One person against the limit, as a sentence. `day` formats a YYYY-MM-DD. */
export function limitSays(r: LimitRow, day: (iso: string) => string): string {
  if (r.daysToLimit > 0) return `${r.name} reaches ${limitWords(r.capMonths)} in ${r.daysToLimit} day${r.daysToLimit === 1 ? '' : 's'}, on ${day(r.limitOn)}.`
  if (r.daysToLimit === 0) return `${r.name} reaches ${limitWords(r.capMonths)} today.`
  return `${r.name} reached ${limitWords(r.capMonths)} on ${day(r.limitOn)}.`
}

/** The time-limit answer's sentence. */
export function limitsSay(rows: readonly LimitRow[], day: (iso: string) => string, stale: readonly string[] = []): string {
  const staleLine = stale.length
    ? ` Last night’s reading also listed ${listed([...stale])}; the live check does not.`
    : ''
  if (rows.length === 0) return `No contractor on your sites is near the time limit. Checked just now.${staleLine}`
  return (
    `${planSays(rows[0])} ` +
    `${counted(rows.length, 'contractor')} ${rows.length === 1 ? 'is' : 'are'} near the time limit, counted across every supplier. ` +
    `${limitSays(rows[0], day)} Checked just now.${staleLine}`
  )
}

/** The time limit is a client's count: what a supplier, an MSP or a worker is told instead. */
export const LIMIT_IS_THE_CLIENTS = 'Your client counts the time limit across every supplier; its program manager reads it.'

/** The recommendation for the person nearest the limit. */
export function planSays(r: LimitRow): string {
  return r.daysToLimit > 0
    ? `Plan ${r.name}’s end date or break in service now.`
    : `Decide today what happens to ${r.name}; the time limit has passed.`
}

// ── Spend by supplier ────────────────────────────────────────────────

/** An invoice receipt billed to the reader's company, as the reader reads it. */
export interface SpendReceipt {
  invoiceId: string
  number: string
  /** The firm that billed it. Null where nothing behind the invoice names it. */
  supplier: string | null
  currency: string
  totalMinor: number
  paidMinor: number
}

export interface SpendRow {
  supplier: string
  currency: string
  receipts: number
  billedMinor: number
  paidMinor: number
  receiptLinks: Link[]
}

/**
 * Invoice receipts per supplier, in minor units. One row per supplier
 * and currency: amounts in two currencies are never added.
 */
export function spendBySupplier(receipts: readonly SpendReceipt[]): SpendRow[] {
  const by = new Map<string, SpendRow>()
  for (const r of receipts) {
    const supplier = r.supplier?.trim() || NO_SUPPLIER
    const currency = r.currency.toUpperCase()
    const key = `${supplier}\u0000${currency}`
    const row = by.get(key) ?? { supplier, currency, receipts: 0, billedMinor: 0, paidMinor: 0, receiptLinks: [] }
    row.receipts++
    row.billedMinor += Math.round(r.totalMinor)
    row.paidMinor += Math.round(r.paidMinor)
    row.receiptLinks.push({ label: r.number, href: hrefFor('Invoice', r.invoiceId) })
    by.set(key, row)
  }
  return [...by.values()].sort((a, b) => a.currency.localeCompare(b.currency) || b.billedMinor - a.billedMinor || a.supplier.localeCompare(b.supplier))
}

/** The calendar month a day falls in, UTC: [from, to) and "October 2026". */
export function monthOf(now: Date): { from: Date; to: Date; label: string } {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  const from = new Date(Date.UTC(y, m, 1))
  return {
    from,
    to: new Date(Date.UTC(y, m + 1, 1)),
    label: formatMonth(from),
  }
}

/**
 * The spend answer's sentence. `money` formats minor units in a
 * currency. Totals are per currency, never across.
 */
export function spendSays(rows: readonly SpendRow[], label: string, undated: number, money: (minor: number, currency: string) => string): string {
  const undatedLine = undated > 0
    ? ` ${counted(undated, 'invoice')} ${undated === 1 ? 'has' : 'have'} no invoice date, so no month counts ${undated === 1 ? 'it' : 'them'}.`
    : ''
  if (rows.length === 0) return `No supplier billed you in ${label}. Checked just now.${undatedLine}`
  const currencies = [...new Set(rows.map((r) => r.currency))]
  const sum = (c: string, f: (r: SpendRow) => number) => rows.filter((r) => r.currency === c).reduce((s, r) => s + f(r), 0)
  const billed = listed(currencies.map((c) => money(sum(c, (r) => r.billedMinor), c)))
  const paid = listed(currencies.map((c) => money(sum(c, (r) => r.paidMinor), c)))
  const receipts = rows.reduce((s, r) => s + r.receipts, 0)
  const suppliers = new Set(rows.map((r) => r.supplier)).size
  return (
    `${counted(suppliers, 'supplier')} billed you ${billed} in ${label}, on ${receipts} invoice${receipts === 1 ? '' : 's'}. ` +
    `Of that, ${paid} is paid. Counted by invoice date, and checked just now.${undatedLine}`
  )
}

// ── Unsigned weeks ───────────────────────────────────────────────────

export interface WeekRow {
  timesheetId: string
  personId: string
  person: string
  /** YYYY-MM-DD. */
  periodStart: string
  periodEnd: string
  hours: number
  /** Whole days since it was filed (or since the week ended, where no filing day is kept). */
  waitingDays: number
  href: string
}

/** How many weeks the chat draws before it sends the reader to Timesheets. */
export const WEEKS_SHOWN = 20

/** The unsigned-weeks answer's sentence. */
export function weeksSay(total: number, oldest: WeekRow | null, company: string, maySign = true): string {
  if (total === 0 || !oldest) return `No timesheet is waiting for approval at ${company}. Checked just now.`
  const waited = oldest.waitingDays > 0 ? `; it has waited ${oldest.waitingDays} day${oldest.waitingDays === 1 ? '' : 's'}` : ''
  const rec = maySign
    ? `Approve ${oldest.person}’s timesheet first${waited}.`
    : `Ask your hiring manager to approve ${oldest.person}’s timesheet first${waited}.`
  return (
    `${rec} ${counted(total, 'timesheet')} ${total === 1 ? 'is' : 'are'} waiting for approval at ${company}. Checked just now.` +
    (total > WEEKS_SHOWN ? ` The ${WEEKS_SHOWN} oldest are below; the rest are on Timesheets.` : '')
  )
}

/** The closing line of the greeting, word for word from the approved prototype. */
export const GREETING_CLOSE = 'Ask me anything about the program. I answer from the record, and I never move money without a person.'

/** "Good morning", by the reader's own clock. */
export function partOfDay(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/** The last word of a role that names a person; any other role is a desk ("Finance", "AP & Payroll"). */
const PERSON_ROLES = new Set(['manager', 'clerk', 'officer', 'lead', 'partner', 'recruiter', 'owner', 'admin', 'coordinator', 'approver', 'viewer', 'desk', 'consultant'])

/** A role as a sentence says it: lower case, except an acronym ("AP Clerk" reads "AP clerk"). */
function roleWords(role: string): string {
  return role.trim().split(/\s+/).map((w) => (/^[A-Z][a-z]/.test(w) ? w.toLowerCase() : w)).join(' ')
}

/**
 * The greeting's first line after "Good evening, Marcus.": the desk this
 * seat is and the company it is at, and in the demo that the company is a
 * sample. The phone header carries no words (founder, 2026-10-13), so this
 * is the one place in the chat that says where you are.
 */
export function seatSays(seat: { role: string | null; company: string | null; sample: boolean }): string | null {
  const company = seat.company?.trim()
  if (!company) return null
  const at = `${company}${seat.sample ? ', a sample company' : ''}.`
  const role = seat.role?.trim()
  if (!role) return `You are signed in at ${at}`
  const words = roleWords(role)
  const last = words.split(' ').pop()!.toLowerCase()
  return PERSON_ROLES.has(last) ? `You are the ${words} at ${at}` : `You are in ${words} at ${at}`
}

/**
 * Find the item a person meant: its number in the list, its question's
 * id, its ledger entry's id, or the invoice receipt's number.
 */
export function findItem(items: readonly WaitingItem[], ref: string): WaitingItem | null {
  const r = ref.trim().toLowerCase()
  if (/^\d+$/.test(r)) return items.find((i) => i.n === Number(r)) ?? null
  return (
    items.find((i) => i.approvalId.toLowerCase() === r || i.entryId.toLowerCase() === r) ??
    items.find((i) => i.title.toLowerCase().split(' ')[0] === r) ??
    null
  )
}

/** What a confirm card says the button will do, in the same words the result confirms. */
export function confirmSays(decision: 'APPROVED' | 'REJECTED', item: WaitingItem, reason: string | null): string {
  return decision === 'APPROVED'
    ? `Approve ${item.title}? Your approval is recorded under your name.`
    : `Reject ${item.title}, because “${reason}”? Nothing else happens, and your reason is recorded under your name.`
}

/**
 * The request the chat sends for a yes or a no. The one approval route
 * the web and Teams share, with the surface named; nothing else writes.
 */
export function decisionRequest(approvalId: string, decision: 'APPROVED' | 'REJECTED', reason: string | null): {
  url: string
  init: { method: 'POST'; headers: Record<string, string>; body: string }
} {
  return {
    url: `/api/twin/approvals/${encodeURIComponent(approvalId)}`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, reason: reason ?? undefined, surface: 'WEB' }),
    },
  }
}

// ── Answering ────────────────────────────────────────────────────────

/** A read the seat may be refused, with the sentence that says who reads it instead. */
export type Refusable<T> = ({ ok: true } & T) | { ok: false; says: string; links?: Link[] }

/** What the route reads. Every one is a read; none writes. */
export interface Readers {
  waiting(): Promise<WaitingItem[]>
  /** An entry in the reader's scope by its id, its question's id, or the entity it is about. */
  entry(ref: string): Promise<{ id: string; says: string; ruleCited: string; rationale: string; entityType: string; entityId: string } | null>
  /** Invoice receipts billed to this company in [from, to), each checked now, with the nightly verdict beside it. */
  receiptsIn(from: Date, to: Date): Promise<Refusable<{ receipts: VarianceReceipt[] }>>
  /** The twin's questions this seat may not answer, and who does. */
  othersWaiting(): Promise<OtherWaiting[]>
  /** The twin's time-limit warnings, or the sentence for a seat that does not read what the rules found. */
  limits(): Promise<Refusable<{ entries: LimitEntry[]; stale?: string[] }>>
  /**
   * Bills this firm sent that the firm paying them put on hold, with the
   * payer's reason; empty for a seat that does not send bills. Optional
   * so a reader that never sends bills need not say so.
   */
  heldBills?(): Promise<HeldBill[]>
  /** Receipts the twin told this seat's paying desk about that still fail the check; empty for any other desk. */
  told(): Promise<{ told: ToldReceipt[]; stale: string[] }>
  /** A placement or a receipt the message names, at this company, where it names one. */
  named(text: string): Promise<Named>
  /** Weeks waiting for this company's signature, oldest first, at most WEEKS_SHOWN, and how many in all. */
  unsignedWeeks(): Promise<Refusable<{ rows: WeekRow[]; total: number; company: string; maySign: boolean }>>
  /** Invoice receipts billed to this company in [from, to), and how many carry no date at all. */
  spendIn(from: Date, to: Date): Promise<Refusable<{ receipts: SpendReceipt[]; undated: number }>>
  ledgerLines(): Promise<LedgerLine[]>
  /** Whether this company's settings desk turned the model on (lib/model-boundary's switch). */
  modelOn(): Promise<boolean>
  /**
   * The people and firms this reader may read: for masking when something
   * is about to leave, and for the transaction rule when a question has no
   * word of the trade or names a firm by its legal form.
   */
  vocabulary(): Promise<MaskVocabulary>
  /** Asks the model, masked text in, masked text out; only called with the switch and the key both on. */
  model(system: string, question: string, context: string): Promise<ModelReply | null>
  /** Logs one prompt that left and its answer, masked. Never throws. */
  logPrompt(entry: PromptLog): Promise<void>
}

/**
 * One answer to one message. Rules first; the model only for ASK, and
 * only where a key is configured.
 */
/** A YYYY-MM-DD as a reader reads it, "Dec 11, 2026", through the one date formatter. */
const day = (iso: string): string => formatDay(iso)
/** Minor units in their currency, "$3,800.00", through the one money formatter. */
export const money = (minor: number, currency: string): string => format(fromMinor(minor, currency))

/**
 * What needs this seat today: the twin's questions it may answer, as
 * cards; who else is being asked; and who is near the time limit. All of
 * it from the ledger and the rules, never the model. With `greeting`, it
 * is the first message of the chat and closes with what Etyme answers.
 */
/** The program's picture as `/api/program` counts it: people on site today and the suppliers they come through. */
export interface Picture {
  onSite: number
  suppliers: number
}

export const CONTRACTORS_HREF = '/dashboard/people'
export const RECEIPTS_HREF = '/dashboard/invoices'

/** "Seven contractors are on site today, through four suppliers.", the count linking to Contractors. Null when nobody is. */
export function pictureSays(p: Picture | null | undefined): RichLine | null {
  if (!p || p.onSite <= 0) return null
  const who = counted(p.onSite, 'contractor')
  return {
    says: `${who} ${p.onSite === 1 ? 'is' : 'are'} on site today` +
      (p.suppliers > 0 ? `, through ${counted(p.suppliers, 'supplier').toLowerCase()}.` : '.'),
    links: [{ text: who, href: CONTRACTORS_HREF }],
  }
}

/** "Suppliers billed you $42,587.00 so far in Oct 2026." Per currency, never added across. Null when nothing was billed. */
export function billedSays(rows: readonly SpendRow[], label: string): RichLine | null {
  const currencies = [...new Set(rows.filter((r) => r.billedMinor !== 0).map((r) => r.currency))]
  if (currencies.length === 0) return null
  const amounts = currencies.map((c) => money(rows.filter((r) => r.currency === c).reduce((s, r) => s + r.billedMinor, 0), c))
  return {
    says: `Suppliers billed you ${listed(amounts)} so far in ${label}.`,
    links: amounts.map((text) => ({ text, href: RECEIPTS_HREF })),
  }
}

/** A receipt the twin told this paying desk about, as it reads today. */
export interface ToldReceipt {
  invoiceId: string
  number: string
  supplier: string | null
  /** Hours billed and accepted on the accepted weeks; null where the difference is not in the hours. */
  hoursBilled: number | null
  hoursAccepted: number | null
}

/**
 * Told, not asked: the receipts the twin told the paying desk about,
 * which nobody can say yes to because they fail the check. One line,
 * however many: "PR-2026-0442 bills 41.5 hours against 40 accepted; it
 * cannot be paid until Pinnacle Resourcing corrects it."
 */
export function toldSays(told: readonly ToldReceipt[], stale: readonly string[] = []): RichLine | null {
  if (told.length === 0 && stale.length === 0) return null
  const one = (t: ToldReceipt) => {
    const what = t.hoursBilled != null && t.hoursAccepted != null && t.hoursBilled !== t.hoursAccepted
      ? `${t.number} bills ${hrs(t.hoursBilled)} hours against ${hrs(t.hoursAccepted)} approved`
      : `${t.number} does not match the approved hours or the contract rate`
    return `${what}; it cannot be paid until ${t.supplier ?? 'the supplier'} corrects it.`
  }
  const lines = told.map(one)
  if (stale.length) lines.push(`${listed([...stale])}, flagged last night, ${stale.length === 1 ? 'matches' : 'match'} now.`)
  return {
    says: lines.join(' '),
    links: [...told.map((t) => ({ text: t.number, href: hrefFor('Invoice', t.invoiceId) }))],
  }
}

/** The recommendation for the first receipt the paying desk was told about. */
export function toldAskSays(t: ToldReceipt): RichLine {
  const over = t.hoursBilled != null && t.hoursAccepted != null && t.hoursBilled > t.hoursAccepted
    ? `; it bills ${hrs(t.hoursBilled - t.hoursAccepted)} hours over the approved hours`
    : ''
  return {
    says: `Ask ${t.supplier ?? 'the supplier'} to correct ${t.number}${over}.`,
    links: [{ text: t.number, href: hrefFor('Invoice', t.invoiceId) }],
  }
}

/** The recommendation for the twin's own questions to this seat. */
export function itemsAskSays(items: readonly WaitingItem[]): RichLine | null {
  if (items.length === 0) return null
  if (items.every((i) => i.action === BILL_SEND && i.bill)) {
    const b = items[0].bill!
    return items.length === 1
      ? { says: `Send ${b.invoiceNumber ? 'bill ' : ''}${items[0].title}; it is built from weeks ${b.customerName} signed.`, links: [{ text: items[0].title, href: items[0].href }] }
      : { says: `Send the ${counted(items.length, 'bill').toLowerCase()} below; each is built from weeks the customer signed.` }
  }
  const receipts = items.every((i) => i.action === 'invoice_receipt.approve')
  if (items.length === 1) {
    return receipts
      ? { says: `Approve ${items[0].title}; it matches the approved hours and the contract rate.`, links: [{ text: items[0].title, href: items[0].href }] }
      : { says: `Answer Etyme’s question on ${items[0].title} below.`, links: [{ text: items[0].title, href: items[0].href }] }
  }
  return receipts
    ? { says: `Approve the ${counted(items.length, 'invoice').toLowerCase()} below; each matches the approved hours and the contract rate.` }
    : { says: `Answer Etyme’s ${counted(items.length, 'question').toLowerCase()} below.` }
}

// ── The supplier's bill (2026-10-18) ─────────────────────────────────
//
// Ask Etyme at a supplier drafts the bill on the agreement's billing date
// and asks whoever issues bills to send it (`bill.send`, lib/money/
// supplier-bills). The card shows the bill the way the Bills page would:
// who it is to, the period, the hours, the amount, each person, what it is
// built from and when it falls due. A yes goes through the one approval
// route and sends it exactly as the Submit button does.

export const BILL_SEND = 'bill.send'

/** What "Not now" records when the person gives no reason: true, and plain. */
export const NOT_NOW_REASON = 'Not now, said in Ask Etyme with no reason given. The draft stays on the Bills page.'

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}
const isMinor = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
const isHours = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * A `bill.send` question's payload, read back. Null where any figure the
 * card shows is missing or not a number: a card with a blank where the
 * amount should be is worse than the plain question, which still shows.
 */
export function billFromPayload(p: unknown): BillCardPayload | null {
  if (!isRecord(p) || !isRecord(p.period) || !isRecord(p.builtFrom)) return null
  const { period, builtFrom } = p
  if (typeof p.customerName !== 'string' || !p.customerName) return null
  if (typeof period.label !== 'string' || typeof period.start !== 'string' || typeof period.end !== 'string') return null
  if (!isHours(p.hours) || !isMinor(p.totalMinor) || typeof p.currency !== 'string' || !p.currency) return null
  if (!Array.isArray(p.people) || !Array.isArray(builtFrom.timesheetIds)) return null
  const people = p.people.filter((x): x is { personName: string; hours: number; amountMinor: number } =>
    isRecord(x) && typeof x.personName === 'string' && isHours(x.hours) && isMinor(x.amountMinor))
  if (people.length !== p.people.length) return null
  const ids = builtFrom.timesheetIds.filter((x): x is string => typeof x === 'string')
  return {
    customerName: p.customerName,
    period: { start: period.start, end: period.end, label: period.label },
    hours: p.hours,
    totalMinor: p.totalMinor,
    currency: p.currency,
    people: people.map((x) => ({ personName: x.personName, hours: x.hours, amountMinor: x.amountMinor })),
    builtFrom: {
      timesheetIds: ids,
      weeks: isMinor(builtFrom.weeks) ? builtFrom.weeks : ids.length,
      expenses: isMinor(builtFrom.expenses) ? builtFrom.expenses : 0,
      milestones: isMinor(builtFrom.milestones) ? builtFrom.milestones : 0,
    },
    dueSays: typeof p.dueSays === 'string' ? p.dueSays : '',
    heldBack: typeof p.heldBack === 'string' && p.heldBack ? p.heldBack : null,
    setAside: Array.isArray(p.setAside) ? p.setAside.filter((x): x is string => typeof x === 'string' && !!x) : [],
    ...(typeof p.invoiceId === 'string' ? { invoiceId: p.invoiceId } : {}),
    ...(typeof p.invoiceNumber === 'string' ? { invoiceNumber: p.invoiceNumber } : {}),
  }
}

/** "INV-0042 to Northbend Athletic": the bill as a waiting item names it, number first so "approve INV-0042" finds it. */
export function billItemTitle(b: Pick<BillCardPayload, 'customerName' | 'invoiceNumber' | 'period'>): string {
  return b.invoiceNumber ? `${b.invoiceNumber} to ${b.customerName}` : `the bill to ${b.customerName} for ${b.period.label}`
}

/** The card's heading. */
export function billCardTitle(b: Pick<BillCardPayload, 'customerName' | 'period'>): string {
  return `Bill ready to send — ${b.customerName}, ${b.period.label}`
}

/** "2 signed weeks", with expenses and milestones where there are any: the card's "Built from" row. */
export function billBuiltFrom(b: Pick<BillCardPayload, 'builtFrom'>): string {
  const { weeks, expenses, milestones } = b.builtFrom
  return listed([
    `${weeks} signed week${weeks === 1 ? '' : 's'}`,
    ...(expenses ? [`${expenses} approved expense${expenses === 1 ? '' : 's'}`] : []),
    ...(milestones ? [`${milestones} accepted milestone${milestones === 1 ? '' : 's'}`] : []),
  ])
}

/** The rows the card shows, in order. The same rows on the web and in a test. */
export function billRows(b: BillCardPayload): { label: string; value: string }[] {
  const rows = [
    { label: 'Hours', value: hrs(b.hours) },
    { label: 'Amount', value: money(b.totalMinor, b.currency) },
  ]
  for (const x of b.people) rows.push({ label: 'Person', value: `${x.personName} · ${hrs(x.hours)} hours · ${money(x.amountMinor, b.currency)}` })
  rows.push({ label: 'Built from', value: billBuiltFrom(b) })
  // The label already says "Due"; the sentence is not made to say it twice.
  if (b.dueSays) rows.push({ label: 'Due', value: b.dueSays.replace(/^Due\s+/u, '') })
  if (b.heldBack) rows.push({ label: 'Left off', value: b.heldBack })
  for (const x of b.setAside) rows.push({ label: 'Terms', value: x })
  return rows
}

/** What a sent bill's card reads, in the words the Send button promised. */
export function billSentSays(b: Pick<BillCardPayload, 'customerName' | 'invoiceNumber'>, number?: string | null): string {
  const n = number ?? b.invoiceNumber
  return `Sent to ${b.customerName}${n ? `: bill ${n}` : ''}.`
}

/** What a bill's card reads after "Not now". */
export function billKeptSays(b: Pick<BillCardPayload, 'invoiceNumber'>): string {
  return `Not sent. ${b.invoiceNumber ? `Bill ${b.invoiceNumber}` : 'The bill'} stays a draft on the Bills page; send it from there when it is ready.`
}

/** A bill this firm sent that the firm paying it put on hold, read from the hold itself. */
export interface HeldBill {
  invoiceId: string
  number: string
  /** The firm that holds it: the customer, or the prime above a sub-vendor. */
  payerName: string
  /** The reason the payer gave when it held the bill; null where the hold carries none. */
  reason: string | null
  /** YYYY-MM-DD, the day the hold was put on. */
  heldOn: string | null
  href: string
}

/** The held card's heading. */
export function heldBillTitle(h: Pick<HeldBill, 'payerName' | 'number'>): string {
  return `${h.payerName} put bill ${h.number} on hold`
}

/** The held card's sentence: their reason, and what it means for the money. */
export function heldBillSays(h: Pick<HeldBill, 'payerName' | 'reason'>): string {
  return (h.reason ? `Their reason: ${h.reason.replace(/[\s.]+$/u, '')}. ` : `${h.payerName} gave no reason on the record. `) +
    `Nothing is paid on it until ${h.payerName} lifts the hold.`
}

/**
 * The notice the hold route sent this firm, by its title, so the greeting
 * does not say the same hold twice: once as the card and again under
 * "Since you last looked". The title is the hold route's own sentence.
 */
export function heldNoticeTitles(held: readonly HeldBill[]): Set<string> {
  return new Set(held.map((h) => supplierToldSays({ payerName: h.payerName, number: h.number, to: 'HELD', reason: h.reason }).title))
}

/** The fact line where the only thing to look at is a bill on hold. */
export function heldHeadline(held: readonly HeldBill[]): string {
  return held.length === 1
    ? `${held[0].payerName} put one of your bills on hold.`
    : `${numberWord(held.length)} of your bills are on hold.`
}

/** The recommendation where a customer put one of this firm's bills on hold. */
export function heldAskSays(held: readonly HeldBill[]): RichLine | null {
  if (held.length === 0) return null
  const h = held[0]
  const n = `bill ${h.number}`
  return held.length === 1
    ? { says: `Open ${n} and answer ${h.payerName}; they put it on hold.`, links: [{ text: n, href: h.href }] }
    : { says: `Open the ${counted(held.length, 'bill').toLowerCase()} on hold below; each says who held it and why.` }
}

/** Lines in the greeting before its closing sentence, at most: the first line and five under it. */
export const GREETING_LINES = 6

/**
 * What needs this seat today: the twin's questions it may answer, as
 * cards; who else is being asked; who is near the time limit; and, in
 * the greeting, the program's picture — people on site and this month's
 * invoice receipts — where they are not zero. All of it from the ledger,
 * the record and the rules, never the model. With `greeting`, it is the
 * first message of the chat and closes with what Etyme answers.
 */
export async function today(read: Readers, opts: TodayOptions = {}): Promise<Answer> {
  const now = opts.now ?? new Date()
  const month = monthOf(now)
  const [items, others, limits, told, spend, needs, held] = await Promise.all([
    read.waiting(), read.othersWaiting(), read.limits(), read.told(),
    opts.greeting ? read.spendIn(month.from, month.to) : Promise.resolve(null),
    opts.needs ? opts.needs().catch(() => null) : Promise.resolve(null),
    read.heldBills ? read.heldBills() : Promise.resolve([] as HeldBill[]),
  ])
  const near = limits.ok ? nearLimit(limits.entries, now) : []

  // Recommendation first: what this desk should do, in that order.
  const recommend =
    itemsAskSays(items) ??
    (told.told.length ? toldAskSays(told.told[0]) : null) ??
    (held.length ? heldAskSays(held) : null) ??
    askOthersSays(others) ??
    (near.length ? { says: planSays(near[0]), links: [{ text: near[0].name, href: near[0].href }] } : null) ??
    undefined

  // Then the facts, each read at the moment of the question.
  const lines: RichLine[] = []
  const toldLine = toldSays(told.told, told.stale)
  if (toldLine) lines.push(toldLine)
  lines.push(...othersSay(others))
  if (near.length) {
    lines.push({
      says: limitSays(near[0], day) +
        (near.length > 1 ? ` ${counted(near.length - 1, 'more contractor')} ${near.length === 2 ? 'is' : 'are'} near the time limit.` : ''),
      links: [{ text: near[0].name, href: near[0].href }],
    })
  }
  if (limits.ok && limits.stale?.length) {
    lines.push({ says: `Last night’s reading also listed ${listed(limits.stale)}; the live check does not.` })
  }
  const onSite = opts.greeting ? pictureSays(opts.picture) : null
  if (onSite) lines.push(onSite)
  const billed = spend?.ok ? billedSays(spendBySupplier(spend.receipts), month.label) : null
  if (billed) lines.push(billed)

  // Six lines at most before the closing sentence: the recommendation, the
  // headline, and what fits of the facts.
  const room = GREETING_LINES - 1 - (recommend ? 1 : 0)
  const more = lines.slice(0, room)
  // The headline. Where the decisions queue was read, its count leads, so
  // the number on the Ask Etyme mark and this line are one figure.
  const headline = needs != null ? needsCountSays(needs, items) : null
  const nothing = (needs ?? 0) === 0 && items.length === 0 && held.length === 0 && others.length === 0 && near.length === 0 && told.told.length === 0
  const says = (headline ? headline.says
    : nothing ? 'Nothing needs you today, and nothing Etyme asked is waiting on anybody.'
      : items.length === 0 && held.length > 0 ? heldHeadline(held) : needsSays(items)) + ' Checked just now.'
  // What the notices said, after the recommendation, the decisions and the
  // facts, and never counted in the six lines: a notice is not lost to the
  // cap, because the route marks read only the ones it passed in here.
  // A hold already drawn as a card is not said again as a notice; the
  // route still marks that notice read, because the card said it.
  if (opts.greeting && opts.notices) {
    const said = heldNoticeTitles(held)
    more.push(...sinceSays(opts.notices.shown.filter((n) => !said.has(n.title)), opts.notices.older))
  }
  if (opts.greeting) more.push({ says: GREETING_CLOSE })
  // The boundary, the greeting's last line: said on the first screen, once,
  // now that the phone draws no heading over the thread.
  if (opts.greeting && opts.model) more.push({ says: boundarySays(opts.model) })
  return {
    kind: 'NEEDS', ...(recommend ? { recommend } : {}), says, ...(headline ? { saysLinks: headline.links } : {}),
    items, ...(held.length ? { held } : {}), more, ...(opts.greeting ? { greeting: true } : {}),
  }
}

/** What the route hands `today` beyond the readers. */
export interface TodayOptions {
  now?: Date
  greeting?: boolean
  picture?: Picture | null
  /**
   * GET /api/decisions' `total` for this seat, read by the route. Null or
   * absent where it could not be read, and the headline says what the
   * twin's own questions say, as before.
   */
  needs?: () => Promise<number | null>
  /** Unread notices for the greeting's "Since you last looked", and how many older ones wait. */
  notices?: { shown: readonly NoticeLine[]; older: number }
  /** Whether a model can be asked here; the greeting closes on what that means for this company's data. */
  model?: ModelState
}

/**
 * The boundary, said on the first screen (CLAUDE.md, "Ask Etyme is the
 * app"). The last clause follows whether a model can be asked here.
 */
export type ModelState = 'OFF' | 'ON' | 'NO_KEY'

/** The switch and the key together: ON only when both are on. */
export function modelState(companyOn: boolean, env: Record<string, string | undefined>): ModelState {
  return !companyOn ? 'OFF' : modelConfigured(env) ? 'ON' : 'NO_KEY'
}

export function boundarySays(state: ModelState): string {
  return 'Your data stays in your company. Every read is logged. ' + (
    state === 'ON' ? 'Free-text questions go to the model your company turned on, masked; every prompt is logged under Settings.'
      : state === 'NO_KEY' ? 'Nothing leaves to a model; it is not set up on this deployment.'
        : 'Nothing leaves to a model; your company has not turned it on.')
}

export async function respond(
  text: string,
  read: Readers,
  opts: { env: Record<string, string | undefined>; now?: Date; companyKind?: string | null; permissions?: readonly string[]; needs?: () => Promise<number | null> }
): Promise<Answer> {
  const intent = readAsk(text)

  switch (intent.kind) {
    case 'HELP':
      return { kind: 'TEXT', says: WHAT_I_ANSWER + (modelConfigured(opts.env) ? ' Anything else, I read from the ledger and say only what is on it.' : '') }

    case 'NEEDS':
      return today(read, { now: opts.now, needs: opts.needs })

    case 'NEVER':
      return { kind: 'TEXT', ...neverSays(intent.act, opts.companyKind, opts.permissions, await read.named(text)) }

    case 'MARGIN':
      return { kind: 'TEXT', ...marginRefusal(opts.companyKind) }

    case 'TIME_LIMIT': {
      const limits = await read.limits()
      if (!limits.ok) return { kind: 'TEXT', says: limits.says, links: limits.links }
      const rows = nearLimit(limits.entries, opts.now ?? new Date())
      return { kind: 'TIME_LIMIT', says: limitsSay(rows, day, limits.stale ?? []), rows }
    }

    case 'SPEND': {
      const m = monthOf(opts.now ?? new Date())
      const spend = await read.spendIn(m.from, m.to)
      if (!spend.ok) return { kind: 'TEXT', says: spend.says, links: spend.links }
      const rows = spendBySupplier(spend.receipts)
      return {
        kind: 'SPEND',
        says: spendSays(rows, m.label, spend.undated, money),
        period: { from: m.from.toISOString().slice(0, 10), to: m.to.toISOString().slice(0, 10), label: m.label },
        rows,
      }
    }

    case 'WEEKS': {
      const weeks = await read.unsignedWeeks()
      if (!weeks.ok) return { kind: 'TEXT', says: weeks.says, links: weeks.links }
      const oldest = weeks.rows.reduce<WeekRow | null>((d, r) => (d == null || r.waitingDays > d.waitingDays ? r : d), null)
      return {
        kind: 'WEEKS',
        says: weeksSay(weeks.total, oldest, weeks.company, weeks.maySign),
        rows: weeks.rows,
        more: Math.max(0, weeks.total - weeks.rows.length),
        links: [{ label: 'Open Timesheets', href: '/dashboard/timesheets' }],
      }
    }

    case 'WHY': {
      if (!intent.ref) return { kind: 'TEXT', says: 'Say which one: “Why 1” for the first thing waiting on you, or “Why” and an invoice number.' }
      let ref = intent.ref
      if (/^\d+$/.test(ref)) {
        const item = findItem(await read.waiting(), ref)
        if (!item) return { kind: 'TEXT', says: `There is no item ${ref} waiting on you. Ask “What needs me today?” to see the list.` }
        ref = item.entryId
      }
      const e = await read.entry(ref)
      if (!e) return { kind: 'TEXT', says: `There is no ledger entry “${intent.ref}” you can read. Check the entry, or ask “What needs me today?”.` }
      return {
        kind: 'WHY',
        says: e.says,
        ruleCited: e.ruleCited,
        rationale: e.rationale,
        links: [
          { label: 'The ledger entry', href: entryHref(e.id) },
          ...(e.entityType === 'Invoice' || e.entityType === 'Person'
            ? [{ label: e.entityType === 'Invoice' ? 'The invoice' : 'The contractor', href: hrefFor(e.entityType, e.entityId) }]
            : []),
        ],
      }
    }

    case 'DECIDE': {
      const items = await read.waiting()
      const item = findItem(items, intent.ref)
      if (!item) {
        return {
          kind: 'TEXT',
          says: items.length === 0
            ? 'Nothing from Etyme is waiting on you, so there is nothing to answer.'
            : `“${intent.ref}” is not one of the ${items.length} thing${items.length === 1 ? '' : 's'} waiting on you. Ask “What needs me today?” to see them by number.`,
        }
      }
      if (intent.decision === 'REJECTED' && !intent.reason) {
        return { kind: 'TEXT', says: `Give a reason, so it is on the record: “Reject ${item.n} because …”.` }
      }
      return { kind: 'CONFIRM', says: confirmSays(intent.decision, item, intent.reason), decision: intent.decision, reason: intent.reason, item }
    }

    case 'VARIANCE': {
      const q = quarterOf(opts.now ?? new Date())
      const got = await read.receiptsIn(q.from, q.to)
      if (!got.ok) return { kind: 'TEXT', says: got.says, links: got.links }
      const rows = varianceBySupplier(got.receipts)
      return {
        kind: 'VARIANCE',
        says: varianceSays(rows, q.label, staleVerdicts(got.receipts), got.receipts),
        period: { from: q.from.toISOString().slice(0, 10), to: q.to.toISOString().slice(0, 10), label: q.label },
        rows,
      }
    }

    case 'ASK': {
      // Never beyond the transaction: a general question, or one about
      // another company's book, is refused by rule before anything else —
      // the switch included, because no model would be allowed to answer it.
      const off = await offRecord(intent.text, { named: (t) => read.named(t), names: () => read.vocabulary() })
      if (off) return { kind: 'TEXT', says: off }
      // Free text leaves only when the company turned the model on AND the
      // deployment has a key; the company's switch is said first, because
      // it is the one a person can change.
      const state = modelState(await read.modelOn(), opts.env)
      if (state === 'OFF') return { kind: 'TEXT', says: NO_SWITCH }
      if (state === 'NO_KEY') return { kind: 'TEXT', says: NO_MODEL }
      const lines = await read.ledgerLines()
      if (lines.length === 0) return { kind: 'TEXT', says: `${NOT_YET} Etyme has checked nothing you can read yet. ${WHAT_I_ANSWER}` }
      // Masked at the edge: the question and at most 60 lines, every name
      // and figure a token, the map kept for this request only.
      const masker = newMasker(await read.vocabulary())
      const maskedQuestion = masker.mask(intent.text)
      const maskedContext = masker.mask(ledgerContext(lines))
      const reply = await read.model(MODEL_SYSTEM, maskedQuestion, maskedContext)
      if (!reply) return { kind: 'TEXT', says: 'The model did not answer just now. ' + WHAT_I_ANSWER }
      // An answer with no line of the record behind it is not shown, and
      // the log says so beside what the model wrote.
      const check = grounded(reply.text, lines)
      await read.logPrompt({
        model: reply.model,
        maskedPrompt: `Ledger lines:\n${maskedContext}\n\nQuestion: ${maskedQuestion}`,
        maskedAnswer: check.replaced ? `${REPLACED_NOTE}${reply.text}` : reply.text,
        tokensIn: reply.tokensIn,
        tokensOut: reply.tokensOut,
        realValues: masker.realValues(),
        ...(check.replaced ? { replaced: true } : {}),
      })
      if (!check.show) return { kind: 'TEXT', says: NOT_GROUNDED, links: [LEDGER_LINK] }
      const said = masker.unmask(reply.text)
      const byId = new Map(lines.map((l) => [l.id, l]))
      return {
        kind: 'MODEL',
        says: said,
        links: citedIds(said, lines).map((id) => {
          const l = byId.get(id)!
          return { label: `Entry ${id.slice(-6)}`, href: hrefFor(l.entityType, l.entityId, l.id) }
        }),
      }
    }
  }
}

/**
 * The questions whose cards an answer carries, by approval id, so the
 * saved line knows which cards it drew (lib/ask-etyme-thread). The
 * greeting is never saved; a "What needs me today?" asked later is.
 */
export function cardIdsOf(answer: Answer): string[] {
  if (answer.kind === 'NEEDS') return answer.items.map((i) => i.approvalId)
  if (answer.kind === 'CONFIRM') return [answer.item.approvalId]
  return []
}
