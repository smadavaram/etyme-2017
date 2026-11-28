/**
 * The cards the Etyme bot sends in Teams. Pure: facts in, card out.
 *
 * Three cards, each saying the thing, why it arrived and one action:
 *
 *   an invoice receipt to approve   amount, supplier, contractor, period,
 *                                   what does not match, the rule — and
 *                                   Approve · Reject · Why?
 *   a contractor near the time limit contractor, days left, supplier —
 *                                   Acknowledge · Escalate
 *   a bill to send                  the bill Ask Etyme drafted, in the rows
 *                                   the web card shows — Send bill · Not now
 *                                   · Open bill · Why?
 *   the nightly digest              "3 invoice receipts need approval ·
 *                                   1 contractor near the time limit", each with its own
 *                                   buttons, and never sent empty
 *
 * Every button sends data back to the bot and nothing else. The bot
 * hands an answer to the twin's one approval door (lib/teams/actions);
 * a card never writes anything itself.
 *
 * "Why?" opens the ledger entry's own words — its `ruleCited` and its
 * `rationale` — verbatim, never a paraphrase, because the reason a person
 * approved on is the reason an auditor reads back.
 *
 * The words are Etyme's (CLAUDE.md): invoice receipt, time limit,
 * supplier — never "vendor bill" or "tenure cap".
 */

import { amount } from '@/lib/money-display'
import { formatDay } from '@/lib/format-date'

export const CARD_CONTENT_TYPE = 'application/vnd.microsoft.card.adaptive'
const SCHEMA = 'http://adaptivecards.io/schemas/adaptive-card.json'
/** Teams renders 1.5 on desktop, web and mobile. */
const VERSION = '1.5'

/** What a button sends back. `etyme` names the act so nothing else is mistaken for one. */
export type CardAction =
  /** `as: 'bill'` where the button sends a bill, so the answer is said in the words the button used. */
  | { etyme: 'twin.approval'; approvalId: string; decision: 'APPROVED' | 'REJECTED'; reason?: string; as?: 'bill' | 'pay'
      /** What the person typed on a pay card: the bank reference and, optionally, the method. */
      answer?: { reference: string | null; method: string | null } }
  | { etyme: 'twin.why'; approvalId: string }
  | { etyme: 'tenure.ack'; twinActionId: string; personName?: string; tier?: string }

export interface InvoiceApprovalFacts {
  approvalId: string
  number: string | null
  supplierName: string | null
  contractors: string[]
  periodStart: string | null
  periodEnd: string | null
  /** Minor units. Null where the record does not carry a total. */
  amountMinor: number | null
  currency: string
  dueAt: string | null
  /** One sentence per thing that does not match, with the numbers. Empty when everything matches. */
  variances: string[]
  /** The ledger entry's own words. */
  ruleCited: string
  rationale: string
  /**
   * True where the twin asks to pay the receipt (`invoice_receipt.pay`),
   * not only to approve it: the card asks for the bank reference and a yes
   * records the payment through the one approval route.
   */
  pay?: boolean
}

export interface TenureAlertFacts {
  twinActionId: string
  personName: string
  tier: string
  daysToLimit: number
  limitOn: string | null
  daysOnSite: number | null
  capMonths: number | null
  suppliers: string[]
  ruleCited: string
  rationale: string
  /** A question the twin put about writing to the supplier, where there is one. */
  escalateApprovalId: string | null
  /** The person's page in Etyme, where escalating is done when there is no question to answer. */
  link: string | null
}

/**
 * A bill Ask Etyme drafted, waiting for somebody who sends bills. The
 * title and rows are the web card's own (`billCardTitle`, `billRows`), so
 * the two doors cannot word one bill two ways.
 */
export interface BillSendFacts {
  approvalId: string
  /** "Bill ready to send — Northbend Athletic, March 2026" */
  title: string
  /** "INV-0042 to Northbend Athletic", the bill as a list names it. */
  name: string
  rows: { label: string; value: string }[]
  /**
   * Why this person is asked where they otherwise would not be: the owner
   * Ask Etyme acts for, because nobody else at the firm sends bills.
   * Said under the title. Null for everybody else.
   */
  askedYouBecause: string | null
  ruleCited: string
  rationale: string
  /** The draft in Etyme, where it is edited. */
  link: string | null
}

/**
 * A bench person Ask Etyme would put forward (`bench.put_forward`,
 * 2026-10-29), as Teams shows it. The question, the match's reasons and
 * the band are the web card's own words. There is no yes in Teams: the
 * submission goes out in the recruiter's name from their own signed-in
 * session, so the card says the route's own sentence (PUT_FORWARD_SIGNED_IN)
 * and opens Ask Etyme on the web.
 */
export interface PutForwardFacts {
  approvalId: string
  /** "Put Felix Brenner forward for Java Developer at Northbend Athletic?" */
  question: string
  /** "Match 84 of 100, high confidence." Null where the reasons are not whole, so no score is shown. */
  scoreSays: string | null
  whyRows: { label: string; value: string }[]
  bandSays: string
  /** The approval route's sentence for a yes from Teams, word for word. */
  signedIn: string
  /** Ask Etyme on the web, where the rate is entered. */
  link: string | null
  ruleCited: string
  rationale: string
}

/** What "Keep it as a draft" records when the person gives no reason: true, and plain. */
export const BILL_NOT_NOW_REASON = 'Not now, said in Teams with no reason given. The draft stays on the Bills page.'

type Element = Record<string, unknown>

const text = (t: string, extra: Element = {}): Element => ({ type: 'TextBlock', text: t, wrap: true, ...extra })
const facts = (rows: [string, string][]): Element => ({ type: 'FactSet', facts: rows.map(([title, value]) => ({ title, value })) })

/** "Oct 4, 2026", through the one date door; null for nothing, or for a day it cannot read. */
function day(iso: string | null): string | null {
  if (!iso) return null
  try {
    return formatDay(iso)
  } catch {
    return null
  }
}

/** "Sep 28 – Oct 4, 2026" · "Oct 4, 2026" · null */
export function periodWords(start: string | null, end: string | null): string | null {
  const a = day(start)
  const b = day(end)
  if (a && b) {
    if (a === b) return a
    const sameYear = a.slice(-4) === b.slice(-4)
    return `${sameYear ? a.replace(/, \d{4}$/, '') : a} – ${b}`
  }
  return a ?? b
}

/** "Helena Marsh" · "Helena Marsh and Ravi Kumar" · "Helena Marsh, Ravi Kumar and 2 more" */
export function namesWords(names: readonly string[]): string | null {
  const n = [...new Set(names.filter(Boolean))]
  if (n.length === 0) return null
  if (n.length === 1) return n[0]
  if (n.length === 2) return `${n[0]} and ${n[1]}`
  return n.length === 3 ? `${n[0]}, ${n[1]} and ${n[2]}` : `${n[0]}, ${n[1]} and ${n.length - 2} more`
}

function adaptive(body: Element[], actions: Element[] = []): Element {
  return { $schema: SCHEMA, type: 'AdaptiveCard', version: VERSION, body, ...(actions.length ? { actions } : {}) }
}

/** A card as a Teams message. */
export function asMessage(card: Element, summary?: string): Record<string, unknown> {
  return {
    type: 'message',
    ...(summary ? { summary } : {}),
    attachments: [{ contentType: CARD_CONTENT_TYPE, content: card }],
  }
}

// ── Invoice receipt ───────────────────────────────────────────────────

function whyCard(ruleCited: string, rationale: string): Element {
  return adaptive([text('The rule', { weight: 'Bolder' }), text(ruleCited), text('Why', { weight: 'Bolder' }), text(rationale)])
}

/** Said under the reference box, and by the route to a yes with none: the same sentence. */
export const PAY_REFERENCE_NEEDED = 'Enter the bank reference, so you can reconcile this payment later.'

/**
 * Pay · Not now · Why? for a receipt the twin asks to pay: Pay opens one
 * box for the bank reference (required) and one for the method
 * (optional), and its submit carries both as the answer the chat card
 * sends. Not now is a recorded no with its plain reason.
 */
export function payActions(f: Pick<InvoiceApprovalFacts, 'approvalId' | 'ruleCited' | 'rationale'>): Element[] {
  const pay: CardAction = { etyme: 'twin.approval', approvalId: f.approvalId, decision: 'APPROVED', as: 'pay' }
  const later: CardAction = { etyme: 'twin.approval', approvalId: f.approvalId, decision: 'REJECTED', as: 'pay', reason: PAY_NOT_NOW_REASON }
  return [
    {
      type: 'Action.ShowCard', title: 'Pay',
      card: adaptive(
        [
          { type: 'Input.Text', id: 'reference', label: 'Bank reference', isRequired: true, errorMessage: PAY_REFERENCE_NEEDED, maxLength: 200, placeholder: 'For example: ACH 20261026-0451' },
          { type: 'Input.Text', id: 'method', label: 'Method (optional)', maxLength: 60, placeholder: 'ACH, wire or check' },
        ],
        [{ type: 'Action.Submit', title: 'Yes, pay it', style: 'positive', data: pay }],
      ),
    },
    { type: 'Action.Submit', title: 'Not now', data: later },
    { type: 'Action.ShowCard', title: 'Why?', card: whyCard(f.ruleCited, f.rationale) },
  ]
}

/** What a Not now on a pay card records when the person gives no reason. */
export const PAY_NOT_NOW_REASON = 'Not now, said in Teams with no reason given. The invoice receipt stays unpaid on its page.'

/** Approve · Reject · Why? for one question the twin asked; a pay question draws `payActions`. */
export function approvalActions(f: Pick<InvoiceApprovalFacts, 'approvalId' | 'ruleCited' | 'rationale'> & { pay?: boolean }): Element[] {
  if (f.pay) return payActions(f)
  const approve: CardAction = { etyme: 'twin.approval', approvalId: f.approvalId, decision: 'APPROVED' }
  const reject: CardAction = { etyme: 'twin.approval', approvalId: f.approvalId, decision: 'REJECTED' }
  return [
    { type: 'Action.Submit', title: 'Approve', style: 'positive', data: approve },
    {
      type: 'Action.ShowCard', title: 'Reject',
      card: adaptive(
        [
          text('Give a reason. It is recorded under your name.'),
          { type: 'Input.Text', id: 'reason', isMultiline: true, isRequired: true, errorMessage: 'Give a reason before rejecting.', placeholder: 'For example: the hours were not agreed' },
        ],
        [{ type: 'Action.Submit', title: 'Reject with this reason', style: 'destructive', data: reject }],
      ),
    },
    { type: 'Action.ShowCard', title: 'Why?', card: whyCard(f.ruleCited, f.rationale) },
  ]
}

function invoiceFacts(f: InvoiceApprovalFacts): Element[] {
  const rows: [string, string][] = [
    ['Amount', f.amountMinor == null ? 'Not on the invoice receipt' : amount(f.amountMinor, f.currency)],
    ['Supplier', f.supplierName ?? 'Not named on the invoice receipt'],
    ['Contractor', namesWords(f.contractors) ?? 'No hours line names anybody'],
    ['Period', periodWords(f.periodStart, f.periodEnd) ?? 'No period on the invoice receipt'],
  ]
  const due = day(f.dueAt)
  if (due) rows.push(['Due', due])
  return [
    facts(rows),
    text(f.variances.length ? 'What does not match' : 'Variance', { weight: 'Bolder', spacing: 'Medium' }),
    ...(f.variances.length
      ? f.variances.map((v) => text(`• ${v}`, { color: 'Attention' }))
      : [text('None. The hours match the approved timesheets, and the rate matches the contract.')]),
    text(`Rule: ${f.ruleCited}`, { isSubtle: true, spacing: 'Medium' }),
  ]
}

export function invoiceTitle(f: Pick<InvoiceApprovalFacts, 'number' | 'supplierName'> & { pay?: boolean }): string {
  if (f.pay) {
    const whose = f.supplierName ? `${/s$/i.test(f.supplierName) ? `${f.supplierName}\u2019` : `${f.supplierName}\u2019s`} invoice` : 'the invoice'
    return `Pay ${whose}${f.number ? ` ${f.number}` : ''}?`
  }
  const which = f.number ? `Invoice receipt ${f.number}` : 'An invoice receipt'
  return `${which}${f.supplierName ? ` from ${f.supplierName}` : ''} needs your approval`
}

/** The invoice approval card. */
export function invoiceApprovalCard(f: InvoiceApprovalFacts): Element {
  return adaptive(
    [text(invoiceTitle(f), { weight: 'Bolder', size: 'Medium' }), ...invoiceFacts(f)],
    approvalActions(f),
  )
}

// ── A bill to send ────────────────────────────────────────────────────

/** Send bill · Not now · Open bill · Why? for one bill Ask Etyme drafted. */
export function billActions(f: BillSendFacts): Element[] {
  const send: CardAction = { etyme: 'twin.approval', approvalId: f.approvalId, decision: 'APPROVED', as: 'bill' }
  const keep: CardAction = { etyme: 'twin.approval', approvalId: f.approvalId, decision: 'REJECTED', as: 'bill', reason: BILL_NOT_NOW_REASON }
  return [
    { type: 'Action.Submit', title: 'Send bill', style: 'positive', data: send },
    {
      type: 'Action.ShowCard', title: 'Not now',
      card: adaptive(
        [
          text('Why not now? Optional. The bill stays a draft, and your answer is recorded under your name.'),
          { type: 'Input.Text', id: 'note', isMultiline: true, placeholder: 'For example: I will send it with the expenses' },
        ],
        [{ type: 'Action.Submit', title: 'Keep it as a draft', data: keep }],
      ),
    },
    ...(f.link ? [{ type: 'Action.OpenUrl', title: 'Open bill', url: f.link }] : []),
    { type: 'Action.ShowCard', title: 'Why?', card: whyCard(f.ruleCited, f.rationale) },
  ]
}

function billFacts(f: BillSendFacts): Element[] {
  return [
    ...(f.askedYouBecause ? [text(f.askedYouBecause, { isSubtle: true, spacing: 'Small' })] : []),
    facts(f.rows.map((r) => [r.label, r.value])),
  ]
}

/** The bill card, sent on its own. */
export function billSendCard(f: BillSendFacts): Element {
  return adaptive([text(f.title, { weight: 'Bolder', size: 'Medium' }), ...billFacts(f)], billActions(f))
}

// ── A bench person to put forward ─────────────────────────────────────

/** Open Ask Etyme · Why? There is no yes here: see PutForwardFacts. */
export function putForwardActions(f: PutForwardFacts): Element[] {
  return [
    ...(f.link ? [{ type: 'Action.OpenUrl', title: 'Open Ask Etyme', url: f.link }] : []),
    { type: 'Action.ShowCard', title: 'Why?', card: whyCard(f.ruleCited, f.rationale) },
  ]
}

function putForwardFacts(f: PutForwardFacts): Element[] {
  return [
    ...(f.scoreSays ? [text(f.scoreSays, { isSubtle: true, spacing: 'Small' }), facts(f.whyRows.map((r) => [r.label, r.value]))] : []),
    text(f.bandSays, { isSubtle: true }),
    text(f.signedIn, { spacing: 'Medium' }),
  ]
}

/** The put-forward card, sent on its own. */
export function putForwardCard(f: PutForwardFacts): Element {
  return adaptive([text(f.question, { weight: 'Bolder', size: 'Medium' }), ...putForwardFacts(f)], putForwardActions(f))
}

// ── The time limit ────────────────────────────────────────────────────

export function tenureTitle(f: Pick<TenureAlertFacts, 'personName' | 'daysToLimit' | 'tier'>): string {
  if (f.daysToLimit < 0) return `${f.personName} is past the time limit`
  if (f.tier === 'BREACH' || f.daysToLimit <= 0) return `${f.personName} is at the time limit`
  return `${f.personName} is ${f.daysToLimit} day${f.daysToLimit === 1 ? '' : 's'} from the time limit`
}

function tenureActions(f: TenureAlertFacts): Element[] {
  const ack: CardAction = { etyme: 'tenure.ack', twinActionId: f.twinActionId, personName: f.personName, tier: f.tier }
  const out: Element[] = [{ type: 'Action.Submit', title: 'Acknowledge', data: ack }]
  if (f.escalateApprovalId) {
    const yes: CardAction = { etyme: 'twin.approval', approvalId: f.escalateApprovalId, decision: 'APPROVED' }
    out.push({ type: 'Action.Submit', title: 'Escalate', data: yes, tooltip: 'Approve Etyme writing to the supplier' })
  } else if (f.link) {
    out.push({ type: 'Action.OpenUrl', title: 'Escalate', url: f.link, tooltip: 'Open their time on site in Etyme' })
  }
  return out
}

function tenureFacts(f: TenureAlertFacts): Element[] {
  const rows: [string, string][] = [
    ['Contractor', f.personName],
    ['Days left', f.daysToLimit <= 0 ? 'None: at or past the limit' : String(f.daysToLimit)],
    ['Supplier', namesWords(f.suppliers) ?? 'No supplier on the record'],
  ]
  const on = day(f.limitOn)
  if (on) rows.push(['Limit reached on', on])
  if (f.daysOnSite != null) rows.push(['Days on site', String(f.daysOnSite)])
  return [facts(rows), text(`Rule: ${f.ruleCited}`, { isSubtle: true, spacing: 'Medium' })]
}

/** The time-limit card. */
export function tenureAlertCard(f: TenureAlertFacts): Element {
  return adaptive([text(tenureTitle(f), { weight: 'Bolder', size: 'Medium' }), ...tenureFacts(f)], tenureActions(f))
}

// ── The digest ────────────────────────────────────────────────────────

/** "1 bill to send · 3 invoice receipts need approval · 1 contractor near the time limit", or null when there is nothing. */
export function digestHeading(invoices: number, risks: number, bills = 0, of: { paying?: number; past?: number; putForward?: number } = {}): string | null {
  const parts: string[] = []
  const people = Math.max(0, of.putForward ?? 0)
  if (people > 0) parts.push(`${people} ${people === 1 ? 'person' : 'people'} from your bench to put forward`)
  // A receipt the twin asks to pay is titled as paying, never as an approval
  // (walk four, 2026-10-26: "3 invoice receipts need approval" over "Pay …?").
  const paying = Math.min(invoices, Math.max(0, of.paying ?? 0))
  const approving = invoices - paying
  // Past the limit is said as past, never as near (walk four: Anders Lund).
  const past = Math.min(risks, Math.max(0, of.past ?? 0))
  const near = risks - past
  if (bills > 0) parts.push(`${bills} bill${bills === 1 ? '' : 's'} to send`)
  if (paying > 0) parts.push(`${paying} invoice receipt${paying === 1 ? '' : 's'} to pay`)
  if (approving > 0) parts.push(`${approving} invoice receipt${approving === 1 ? ' needs' : 's need'} approval`)
  if (past > 0) parts.push(`${past} contractor${past === 1 ? '' : 's'} past the time limit`)
  if (near > 0) parts.push(`${near} contractor${near === 1 ? '' : 's'} near the time limit`)
  return parts.length ? parts.join(' · ') : null
}

/** The digest's heading from its own items: paying and approving told apart, past and near told apart. */
export function digestHeadingOf(invoices: readonly Pick<InvoiceApprovalFacts, 'pay'>[], risks: readonly Pick<TenureAlertFacts, 'daysToLimit'>[], bills: readonly unknown[] = [], putForward: readonly unknown[] = []): string | null {
  return digestHeading(invoices.length, risks.length, bills.length, {
    paying: invoices.filter((i) => i.pay).length,
    past: risks.filter((r) => r.daysToLimit < 0).length,
    putForward: putForward.length,
  })
}

/**
 * The nightly digest: one card, each item with its own buttons. Null
 * when there is nothing to say — an empty digest is never sent.
 */
export function digestCard(invoices: readonly InvoiceApprovalFacts[], risks: readonly TenureAlertFacts[], bills: readonly BillSendFacts[] = [], putForward: readonly PutForwardFacts[] = []): Element | null {
  const heading = digestHeadingOf(invoices, risks, bills, putForward)
  if (!heading) return null
  const body: Element[] = [text(heading, { weight: 'Bolder', size: 'Medium' })]
  for (const f of putForward) {
    body.push({
      type: 'Container', separator: true, spacing: 'Medium',
      items: [text(f.question, { weight: 'Bolder' }), ...putForwardFacts(f), { type: 'ActionSet', actions: putForwardActions(f) }],
    })
  }
  for (const f of bills) {
    body.push({
      type: 'Container', separator: true, spacing: 'Medium',
      items: [text(f.title, { weight: 'Bolder' }), ...billFacts(f), { type: 'ActionSet', actions: billActions(f) }],
    })
  }
  for (const f of invoices) {
    body.push({
      type: 'Container', separator: true, spacing: 'Medium',
      items: [text(invoiceTitle(f), { weight: 'Bolder' }), ...invoiceFacts(f), { type: 'ActionSet', actions: approvalActions(f) }],
    })
  }
  for (const f of risks) {
    body.push({
      type: 'Container', separator: true, spacing: 'Medium',
      items: [text(tenureTitle(f), { weight: 'Bolder' }), ...tenureFacts(f), { type: 'ActionSet', actions: tenureActions(f) }],
    })
  }
  return adaptive(body)
}

/** What replaces a card once it is answered, so nobody presses it twice. */
export function answeredCard(title: string, sentence: string): Element {
  return adaptive([text(title, { weight: 'Bolder' }), text(sentence)])
}

/** Read a button's data back, refusing anything that is not one of ours. */
export function readCardAction(value: unknown): CardAction | null {
  const v = value as Record<string, unknown> | null
  if (!v || typeof v !== 'object') return null
  const id = (k: string) => (typeof v[k] === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(v[k] as string) ? (v[k] as string) : null)
  if (v.etyme === 'twin.approval') {
    const approvalId = id('approvalId')
    const decision = v.decision === 'APPROVED' || v.decision === 'REJECTED' ? v.decision : null
    if (!approvalId || !decision) return null
    // "Not now" on a bill: what the person typed, else the sentence the button carries.
    const note = typeof v.note === 'string' && v.note.trim() ? v.note : null
    const reason = note ?? (typeof v.reason === 'string' ? v.reason : null)
    // A pay card's boxes: what the person typed, trimmed; a blank box is absent.
    const field = (k: string, max: number) => (typeof v[k] === 'string' && (v[k] as string).trim() ? (v[k] as string).trim().slice(0, max) : null)
    const answer = v.as === 'pay' && decision === 'APPROVED' ? { reference: field('reference', 200), method: field('method', 60) } : null
    return {
      etyme: 'twin.approval', approvalId, decision,
      ...(reason != null ? { reason: reason.slice(0, 2000) } : {}),
      ...(v.as === 'bill' ? { as: 'bill' as const } : v.as === 'pay' ? { as: 'pay' as const } : {}),
      ...(answer ? { answer } : {}),
    }
  }
  if (v.etyme === 'twin.why') {
    const approvalId = id('approvalId')
    return approvalId ? { etyme: 'twin.why', approvalId } : null
  }
  if (v.etyme === 'tenure.ack') {
    const twinActionId = id('twinActionId')
    if (!twinActionId) return null
    return {
      etyme: 'tenure.ack', twinActionId,
      ...(typeof v.personName === 'string' ? { personName: v.personName.slice(0, 200) } : {}),
      ...(typeof v.tier === 'string' ? { tier: v.tier.slice(0, 20) } : {}),
    }
  }
  return null
}
