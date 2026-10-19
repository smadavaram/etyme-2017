import { sign, read, baseUrl } from '@/lib/signed-link'
import { amount, rate } from '@/lib/money-display'
import { minorPerUnit } from '@/lib/money'
import { formatDay, formatRange } from '@/lib/format-date'
import { andList, hello, paragraphs } from '@/lib/notify/letters'
import type { DeliveryState } from '@/lib/notification-delivery'

/**
 * A bill reaching the firm that pays it — the words, the link and the
 * sentence the Bills page reads. No database in here.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * Tapin's first day (2026-10-19): a supplier whose client is not on
 * Etyme sent a bill, the bill moved to SUBMITTED, and nothing reached
 * the client. The supplier emailed it by hand. A bill nobody receives is
 * a bill nobody pays, and the aging clock started on a document sitting
 * in our own database.
 *
 * Two ways a bill reaches the payer, decided by whether the payer is on
 * Etyme (`Company.claimedAt`, lib/off-system):
 *
 *   ON ETYME   the seats that record payments there — the AP clerk — are
 *              told in the app and on their own channel (Teams where the
 *              firm set it up, email behind it). The notice opens the
 *              bill inside Etyme. No stranger's link is minted.
 *   NOT ON     the person the supplier recorded for that client is
 *              emailed one letter with one link: a read-only page of this
 *              bill, no sign-in, that dies 90 days after the due date.
 *
 * ── The rule this defends ────────────────────────────────────────────
 *
 * Every message names the thing, says why it arrived, and gives one
 * action. The letter's first line is the bill itself — whose, which,
 * for whom, which month, how many hours, how much, when it is due — in
 * the order an AP clerk reads it. The second line is the three-way
 * check said once: the weeks it is built from and who signed them. Then
 * the link. Then why this person got it. Nothing else: no pitch, no AI,
 * no line about what Etyme is.
 *
 * ── What the page never shows ────────────────────────────────────────
 *
 * The rate on each line is the rate on this bill — what the supplier
 * charges the firm reading it. Nothing of any rung below: no pay rate, no
 * sub-vendor's rate, no margin, no sub-vendor's name. The shaping here
 * takes only the fields it names, so a field added to the read later
 * cannot ride through to a stranger.
 */

// ── The link ──────────────────────────────────────────────────────────

/** The purpose a bill link is signed for, so no other link replays as one. */
export const BILL_LINK_KIND = 'bill-view'

/** How long after the due date a bill's link keeps opening. */
export const BILL_LINK_DAYS_AFTER_DUE = 90

const DAY_MS = 86_400_000

/**
 * A token for one bill and the one address it was sent to.
 *
 * The address rides inside, so every open is logged as that person's
 * read. A part may not carry a colon (lib/signed-link); an address that
 * does is not one this product sends to, so it is refused here rather
 * than signed into something that reads back as two parts.
 */
export function billLinkToken(invoiceId: string, to: string): string {
  const address = to.trim().toLowerCase()
  if (!invoiceId || invoiceId.includes(':') || !address || address.includes(':')) {
    throw new Error('A bill link names one bill and one address, neither with a colon in it.')
  }
  return sign(BILL_LINK_KIND, [invoiceId, address])
}

/** The bill and the address back, or null for anything that is not a bill link of ours. */
export function readBillLinkToken(token: string | null | undefined): { invoiceId: string; to: string } | null {
  const parts = read(BILL_LINK_KIND, token)
  if (!parts || parts.length !== 2 || !parts[0] || !parts[1]) return null
  return { invoiceId: parts[0], to: parts[1] }
}

/** The moment the link stops opening: the due date, plus ninety days. */
export function billLinkExpiresAt(dueAt: Date): Date {
  return new Date(dueAt.getTime() + BILL_LINK_DAYS_AFTER_DUE * DAY_MS)
}

/** Whether the link still opens. Read from the bill's due date as it stands now. */
export function billLinkOpen(dueAt: Date, now: Date): boolean {
  return now.getTime() < billLinkExpiresAt(dueAt).getTime()
}

/** Where the page lives. Null where this deployment does not know its address. */
export function billLinkUrl(token: string, base: string = baseUrl()): string | null {
  return base ? `${base.replace(/\/$/, '')}/answer/bill/${token}` : null
}

/** The page inside Etyme a payer on Etyme opens the bill on. */
export function billPageInEtyme(invoiceId: string): string {
  return `/dashboard/invoices/${invoiceId}`
}

// ── Saying a bill ─────────────────────────────────────────────────────

export interface BillFacts {
  /** The firm that raised it: "Tapin". */
  supplierName: string
  /** The firm it goes to: "Northbend Athletic". */
  clientName: string
  number: string
  /** The people on its hours lines, in the order they appear. */
  people: string[]
  periodStart: Date
  periodEnd: Date
  /** Hours across its hours lines. */
  hours: number
  /** `Invoice.total`, whole currency units. */
  total: number
  currency: string
  dueAt: Date
  /** How many signed weeks its hours lines rest on. */
  weeks: number
  /** The firm that signed those weeks, where one firm did. */
  signedBy: string | null
  /** Whether every one of those weeks carries the client's signature. */
  allSigned: boolean
  expenses: number
  milestones: number
}

/** "$11,600.00": a bill's total, always with its cents, because an AP clerk keys it in. */
export function billTotal(total: number, currency: string): string {
  return amount(Math.round(total * minorPerUnit(currency)), currency)
}

function hoursSaid(h: number): string {
  const n = Math.round(h * 100) / 100
  return `${n} ${n === 1 ? 'hour' : 'hours'}`
}

/** "October 2026" for a calendar month; "Oct 4 – Oct 17, 2026" otherwise. */
export function billPeriod(start: Date, end: Date): string {
  const s = start.toISOString().slice(0, 10)
  const nextDay = new Date(end.getTime() + DAY_MS)
  const wholeMonth =
    s.endsWith('-01') &&
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth() &&
    nextDay.getUTCDate() === 1
  if (wholeMonth) {
    return start.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' })
  }
  return formatRange(start, end)
}

function whoFor(people: string[]): string | null {
  const names = [...new Set(people.filter(Boolean))]
  if (names.length === 0) return null
  if (names.length <= 2) return andList(names)
  return `${names.length} people`
}

/**
 * "Tapin's bill IN-1042 for Helena Marsh, October 2026: 80 hours,
 * $11,600.00, due Dec 15, 2026" — the bill in one line, in the order an
 * AP clerk reads one. The subject of the letter, and its first sentence.
 */
export function billLine(f: BillFacts): string {
  const who = whoFor(f.people)
  const what = [f.hours > 0 ? hoursSaid(f.hours) : null, billTotal(f.total, f.currency), `due ${formatDay(f.dueAt)}`]
    .filter(Boolean)
    .join(', ')
  return `${f.supplierName}’s bill ${f.number}${who ? ` for ${who}` : ''}, ${billPeriod(f.periodStart, f.periodEnd)}: ${what}`
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * The three-way check, said once: what the bill rests on.
 *
 * "It is built from 2 weeks Northbend Athletic signed." Where the
 * signatures came from more than one firm, or none can be named, the
 * firm is left out rather than guessed.
 */
export function builtFrom(f: Pick<BillFacts, 'weeks' | 'signedBy' | 'expenses' | 'milestones'> & { allSigned?: boolean }): string | null {
  const parts: string[] = []
  if (f.weeks > 0) {
    // A week nobody signed is never called signed: the sentence drops the
    // word rather than claim a receipt the bill does not have.
    parts.push(
      f.allSigned === false ? count(f.weeks, 'week of hours', 'weeks of hours')
        : f.signedBy ? `${count(f.weeks, 'week', 'weeks')} ${f.signedBy} signed`
          : count(f.weeks, 'signed week', 'signed weeks')
    )
  }
  if (f.expenses > 0) parts.push(count(f.expenses, 'approved expense', 'approved expenses'))
  if (f.milestones > 0) parts.push(count(f.milestones, 'accepted milestone', 'accepted milestones'))
  return parts.length ? `It is built from ${andList(parts)}.` : null
}

export interface BillLetter {
  subject: string
  body: string
}

/**
 * The letter to the person a supplier recorded at a client that is not
 * on Etyme. Plain text, because the email goes as text; the link is a
 * line of its own so every mail client makes it clickable.
 */
export function billLetter(i: {
  facts: BillFacts
  contactName: string | null
  url: string
  expiresAt: Date
  /** The person who sent it, where a person did — the one to tell if this reached the wrong person. */
  sender: { name: string; email: string | null } | null
}): BillLetter {
  const f = i.facts
  const line = billLine(f)
  const tell = i.sender
    ? `${i.sender.name} at ${f.supplierName}${i.sender.email ? ` (${i.sender.email})` : ''}`
    : f.supplierName
  return {
    subject: line,
    body: paragraphs(
      hello(i.contactName),
      `${line}.`,
      [builtFrom(f), 'The link shows each line, the signed weeks and where to pay:'].filter(Boolean).join(' '),
      i.url,
      `You do not need an account. The link works until ${formatDay(i.expiresAt)}.`,
      `You are getting this because ${f.supplierName} recorded you as the person at ${f.clientName} ` +
        `who receives its bills. If that is wrong, tell ${tell}.`,
    ),
  }
}

/**
 * The notice to the seats that record payments at a client on Etyme. It
 * opens the bill inside Etyme, so it carries no link of its own: the
 * notice's page is the bill.
 */
export function billNotice(f: BillFacts): { title: string; body: string } {
  return {
    title: `${f.supplierName}’s bill ${f.number}: ${billTotal(f.total, f.currency)}, due ${formatDay(f.dueAt)}`,
    body: [
      `${billLine(f)}.`,
      builtFrom(f),
      'Open it to check the lines against the signed weeks, and record the payment there when it is paid.',
    ].filter(Boolean).join(' '),
  }
}

// ── The sentence the Bills page reads ─────────────────────────────────

/** One address or seat a bill went to, and what happened. */
export interface BillRecipient {
  /** An email address, or the seat's own address for a payer on Etyme. */
  address: string
  /** EMAIL to a stranger with a link; ETYME to a seat in the app and on its channel. */
  via: 'EMAIL' | 'ETYME'
  state: DeliveryState
  note: string
  /** For a seat: the person's name and their role there. */
  name?: string | null
  role?: string | null
}

/** What one sending of a bill did. Written once per sending, on the event log. */
export interface BillDelivery {
  invoiceId: string
  number: string
  clientName: string
  onEtyme: boolean
  resend: boolean
  at: string
  byPersonId: string | null
  to: BillRecipient[]
  /** Why nothing went, where nothing could. */
  why: string | null
}

const REACHED: ReadonlySet<DeliveryState> = new Set(['SENT'])

/** "Oct 19", with the year only where it is not this year. */
function onDay(d: Date, now: Date): string {
  return formatDay(d, { year: d.getUTCFullYear() !== now.getUTCFullYear() })
}

function rolesAt(to: BillRecipient[]): string {
  const roles = [...new Set(to.map((t) => t.role).filter((d): d is string => Boolean(d)))]
  return roles.length ? andList(roles) : 'team'
}

/**
 * The sentence for one sending.
 *
 *   "Sent to dana@acme.com on Oct 19"
 *   "Sent on Etyme to Northbend Athletic's AP Clerk on Oct 19"
 *   "Not emailed: no address is recorded for Larkspur Freight. …"
 *
 * Said only where it is true: an email the provider never took, or a demo
 * address nothing left for, never reads as sent.
 */
export function deliverySays(d: BillDelivery, now: Date): string {
  const at = new Date(d.at)
  const when = onDay(at, now)
  const again = d.resend ? ' again' : ''
  if (d.to.length === 0) return `Not sent: ${d.why ?? 'nobody to send it to.'}`

  if (d.onEtyme) {
    return `Sent${again} on Etyme to ${d.clientName}’s ${rolesAt(d.to)} on ${when}`
  }

  const went = d.to.filter((t) => REACHED.has(t.state)).map((t) => t.address)
  const stuck = d.to.filter((t) => !REACHED.has(t.state))
  const parts: string[] = []
  if (went.length) parts.push(`Sent${again} to ${andList(went)} on ${when}`)
  for (const t of stuck) {
    const why =
      t.state === 'DEMO_SKIPPED' ? 'it is a demo address, so nothing left'
        : t.state === 'NOT_CONFIGURED' ? 'email is not set up on this deployment, so nothing left'
          : `the email did not leave (${t.note})`
    parts.push(`Not emailed to ${t.address}: ${why}`)
  }
  return parts.join('. ')
}

/**
 * The sentence for a bill's whole history: the latest sending, and the
 * first where it was a different day. Null where the bill was never
 * sent to anybody by Etyme — the page then says nothing rather than
 * guess.
 */
export function billSentSays(history: BillDelivery[], now: Date): string | null {
  if (history.length === 0) return null
  const sorted = [...history].sort((a, b) => a.at.localeCompare(b.at))
  const last = sorted[sorted.length - 1]
  const first = sorted[0]
  const said = deliverySays(last, now)
  if (last === first || !last.resend) return said
  const firstReached = first.to.some((t) => REACHED.has(t.state))
  const firstDay = onDay(new Date(first.at), now)
  // "first sent Oct 19" beside "sent again on Oct 19" says nothing.
  return firstReached && firstDay !== onDay(new Date(last.at), now) ? `${said}; first sent ${firstDay}` : said
}

// ── The page ──────────────────────────────────────────────────────────

/** One line of the bill as the reader sees it. Only these fields, ever. */
export interface BillPageLine {
  kind: 'HOURS' | 'EXPENSE' | 'MILESTONE'
  person: string | null
  /** "Oct 4 – Oct 10, 2026" for a week; the description otherwise. */
  what: string
  hours: number | null
  /** The rate on this bill, "$145/hr". Null on a line with no rate. */
  rate: string | null
  amount: string
}

export interface BillPageWeek {
  person: string
  week: string
  hours: number
  /** "Signed by Dana Whitfield on Oct 12, 2026", "Approved by email: …", or "Signed Oct 12, 2026". */
  signed: string
}

export interface BillPageRemit {
  payTo: string
  method: string
  bank: string | null
  /** "ending 4421": the last four digits, never more. */
  account: string | null
}

export interface BillPageView {
  supplierName: string
  clientName: string
  number: string
  period: string
  status: string
  total: string
  due: string
  lines: BillPageLine[]
  weeks: BillPageWeek[]
  builtFrom: string | null
  remit: BillPageRemit | null
  /** For a payer on Etyme: where to record it. Null for a payer that is not. */
  recordOnEtyme: string | null
  expiresOn: string
}

/** What the shaping reads. Named fields only; anything else on the row is ignored. */
export interface BillPageInput {
  supplierName: string
  clientName: string
  clientOnEtyme: boolean
  invoiceId: string
  number: string
  status: string
  total: number
  paid: number
  currency: string
  periodStart: Date
  periodEnd: Date
  dueAt: Date
  lines: {
    hours: number
    rateCents: number
    amountCents: number
    description: string | null
    personName: string | null
    week: { start: Date; end: Date } | null
    expense: boolean
    milestone: boolean
  }[]
  weeks: { person: string; start: Date; end: Date; hours: number; signedAt: Date | null; signer: string | null; byEmail: boolean }[]
  signedBy: string | null
  remit: { legalName: string; paymentMethod: string; bankName: string | null; accountLast4: string | null } | null
}

const METHOD_WORDS: Record<string, string> = { ACH: 'ACH bank transfer', WIRE: 'Wire transfer', CHECK: 'Check' }

/** The last four digits of whatever was stored, and never more. */
export function lastFour(stored: string | null | undefined): string | null {
  const digits = (stored ?? '').replace(/\D/g, '')
  return digits.length ? digits.slice(-4) : null
}

function statusSays(i: Pick<BillPageInput, 'status' | 'paid' | 'total' | 'currency'>): string {
  switch (i.status) {
    case 'PAID': return 'Paid'
    case 'PARTIALLY_PAID': return `Part paid: ${billTotal(i.paid, i.currency)} of ${billTotal(i.total, i.currency)}`
    case 'CANCELLED': return 'Cancelled'
    default: return 'Waiting for payment'
  }
}

function signedSays(w: BillPageInput['weeks'][number]): string {
  if (!w.signedAt) return 'Signed'
  const on = formatDay(w.signedAt)
  if (w.signer && w.byEmail) return `Approved by email: ${w.signer}, ${on}`
  if (w.signer) return `Signed by ${w.signer} on ${on}`
  return `Signed ${on}`
}

export function billPageView(i: BillPageInput, now: Date): BillPageView {
  const lines: BillPageLine[] = i.lines.map((l) => {
    const kind: BillPageLine['kind'] = l.expense ? 'EXPENSE' : l.milestone ? 'MILESTONE' : 'HOURS'
    const isHours = kind === 'HOURS'
    return {
      kind,
      person: l.personName,
      what: isHours && l.week ? formatRange(l.week.start, l.week.end) : (l.description ?? (l.expense ? 'Expense' : 'Milestone')),
      hours: isHours ? Math.round(l.hours * 100) / 100 : null,
      rate: isHours && l.rateCents > 0 ? rate(l.rateCents, i.currency) : null,
      amount: amount(l.amountCents, i.currency),
    }
  })
  return {
    supplierName: i.supplierName,
    clientName: i.clientName,
    number: i.number,
    period: billPeriod(i.periodStart, i.periodEnd),
    status: statusSays(i),
    total: billTotal(i.total, i.currency),
    due: formatDay(i.dueAt),
    lines,
    weeks: i.weeks.map((w) => ({ person: w.person, week: formatRange(w.start, w.end), hours: Math.round(w.hours * 100) / 100, signed: signedSays(w) })),
    builtFrom: builtFrom({
      weeks: i.weeks.length,
      signedBy: i.signedBy,
      allSigned: i.weeks.every((w) => w.signedAt != null),
      expenses: lines.filter((l) => l.kind === 'EXPENSE').length,
      milestones: lines.filter((l) => l.kind === 'MILESTONE').length,
    }),
    remit: i.remit
      ? {
          payTo: i.remit.legalName,
          method: METHOD_WORDS[i.remit.paymentMethod] ?? i.remit.paymentMethod,
          bank: i.remit.bankName,
          account: lastFour(i.remit.accountLast4) ? `ending ${lastFour(i.remit.accountLast4)}` : null,
        }
      : null,
    recordOnEtyme: i.clientOnEtyme ? billPageInEtyme(i.invoiceId) : null,
    expiresOn: formatDay(billLinkExpiresAt(i.dueAt)),
  }
}

// ── Refusals ──────────────────────────────────────────────────────────

export const BILL_LINK_NOT_OURS = 'This link is not one of ours, or the bill it named is gone. Ask whoever sent it for a new one.'

export function billLinkClosedSays(i: { number: string; supplierName: string; expiresAt: Date }): string {
  return `This link to bill ${i.number} ran out on ${formatDay(i.expiresAt)}, ${BILL_LINK_DAYS_AFTER_DUE} days after the bill was due. Ask ${i.supplierName} for a copy.`
}

export function billCancelledSays(i: { number: string; supplierName: string }): string {
  return `${i.supplierName} cancelled bill ${i.number}, so there is nothing to pay on it.`
}
