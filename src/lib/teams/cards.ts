/**
 * The cards the Etyme bot sends in Teams. Pure: facts in, card out.
 *
 * Three cards, each saying the thing, why it arrived and one action:
 *
 *   an invoice receipt to approve   amount, supplier, contractor, period,
 *                                   what does not match, the rule — and
 *                                   Approve · Reject · Why?
 *   a time-limit risk               contractor, days left, supplier —
 *                                   Acknowledge · Escalate
 *   the nightly digest              "3 invoice receipts need approval ·
 *                                   1 time-limit risk", each with its own
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

export const CARD_CONTENT_TYPE = 'application/vnd.microsoft.card.adaptive'
const SCHEMA = 'http://adaptivecards.io/schemas/adaptive-card.json'
/** Teams renders 1.5 on desktop, web and mobile. */
const VERSION = '1.5'

/** What a button sends back. `etyme` names the act so nothing else is mistaken for one. */
export type CardAction =
  | { etyme: 'twin.approval'; approvalId: string; decision: 'APPROVED' | 'REJECTED'; reason?: string }
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

type Element = Record<string, unknown>

const text = (t: string, extra: Element = {}): Element => ({ type: 'TextBlock', text: t, wrap: true, ...extra })
const facts = (rows: [string, string][]): Element => ({ type: 'FactSet', facts: rows.map(([title, value]) => ({ title, value })) })

function day(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
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

/** Approve · Reject · Why? for one question the twin asked. */
export function approvalActions(f: Pick<InvoiceApprovalFacts, 'approvalId' | 'ruleCited' | 'rationale'>): Element[] {
  const approve: CardAction = { etyme: 'twin.approval', approvalId: f.approvalId, decision: 'APPROVED' }
  const reject: CardAction = { etyme: 'twin.approval', approvalId: f.approvalId, decision: 'REJECTED' }
  return [
    { type: 'Action.Submit', title: 'Approve', style: 'positive', data: approve },
    {
      type: 'Action.ShowCard', title: 'Reject',
      card: adaptive(
        [
          text('Say why. Your reason is kept in the twin’s ledger beside your name.'),
          { type: 'Input.Text', id: 'reason', isMultiline: true, isRequired: true, errorMessage: 'Say why before rejecting.', placeholder: 'For example: the hours were not agreed' },
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
      : [text('None. The hours and the rate agree with what was accepted and the contract.')]),
    text(`Rule: ${f.ruleCited}`, { isSubtle: true, spacing: 'Medium' }),
  ]
}

export function invoiceTitle(f: Pick<InvoiceApprovalFacts, 'number' | 'supplierName'>): string {
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

// ── The time limit ────────────────────────────────────────────────────

export function tenureTitle(f: Pick<TenureAlertFacts, 'personName' | 'daysToLimit' | 'tier'>): string {
  if (f.tier === 'BREACH' || f.daysToLimit <= 0) return `${f.personName} is at the time limit`
  return `${f.personName} is ${f.daysToLimit} day${f.daysToLimit === 1 ? '' : 's'} from the time limit`
}

function tenureActions(f: TenureAlertFacts): Element[] {
  const ack: CardAction = { etyme: 'tenure.ack', twinActionId: f.twinActionId, personName: f.personName, tier: f.tier }
  const out: Element[] = [{ type: 'Action.Submit', title: 'Acknowledge', data: ack }]
  if (f.escalateApprovalId) {
    const yes: CardAction = { etyme: 'twin.approval', approvalId: f.escalateApprovalId, decision: 'APPROVED' }
    out.push({ type: 'Action.Submit', title: 'Escalate', data: yes, tooltip: 'Approve the twin writing to the supplier' })
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

/** "3 invoice receipts need approval · 1 time-limit risk", or null when there is nothing. */
export function digestHeading(invoices: number, risks: number): string | null {
  const parts: string[] = []
  if (invoices > 0) parts.push(`${invoices} invoice receipt${invoices === 1 ? ' needs' : 's need'} approval`)
  if (risks > 0) parts.push(`${risks} time-limit risk${risks === 1 ? '' : 's'}`)
  return parts.length ? parts.join(' · ') : null
}

/**
 * The nightly digest: one card, each item with its own buttons. Null
 * when there is nothing to say — an empty digest is never sent.
 */
export function digestCard(invoices: readonly InvoiceApprovalFacts[], risks: readonly TenureAlertFacts[]): Element | null {
  const heading = digestHeading(invoices.length, risks.length)
  if (!heading) return null
  const body: Element[] = [text(heading, { weight: 'Bolder', size: 'Medium' })]
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
    return { etyme: 'twin.approval', approvalId, decision, ...(typeof v.reason === 'string' ? { reason: v.reason.slice(0, 2000) } : {}) }
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
