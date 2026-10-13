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
 * Anything else goes to the model with the ledger lines as context, and
 * only if a key is configured. The model describes; it never acts and it
 * is never the gate. Nothing in this file or the route writes state: a
 * yes or a no is sent by the panel to POST /api/twin/approvals/:id, the
 * one door the web and Teams share.
 */

import { formatDay, formatMonth } from '@/lib/format-date'
import { format, fromMinor } from '@/lib/money'
import { desksHolding, type Permission } from '@/lib/permissions'

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
  if (/\bvariance\b/.test(lower) && /\bsuppliers?\b/.test(lower)) return { kind: 'VARIANCE' }

  if (
    /^(what|who|anything)\b.*\b(needs?|waiting on|waits? (for|on)|for)\s+me\b/.test(lower) ||
    /^(needs me|my queue|waiting on me|what is waiting( on me)?)\??$/.test(lower)
  ) return { kind: 'NEEDS' }

  const never = neverAct(text)
  if (never) return { kind: 'NEVER', act: never }

  const why = text.match(/^why\b\s*(.*)$/i)
  if (why) return { kind: 'WHY', ref: cleanRef(why[1]) }

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

  if (/\btime[- ]limits?\b|\btenure\b/.test(lower)) return { kind: 'TIME_LIMIT' }
  if (/\b(spend|spent|spending)\b/.test(lower)) return { kind: 'SPEND' }
  if (
    /\bunsigned\b/.test(lower) ||
    (/\b(weeks?|timesheets?)\b/.test(lower) && /\b(not signed|to sign|waiting|not approved|unapproved)\b/.test(lower))
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

const NEVER_FLOOR: Record<NeverAct, { doing: string; needs: Permission; where: string; link: Link }> = {
  EXTEND: { doing: 'Extending a placement', needs: 'assignments.write', where: 'on the placement’s page', link: { label: 'Open Contracts', href: '/dashboard/contracts' } },
  END: { doing: 'Ending a placement', needs: 'assignments.terminate', where: 'on the placement’s page', link: { label: 'Open Contracts', href: '/dashboard/contracts' } },
  AWARD: { doing: 'Awarding a job to a candidate', needs: 'requirements.write', where: 'on the submission, under its job request', link: { label: 'Open Submissions', href: '/dashboard/submissions' } },
  REJECT_SUBMISSION: { doing: 'Rejecting a submission', needs: 'requirements.write', where: 'on the submission, under its job request', link: { label: 'Open Submissions', href: '/dashboard/submissions' } },
  PAY: { doing: 'Paying an invoice receipt', needs: 'payments.record', where: 'on the invoice receipt’s page', link: { label: 'Open Invoice receipts', href: '/dashboard/invoices' } },
  PAYROLL: { doing: 'Running or releasing payroll', needs: 'payroll.run', where: 'on Payroll', link: { label: 'Open Payroll', href: '/dashboard/payroll' } },
  SIGN_AGREEMENT: { doing: 'Signing an agreement', needs: 'rates.write', where: 'on the agreement’s page', link: { label: 'Open Agreements', href: '/dashboard/program/agreements' } },
  SIGN_WEEK: { doing: 'Signing a week of hours', needs: 'timesheets.approve', where: 'on Timesheets', link: { label: 'Open Timesheets', href: '/dashboard/timesheets' } },
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
  if (/^(sign|countersign|approve)\b.*\b(week|hours|timesheets?)\b/.test(t) && /^(sign|countersign)\b/.test(t)) return 'SIGN_WEEK'
  if (/^(sign|countersign|execute)\b/.test(t)) return 'SIGN_AGREEMENT'
  return null
}

/** "Contract Manager or Resource Manager". */
function orNames(xs: readonly string[]): string {
  if (xs.length <= 1) return xs[0] ?? ''
  return `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`
}

/**
 * The one sentence for an act on the never floor: that it is never
 * Etyme's, who does it at this kind of company, and where.
 */
export function neverSays(act: NeverAct, companyKind: string | null | undefined, permissions: readonly string[] = []): { says: string; links: Link[] } {
  const f = NEVER_FLOOR[act]
  const desks = desksHolding(f.needs, companyKind).slice(0, 3)
  const who = permissions.includes(f.needs)
    ? `Your desk does it: you do it yourself ${f.where}.`
    : desks.length ? `Your ${orNames(desks)} does it ${f.where}.` : `A person at your company does it ${f.where}; ask whoever manages roles there who holds that desk.`
  return { says: `${f.doing} is never Etyme’s to do. ${who}`, links: [f.link] }
}

/**
 * The four questions drawn as chips above the box, in the founder's
 * prototype order. Each is answered by rules; none goes to the model.
 */
export const SUGGESTED_QUESTIONS: readonly string[] = [
  'What needs me today?',
  'Who is near the time limit?',
  'What did we spend by supplier this month?',
  'Which weeks are unsigned?',
]

/** The line under the box, word for word from the approved prototype. */
export const FOOTER_LINE =
  'Etyme answers from the record and its rules. It asks before any outside message or money moves, and every act is in the ledger.'

export const WHAT_I_ANSWER =
  'I answer these from the record and its rules: “What needs me today?”, “Who is near the time limit?”, ' +
  '“What did we spend by supplier this month?”, “Which weeks are unsigned?”, ' +
  '“Show me invoice variance by supplier this quarter”, “Why 1” (or why and an entry), ' +
  '“Approve 1” and “Reject 1 because …”.'

// ── The model ────────────────────────────────────────────────────────

/** Whether a model can be asked on this deployment. The key only, never its value. */
export function modelConfigured(env: Record<string, string | undefined>): boolean {
  return Boolean(env.ANTHROPIC_API_KEY && env.ANTHROPIC_API_KEY.trim())
}

export const NO_MODEL =
  'The model is not set up on this deployment, so I can answer only the questions the rules cover. ' + WHAT_I_ANSWER

/** The one sentence the model says for any act. Checked in the test, so it cannot drift. */
export const ASK_THE_DESK = 'I cannot do that; ask the desk.'

/**
 * The model's instruction. It may describe what the ledger lines say and
 * nothing more. The lines are the whole of what it knows; an act of any
 * kind gets the one sentence above, because the model is never the gate.
 */
export const MODEL_SYSTEM = [
  'You answer questions about a company’s contingent workforce program, for a person signed in to Etyme.',
  'You are given lines from the program manager twin’s ledger. They are the only facts you have.',
  'Describe only what is on those lines. Do not guess, estimate or add a figure that is not on a line.',
  'When you cite a line, give its id in square brackets, exactly as written, like [ck123].',
  `If you are asked to do anything — approve, reject, pay, send, change, end, sign or write — answer exactly: "${ASK_THE_DESK}"`,
  'If the lines do not answer the question, say so in one sentence.',
  'Use plain American English, short sentences, no more than eight lines. Say job request, time limit, invoice receipt and bill.',
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
}

export interface VarianceReceipt {
  invoiceId: string
  number: string | null
  supplierName: string | null
  verdict: 'CLEAN' | 'MISMATCH' | 'BLOCKED'
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
  | { kind: 'NEEDS'; says: string; items: WaitingItem[]; more?: string[]; links?: Link[]; greeting?: boolean }
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

/** The sentence over the variance table. */
export function varianceSays(rows: readonly VarianceRow[], label: string): string {
  if (rows.length === 0) return `Etyme has recorded no invoice receipts in ${label}.`
  const receipts = rows.reduce((s, r) => s + r.receipts, 0)
  const off = rows.reduce((s, r) => s + r.mismatch + r.held, 0)
  const over = rows.reduce((s, r) => s + (r.hoursOverAccepted ?? 0), 0)
  return (
    `${receipts} invoice receipt${receipts === 1 ? '' : 's'} from ${rows.length} supplier${rows.length === 1 ? '' : 's'} in ${label}` +
    (off === 0 ? ', all clean.' : `; ${off} ${off === 1 ? 'is' : 'are'} not clean, ${hrs(over)} hours billed over what was accepted.`) +
    ' Checked again against the three-way check as you asked.'
  )
}

/** The twin's questions, as a reply. */
export function needsSays(items: readonly WaitingItem[]): string {
  if (items.length === 0) return 'Nothing from Etyme is waiting on you.'
  return items.length === 1
    ? 'Etyme is asking you one thing. Approve it here, or reject it with a reason.'
    : `Etyme is asking you ${counted(items.length, 'thing').toLowerCase()}. Approve each here, or reject it with a reason.`
}

// ── Today: who else is asked, and the time limit ─────────────────────

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine']
/** "Two invoice receipts", "12 questions". Sentence case, for the start of a line. */
function counted(n: number, noun: string): string {
  return `${n < NUMBER_WORDS.length ? NUMBER_WORDS[n] : n} ${noun}${n === 1 ? '' : 's'}`
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
  /** "invoice receipt" or "question". */
  noun: string
  /** The desks that hold the permission it needs, in the trade's words. */
  desks: string[]
  /** True where it was asked on this reader's own authority, so nobody here signs it. */
  own: boolean
  href: string
}

/**
 * Who else is being asked, grouped by the desk that answers, in one line
 * per desk: "Two invoice receipts are waiting for the AP Clerk:
 * PR-2026-0441 and PR-2026-0443. Neither is yours to sign." Where Etyme
 * asked on this reader's own authority — the program manager, whose
 * authority the twin acts under — the line says why it is not theirs.
 */
export function othersSay(others: readonly OtherWaiting[]): string[] {
  const out: string[] = []
  const byDesk = new Map<string, OtherWaiting[]>()
  for (const o of others) {
    const desk = o.desks.length ? `the ${listed(o.desks).replace(/ and ([^,]+)$/, ' or $1')}` : 'another desk'
    const key = `${desk}\u0000${o.own ? 'own' : ''}`
    byDesk.set(key, [...(byDesk.get(key) ?? []), o])
  }
  for (const [key, xs] of byDesk) {
    const [desk, own] = key.split('\u0000')
    const noun = xs.every((x) => x.noun === xs[0].noun) ? xs[0].noun : 'question'
    const not = xs.length === 1 ? 'It is not yours to sign' : xs.length === 2 ? 'Neither is yours to sign' : 'None is yours to sign'
    const why = own ? ': Etyme asked on your authority, and nobody signs their own.' : '.'
    out.push(`${counted(xs.length, noun)} ${xs.length === 1 ? 'is' : 'are'} waiting for ${desk}: ${listed(xs.map((x) => x.title))}. ${not}${why}`)
  }
  return out
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
export function limitsSay(rows: readonly LimitRow[], day: (iso: string) => string): string {
  if (rows.length === 0) return 'Nobody on your sites is inside a time-limit warning. Etyme reads every supplier’s contracts each night and warns at 90, 60 and 30 days.'
  const newest = rows.reduce((d, r) => (r.readOn > d ? r.readOn : d), rows[0].readOn)
  return (
    `${counted(rows.length, 'person')} ${rows.length === 1 ? 'is' : 'are'} inside a time-limit warning, counted across every supplier. ` +
    `${limitSays(rows[0], day)} From Etyme’s nightly reading, last on ${day(newest)}.`
  )
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
    ? ` ${counted(undated, 'invoice receipt')} ${undated === 1 ? 'carries' : 'carry'} no billing date and ${undated === 1 ? 'is' : 'are'} not counted in any month.`
    : ''
  if (rows.length === 0) return `No supplier billed you in ${label}.${undatedLine}`
  const currencies = [...new Set(rows.map((r) => r.currency))]
  const sum = (c: string, f: (r: SpendRow) => number) => rows.filter((r) => r.currency === c).reduce((s, r) => s + f(r), 0)
  const billed = listed(currencies.map((c) => money(sum(c, (r) => r.billedMinor), c)))
  const paid = listed(currencies.map((c) => money(sum(c, (r) => r.paidMinor), c)))
  const receipts = rows.reduce((s, r) => s + r.receipts, 0)
  const suppliers = new Set(rows.map((r) => r.supplier)).size
  return (
    `${counted(suppliers, 'supplier')} billed you ${billed} in ${label}, on ${receipts} invoice receipt${receipts === 1 ? '' : 's'}, ` +
    `counted by the day each was billed. ${paid} of it is paid.${undatedLine}`
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
export function weeksSay(total: number, oldestDays: number | null, company: string): string {
  if (total === 0) return `No week is waiting for a signature at ${company}.`
  return (
    `${counted(total, 'week')} ${total === 1 ? 'is' : 'are'} waiting for a signature at ${company}` +
    (oldestDays != null && oldestDays > 0 ? `; the oldest has waited ${oldestDays} day${oldestDays === 1 ? '' : 's'}.` : '.') +
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
    ? `Approve ${item.title}? ${item.says} It is recorded in the twin’s ledger under your name.`
    : `Reject ${item.title}, because “${reason}”? Etyme does nothing, and your reason is recorded in the twin’s ledger under your name.`
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
  receiptsIn(from: Date, to: Date): Promise<VarianceReceipt[]>
  /** The twin's questions this seat may not answer, and who does. */
  othersWaiting(): Promise<OtherWaiting[]>
  /** The twin's time-limit warnings, or the sentence for a seat that does not read what the rules found. */
  limits(): Promise<Refusable<{ entries: LimitEntry[] }>>
  /** Weeks waiting for this company's signature, oldest first, at most WEEKS_SHOWN, and how many in all. */
  unsignedWeeks(): Promise<Refusable<{ rows: WeekRow[]; total: number; company: string }>>
  /** Invoice receipts billed to this company in [from, to), and how many carry no date at all. */
  spendIn(from: Date, to: Date): Promise<Refusable<{ receipts: SpendReceipt[]; undated: number }>>
  ledgerLines(): Promise<LedgerLine[]>
  /** Asks the model; only called where a key is configured. */
  model(system: string, question: string, context: string): Promise<string | null>
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

/** "12 contractors are on site today, through 4 suppliers." Null when nobody is. */
export function pictureSays(p: Picture | null | undefined): string | null {
  if (!p || p.onSite <= 0) return null
  return (
    `${counted(p.onSite, 'contractor')} ${p.onSite === 1 ? 'is' : 'are'} on site today` +
    (p.suppliers > 0 ? `, through ${counted(p.suppliers, 'supplier').toLowerCase()}.` : '.')
  )
}

/** "Suppliers billed you $42,587.00 so far in Oct 2026." Per currency, never added across. Null when nothing was billed. */
export function billedSays(rows: readonly SpendRow[], label: string): string | null {
  const currencies = [...new Set(rows.filter((r) => r.billedMinor !== 0).map((r) => r.currency))]
  if (currencies.length === 0) return null
  const total = listed(currencies.map((c) => money(rows.filter((r) => r.currency === c).reduce((s, r) => s + r.billedMinor, 0), c)))
  return `Suppliers billed you ${total} so far in ${label}.`
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
export async function today(read: Readers, opts: { now?: Date; greeting?: boolean; picture?: Picture | null } = {}): Promise<Answer> {
  const now = opts.now ?? new Date()
  const month = monthOf(now)
  const [items, others, limits, spend] = await Promise.all([
    read.waiting(), read.othersWaiting(), read.limits(),
    opts.greeting ? read.spendIn(month.from, month.to) : Promise.resolve(null),
  ])
  const near = limits.ok ? nearLimit(limits.entries, now) : []
  const lines: { says: string; link?: Link }[] = othersSay(others).map((says) => ({ says }))
  if (near.length) {
    lines.push({
      says: limitSays(near[0], day) +
        (near.length > 1 ? ` ${counted(near.length - 1, 'more person')} ${near.length === 2 ? 'is' : 'are'} inside a warning; ask “Who is near the time limit?”.` : ''),
      link: { label: `Open ${near[0].name}`, href: near[0].href },
    })
  }
  const onSite = opts.greeting ? pictureSays(opts.picture) : null
  if (onSite) lines.push({ says: onSite, link: { label: 'Open Contractors', href: '/dashboard/people' } })
  const billed = spend?.ok ? billedSays(spendBySupplier(spend.receipts), month.label) : null
  if (billed) lines.push({ says: billed, link: { label: 'Open Invoice receipts', href: '/dashboard/invoices' } })

  const kept = lines.slice(0, GREETING_LINES - 1)
  const says = items.length === 0 && others.length === 0 && near.length === 0
    ? 'Nothing needs you today, and nothing Etyme asked is waiting on anybody.'
    : needsSays(items)
  const more = kept.map((l) => l.says)
  if (opts.greeting) more.push(GREETING_CLOSE)
  const links = kept.flatMap((l) => (l.link ? [l.link] : []))
  return { kind: 'NEEDS', says, items, more, links, ...(opts.greeting ? { greeting: true } : {}) }
}

/**
 * The boundary, said on the first screen (CLAUDE.md, "Ask Etyme is the
 * app"). The last clause follows whether a model can be asked here.
 */
export function boundarySays(modelOn: boolean): string {
  return 'Your data stays in your company. Every read is logged. ' + (modelOn
    ? 'Free-text questions go to the model turned on for this deployment; the rules answer first.'
    : 'Nothing leaves to a model unless your company turns it on.')
}

export async function respond(
  text: string,
  read: Readers,
  opts: { env: Record<string, string | undefined>; now?: Date; companyKind?: string | null; permissions?: readonly string[] }
): Promise<Answer> {
  const intent = readAsk(text)

  switch (intent.kind) {
    case 'HELP':
      return { kind: 'TEXT', says: WHAT_I_ANSWER + (modelConfigured(opts.env) ? ' Anything else, I read from the ledger and say only what is on it.' : '') }

    case 'NEEDS':
      return today(read, { now: opts.now })

    case 'NEVER':
      return { kind: 'TEXT', ...neverSays(intent.act, opts.companyKind, opts.permissions) }

    case 'TIME_LIMIT': {
      const limits = await read.limits()
      if (!limits.ok) return { kind: 'TEXT', says: limits.says, links: limits.links }
      const rows = nearLimit(limits.entries, opts.now ?? new Date())
      return { kind: 'TIME_LIMIT', says: limitsSay(rows, day), rows }
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
      const oldest = weeks.rows.reduce<number | null>((d, r) => (d == null || r.waitingDays > d ? r.waitingDays : d), null)
      return {
        kind: 'WEEKS',
        says: weeksSay(weeks.total, oldest, weeks.company),
        rows: weeks.rows,
        more: Math.max(0, weeks.total - weeks.rows.length),
        links: [{ label: 'Open Timesheets', href: '/dashboard/timesheets' }],
      }
    }

    case 'WHY': {
      if (!intent.ref) return { kind: 'TEXT', says: 'Say which one: “Why 1” for the first thing waiting on you, or why and an entry.' }
      let ref = intent.ref
      if (/^\d+$/.test(ref)) {
        const item = findItem(await read.waiting(), ref)
        if (!item) return { kind: 'TEXT', says: `There is no item ${ref} waiting on you. Ask “What needs me?” to see the list.` }
        ref = item.entryId
      }
      const e = await read.entry(ref)
      if (!e) return { kind: 'TEXT', says: `There is no ledger entry “${intent.ref}” you can read. Check the entry, or ask “What needs me?”.` }
      return {
        kind: 'WHY',
        says: e.says,
        ruleCited: e.ruleCited,
        rationale: e.rationale,
        links: [
          { label: 'The ledger entry', href: entryHref(e.id) },
          ...(e.entityType === 'Invoice' || e.entityType === 'Person'
            ? [{ label: e.entityType === 'Invoice' ? 'The invoice receipt' : 'The person', href: hrefFor(e.entityType, e.entityId) }]
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
            : `“${intent.ref}” is not one of the ${items.length} thing${items.length === 1 ? '' : 's'} waiting on you. Ask “What needs me?” to see them by number.`,
        }
      }
      if (intent.decision === 'REJECTED' && !intent.reason) {
        return { kind: 'TEXT', says: `Say why, so whoever reads the twin’s ledger knows: “Reject ${item.n} because …”.` }
      }
      return { kind: 'CONFIRM', says: confirmSays(intent.decision, item, intent.reason), decision: intent.decision, reason: intent.reason, item }
    }

    case 'VARIANCE': {
      const q = quarterOf(opts.now ?? new Date())
      const rows = varianceBySupplier(await read.receiptsIn(q.from, q.to))
      return {
        kind: 'VARIANCE',
        says: varianceSays(rows, q.label),
        period: { from: q.from.toISOString().slice(0, 10), to: q.to.toISOString().slice(0, 10), label: q.label },
        rows,
      }
    }

    case 'ASK': {
      if (!modelConfigured(opts.env)) return { kind: 'TEXT', says: NO_MODEL }
      const lines = await read.ledgerLines()
      if (lines.length === 0) return { kind: 'TEXT', says: 'The twin’s ledger has nothing you can read yet, so there is nothing to describe. ' + WHAT_I_ANSWER }
      const said = await read.model(MODEL_SYSTEM, intent.text, ledgerContext(lines))
      if (!said) return { kind: 'TEXT', says: 'The model did not answer just now. ' + WHAT_I_ANSWER }
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
