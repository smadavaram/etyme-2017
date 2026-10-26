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

import { formatDay, formatMonth, formatMonthLong } from '@/lib/format-date'
import { format, fromMinor } from '@/lib/money'
import { desksHolding, type Permission, hasPermission, hasAnyPermission } from '@/lib/permissions'
import { newMasker, type MaskVocabulary } from './mask'
import type { BillCardPayload } from '@/lib/money/supplier-bills'
import { supplierToldSays } from '@/lib/money/invoice-hold'
import { offRecord, asksAboutFirmMoney, anotherFirmsMoney, NOT_ANOTHER_BOOK } from './transaction'
import type { WorkerAnswer } from './worker'

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
  /** A firm's own book (2026-10-19): who rolls off, who is on the bench, signed weeks not billed, bills unpaid. */
  | { kind: 'ROLLOFF' }
  | { kind: 'BENCH' }
  | { kind: 'UNBILLED' }
  | { kind: 'UNPAID' }
  /** The trade's plain questions, answered from the record (the walk of 2026-10-22). */
  | { kind: 'APPLIED'; job: string | null }
  | { kind: 'PAYABLE' }
  | { kind: 'ACCEPT' }
  | { kind: 'I9' }
  | { kind: 'EXPIRING' }
  /** "When was I last paid?": the reader's own pay, answered from payroll or refused with who runs it (walk three, 2026-10-26). */
  | { kind: 'LAST_PAID' }
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

  // A firm's own book, each answered from the record (founder, 2026-10-19:
  // a supplier asks which weeks are signed and not billed, which bills are
  // unpaid, who is on the bench, who rolls off).
  // The trade's plain questions (the walk of 2026-10-22): who applied,
  // what can be paid, which weeks to accept, who is missing an I-9, whose
  // papers run out, who is available. Each is answered from the record.
  const applied = readApplied(text)
  if (applied) return applied
  if (LAST_PAID_ASK.test(lower)) return { kind: 'LAST_PAID' }
  if (/\b(invoice receipts?|invoices?|receipts?)\b/.test(lower) && /\b(can (i|we) pay|to pay|ready to pay|payable|may (i|we) pay|should (i|we) pay|waiting (for|on) payment)\b/.test(lower)) return { kind: 'PAYABLE' }
  if (/\b(weeks?|timesheets?|hours)\b/.test(lower) && /\b(accept|to accept|accepting)\b/.test(lower)) return { kind: 'ACCEPT' }
  if (/\bi-?9s?\b/.test(lower) && /\b(missing|without|no|needs?|owes?|lacks?|lacking|held)\b/.test(lower)) return { kind: 'I9' }
  if (/\b(papers?|paperwork|documents?|certificates?|insurance|licen[cs]es?|visas?|permits?)\b/.test(lower) && /\b(run(s|ning)? out|expir\w*|laps\w*|due to renew)\b/.test(lower)) return { kind: 'EXPIRING' }
  if (/\b(who|anyone|anybody|somebody|someone)\b.*\b(available|free now|between projects)\b|\bavailable (people|consultants|engineers|workers|now)\b/.test(lower)) return { kind: 'BENCH' }

  if (/\broll(s|ing|ed)?[- ]?off\b|\bending soon\b/.test(lower)) return { kind: 'ROLLOFF' }
  if (/\bbench\b/.test(lower) && !/\bbench (pay|burn|profit|cost)/.test(lower)) return { kind: 'BENCH' }
  if (/\bunbilled\b|\bnot (yet )?(been )?billed\b|\bnot on a bill\b/.test(lower)) return { kind: 'UNBILLED' }
  if (
    /\bunpaid\b|\boutstanding (bills?|invoices?)\b|\bwho owes (us|me)\b/.test(lower) ||
    (/\b(billed|bills?|invoices?|invoiced)\b/.test(lower) && /\bnot (yet )?(been )?paid\b/.test(lower))
  ) return { kind: 'UNPAID' }

  if (/\btime[- ]limits?\b|\btenure\b|\b18[- ]months?\b/.test(lower)) return { kind: 'TIME_LIMIT' }
  if (/\b(spend|spent|spending)\b|\bbilled (us|you)\b|\bhow much have suppliers billed\b/.test(lower)) return { kind: 'SPEND' }
  if (
    /\bunsigned\b/.test(lower) ||
    (/\b(weeks?|timesheets?|hours)\b/.test(lower) && /\b(not signed|to sign|waiting|not approved|unapproved|approval)\b/.test(lower))
  ) return { kind: 'WEEKS' }

  return { kind: 'ASK', text }
}

/** "When was I last paid?", "When did I last get paid?", "my last paycheck": the reader's own pay. */
const LAST_PAID_ASK = /\bwhen (was|were) i (last )?paid\b|\bwhen did i (last )?get paid\b|\bmy last (pay ?check|pay ?day|payment)\b/

/** Words that name no one job: "my jobs", "our job requests". */
const ANY_JOB = /^(my|our|the|any|all|open|these|those)?\s*(jobs?|job requests?|roles?|positions?|openings?|requisitions?)$/i

/**
 * "Who applied for the HCM integration lead job?", "Candidates for the
 * data engineer role", "Who applied?": the job named, or null for all of
 * the reader's jobs. Null where the question is not about who applied.
 */
export function readApplied(raw: string): Intent | null {
  const t = raw.trim().replace(/\s+/g, ' ').replace(/[?.!]+$/, '')
  const asked =
    /^(who|which (people|candidates|consultants))\b.*\b(applied|apply|applying|submitted|were put forward)\b/i.test(t) ||
    /^(show )?(the )?(candidates|applicants|submissions)\b.*\b(for|on|to)\b/i.test(t) ||
    /^who applied$/i.test(t)
  if (!asked) return null
  const m = t.match(/\b(?:for|to|on)\s+(?:the\s+|my\s+|our\s+|a\s+)?(.+?)(?:\s+(?:job requests?|jobs?|roles?|positions?|openings?|requisitions?))?$/i)
  const job = m?.[1]?.trim() ?? null
  return { kind: 'APPLIED', job: job && !ANY_JOB.test(job) && !ANY_JOB.test(`${job} jobs`) ? job : null }
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
export function deskRefusal(
  reads: string,
  needs: Permission | readonly Permission[],
  companyKind: string | null | undefined,
  /**
   * `self`: the reader's own role, never named back to them (walk three,
   * 2026-10-26: Aptiva's Owner read "Your Owner accepts timesheets; ask
   * them"). `book`: the client whose program a seated firm reads, so the
   * desk named is that client's, never "your".
   */
  opts: { self?: string | null; book?: string | null } = {},
): string {
  const all = desksHolding(needs, companyKind)
  const desks = deskOthers(all, opts.self)
  const whose = opts.book?.trim() ? possessive(opts.book) : 'Your'
  if (desks.length) return `${whose} ${twoDesks(desks)} ${reads}; ask them.`
  // The reader holds the only desk that reads it, and this seat still may
  // not: what they may do is change what the seat holds.
  if (all.length) return `Your seat here does not hold that; Users & permissions sets what each role may do.`
  return opts.book?.trim()
    ? `No role at ${opts.book.trim()} ${reads} yet.`
    : `No role at your company ${reads} yet; ask whoever manages roles.`
}

/** The desks other than the reader's own role: a person is never told to ask themselves. */
export function deskOthers(desks: readonly string[], self?: string | null): string[] {
  const me = self?.trim().toLowerCase()
  return me ? desks.filter((d) => d.trim().toLowerCase() !== me) : [...desks]
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

// ── Whose Ask Etyme this is ──────────────────────────────────────────

/**
 * The party a seat reads Ask Etyme as (founder, 2026-10-19, "the closing
 * line and the four chips are the party's own"): a client; an MSP, or any
 * firm seated in a client's program, reading that program; a supplier,
 * integrator or sub-vendor reading its own book; a one-person firm; a
 * worker. One platform, one chat; the words are the party's.
 */
export type Party = 'CLIENT' | 'MSP' | 'FIRM' | 'SOLO' | 'WORKER'

export function partyOf(seat: { companyKind: string | null | undefined; worker?: boolean; seatedAt?: string | null }): Party {
  if (seat.worker) return 'WORKER'
  if (seat.companyKind === 'CONSULTANT_CORP') return 'SOLO'
  if (seat.companyKind === 'CLIENT') return 'CLIENT'
  if (seat.companyKind === 'MSP' || seat.seatedAt) return 'MSP'
  return 'FIRM'
}

/**
 * The four questions drawn as chips above the box for a client or an MSP,
 * in the founder's prototype order. Each is answered by rules; none goes
 * to the model.
 */
export const SUGGESTED_QUESTIONS: readonly string[] = [
  'What needs me today?',
  'Who is near the time limit?',
  'What did we spend by supplier this month?',
  'Which timesheets are waiting?',
]

/** A supplier's, an integrator's or a sub-vendor's four: its own people and money, each answered from the record. */
export const FIRM_QUESTIONS: readonly string[] = [
  'Who rolls off in the next 30 days?',
  'Who is on the bench?',
  'Which weeks are signed and not billed?',
  'Which bills are unpaid?',
]

/** A one-person firm's four: she is the firm and the worker at once. */
export const SOLO_QUESTIONS: readonly string[] = [
  'Is my week signed?',
  'What have I billed and not been paid?',
  'What papers are due?',
  'When does my contract end?',
]

/**
 * Every question a chip may carry, with the desk that gets an answer to
 * it rather than a refusal: the permission its read asks for, never a
 * guess. A chip is a promise that this seat gets an answer (the walk of
 * 2026-10-22: a hiring manager was offered the time limit and spend, and
 * both refused her).
 */
const CHIPS: ReadonlyArray<{ q: string; parties: readonly Party[]; may: (p: readonly string[], kind: string | null | undefined) => boolean }> = [
  { q: 'What needs me today?', parties: ['CLIENT', 'MSP', 'FIRM'], may: () => true },
  { q: 'Who applied for my jobs?', parties: ['CLIENT', 'MSP', 'FIRM'], may: (p) => hasAnyPermission(p, ['requirements.write', 'requirements.read', 'submissions.create']) },
  { q: 'Which timesheets are waiting?', parties: ['CLIENT', 'MSP'], may: (p) => hasAnyPermission(p, ['timesheets.read', 'timesheets.approve']) },
  { q: 'Which invoice receipts can I pay?', parties: ['CLIENT', 'MSP', 'FIRM'], may: (p, k) => paysOut(p, k) },
  { q: 'Which weeks do I need to accept?', parties: ['FIRM'], may: (p) => hasPermission(p, 'timesheets.approve') },
  { q: 'Which weeks are signed and not billed?', parties: ['FIRM'], may: (p) => hasAnyPermission(p, ['invoices.issue', 'invoices.read']) },
  { q: 'Which bills are unpaid?', parties: ['FIRM'], may: (p) => hasPermission(p, 'invoices.read') },
  { q: 'Who is near the time limit?', parties: ['CLIENT', 'MSP'], may: (p) => hasAnyPermission(p, ['governance.read', 'settings.manage']) },
  { q: 'What did we spend by supplier this month?', parties: ['CLIENT', 'MSP'], may: (p) => hasPermission(p, 'invoices.read') },
  { q: 'Who is missing an I-9?', parties: ['CLIENT', 'MSP'], may: (p) => hasPermission(p, 'governance.read') },
  { q: 'Whose papers run out this month?', parties: ['CLIENT', 'MSP'], may: (p) => hasPermission(p, 'governance.read') },
  { q: 'Who rolls off in the next 30 days?', parties: ['FIRM'], may: (p) => hasAnyPermission(p, ['consultants.read', 'assignments.write', 'requirements.read', 'utilization.read', 'invoices.read']) },
  { q: 'Who is on the bench?', parties: ['FIRM'], may: (p, k) => (k !== 'MSP' && hasPermission(p, 'consultants.read')) || (k === 'GSI' && hasPermission(p, 'assignments.write')) },
]

/** The most chips drawn over the box. */
export const CHIPS_SHOWN = 4

/**
 * The chips for a seat; a worker's are her own five (./worker), drawn by
 * the screen. With the seat's permissions, only questions its desk gets an
 * answer to, in the order above, four at most; without them, the party's
 * own four, as before.
 */
export function questionsFor(party: Party, permissions?: readonly string[] | null, companyKind?: string | null): readonly string[] {
  if (party === 'SOLO') return SOLO_QUESTIONS
  if (!permissions) return party === 'FIRM' ? FIRM_QUESTIONS : SUGGESTED_QUESTIONS
  return CHIPS.filter((c) => c.parties.includes(party) && c.may(permissions, companyKind)).slice(0, CHIPS_SHOWN).map((c) => c.q)
}

/** "Northbend Athletic’s", "Cavanaugh Glassworks’". */
export function possessive(name: string): string {
  return /s$/i.test(name.trim()) ? `${name.trim()}’` : `${name.trim()}’s`
}

/** The greeting's closing line, the party's own. */
export function closeFor(party: Party, client?: string | null): string {
  if (party === 'FIRM') return 'Ask me about our people, our bench, our weeks and our bills. I answer from the record, and I never move money without a person.'
  if (party === 'SOLO') return 'Ask me about your weeks, your bills, your papers and your contract. I never file or sign anything for you.'
  const whose = party === 'MSP' && client?.trim() ? possessive(client) : 'your'
  return `Ask me about ${whose} jobs, candidates, timesheets and invoice receipts. I answer from the record, and I never move money without a person.`
}

/** What the box says before anybody types. */
export function placeholderFor(party: Party): string {
  if (party === 'FIRM') return 'Ask Etyme about our people…'
  if (party === 'SOLO' || party === 'WORKER') return 'Ask Etyme about your work…'
  return 'Ask Etyme about your contractors…'
}

/** The line under the box, word for word from the approved prototype. */
export const FOOTER_LINE =
  'Etyme answers from the record and its rules. It asks before any outside message or money moves, and every act is in the ledger.'

export const WHAT_I_ANSWER =
  'I answer from the record: what needs you, the time limit, spend, timesheets to approve and invoice mismatches. ' +
  'I also answer “Why 1”, “Approve 1” and “Reject 1 because …”.'

/** The same, for a firm's own book. */
export const WHAT_I_ANSWER_FIRM =
  'I answer from the record: what needs you, roll-offs, the bench, signed weeks not billed and unpaid bills. ' +
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
  /** The record the question is about, so the queue row for the same record is not drawn beside its card. */
  entity?: { type: string; id: string }
  /** For `bill.send`: the drafted bill, as the card shows it. */
  bill?: BillCardPayload
  /**
   * For `invoice_receipt.pay`: whose invoice and its number, as the card
   * asks it ("Pay Pinnacle Resourcing’s invoice PR-2026-0451?"). A yes
   * carries the bank reference the person types on the card.
   */
  pay?: { supplier: string | null; number: string | null }
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
  | { kind: 'NEEDS'; recommend?: RichLine; says: string; saysLinks?: { text: string; href: string }[]; items: WaitingItem[]; held?: HeldBill[]; more?: RichLine[]; links?: Link[]; greeting?: boolean
      /** Every other decision in the count, as a card (founder, 2026-10-19); the twin's own questions are `items`. */
      queue?: QueueCard[] }
  /** A firm's own book as a sentence and a table: who rolls off, the bench, signed weeks not billed, unpaid bills. */
  | { kind: 'LIST'; says: string; table?: ListTable; links?: Link[] }
  | { kind: 'TIME_LIMIT'; says: string; rows: LimitRow[] }
  | { kind: 'SPEND'; says: string; period: { from: string; to: string; label: string }; rows: SpendRow[] }
  | { kind: 'WEEKS'; says: string; rows: WeekRow[]; more: number; links: Link[] }
  | { kind: 'WHY'; says: string; ruleCited: string; rationale: string; links: Link[] }
  | { kind: 'CONFIRM'; says: string; decision: 'APPROVED' | 'REJECTED'; reason: string | null; item: WaitingItem }
  | { kind: 'VARIANCE'; says: string; period: { from: string; to: string; label: string }; rows: VarianceRow[] }
  | { kind: 'MODEL'; says: string; links: Link[] }
  /** A worker's own work: what needs her, where her weeks stand, her chain (./worker). */
  | WorkerAnswer

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
  /** The notice's kind ("CYCLE_DUE"), its body and, for a date that is due, the cycle and the day. */
  type?: string | null
  body?: string | null
  cycleKind?: string | null
  dueOn?: string | null
  /** The thing it is about; for the twin's own question, the approval its card answers. */
  entityId?: string | null
  /** Etyme's own question, already answered: marked read with the rest, never said. */
  settled?: boolean
}

/** Notices said in one greeting, at most; the rest wait for the next one. */
export const NOTICES_SHOWN = 5

export const SINCE_HEADING = 'Since you last looked:'

export const YOUR_WORK_HREF = '/dashboard/my-work'

/**
 * One group of cycle notices as a sentence that says who and what:
 * "You have five weeks to approve by Wednesday: Helena Marsh, Omar Haddad
 * and three more." / "Your week of Oct 18–24 is due on Monday." Null
 * where the notice is not a dated cycle.
 */
function cycleSays(kind: string, dueOn: string, people: readonly string[], title: string, now: Date, worker: boolean, ownWork = false): string | null {
  const when = whenSays(dueOn, now)
  const by = when === 'today' || when === 'tomorrow' ? when : `by ${when}`
  const on = when === 'today' || when === 'tomorrow' ? when : `on ${when}`
  const week = weekDueOn(dueOn)
  const n = Math.max(1, people.length)
  if (kind === 'TIMESHEET_SUBMIT') {
    if (worker) return week ? `Your week of ${week} is due ${on}. You file it on Your work.` : `Your hours are due ${on}. You file them on Your work.`
    if (people.length === 1) return week ? `${possessive(people[0])} week of ${week} is due ${on}.` : `${possessive(people[0])} hours are due ${on}.`
    return people.length ? `${counted(n, 'week')} ${n === 1 ? 'is' : 'are'} due ${on}: ${namesUpTo3(people)}.` : `Hours are due ${on}.`
  }
  if (kind === 'TIMESHEET_APPROVE') {
    if (people.length === 1) return `You have ${possessive(people[0])} week to approve ${by}.`
    return people.length ? `You have ${lowerNumber(n)} weeks to approve ${by}: ${namesUpTo3(people)}.` : `You have weeks to approve ${by}.`
  }
  const label = title.split(' — ')[0].trim()
  if (!label) return null
  // The reader's own name in the list is her own work, never her name in the third person.
  if (ownWork) return people.length ? `${label} ${on}: ${namesUpTo3(people)} and your own work.` : `${label} ${on}, for your own work.`
  return people.length ? `${label} ${on}: ${namesUpTo3(people)}.` : `${label} ${on}.`
}

/**
 * "Since you last looked", one sentence per notice, each saying who and
 * what and linking to the page it is about (founder, 2026-10-19: "Marcus
 * Oyelaran has five weeks to approve by Wednesday", never "Hours to
 * approve — in 3 days (5 times)"). Dated cycle notices for the same act
 * on the same day are one sentence naming everybody in them; any other
 * notice says its own title once, however often it was sent. Never a count
 * in parentheses. `older` is how many unread notices were not shown; they
 * are said in one line and shown the next time. `threads` are the
 * conversations somebody wrote on, said first. Empty when there is
 * nothing, so the greeting draws no heading at all.
 */
export function sinceSays(
  notices: readonly NoticeLine[],
  older = 0,
  opts: { now?: Date; worker?: boolean; threads?: readonly ThreadNote[]; moreThreads?: number; self?: string | null } = {},
): RichLine[] {
  const now = opts.now ?? new Date()
  const threadLines = threadsSay(opts.threads ?? [], opts.moreThreads ?? 0)
  if (notices.length === 0 && threadLines.length === 0) return []
  const groups: { key: string; kind: string | null; dueOn: string | null; title: string; href: string; people: string[] }[] = []
  for (const n of notices) {
    const title = n.title.replace(/[\s.!:;,]+$/u, '').replace(/!/g, '').trim() || 'A notice'
    const dated = n.cycleKind && n.dueOn ? `${n.cycleKind}:${n.dueOn.slice(0, 10)}` : null
    const key = dated ?? `${title}\u0000${n.href}`
    const same = groups.find((g) => g.key === key)
    const people = dated ? noticePeople(n.body) : []
    if (same) {
      for (const p of people) if (!same.people.includes(p)) same.people.push(p)
    } else {
      groups.push({ key, kind: dated ? n.cycleKind! : null, dueOn: dated ? n.dueOn! : null, title, href: n.href, people })
    }
  }
  const out: RichLine[] = [{ says: SINCE_HEADING }, ...threadLines]
  // A notice about the reader's own week says "your week", and never asks
  // her to approve it (walk three, 2026-10-26: Colleen Byrne read "You
  // have Colleen Byrne's week to approve by Wednesday").
  const me = opts.self?.trim().toLowerCase() || null
  const mine = (p: string) => !!me && p.trim().toLowerCase() === me
  const said0 = out.length
  for (const g of groups) {
    if (g.kind && g.dueOn && g.people.some(mine)) {
      const others = g.people.filter((p) => !mine(p))
      if (g.kind === 'TIMESHEET_SUBMIT') {
        const own = cycleSays(g.kind, g.dueOn, [], g.title, now, true)
        if (own) out.push({ says: own, links: [{ text: 'Your work', href: YOUR_WORK_HREF }] })
      }
      const rest = g.kind === 'TIMESHEET_APPROVE' || g.kind === 'TIMESHEET_SUBMIT'
        ? (others.length ? cycleSays(g.kind, g.dueOn, others, g.title, now, false) : null)
        : cycleSays(g.kind, g.dueOn, others, g.title, now, false, true)
      if (rest) {
        const text = others.find((p) => rest.includes(p))
        out.push({ says: rest, links: text ? [{ text, href: g.href }] : [] })
      }
      continue
    }
    const said = g.kind && g.dueOn ? cycleSays(g.kind, g.dueOn, g.people, g.title, now, !!opts.worker) : null
    if (said) {
      const text = opts.worker && g.kind === 'TIMESHEET_SUBMIT' ? 'Your work' : g.people.find((p) => said.includes(p))
      out.push({ says: said, links: text ? [{ text, href: opts.worker && g.kind === 'TIMESHEET_SUBMIT' ? YOUR_WORK_HREF : g.href }] : [] })
    } else {
      out.push({ says: `${g.title}.`, links: [{ text: g.title, href: g.href }] })
    }
  }
  // Every notice was the reader's own week to approve: the heading alone says nothing.
  if (out.length === said0 && threadLines.length === 0 && older === 0) return []
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
  /**
   * A drafted bill this reader may send itself, through the Bills page's
   * own Send (`POST /api/invoices/:id/submit`, which asks for
   * `invoices.issue` — SEND_BILL_PERMISSION in lib/today-page). Etyme's
   * question was asked on this reader's authority, so the yes on it is
   * somebody else's; the Send the Today page offers is still theirs
   * (walk three, 2026-10-26: Brightmoor's Owner read "it is not yours to
   * send" on a bill Today's Send button sends).
   */
  send?: { invoiceId: string; because?: string | null }
  /** Money's own refusal for this reader on that bill, said word for word (`maySendBill`), where the reader sends bills and still may not send this one. */
  sendRefused?: string
}

/**
 * Who else is being asked, one line per desk, the person first: "Renata
 * Kowal, AP clerk, has two invoice receipts to approve: PR-2026-0441 and
 * IN-XSWQQZ-20260901. Etyme asked Renata; it is not yours to approve."
 * Where Etyme asked on this reader's own authority — the program manager,
 * whose authority the twin acts under — the line says whom it asked
 * instead, so the reader never reads an authority they hold as a reason.
 */
/**
 * A desk as a sentence names it: a role that names a person is lower case
 * after "your" ("your AP clerk"); a team keeps its name ("Accounts
 * Receivable or Finance"). `beside` is the role written after a person's
 * name ("Renata Kowal, AP clerk,").
 */
function deskWords(desks: readonly string[]): { subject: string; object: string; beside: string } | null {
  if (desks.length === 0) return null
  const raw = twoDesks(desks)
  const words = roleWords(raw)
  const person = PERSON_ROLES.has(words.split(' ').pop()!.toLowerCase())
  return person
    ? { subject: `Your ${words}`, object: `your ${words}`, beside: words }
    : { subject: raw, object: raw, beside: raw }
}

export function othersSay(others: readonly OtherWaiting[]): RichLine[] {
  const out: RichLine[] = []
  const byDesk = new Map<string, OtherWaiting[]>()
  for (const o of others) {
    // Money's own sentence on a bill this reader sends and may not send, word for word.
    if (o.sendRefused) {
      out.push({ says: `${o.title}: ${o.sendRefused}`, links: [{ text: o.title, href: o.href }] })
      continue
    }
    const key = `${o.desks.join('|')}\u0000${o.own ? 'own' : ''}`
    byDesk.set(key, [...(byDesk.get(key) ?? []), o])
  }
  for (const [key, xs] of byDesk) {
    const own = key.endsWith('\u0000own')
    const desk = deskWords(xs[0].desks)
    const people = (xs[0].people ?? []).slice(0, 2)
    const noun = xs.every((x) => x.noun === xs[0].noun) ? xs[0].noun : 'question'
    const verb = noun === 'bill' ? 'send' : noun === 'question' ? 'answer' : 'approve'
    const who = people.length ? (desk ? `${orNames(people)}, ${desk.beside},` : orNames(people)) : desk ? desk.subject : 'Somebody else'
    const has = people.length > 1 ? 'have' : 'has'
    const whom = people.length ? people[0].split(/\s+/)[0] : desk ? desk.object : 'somebody else'
    const notYours = xs.length === 1 ? `it is not yours to ${verb}` : `they are not yours to ${verb}`
    out.push({
      says: `${who} ${has} ${lowerNumber(xs.length)} ${noun}${xs.length === 1 ? '' : 's'} to ${verb}: ${listed(xs.map((x) => x.title))}. ` +
        (own ? `Etyme asked ${whom}; ${notYours}.` : `${cap(notYours)}.`),
      links: xs.map((x) => ({ text: x.title, href: x.href })),
    })
  }
  return out
}

/**
 * Who to ask, for the receipts and questions waiting on another desk:
 * "Ask Renata Kowal, AP clerk, to approve PR-2026-0441 and
 * IN-XSWQQZ-20260901." Names come from the seats that hold the desk;
 * where nobody holds it, the desk alone.
 */
export function askOthersSays(others: readonly OtherWaiting[]): RichLine | null {
  if (others.length === 0) return null
  const first = others[0]
  const same = others.filter((o) => o.desks.join() === first.desks.join())
  const verb = same.every((o) => o.noun === 'invoice receipt') ? 'approve' : same.every((o) => o.noun === 'bill') ? 'send' : 'answer'
  const desk = deskWords(first.desks)
  const people = (first.people ?? []).slice(0, 2)
  const who = people.length ? (desk ? `${orNames(people)}, ${desk.beside},` : orNames(people)) : desk ? desk.object : 'whoever answers it'
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
    `${limitCountSays(rows)}, counted across every supplier. ` +
    `${limitSays(rows[0], day)} Checked just now.${staleLine}`
  )
}

/**
 * "One contractor is past the time limit and two are near it": a person
 * whose day has gone is past it, never "near" (walk four, 2026-10-26:
 * Kestrel read Anders Lund as near the limit he reached in May). A person
 * reaching it today is near it. No full stop, so a clause can follow.
 */
export function limitCountSays(rows: readonly Pick<LimitRow, 'daysToLimit'>[]): string {
  const past = rows.filter((r) => r.daysToLimit < 0).length
  const near = rows.length - past
  if (past === 0) return `${counted(near, 'contractor')} ${near === 1 ? 'is' : 'are'} near the time limit`
  if (near === 0) return `${counted(past, 'contractor')} ${past === 1 ? 'is' : 'are'} past the time limit`
  return `${counted(past, 'contractor')} ${past === 1 ? 'is' : 'are'} past the time limit and ${lowerNumber(near)} ${near === 1 ? 'is' : 'are'} near it`
}

/** "Two more contractors are near the time limit." · "One more contractor is past it." Past said as past. */
function moreLimitSays(rest: readonly Pick<LimitRow, 'daysToLimit'>[]): string {
  const past = rest.filter((r) => r.daysToLimit < 0).length
  const near = rest.length - past
  const part = (n: number, where: string) => `${counted(n, 'more contractor')} ${n === 1 ? 'is' : 'are'} ${where}`
  if (past && near) return `${part(past, 'past the time limit')}, and ${lowerNumber(near)} more ${near === 1 ? 'is' : 'are'} near it.`
  return `${past ? part(past, 'past the time limit') : part(near, 'near the time limit')}.`
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
export function spendSays(rows: readonly SpendRow[], label: string, undated: number, money: (minor: number, currency: string) => string, whom = 'you'): string {
  const undatedLine = undated > 0
    ? ` ${counted(undated, 'invoice')} ${undated === 1 ? 'has' : 'have'} no invoice date, so no month counts ${undated === 1 ? 'it' : 'them'}.`
    : ''
  if (rows.length === 0) return `No supplier billed ${whom} in ${label}. Checked just now.${undatedLine}`
  const currencies = [...new Set(rows.map((r) => r.currency))]
  const sum = (c: string, f: (r: SpendRow) => number) => rows.filter((r) => r.currency === c).reduce((s, r) => s + f(r), 0)
  const billed = listed(currencies.map((c) => money(sum(c, (r) => r.billedMinor), c)))
  const paid = listed(currencies.map((c) => money(sum(c, (r) => r.paidMinor), c)))
  const receipts = rows.reduce((s, r) => s + r.receipts, 0)
  const suppliers = new Set(rows.map((r) => r.supplier)).size
  return (
    `${counted(suppliers, 'supplier')} billed ${whom} ${billed} in ${label}, on ${receipts} invoice${receipts === 1 ? '' : 's'}. ` +
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
export const GREETING_CLOSE = 'Ask me about your jobs, candidates, timesheets and invoice receipts. I answer from the record, and I never move money without a person.'

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
export function seatSays(seat: { role: string | null; company: string | null; sample: boolean; party?: Party; seatedAt?: string | null }): string | null {
  const company = seat.company?.trim()
  if (!company) return null
  // A one-person firm is her own company (founder, 2026-10-19).
  if (seat.party === 'SOLO') return `This is ${company}, your own company${seat.sample ? ', a sample' : ''}.`
  // A seat in a client's program says where it sits: whose program, for whom.
  const client = seat.seatedAt?.trim()
  if (client && client !== company) {
    return `You run ${possessive(client)} program for ${company}${seat.sample ? `, a sample ${seat.party === 'MSP' ? 'MSP' : 'company'}` : ''}.`
  }
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
export function decisionRequest(
  approvalId: string,
  decision: 'APPROVED' | 'REJECTED',
  reason: string | null,
  /** What the person filled in on the card before a yes: the bank reference and method on a payment. */
  answer?: PayAnswer | null,
): {
  url: string
  init: { method: 'POST'; headers: Record<string, string>; body: string }
} {
  const filled = answer && (answer.reference?.trim() || answer.method?.trim())
    ? { reference: answer.reference?.trim() || undefined, method: answer.method?.trim() || undefined }
    : null
  return {
    url: `/api/twin/approvals/${encodeURIComponent(approvalId)}`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, reason: reason ?? undefined, surface: 'WEB', ...(filled && decision === 'APPROVED' ? { answer: filled } : {}) }),
    },
  }
}

// ── Paying an invoice receipt (2026-10-26) ───────────────────────────
//
// The twin asks to pay a supplier's invoice that passed the three-way
// check (`invoice_receipt.pay`, NEEDS_APPROVAL, the desk holding
// payments.record). The card asks one thing, the bank reference, so the
// AP clerk can reconcile the payment, and optionally the method. A yes
// goes through the one approval route, which pays through the payment
// route's own gate. `approve` stays for typed-in receipts.

export const RECEIPT_APPROVE = 'invoice_receipt.approve'
export const RECEIPT_PAY = 'invoice_receipt.pay'

/** What the person fills in on a pay card. */
export interface PayAnswer { reference?: string | null; method?: string | null }

/**
 * Said beside the box when the bank reference is blank: the approval
 * route's own refusal, word for word (NEEDS_BANK_REFERENCE in
 * lib/twin/performers; a test holds the two equal). Walk four asked that
 * it say "you" to the AP clerk; the route's sentence is the architect's,
 * and this copy moves with it, never ahead of it.
 */
export const NEEDS_BANK_REFERENCE = 'Enter the bank reference, so you can reconcile this payment later.'

/** The ways a payment goes out, offered beside the reference; none chosen means none said. */
export const PAY_METHODS: readonly string[] = ['ACH', 'Wire', 'Check']

/** "Pay Pinnacle Resourcing’s invoice PR-2026-0451?" */
export function payQuestion(p: { supplier: string | null; number: string | null }): string {
  const whose = p.supplier ? `${possessive(p.supplier)} invoice` : 'the invoice'
  return `Pay ${whose}${p.number ? ` ${p.number}` : ''}?`
}

/**
 * The line under the pay card's question: what the yes does (walk three,
 * 2026-10-26). It replaces the twin's own "Approve it for payment", which
 * named a step the card does not have.
 */
export function payYesSays(p: { supplier: string | null; number: string | null }): string {
  return `Yes records this payment to ${p.supplier ?? 'the supplier'} under your name, with the bank reference below.`
}

/** What the chat says after the yes: paid, and the reference it was paid under. */
export function paidSays(p: { supplier: string | null; number: string | null }, reference: string): string {
  const whose = p.supplier ? `${possessive(p.supplier)} invoice` : 'the invoice'
  return `Paid ${whose}${p.number ? ` ${p.number}` : ''}, bank reference ${reference}. Recorded under your name.`
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
  /**
   * Invoice receipts billed to this company in [from, to), and how many
   * carry no date at all. `whom` is the program's name where a seated firm
   * reads its client's book, so the sentence never says "you" for it.
   */
  spendIn(from: Date, to: Date): Promise<Refusable<{ receipts: SpendReceipt[]; undated: number; whom?: string }>>
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
  /** A firm's own people billing today and what their rates come to a month; null for a seat that does not read money. */
  billing?(): Promise<Billing | null>
  /** This firm's people whose last day falls in the next `days` days, soonest first. */
  rollingOff?(days: number): Promise<Refusable<{ rows: RollRow[] }>>
  /** Who is on this firm's bench: the people who agreed to be, or an integrator's own people between projects. */
  bench?(): Promise<Refusable<{ rows: BenchRow[] }>>
  /** Weeks signed at the top that are on none of this firm's bills, oldest first. */
  unbilledWeeks?(): Promise<Refusable<{ rows: UnbilledRow[] }>>
  /** Bills this firm sent that are not paid in full, the latest first. */
  unpaidBills?(): Promise<Refusable<{ rows: UnpaidRow[] }>>
  /** Who applied for one of this company's jobs, or for any of them, through the Candidates page's own route. */
  applied?(job: string | null): Promise<Refusable<{ job: string | null; rows: AppliedRow[]; total: number }>>
  /** The compliance page's own read: who cannot start for want of a paper, and what runs out when. */
  compliance?(): Promise<Refusable<{ client: string; held: PaperHeld[]; runs: PaperRun[] }>>
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
  /**
   * What current rates come to a month, in minor units, as the program
   * dashboard counts it; null where any seat on site has no rate on the
   * rung the client pays, or the rates are in more than one currency.
   */
  monthlyMinor?: number | null
  currency?: string | null
}

/** What a firm bills today: the people on its live lines, and what their current rates come to a month. */
export interface Billing {
  people: number
  /** Minor units; null where a live line has no rate or the lines bill in more than one currency. */
  monthlyMinor: number | null
  currency: string | null
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

/** Money in a greeting: whole amounts without the cents, the cents where there are any. */
const greetMoney = (minor: number, currency: string): string => format(fromMinor(minor, currency), { compact: true })

/** "October", from a month's first day. */
function monthName(label: string, from?: Date): string {
  return from ? formatMonthLong(from).split(' ')[0] : label
}

/**
 * The money line (founder, 2026-10-19, "names both figures"): "Suppliers
 * billed $42,587 so far in October; current rates come to $135,200 a
 * month." Per currency, never added across; the rates clause is left out
 * where the dashboard could not price every seat. For a firm the payers
 * below it are sub-vendors. Null when nothing was billed and no rate is
 * known.
 */
export function billedSays(rows: readonly SpendRow[], label: string, opts: { from?: Date; monthly?: { minor: number; currency: string } | null; party?: Party } = {}): RichLine | null {
  const currencies = [...new Set(rows.filter((r) => r.billedMinor !== 0).map((r) => r.currency))]
  const amounts = currencies.map((c) => greetMoney(rows.filter((r) => r.currency === c).reduce((s, r) => s + r.billedMinor, 0), c))
  const month = monthName(label, opts.from)
  const who = opts.party === 'FIRM' || opts.party === 'SOLO' ? 'Sub-vendors billed you' : 'Suppliers billed'
  const rates = opts.monthly && opts.monthly.minor > 0 ? greetMoney(opts.monthly.minor, opts.monthly.currency) : null
  if (amounts.length === 0 && !rates) return null
  const billed = amounts.length ? `${who} ${listed(amounts)} so far in ${month}` : null
  const says = billed && rates ? `${billed}; current rates come to ${rates} a month.`
    : billed ? `${billed}.`
      : `Current rates come to ${rates} a month.`
  return { says, links: [...amounts, ...(rates ? [rates] : [])].map((text) => ({ text, href: RECEIPTS_HREF })) }
}

/** A firm's own money: "Three people are billing: $59,680 a month at current rates." Null where nobody is. */
export function billingSays(b: Billing | null | undefined): string | null {
  if (!b || b.people <= 0) return null
  const who = `${numberWord(b.people)} ${b.people === 1 ? 'person is' : 'people are'} billing`
  return b.monthlyMinor != null && b.monthlyMinor > 0 && b.currency
    ? `${who}: ${greetMoney(b.monthlyMinor, b.currency)} a month at current rates.`
    : `${who} today.`
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
  // Pay is never offered on a receipt that fails the check. What the
  // paying desk may do instead is said: an hours difference is the one a
  // person may pass, as an exception recorded with a reason on the
  // receipt's page (the payment gate's own words, lib/invoice-match);
  // any other difference waits for the supplier's correction.
  const one = (t: ToldReceipt) => {
    if (t.hoursBilled != null && t.hoursAccepted != null && t.hoursBilled !== t.hoursAccepted) {
      return `${t.number} bills ${hrs(t.hoursBilled)} hours against ${hrs(t.hoursAccepted)} approved. ` +
        `Ask ${t.supplier ?? 'the supplier'} to correct it, or record an exception with a reason on its page.`
    }
    return `${t.number} does not match the approved hours or the contract rate; it cannot be paid until ${t.supplier ?? 'the supplier'} corrects it.`
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
  // Paying first: a receipt the twin asks to pay is one card, with the bank reference.
  if (items.every((i) => i.action === RECEIPT_PAY)) {
    return items.length === 1
      ? { says: `Pay ${items[0].title}; it passes the three-way check.`, links: [{ text: items[0].title, href: items[0].href }] }
      : { says: `Pay the ${counted(items.length, 'invoice receipt').toLowerCase()} below; each passes the three-way check.` }
  }
  const receipts = items.every((i) => i.action === RECEIPT_APPROVE || i.action === RECEIPT_PAY)
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
  // Money's due-on-sending line, kept apart from its sentence (which is
  // already in `dueSays`); null where the bill is not yet due when sent.
  const late = isRecord(p.pastDue) && isMinor(p.pastDue.daysPast) && typeof p.pastDue.says === 'string'
    ? { daysPast: p.pastDue.daysPast, says: p.pastDue.says }
    : null
  const pastDue = { pastDue: late }
  return {
    ...pastDue,
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

/**
 * The card's due line from money's answer for the day it is read, where
 * there is one; the stored payload's otherwise. Pure: `live` is
 * money's `pastDueOnSendingNow` answer, already read (./bill-due).
 */
export function billWithDue(bill: BillCardPayload, live: { dueSays: string; pastDue: { daysPast: number; says: string } | null }): BillCardPayload {
  if (!live.dueSays) return bill
  return { ...bill, dueSays: live.dueSays, pastDue: live.pastDue }
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

// ── A bill the reader sends itself (walk three, 2026-10-26) ──────────

/** The Bills page's own Send: the one route the Today page's button calls. */
export function sendBillUrl(invoiceId: string): string {
  return `/api/invoices/${encodeURIComponent(invoiceId)}/submit`
}

/** "Bill IN_9PQV02_001 is drafted; send it below, or say not now." The fact line where the only thing to do is send. */
export function sendHeadline(sendable: readonly Pick<OtherWaiting, 'title'>[]): string {
  return sendable.length === 1
    ? `Bill ${sendable[0].title} is drafted; send it below, or say not now.`
    : `${counted(sendable.length, 'bill')} are drafted; send each below, or say not now.`
}

/** The recommendation where the reader may send a drafted bill: their own work. */
export function sendAskSays(sendable: readonly Pick<OtherWaiting, 'title' | 'href'>[]): RichLine | null {
  if (sendable.length === 0) return null
  return sendable.length === 1
    ? { says: `Send bill ${sendable[0].title}; it is built from signed weeks.`, links: [{ text: sendable[0].title, href: sendable[0].href }] }
    : { says: `Send the ${counted(sendable.length, 'drafted bill').toLowerCase()} below; each is built from signed weeks.` }
}

/** Each bill the reader may send, as a card whose button is the Bills page's own Send. */
export function sendCards(sendable: readonly OtherWaiting[]): QueueCard[] {
  return sendable.filter((o) => o.send).map((o) => ({
    key: `BILL_SEND:${o.send!.invoiceId}`,
    type: 'BILL_SEND',
    title: `Bill ${o.title} is ready to send.`,
    // Money's own reason where the owner-only exception let this seat send it, word for word.
    fact: o.send!.because ?? 'Send sends it to the customer under your name, as Send on the Bills page does.',
    href: o.href,
    act: { label: 'Send bill', url: sendBillUrl(o.send!.invoiceId), body: {}, done: 'Sent, and recorded under your name.' },
  }))
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
  const party = opts.party ?? 'CLIENT'
  const [items, others, limits, told, spend, needsRaw, held, picture, billing] = await Promise.all([
    read.waiting(), read.othersWaiting(), read.limits(), read.told(),
    opts.greeting ? read.spendIn(month.from, month.to) : Promise.resolve(null),
    opts.needs ? opts.needs().catch(() => null) : Promise.resolve(null),
    read.heldBills ? read.heldBills() : Promise.resolve([] as HeldBill[]),
    opts.greeting ? Promise.resolve(opts.picture ?? null).catch(() => null) : Promise.resolve(null),
    opts.greeting && party === 'FIRM' && read.billing ? read.billing().catch(() => null) : Promise.resolve(null),
  ])
  const near = limits.ok ? nearLimit(limits.entries, now) : []
  // A bill this reader may send through the Bills page's own Send is a card
  // of its own, never "not yours to send" (walk three, 2026-10-26).
  const sendable = others.filter((o) => o.send)
  const elsewhere = others.filter((o) => !o.send)
  // The queue's count, and where the route read them, its rows.
  const queue: QueueRead | null = needsRaw == null ? null : typeof needsRaw === 'number' ? { total: needsRaw, items: [] } : needsRaw
  const needs = queue?.total ?? null

  // Recommendation first: what this desk should do, in that order. It
  // names the reader's own work only (walk three, 2026-10-26: compliance
  // and HR were told to "ask the AP clerk to approve IN-FMDSDT"); who else
  // is asked stays a fact line below.
  const recommend =
    itemsAskSays(items) ??
    (told.told.length ? toldAskSays(told.told[0]) : null) ??
    (held.length ? heldAskSays(held) : null) ??
    sendAskSays(sendable) ??
    (near.length ? { says: planSays(near[0]), links: [{ text: near[0].name, href: near[0].href }] } : null) ??
    undefined

  // Then the facts, each read at the moment of the question. A one-person
  // firm's own week first: money and the week before anything else.
  const lines: RichLine[] = []
  if (opts.greeting && party === 'SOLO' && opts.ownWeek) lines.push(opts.ownWeek)
  const toldLine = toldSays(told.told, told.stale)
  if (toldLine) lines.push(toldLine)
  lines.push(...othersSay(elsewhere))
  if (near.length) {
    lines.push({
      says: limitSays(near[0], day) +
        (near.length > 1 ? ` ${moreLimitSays(near.slice(1))}` : ''),
      links: [{ text: near[0].name, href: near[0].href }],
    })
  }
  if (limits.ok && limits.stale?.length) {
    lines.push({ says: `Last night’s reading also listed ${listed(limits.stale)}; the live check does not.` })
  }
  const onSite = opts.greeting ? pictureSays(picture) : null
  if (onSite) lines.push(onSite)
  const monthly = picture?.monthlyMinor != null && picture.monthlyMinor > 0 && picture.currency ? { minor: picture.monthlyMinor, currency: picture.currency } : null
  const billed = spend?.ok ? billedSays(spendBySupplier(spend.receipts), month.label, { from: month.from, monthly: party === 'FIRM' || party === 'SOLO' ? null : monthly, party })
    : opts.greeting && monthly && party !== 'FIRM' ? billedSays([], month.label, { from: month.from, monthly, party }) : null
  // A firm's own money first, then what its sub-vendors billed it: one line.
  const ours = billingSays(billing)
  if (ours || billed) {
    lines.push(ours && billed ? { says: `${ours} ${billed.says}`, links: billed.links } : ours ? { says: ours } : billed!)
  }

  // Six lines at most before the closing sentence: the recommendation, the
  // headline, and what fits of the facts.
  const room = GREETING_LINES - 1 - (recommend ? 1 : 0)
  const more = lines.slice(0, room)
  // The headline. Where the decisions queue was read, its count leads and
  // names the first three, so the number on the Ask Etyme mark and this
  // line are one read.
  const headline = queue && (queue.items.length > 0 || queue.says) ? namedNeedsSays(queue, items) : needs != null ? needsCountSays(needs, items) : null
  const nothing = (needs ?? 0) === 0 && items.length === 0 && held.length === 0 && others.length === 0 && near.length === 0 && told.told.length === 0
  const says = (headline ? headline.says
    : nothing ? 'Nothing needs you today, and nothing Etyme asked is waiting on anybody.'
      : items.length === 0 && held.length > 0 ? heldHeadline(held)
        : items.length === 0 && sendable.length > 0 ? sendHeadline(sendable) : needsSays(items)) + ' Checked just now.'
  // What the notices and the conversations said, after the recommendation,
  // the decisions and the facts, and never counted in the six lines: a
  // notice is not lost to the cap, because the route marks read only the
  // ones it passed in here. A hold already drawn as a card is not said
  // again as a notice; the route still marks that notice read, because the
  // card said it.
  if (opts.greeting && (opts.notices || opts.threads)) {
    const said = heldNoticeTitles(held)
    // Nor is the twin's own question said again as the notice that told
    // of it: its card is right above (handoffs station, 2026-10-20: "Ask
    // Etyme is asking you to decide." under the bill card it asked about).
    const carded = new Set(items.map((i) => i.approvalId))
    more.push(...sinceSays((opts.notices?.shown ?? []).filter((n) => !n.settled && !said.has(n.title) && !(n.entityId && carded.has(n.entityId))), opts.notices?.older ?? 0, {
      now, threads: opts.threads?.shown, moreThreads: opts.threads?.more, self: opts.self,
    }))
  }
  if (opts.greeting) more.push({ says: closeFor(party, opts.client) })
  // The boundary, the greeting's last line: said on the first screen, once,
  // now that the phone draws no heading over the thread.
  if (opts.greeting && opts.model) more.push({ says: boundarySays(opts.model) })
  const cards = [...queueCards(queue, items), ...sendCards(sendable)]
  return {
    kind: 'NEEDS', ...(recommend ? { recommend } : {}), says, ...(headline ? { saysLinks: headline.links } : {}),
    items, ...(held.length ? { held } : {}), ...(cards.length ? { queue: cards } : {}), more, ...(opts.greeting ? { greeting: true } : {}),
  }
}

/** What the route hands `today` beyond the readers. */
export interface TodayOptions {
  now?: Date
  greeting?: boolean
  /** The program's picture, or the read of it already under way, so it runs beside the rest. */
  picture?: Picture | null | Promise<Picture | null>
  /**
   * GET /api/decisions for this seat, read by the route: its `total`, and
   * where the route kept them, its rows, which the headline names and the
   * chat draws as cards. Null or absent where it could not be read, and
   * the headline says what the twin's own questions say, as before.
   */
  needs?: () => Promise<number | QueueRead | null>
  /** Unread notices for the greeting's "Since you last looked", and how many older ones wait. */
  notices?: { shown: readonly NoticeLine[]; older: number }
  /**
   * A one-person firm's own latest week, where it stands (`latestWeekLine`
   * in ./worker): she is the firm and the worker, so her greeting says her
   * week as a worker's does. Read only for SOLO; ignored for every other party.
   */
  ownWeek?: RichLine | null
  /** Conversations another company or a candidate wrote on since the reader last looked. */
  threads?: { shown: readonly ThreadNote[]; more: number }
  /** Whether a model can be asked here; the greeting closes on what that means for this company's data. */
  model?: ModelState
  /** Whose Ask Etyme this is; the closing line is the party's own. A client's by default. */
  party?: Party
  /** For a seat in a client's program, the client whose book it is. */
  client?: string | null
  /** The reader's own name: a notice about her own week says "your week", and never asks her to approve it. */
  self?: string | null
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

/** The decisions queue as `respond` was handed it, read once; null where it was not read. */
async function queueOf(needs?: () => Promise<number | QueueRead | null>): Promise<QueueRead | null> {
  if (!needs) return null
  const got = await needs().catch(() => null)
  return got == null || typeof got === 'number' ? null : got
}

export async function respond(
  text: string,
  read: Readers,
  opts: {
    env: Record<string, string | undefined>; now?: Date; companyKind?: string | null; permissions?: readonly string[]; needs?: () => Promise<number | QueueRead | null>; party?: Party
    /** The reader's own company, by name: what it pays or is paid is its own book. */
    ownCompany?: string | null
    /** For a firm seated in a client's program, that client: its book is the reader's here, and its desks are the ones named. */
    client?: string | null
    /** The reader's own firm's kind, where `companyKind` is the book's: an MSP has no bench, seated or not. */
    ownKind?: string | null
    /** The reader's own role, never named back to them as the desk to ask. */
    role?: string | null
    /** The reader's own pay, read from their own work where they have any; null where Etyme keeps none. */
    ownPay?: () => Promise<Answer | null>
  }
): Promise<Answer> {
  let intent = readAsk(text)
  const own = [opts.ownCompany, opts.client].filter((x): x is string => !!x && !!x.trim())
  const refuseAs = { self: opts.role ?? null, book: opts.client ?? null }
  // A client or a program asks to approve a week, never to accept one: the
  // signature it gives is an approval (walk three, 2026-10-26).
  if (intent.kind === 'ACCEPT' && (opts.party === 'CLIENT' || opts.party === 'MSP')) intent = { kind: 'WEEKS' }
  // An MSP places nobody, so it has no bench (lib/today-page reads the
  // same): said, with what it may ask instead, before any read.
  if (intent.kind === 'BENCH' && opts.ownKind === 'MSP') {
    const instead = questionsFor('MSP', opts.permissions ?? [], 'MSP').find((q) => q !== 'What needs me today?') ?? 'What needs me today?'
    return { kind: 'TEXT', says: `An MSP places nobody, so it has no bench. Ask “${instead}” instead.` }
  }
  // Never beyond the transaction (founder, 2026-10-18): what another firm
  // pays, bills or charges, where the reader is not the other party, is
  // refused by rule before any intent and before the model is considered.
  // Found by the walk of 2026-10-22: "What does Brightmoor Staffing pay
  // Helena Marsh?" was answered "needs the model".
  if (!['HELP', 'WHY', 'DECIDE', 'NEEDS'].includes(intent.kind) && asksAboutFirmMoney(text, own)) {
    if (anotherFirmsMoney(text, own, await read.vocabulary())) return { kind: 'TEXT', says: NOT_ANOTHER_BOOK }
  }
  // A firm's own book is answered only where this seat has the read; a
  // reader that is not there leaves the question to the rest of the rules.
  const book = {
    ROLLOFF: read.rollingOff, BENCH: read.bench, UNBILLED: read.unbilledWeeks, UNPAID: read.unpaidBills,
    APPLIED: read.applied, I9: read.compliance, EXPIRING: read.compliance,
  } as const
  if (intent.kind in book && !book[intent.kind as keyof typeof book]) intent = { kind: 'ASK', text: text.trim().replace(/\s+/g, ' ') }
  const now = opts.now ?? new Date()

  switch (intent.kind) {
    case 'HELP':
      return { kind: 'TEXT', says: (opts.party === 'FIRM' ? WHAT_I_ANSWER_FIRM : WHAT_I_ANSWER) + (modelConfigured(opts.env) ? ' Anything else, I read from the ledger and say only what is on it.' : '') }

    case 'NEEDS':
      return today(read, { now: opts.now, needs: opts.needs, party: opts.party })

    case 'ROLLOFF': {
      const got = await read.rollingOff!(ROLLOFF_DAYS)
      if (!got.ok) return { kind: 'TEXT', says: got.says, links: got.links }
      return { kind: 'LIST', says: rolloffSays(got.rows), ...(got.rows.length ? { table: rolloffTable(got.rows) } : {}), links: [{ label: 'Open Contracts', href: '/dashboard/contracts' }] }
    }

    case 'BENCH': {
      const got = await read.bench!()
      if (!got.ok) return { kind: 'TEXT', says: got.says, links: got.links }
      return { kind: 'LIST', says: benchSays(got.rows), ...(got.rows.length ? { table: benchTable(got.rows) } : {}), links: [{ label: 'Open the bench', href: '/dashboard/bench' }] }
    }

    case 'UNBILLED': {
      const got = await read.unbilledWeeks!()
      if (!got.ok) return { kind: 'TEXT', says: got.says, links: got.links }
      return { kind: 'LIST', says: unbilledSays(got.rows, now), ...(got.rows.length ? { table: unbilledTable(got.rows) } : {}), links: [{ label: 'Open Bills', href: '/dashboard/invoices' }] }
    }

    case 'UNPAID': {
      const got = await read.unpaidBills!()
      if (!got.ok) return { kind: 'TEXT', says: got.says, links: got.links }
      return { kind: 'LIST', says: unpaidSays(got.rows, now), ...(got.rows.length ? { table: unpaidTable(got.rows) } : {}), links: [{ label: 'Open Bills', href: '/dashboard/invoices' }] }
    }

    case 'APPLIED': {
      const got = await read.applied!(intent.job)
      if (!got.ok) return { kind: 'TEXT', says: got.says, links: got.links }
      return {
        kind: 'LIST', says: appliedSays(got.job, got.rows, got.total),
        ...(got.rows.length ? { table: appliedTable(got.rows) } : {}),
        links: [{ label: 'Open Candidates', href: '/dashboard/submissions' }],
      }
    }

    case 'PAYABLE': {
      // The queue's own "Pay" rows: only a receipt that passes the payment
      // gate (mayPayInvoiceReceipt) is one, so the chat and the page agree.
      const perms = opts.permissions ?? []
      if (!paysOut(perms, opts.companyKind)) {
        const desks = deskOthers(payingDesks(opts.companyKind), refuseAs.self)
        const whose = refuseAs.book ? possessive(refuseAs.book) : 'Your'
        return {
          kind: 'TEXT',
          says: desks.length
            ? `${whose} ${twoDesks(desks)} pays invoice receipts; ask them.`
            : 'Your seat here does not pay invoice receipts; Users & permissions sets what each role may do.',
        }
      }
      const q = await queueOf(opts.needs)
      if (!q) return { kind: 'TEXT', says: 'Your invoice receipts could not be read just now. Open Invoice receipts to see them.', links: [{ label: 'Open Invoice receipts', href: RECEIPTS_HREF }] }
      const rows = q.items.filter((d) => d.type === 'INVOICE_RECEIPT_TO_PAY')
      // A receipt that fails the check is never offered; what the paying desk may do about it is said.
      const told = toldSays((await read.told()).told)
      return {
        kind: 'LIST',
        says: payableSays(rows) + (told ? ` ${told.says}` : ''),
        ...(rows.length ? {
          table: {
            caption: 'Invoice receipts ready to pay',
            head: ['Supplier', 'Invoice receipt', 'Due'],
            rows: rows.map((d) => ({ cells: [afterDash(d.title), factOf(d.subtitle) || '—', d.dueDate ? DAY_UTC(d.dueDate) : '—'], href: d.actionUrl ?? RECEIPTS_HREF })),
          },
        } : {}),
        links: [{ label: 'Open Invoice receipts', href: RECEIPTS_HREF }],
      }
    }

    case 'ACCEPT': {
      const perms = opts.permissions ?? []
      if (!hasPermission(perms, 'timesheets.approve')) {
        return { kind: 'TEXT', says: deskRefusal('accepts timesheets', 'timesheets.approve', opts.companyKind, refuseAs) }
      }
      const q = await queueOf(opts.needs)
      if (!q) return { kind: 'TEXT', says: 'Your timesheets could not be read just now. Open Timesheets to see them.', links: [{ label: 'Open Timesheets', href: '/dashboard/timesheets' }] }
      const rows = q.items.filter((d) => d.type === 'TIMESHEET_APPROVAL' && /^Accept\b/.test(d.title))
      return {
        kind: 'LIST', says: acceptSays(rows),
        ...(rows.length ? {
          table: {
            caption: 'Timesheets to accept',
            head: ['Person', 'Week'],
            rows: rows.map((d) => ({ cells: [d.whose?.trim() || afterDash(d.title), factOf(d.subtitle) || '—'], href: d.actionUrl ?? '/dashboard/timesheets' })),
          },
        } : {}),
        links: [{ label: 'Open Timesheets', href: '/dashboard/timesheets' }],
      }
    }

    case 'I9': {
      const got = await read.compliance!()
      if (!got.ok) return { kind: 'TEXT', says: got.says, links: got.links }
      const rows = i9Rows(got.held)
      return {
        kind: 'LIST', says: i9Says(rows),
        ...(rows.length ? {
          table: {
            caption: 'Held for an I-9',
            head: ['Person', 'Starts', 'Also missing'],
            rows: rows.map((r) => ({
              cells: [r.name, r.startsOn ? DAY_UTC(r.startsOn) : '—', r.missing.filter((m) => !/\bI-?9\b/i.test(m)).join(', ') || '—'],
              href: r.href,
            })),
          },
        } : {}),
        links: [{ label: 'Open Compliance', href: '/dashboard/compliance' }],
      }
    }

    case 'EXPIRING': {
      const got = await read.compliance!()
      if (!got.ok) return { kind: 'TEXT', says: got.says, links: got.links }
      const rows = runsOutThisMonth(got.runs, now)
      return {
        kind: 'LIST', says: expiringSays(rows),
        ...(rows.length ? {
          table: {
            caption: 'Papers that run out this month',
            head: ['Whose', 'Paper', 'Runs out'],
            rows: rows.slice(0, 20).map((r) => ({ cells: [r.whose, r.paper, DAY_UTC(r.runsOutOn)], href: r.href })),
          },
        } : {}),
        links: [{ label: 'Open Compliance', href: '/dashboard/compliance' }],
      }
    }

    case 'LAST_PAID': {
      // The reader's own pay, from payroll, where they have any on the
      // record; else who runs payroll, never "needs the model" (walk
      // three, 2026-10-26: Brightmoor's AP & Payroll asked).
      const mine = opts.ownPay ? await opts.ownPay().catch(() => null) : null
      if (mine) return mine
      return {
        kind: 'TEXT',
        ...lastPaidNotHere({
          company: opts.client ?? opts.ownCompany ?? null, companyKind: opts.companyKind,
          permissions: opts.permissions ?? [], self: opts.role ?? null,
        }),
      }
    }

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
        says: spendSays(rows, m.label, spend.undated, money, spend.whom ?? 'you'),
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
 * "When was I last paid?" where Etyme keeps no pay of the reader's: who
 * runs payroll here, never the reader themselves, and where they hold it,
 * what payroll on Etyme pays and where it is.
 */
export function lastPaidNotHere(p: { company: string | null; companyKind: string | null | undefined; permissions: readonly string[]; self?: string | null }): { says: string; links: Link[] } {
  const at = p.company?.trim() || 'your company'
  if (p.companyKind === 'CLIENT') {
    return { says: `No pay to you is on Etyme. ${possessive(at)} own payroll pays its staff outside Etyme.`, links: [] }
  }
  if (hasPermission(p.permissions, 'payroll.run')) {
    return {
      says: `No pay to you is on Etyme. Payroll here pays the people ${at} places; each run is on Payroll.`,
      links: [{ label: 'Open Payroll', href: '/dashboard/payroll' }],
    }
  }
  const desks = deskOthers(desksHolding('payroll.run', p.companyKind), p.self)
  return {
    says: desks.length
      ? `No pay to you is on Etyme. Your ${twoDesks(desks)} runs payroll at ${at}; ask them about your own pay.`
      : `No pay to you is on Etyme, and nobody runs payroll for ${at} on it yet.`,
    links: [],
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

// ── Every first screen names a person (founder, 2026-10-19) ──────────
//
// "Two things need you: Ingrid Sørensen cannot start on Oct 26 without an
// I-9; Teleworld Solutions has two people on site with no agreement on
// file." The names come from the same GET /api/decisions rows the count
// comes from, so the number on the mark and the sentence are one read.
// Every row is a card; where one existing route performs the act, the
// card carries it, and everywhere else the card opens the row's page.

/** One row of GET /api/decisions, as much of it as the chat reads. */
export interface QueueItem {
  type: string
  title: string
  subtitle?: string | null
  /** Whom the row is about, where the route that wrote it said (`named` on the queue's rows). */
  whose?: string | null
  entityType?: string | null
  entityId: string
  dueDate?: string | null
  actionUrl?: string | null
  /** The approval route's own flag on a week: signed only with a reason, so its card opens the week. */
  flag?: string | null
  /** Etyme's question folded into this row by the queue (`twinApprovalId` on GET /api/decisions' rows). */
  twinApprovalId?: string | null
}

/**
 * The decisions queue as the route read it for this seat: its total, its
 * rows, and its own one-sentence headline with the names in it (`says`,
 * built by GET /api/decisions from the same rows), so the mark, the
 * greeting and the program page say one number and one sentence.
 */
export interface QueueRead { total: number; items: QueueItem[]; says?: string | null }

/** The decisions queue's answer, read; null where it is not one. */
export function queueFrom(body: unknown): QueueRead | null {
  const data = (body as { data?: { total?: unknown; decisions?: unknown } } | null)?.data
  const total = data?.total
  if (typeof total !== 'number' || !Number.isInteger(total) || total < 0) return null
  const rows = Array.isArray(data?.decisions) ? data!.decisions as unknown[] : []
  const items: QueueItem[] = []
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue
    const x = r as Record<string, unknown>
    if (typeof x.type !== 'string' || typeof x.title !== 'string' || typeof x.entityId !== 'string') continue
    items.push({
      type: x.type, title: x.title, entityId: x.entityId,
      subtitle: typeof x.subtitle === 'string' ? x.subtitle : null,
      whose: x.named && typeof x.named === 'object' && typeof (x.named as { whose?: unknown }).whose === 'string' ? (x.named as { whose: string }).whose : null,
      entityType: typeof x.entityType === 'string' ? x.entityType : null,
      dueDate: typeof x.dueDate === 'string' ? x.dueDate : null,
      actionUrl: typeof x.actionUrl === 'string' && /^\/(?!\/)/.test(x.actionUrl) ? x.actionUrl : null,
      flag: typeof x.flag === 'string' && x.flag.trim() ? x.flag : null,
      twinApprovalId: typeof x.twinApprovalId === 'string' && x.twinApprovalId ? x.twinApprovalId : null,
    })
  }
  const says = typeof (data as { says?: unknown }).says === 'string' && (data as { says: string }).says.trim() ? (data as { says: string }).says.trim() : null
  return { total, items, ...(says ? { says } : {}) }
}

/** The act a card performs through one existing route, in the words its button and its result say. */
export interface QueueAct {
  /** The button: "Approve timesheet". */
  label: string
  /** The one route that already performs it; the chat adds no door. */
  url: string
  body: Record<string, unknown>
  /** What the card reads after the route said yes, where the route says nothing of its own. */
  done: string
}

/** A decision as a card in the chat: what it is, one line of fact, and its button. */
export interface QueueCard {
  key: string
  type: string
  title: string
  fact: string
  href: string
  /** Null where no single route performs the act: the card's button is "Open". */
  act: QueueAct | null
}

/**
 * The name after the dash: "Approve timesheet — Helena Marsh" reads
 * "Helena Marsh". After the first dash, so a name with a dash of its own
 * stays whole: "Approve job request — Planning transformation — four
 * supply-planning consultants" is the whole job's name (the walk of
 * 2026-10-22 read "The four supply-planning consultants job request").
 */
function afterDash(title: string): string {
  const at = title.indexOf(' — ')
  return (at >= 0 ? title.slice(at + 3) : title).trim()
}

const cap = (x: string) => (x ? x[0].toUpperCase() + x.slice(1) : x)
const DAY_UTC = (iso: string) => formatDay(iso.slice(0, 10), { year: false })

/** "an I-9", "a W-9": an acronym takes "an" where its first letter is said with a vowel sound. */
function article(word: string): string {
  return /^[AEFHILMNORSX](?:[A-Z0-9-]|$)/.test(word) || /^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`
}

/**
 * "Ingrid Sørensen cannot start on Oct 26 without an I-9", from the
 * paperwork's own refusal: the person, the day and the document. A
 * document named with its form in brackets is said by the form.
 */
function heldStartSays(d: QueueItem): string {
  const first = (d.subtitle ?? '').split(/(?<=\.)\s+/)[0] ?? ''
  const m = first.match(/cannot start without (.+?)\.?$/i)
  const form = m?.[1].match(/\(([A-Z][A-Z0-9]*-[A-Z0-9]+|[A-Z]{2,6})\b/)
  const doc = form ? article(form[1]) : m ? m[1].replace(/\s*\([^)]*\)/g, '').trim() : null
  const on = d.dueDate ? ` on ${DAY_UTC(d.dueDate)}` : ''
  const name = d.whose?.trim() || d.title.split(' — ')[0]
  return doc ? `${name} cannot start${on} without ${doc}` : `${possessive(name)} start${on} is held by paperwork`
}

const NUM_LOWER = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
const lowerNumber = (n: number) => (n < NUM_LOWER.length ? NUM_LOWER[n] : String(n))

/**
 * One decision as the headline names it: the person or the thing, and
 * the step in front of the reader. Begins with a capital, so each named
 * thing reads as its own clause.
 */
export function queueName(d: QueueItem, twin: readonly WaitingItem[] = []): string {
  // The person the row is about: the route's own word where it gave one,
  // else the name after the dash in its title.
  const PERSON_ROWS = ['TIMESHEET_APPROVAL', 'EXPENSE_APPROVAL', 'EXPENSE_ACCEPTANCE', 'ROLLOFF_ACTION', 'SUBMISSION_REVIEW', 'START_HELD', 'INVOICE_RECEIPT_TO_PAY']
  const who = PERSON_ROWS.includes(d.type) && d.whose?.trim() ? d.whose.trim() : afterDash(d.title)
  switch (d.type) {
    case 'START_HELD':
      return heldStartSays(d)
    case 'NO_AGREEMENT': {
      const n = Number((d.subtitle ?? '').match(/^(\d+)\s/)?.[1] ?? NaN)
      return Number.isInteger(n) && n > 0
        ? `${d.title} has ${lowerNumber(n)} ${n === 1 ? 'person' : 'people'} on site with no agreement on file`
        : `${d.title} has no agreement on file`
    }
    case 'TIMESHEET_APPROVAL':
      return /^Accept\b/.test(d.title) ? `${possessive(who)} timesheet waits for you to accept it` : `${possessive(who)} timesheet waits for your approval`
    case 'EXPENSE_APPROVAL':
      return `${possessive(who)} expense waits for your approval`
    case 'EXPENSE_ACCEPTANCE':
      return `${possessive(who)} expense waits for you to accept it`
    case 'ROLLOFF_ACTION':
      return `${who} rolls off ${rollsOffWhen(d)}`
    case 'SUBMISSION_REVIEW':
      return `${possessive(who)} submission waits for your review`
    case 'INVOICE_OVERDUE':
      return `Bill ${who} is overdue`
    case 'INVOICE_RECEIPT_TO_PAY': {
      const number = (d.subtitle ?? '').match(/^Invoice (\S+)/)?.[1]
      return `${possessive(who)} invoice receipt${number ? ` ${number}` : ''} waits for you to pay it`
    }
    case 'SUPPLIER_REVIEW':
      return `${who} waits for your review as a supplier`
    case 'REQUISITION_APPROVAL':
      return `The ${who} job request waits for your approval`
    case 'CONTRACT_PAPERING':
      return `${possessive(who.replace(/ at .*$/, ''))} contract waits to be papered`
    case 'CONTRACT_START':
      return `${d.title.replace(/^Start /, '').replace(/ at .*$/, '')} waits to be started`
    case 'OWN_PAPER':
      // A one-person firm's own paper, asked of her as the worker: the card's own name.
      return cap(d.whose?.trim() || d.title)
    case 'TWIN_QUESTION': {
      const q = twin.find((i) => i.approvalId === d.entityId)
      if (!q) return 'Etyme has a question for you'
      if (q.action === BILL_SEND && q.bill) return `${cap(billItemTitle(q.bill))} waits for you to send it`
      return `${cap(q.title)} waits for your answer`
    }
    default:
      return cap(d.title)
  }
}

/**
 * When a roll-off falls, in the queue's own words: "in 18 days", "today",
 * "tomorrow". The queue says it once in the title ("Rolls off in 18 days
 * — Felix Brenner", `app/api/decisions/words`), and this prints what it
 * wrote rather than counting again. Where the title says no day, the
 * last day itself ("on Nov 6"), and only with neither, "soon".
 */
function rollsOffWhen(d: QueueItem): string {
  const said = d.title.match(/\bRolls off (today|tomorrow|in \d+ days?)(?= — |$)/i)?.[1]
  if (said) return said.toLowerCase()
  return d.dueDate ? `on ${DAY_UTC(d.dueDate)}` : 'soon'
}

/** The last sentence of a row's own words: "Put one on file." */
function lastSentence(x: string | null | undefined): string {
  const parts = (x ?? '').split(/(?<=\.)\s+/).filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

/** A subtitle's parts as one sentence: "40 hours, through Computer Systems Inc, Oct 11 – Oct 17." */
function factOf(subtitle: string | null | undefined): string {
  const parts = (subtitle ?? '').split(' · ').map((p) => p.trim()).filter(Boolean).map((p) => {
    if (/^\d+(\.\d+)?h$/.test(p)) return `${p.slice(0, -1)} hours`
    if (p === 'Event created' || p === 'Roll-off started') return 'roll-off started'
    if (p === 'No action yet' || p === 'Nobody has acted yet') return 'nobody has acted yet'
    if (/^[A-Z_]{3,}$/.test(p)) return cap(p.toLowerCase().replace(/_/g, ' '))
    return p
  })
  const said = parts.join(', ').replace(/[.\s]+$/, '')
  return said ? `${cap(said)}.` : ''
}

/**
 * The act a decision's card performs, where one existing route performs
 * it — the same route the decisions page and the Timesheets page call —
 * and null everywhere else. A flagged week is never a one-tap card: the
 * route asks a reason for it, so the card opens the week.
 */
export function queueAct(d: QueueItem): QueueAct | null {
  const id = encodeURIComponent(d.entityId)
  if (d.type === 'TIMESHEET_APPROVAL' && !d.flag) {
    const accept = /^Accept\b/.test(d.title)
    return {
      label: accept ? 'Accept timesheet' : 'Approve timesheet',
      url: `/api/timesheets/${id}/approve`, body: {},
      done: accept ? 'Accepted, and recorded under your name.' : 'Approved, and recorded under your name.',
    }
  }
  if (d.type === 'EXPENSE_APPROVAL') {
    return { label: 'Approve expense', url: '/api/expenses/actions', body: { action: 'approve', expenseIds: [d.entityId] }, done: 'Approved, and recorded under your name.' }
  }
  if (d.type === 'EXPENSE_ACCEPTANCE') {
    return { label: 'Accept expense', url: `/api/expenses/${id}/accept`, body: { decision: 'accept' }, done: 'Accepted, and recorded under your name.' }
  }
  return null
}

/**
 * A one-person firm's queue with her own papers in it (the walk of
 * 2026-10-22: Colleen Byrne's license renewal was asked of her and her
 * greeting said nothing needed her). She is the firm and the worker, so
 * what is asked of her as the worker is hers to do as the firm: each
 * paper is a row of the one queue, counted in the headline and the mark
 * and drawn as a card that opens her paperwork. The queue's own sentence
 * is dropped where a paper is added, so the headline names the papers too.
 */
export function withOwnPapers(
  q: QueueRead | null,
  papers: ReadonlyArray<{ key: string; name: string; title: string; says: string; href: string }>,
): QueueRead | null {
  // A queue that could not be read stays unread: a count of her papers
  // alone, read as everything she owes, is the plausible wrong number.
  if (papers.length === 0 || !q) return q
  const own: QueueItem[] = papers.map((p) => ({
    type: 'OWN_PAPER', title: p.title, whose: `${p.name} is asked of you`,
    subtitle: p.says, entityId: p.key, actionUrl: p.href,
  }))
  // After the firm's own decisions: money and the week before paperwork.
  return { total: q.total + own.length, items: [...q.items, ...own] }
}

/**
 * Whether a queue row is about a receipt Etyme's own card already asks
 * about: one card per receipt (walk three, 2026-10-26: a clean receipt
 * drew "waits for you to pay it" and "Pay …?" one above the other). The
 * pay card replaces the row; the row stays in the count, because it is
 * the same one thing to do.
 */
export function carriedByTwin(d: QueueItem, twin: readonly WaitingItem[]): boolean {
  if (d.type !== 'INVOICE_RECEIPT_TO_PAY') return false
  return twin.some((i) =>
    (i.action === RECEIPT_PAY || i.action === RECEIPT_APPROVE) &&
    ((!!d.twinApprovalId && i.approvalId === d.twinApprovalId) || (i.entity?.type === 'Invoice' && i.entity.id === d.entityId)))
}

/** Every decision in the count that is not one of the twin's own questions, as a card. */
export function queueCards(q: QueueRead | null | undefined, twin: readonly WaitingItem[] = []): QueueCard[] {
  if (!q) return []
  return q.items
    .filter((d) => d.type !== 'TWIN_QUESTION' && !carriedByTwin(d, twin))
    .map((d) => ({
      key: `${d.type}:${d.entityId}`,
      type: d.type,
      title: `${queueName(d)}.`,
      fact: d.type === 'NO_AGREEMENT' ? lastSentence(d.subtitle) : d.type === 'TIMESHEET_APPROVAL' && d.flag ? `${factOf(d.subtitle)} ${d.flag.replace(/[.\s]*$/, '.')} Open it to approve with a reason.`.trim() : factOf(d.subtitle),
      href: d.actionUrl ?? DECISIONS_HREF,
      act: queueAct(d),
    }))
}

/** "Your professional license is asked of you" read inside a sentence: "your professional license …". An acronym or a name keeps its capital. */
function midSentence(x: string): string {
  return /^(Your|The|A|An)\b/.test(x) ? x[0].toLowerCase() + x.slice(1) : x
}

/**
 * A one-person firm's queue without a week of her own to accept: she is
 * the firm and the worker, and nobody accepts their own week (CLAUDE.md,
 * shipped 2026-10-21). The count drops with the row, so the mark and the
 * headline still agree, and the queue's own sentence goes where it named it.
 */
export function withoutOwnWeek(q: QueueRead | null, self: string | null | undefined): QueueRead | null {
  const me = self?.trim().toLowerCase()
  if (!q || !me) return q
  const mine = (d: QueueItem) => d.type === 'TIMESHEET_APPROVAL' && /^Accept\b/.test(d.title) &&
    (d.whose?.trim().toLowerCase() === me || afterDash(d.title).toLowerCase() === me)
  const kept = q.items.filter((d) => !mine(d))
  if (kept.length === q.items.length) return q
  return { total: Math.max(0, q.total - (q.items.length - kept.length)), items: kept }
}

/** The words at the end of the headline that open the decisions list. */
export const OPEN_THE_LIST = 'Open the list'

/**
 * The headline with the names in it: "Two things need you: A; B. Open the
 * list." The first three are named, the rest are "and n more". Null where
 * the queue owes nothing.
 */
export function namedNeedsSays(q: QueueRead, twin: readonly WaitingItem[]): { says: string; links: { text: string; href: string }[] } | null {
  if (q.total <= 0) return null
  // The queue's own sentence, where it gave one: one number, one sentence, everywhere.
  if (q.says) return { says: `${q.says.replace(/[.\s]*$/, '.')} ${OPEN_THE_LIST}.`, links: [{ text: OPEN_THE_LIST, href: DECISIONS_HREF }] }
  // Inside the sentence a paper of her own reads "your professional
  // license", never a capital after the colon (walk three, 2026-10-26).
  const named = q.items.slice(0, 3).map((d) => (d.type === 'OWN_PAPER' ? midSentence(queueName(d, twin)) : queueName(d, twin)))
  const rest = q.total - named.length
  const head = `${counted(q.total, 'thing')} ${q.total === 1 ? 'needs' : 'need'} you`
  const list = named.length === 0 ? '' : `: ${named.join('; ')}${rest > 0 ? `; and ${lowerNumber(rest)} more` : ''}`
  return { says: `${head}${list}. ${OPEN_THE_LIST}.`, links: [{ text: OPEN_THE_LIST, href: DECISIONS_HREF }] }
}

// ── "Since you last looked" says who and what ────────────────────────

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_MS_2 = 86_400_000

/** "today", "tomorrow", "Wednesday" inside the week ahead, else "Oct 28". */
export function whenSays(iso: string, now: Date): string {
  const on = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const days = Math.round((on - today) / DAY_MS_2)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days > 1 && days < 7) return WEEKDAYS[new Date(on).getUTCDay()]
  return DAY_UTC(iso)
}

/** "Oct 18–24": the Sunday-to-Saturday week a Monday's hours-due date closes. Null where the date is not a Monday. */
export function weekDueOn(iso: string): string | null {
  const due = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(due.getTime()) || due.getUTCDay() !== 1) return null
  const sat = new Date(due.getTime() - 2 * DAY_MS_2)
  const sun = new Date(sat.getTime() - 6 * DAY_MS_2)
  const a = DAY_UTC(sun.toISOString())
  const b = DAY_UTC(sat.toISOString())
  return a.split(' ')[0] === b.split(' ')[0] ? `${a}–${b.split(' ')[1]}` : `${a}–${b}`
}

/** Who a cycle notice is about, from its own body: "Helena Marsh at Northbend Athletic — Oct 22". */
function noticePeople(body: string | null | undefined): string[] {
  const who = (body ?? '').split(' — ')[0].replace(/ (at|through) .*$/, '').replace(/ on .*own payroll.*$/, '').trim()
  if (!who || /^(This engagement|Due)\b/.test(who)) return []
  return who.split(/,\s*/).map((x) => x.trim()).filter(Boolean)
}

/** "Helena Marsh, Omar Haddad and three more". */
function namesUpTo3(xs: readonly string[]): string {
  if (xs.length <= 3) return listed([...xs])
  return `${xs.slice(0, 3).join(', ')} and ${lowerNumber(xs.length - 3)} more`
}

/** A thread somebody wrote on since the reader last looked, as the greeting says it. */
export interface ThreadNote {
  conversationId: string
  /** "Brightmoor Staffing", or the person's name where a candidate or a colleague wrote. */
  who: string
  whoKind: 'FIRM' | 'CANDIDATE' | 'COLLEAGUE'
  /** "the HCM integration lead job"; null where the thread names nothing. */
  about: string | null
  href: string
}

/** Threads named in one greeting, at most; the rest are "n more". */
export const THREADS_SHOWN = 3
export const CONVERSATIONS_HREF = '/dashboard/conversations'

/**
 * One line per thread with an unread message: "Brightmoor Staffing wrote
 * to you about the HCM integration lead job." At most three, then the
 * rest in one line that opens the list.
 */
export function threadsSay(threads: readonly ThreadNote[], more = 0): RichLine[] {
  const out: RichLine[] = threads.slice(0, THREADS_SHOWN).map((t) => {
    const who = t.whoKind === 'CANDIDATE' ? `${t.who}, a candidate,` : t.who
    return { says: `${who} wrote to you${t.about ? ` about ${t.about}` : ''}.`, links: [{ text: t.who, href: t.href }] }
  })
  const rest = more + Math.max(0, threads.length - THREADS_SHOWN)
  if (rest > 0) {
    const text = `${lowerNumber(rest)} more ${rest === 1 ? 'conversation' : 'conversations'}`
    out.push({ says: `And ${text} ${rest === 1 ? 'has a new message' : 'have new messages'}.`, links: [{ text, href: CONVERSATIONS_HREF }] })
  }
  return out
}

// ── A firm's own book: roll-offs, the bench, signed weeks, unpaid bills ──
//
// The four chips a supplier, an integrator or a sub-vendor reads (founder,
// 2026-10-19). Each answer is a sentence — the recommendation where there
// is one, then the count, then when it looked — over a table of the rows.

/** A table inside a reply: the first cell names the row and opens it. */
export interface ListTable { caption: string; head: string[]; rows: Array<{ cells: string[]; href?: string }> }

/** How far ahead "who rolls off" looks. */
export const ROLLOFF_DAYS = 30

export interface RollRow { personId: string; person: string; site: string | null; endsOn: string; daysLeft: number; href: string }
export interface BenchRow { personId: string; person: string; free: string; skills: string[]; href?: string }
export interface UnbilledRow {
  timesheetId: string; person: string; customer: string | null; periodStart: string; periodEnd: string; hours: number; signedOn: string | null; href: string
  /** What the week bills, in minor units, as Today prices it; null where it cannot be priced. */
  amountMinor?: number | null
  currency?: string
  /** The number of a draft bill that already holds the week, not yet sent. */
  draft?: string | null
  personId?: string
}
export interface UnpaidRow { invoiceId: string; number: string; customer: string | null; dueMinor: number; currency: string; dueOn: string | null; held: boolean; href: string }
/** One candidate on a job, as the Candidates page lists them. */
export interface AppliedRow { person: string; job: string; from: string | null; status: string; sentOn: string | null; href: string }
/** A start held by paperwork, as the compliance page lists it. */
export interface PaperHeld { personId: string; name: string; startsOn: string | null; missing: string[]; href: string }
/** A paper on file and the day it runs out. */
export interface PaperRun { whose: string; paper: string; runsOutOn: string; href: string }

/** A submission's stage in the words a recruiter says. */
export function stageWords(status: string): string {
  const s = status.toUpperCase()
  const words: Record<string, string> = {
    SUBMITTED: 'Sent', PENDING: 'Sent', SHORTLISTED: 'Shortlisted', SCREENING: 'In screening', INTERVIEWING: 'Interviewing',
    INTERVIEW: 'Interviewing', OFFERED: 'Offered', AWARDED: 'Selected', PLACED: 'Selected', HIRED: 'Selected',
    REJECTED: 'Not selected', WITHDRAWN: 'Withdrawn', CLOSED: 'Closed',
  }
  return words[s] ?? (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : '—')
}

/** "Ana Ruiz, Ben Ode and Chen Li", or the first three "and n more". */
function namesUpTo(names: readonly string[], n = 3): string {
  const uniq = [...new Set(names)]
  return uniq.length <= n ? listed(uniq) : `${uniq.slice(0, n).join(', ')} and ${lowerNumber(uniq.length - n)} more`
}

export function appliedSays(job: string | null, rows: readonly AppliedRow[], total: number): string {
  if (job) {
    if (total === 0) return `Nobody has applied for the ${job} job yet. Checked just now.`
    return `${total === 1 ? 'One candidate' : `${numberWord(total)} candidates`} applied for the ${job} job: ${namesUpTo(rows.map((r) => r.person))}. Checked just now.`
  }
  if (total === 0) return 'Nobody has applied for your jobs yet. Checked just now.'
  const r = rows[0]
  return `The newest is ${r.person}, for the ${r.job} job${r.from ? `, from ${r.from}` : ''}. ` +
    `${counted(total, 'candidate')} ${total === 1 ? 'is' : 'are'} on your jobs. Checked just now.`
}

export function appliedTable(rows: readonly AppliedRow[]): ListTable {
  return {
    caption: 'Who applied',
    head: ['Candidate', 'Job', 'From', 'Where it is'],
    rows: rows.slice(0, 20).map((r) => ({ cells: [r.person, r.job, r.from ?? '—', stageWords(r.status)], href: r.href })),
  }
}

/** The receipts this seat may pay now: the queue's own "Pay" rows, each through the payment gate. */
export function payableSays(rows: readonly QueueItem[]): string {
  if (rows.length === 0) return 'No invoice receipt is ready for you to pay. Checked just now.'
  return `Pay ${afterDash(rows[0].title)}’s invoice receipt first; it passes the check. ` +
    `${counted(rows.length, 'invoice receipt')} ${rows.length === 1 ? 'is' : 'are'} ready to pay. Checked just now.`
}

export function acceptSays(rows: readonly QueueItem[]): string {
  if (rows.length === 0) return 'No timesheet waits for you to accept it. Checked just now.'
  const who = rows[0].whose?.trim() || afterDash(rows[0].title)
  return `Accept ${possessive(who)} timesheet first. ${counted(rows.length, 'timesheet')} ${rows.length === 1 ? 'waits' : 'wait'} for you to accept ${rows.length === 1 ? 'it' : 'them'}. Checked just now.`
}

/** People who cannot start without an I-9, from the compliance page's held starts. */
export function i9Rows(held: readonly PaperHeld[]): PaperHeld[] {
  return held.filter((h) => h.missing.some((m) => /\bI-?9\b/i.test(m)))
}

export function i9Says(rows: readonly PaperHeld[]): string {
  if (rows.length === 0) return 'Nobody about to start is held for an I-9. Checked just now.'
  const r = rows[0]
  return `${r.name} cannot start${r.startsOn ? ` on ${formatDay(r.startsOn, { year: false })}` : ''} without an I-9. ` +
    `${counted(rows.length, 'start')} ${rows.length === 1 ? 'is' : 'are'} held for one. Checked just now.`
}

/** Papers that run out from today to the month's end, soonest first. */
export function runsOutThisMonth(runs: readonly PaperRun[], now: Date): PaperRun[] {
  const today = now.toISOString().slice(0, 10)
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
  return runs.filter((r) => r.runsOutOn >= today && r.runsOutOn <= end).sort((a, b) => a.runsOutOn.localeCompare(b.runsOutOn) || a.whose.localeCompare(b.whose))
}

export function expiringSays(rows: readonly PaperRun[]): string {
  if (rows.length === 0) return 'No paper on file runs out this month. Checked just now.'
  const r = rows[0]
  return `Renew ${possessive(r.whose)} ${r.paper} first; it runs out on ${formatDay(r.runsOutOn, { year: false })}. ` +
    `${counted(rows.length, 'paper')} ${rows.length === 1 ? 'runs' : 'run'} out this month. Checked just now.`
}

/** "One person rolls", "Three people roll". */
function peopleDo(n: number, verb: string): string {
  return n === 1 ? `One person ${verb}s` : `${numberWord(n)} people ${verb}`
}

export function rolloffSays(rows: readonly RollRow[]): string {
  if (rows.length === 0) return `Nobody on your contracts rolls off in the next ${ROLLOFF_DAYS} days. Checked just now.`
  const r = rows[0]
  return `Plan ${possessive(r.person)} next job now; ${r.person} rolls off${r.site ? ` at ${r.site}` : ''} on ${day(r.endsOn)}. ` +
    `${peopleDo(rows.length, 'roll')} off in the next ${ROLLOFF_DAYS} days. Checked just now.`
}

export function rolloffTable(rows: readonly RollRow[]): ListTable {
  return {
    caption: `Rolling off in the next ${ROLLOFF_DAYS} days`,
    head: ['Person', 'Days left', 'Last day', 'Where'],
    rows: rows.map((r) => ({ cells: [r.person, String(r.daysLeft), day(r.endsOn), r.site ?? '—'], href: r.href })),
  }
}

export function benchSays(rows: readonly BenchRow[]): string {
  if (rows.length === 0) return 'Nobody is on your bench today. Checked just now.'
  const names = rows.map((r) => r.person)
  const shown = names.length <= 3 ? listed(names) : `${names.slice(0, 3).join(', ')} and ${lowerNumber(names.length - 3)} more`
  return `${numberWord(rows.length)} ${rows.length === 1 ? 'person is' : 'people are'} on your bench: ${shown}. Checked just now.`
}

export function benchTable(rows: readonly BenchRow[]): ListTable {
  return {
    caption: 'On your bench',
    head: ['Person', 'Free', 'Skills'],
    rows: rows.map((r) => ({ cells: [r.person, r.free, r.skills.slice(0, 4).join(', ') || '—'], ...(r.href ? { href: r.href } : {}) })),
  }
}

/** "Oct 11–17", "Sep 27–Oct 3". */
function weekSpan(start: string, end: string): string {
  const a = DAY_UTC(start)
  const b = DAY_UTC(end)
  if (a === b) return a
  return a.split(' ')[0] === b.split(' ')[0] ? `${a}–${b.split(' ')[1]}` : `${a}–${b}`
}

export function unbilledSays(rows: readonly UnbilledRow[], now: Date): string {
  if (rows.length === 0) return 'Every signed week is on a bill. Checked just now.'
  const r = rows[0]
  const waited = r.signedOn ? Math.max(0, Math.round((utcMidnight(now) - Date.parse(`${r.signedOn}T00:00:00Z`)) / DAY_MS)) : null
  const ago = waited != null && waited > 0 ? `; it was signed ${waited} day${waited === 1 ? '' : 's'} ago` : ''
  const first = r.draft
    ? `Send draft bill ${r.draft} to ${r.customer ?? 'the customer'} for ${possessive(r.person)} week of ${weekSpan(r.periodStart, r.periodEnd)} first${ago}.`
    : `Bill ${r.customer ?? 'the customer'} for ${possessive(r.person)} week of ${weekSpan(r.periodStart, r.periodEnd)} first${ago}.`
  const drafts = rows.filter((x) => x.draft).length
  const onDrafts = drafts === 0 ? ''
    : drafts === rows.length ? (rows.length === 1 ? ' It is on a draft bill nobody has sent.' : ' All of them are on draft bills nobody has sent.')
    : ` ${numberWord(drafts)} of them ${drafts === 1 ? 'is' : 'are'} on a draft bill nobody has sent.`
  return `${first} ${counted(rows.length, 'signed week')} ${rows.length === 1 ? 'is' : 'are'} on no sent bill yet.${onDrafts} Checked just now.`
}

export function unbilledTable(rows: readonly UnbilledRow[]): ListTable {
  return {
    caption: 'Signed weeks on no bill yet',
    head: ['Person', 'Week', 'Hours', 'Customer', 'Bills'],
    rows: rows.map((r) => ({
      cells: [
        r.person, weekSpan(r.periodStart, r.periodEnd), hrs(r.hours), r.customer ?? '—',
        `${r.amountMinor != null && r.currency ? money(r.amountMinor, r.currency) : '—'}${r.draft ? ` · draft ${r.draft}` : ''}`,
      ],
      href: r.href,
    })),
  }
}

export function unpaidSays(rows: readonly UnpaidRow[], now: Date = new Date()): string {
  if (rows.length === 0) return 'Every bill you sent is paid. Checked just now.'
  const today = utcMidnight(now)
  const late = rows
    .filter((r) => r.dueOn && Date.parse(`${r.dueOn}T00:00:00Z`) < today)
    .sort((a, b) => (a.dueOn ?? '').localeCompare(b.dueOn ?? ''))
  const parts: string[] = []
  if (late.length) {
    const r = late[0]
    const days = Math.round((today - Date.parse(`${r.dueOn}T00:00:00Z`)) / DAY_MS)
    parts.push(`Chase bill ${r.number} first; ${r.customer ?? 'the customer'} is ${days} day${days === 1 ? '' : 's'} past the due date.`)
  }
  const currencies = [...new Set(rows.map((r) => r.currency))]
  const sums = currencies.map((c) => money(rows.filter((r) => r.currency === c).reduce((s, r) => s + r.dueMinor, 0), c))
  parts.push(`${counted(rows.length, 'bill')} ${rows.length === 1 ? 'is' : 'are'} unpaid: ${listed(sums)} in all.`)
  const held = rows.filter((r) => r.held).length
  if (held) parts.push(`${numberWord(held)} ${held === 1 ? 'is' : 'are'} on hold with the customer.`)
  parts.push('Checked just now.')
  return parts.join(' ')
}

export function unpaidTable(rows: readonly UnpaidRow[]): ListTable {
  return {
    caption: 'Bills not paid in full',
    head: ['Bill', 'Customer', 'Still due', 'Due'],
    rows: rows.map((r) => ({ cells: [r.number, r.customer ?? '—', money(r.dueMinor, r.currency), r.held ? 'On hold' : r.dueOn ? day(r.dueOn) : '—'], href: r.href })),
  }
}
