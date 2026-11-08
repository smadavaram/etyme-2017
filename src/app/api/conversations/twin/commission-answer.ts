/**
 * "What did I earn in commission this period?" (founder, 2026-11-08:
 * "Commissions are made when account management team sells and when
 * recruiter teams actually recruit").
 *
 * Answered from money's commission rows on the lines (`commissionAccruals`
 * in lib/money/commission-accrual), never computed a second way here: the
 * figure is the row's own for the period, posted where the run posted it,
 * else what the accepted weeks earned under the cap. A row money cannot
 * stand behind is said as not worked out, with money's reason, and is
 * never added into a total. Two currencies are never added.
 *
 * Who hears whose, in money's rule (`commissionReader`): the Owner, a
 * Contract Manager and whoever reads payroll hear the firm's; anybody else
 * at the firm hears only their own; a client never hears a supplier's.
 *
 * Pure: no database, no request. The read is in ./read.
 */

import { format, fromMinor } from '@/lib/money'
import { formatDay } from '@/lib/format-date'

type Link = { label: string; href: string }

/** Payroll → Commissions, where every row is listed with what it earned. */
export const COMMISSIONS_HREF = '/dashboard/payroll/commissions'
export const COMMISSIONS_LINK: Link = { label: 'Open Commissions', href: COMMISSIONS_HREF }

/** A client buys and never pays its supplier's people: their commissions are the supplier's own. */
export const CLIENT_COMMISSION_REFUSAL =
  'A supplier’s commissions are its own business; Etyme never shows them to the company that pays it. Your invoice receipts show what each supplier bills you.'

export interface CommissionLine {
  /** The commission row on the line; a row read over several months is one line. */
  rowId?: string
  earnedById: string
  earnedBy: string
  kind: 'SALES' | 'RECRUITING'
  /** The person placed, where the row is on one placement. */
  person: string | null
  client: string | null
  /** For the period, in minor units; null where money cannot stand behind a figure. */
  amountMinor: number | null
  currency: string | null
  /** Money's reason where the figure is blank. */
  blankedBecause: string | null
}

export interface CommissionRead {
  /** What the seat reads: the firm's rows, or its own only (money's `commissionReader`). */
  reach: 'FIRM' | 'OWN'
  /** The period, as days: YYYY-MM-DD. */
  from: string
  to: string
  /** The period in the person's words, "last month", "this quarter so far"; the days follow it. */
  periodWords?: string | null
  /** The reader's own person. */
  selfId: string
  rows: CommissionLine[]
  /** Who reads other people's commissions here, by role, the reader's own left out. */
  readers: string[]
}

export type CommissionAsked = { whose: 'OWN' } | { whose: 'OTHERS'; name: string | null }

/**
 * Whether a question is about commission, and whose. Null where it is not
 * about commission at all. "What did I earn in commission?" is the
 * reader's own; "What did Ruth earn in commission?", "Who earned the most
 * commission?" and "Our commissions this month" are other people's.
 */
export function readCommission(raw: string): CommissionAsked | null {
  const lower = raw.trim().replace(/\s+/g, ' ').toLowerCase().replace(/[’‘]/g, "'")
  if (!/\bcommissions?\b/.test(lower)) return null
  // Where the page is, and who may see it, are other questions.
  if (/^(where|how do i (find|open|get to))\b/.test(lower)) return null
  if (/\bwho (can|may) (see|read)\b/.test(lower)) return null
  // A name in the possessive or after "did"/"does"/"has": "Ruth's commission", "What did Ruth Ellis earn".
  const named =
    raw.match(/\b([A-Z][a-zÀ-ɏ'-]+(?: [A-Z][a-zÀ-ɏ'-]+)?)['’]s commissions?\b/)?.[1] ??
    raw.match(/\b(?:did|does|has|is) ([A-Z][a-zÀ-ɏ'-]+(?: [A-Z][a-zÀ-ɏ'-]+)?) (?:earn|make|get|have|owed|due)\b/)?.[1] ??
    raw.match(/\bcommissions? (?:for|of) ([A-Z][a-zÀ-ɏ'-]+(?: [A-Z][a-zÀ-ɏ'-]+)?)\b/)?.[1] ??
    null
  const notAName = /^(I|We|You|They|The|This|Our|My|Etyme)$/
  if (named && !notAName.test(named.split(' ')[0])) return { whose: 'OTHERS', name: named }
  if (/\b(i|me|my|mine|myself)\b/.test(lower) && !/\b(everyone|everybody|each|every|team|recruiters|account managers|who)\b/.test(lower)) return { whose: 'OWN' }
  return { whose: 'OTHERS', name: null }
}

/** The rows a name picks out: the full name, else a first name only one person carries. Pure. */
export function rowsOfName(rows: readonly CommissionLine[], name: string): CommissionLine[] {
  const n = name.trim().toLowerCase()
  const full = rows.filter((r) => r.earnedBy.toLowerCase() === n)
  if (full.length) return full
  const ids = new Set(rows.filter((r) => r.earnedBy.toLowerCase().split(' ')[0] === n).map((r) => r.earnedById))
  return ids.size === 1 ? rows.filter((r) => ids.has(r.earnedById)) : []
}

function orNames(xs: readonly string[]): string {
  if (xs.length <= 1) return xs[0] ?? ''
  if (xs.length === 2) return `${xs[0]} or ${xs[1]}`
  return `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`
}

/** The refusal for another person's commissions, naming who reads them. One sentence. */
export function othersRefusal(readers: readonly string[]): string {
  const who = readers.length ? `your ${orNames(readers.slice(0, 3))}` : 'the Owner'
  return `What other people earn in commission is read by ${who}; ask them. You can ask what you earned.`
}

const money = (minor: number, currency: string) => format(fromMinor(minor, currency))

/** "a recruiting commission on Rajesh Iyer at Northbend Athletic, $640.00". */
function clause(r: CommissionLine): string {
  const on = r.person ? ` on ${r.person}${r.client ? ` at ${r.client}` : ''}` : r.client ? ` at ${r.client}` : ''
  const kind = r.kind === 'SALES' ? 'a sales commission' : 'a recruiting commission'
  if (r.amountMinor == null || !r.currency) {
    const why = r.blankedBecause?.trim().replace(/[.\s]*$/, '')
    return `${kind}${on}, not worked out${why ? ` because ${why[0].toLowerCase()}${why.slice(1)}` : ''}`
  }
  return `${kind}${on}, ${money(r.amountMinor, r.currency)}`
}

/** "$1,240.00", or "$1,240.00 and €300.00": each currency its own figure, never added together. */
export function totalsSay(rows: readonly CommissionLine[]): string | null {
  const by = new Map<string, number>()
  for (const r of rows) {
    if (r.amountMinor == null || !r.currency) continue
    by.set(r.currency, (by.get(r.currency) ?? 0) + r.amountMinor)
  }
  if (by.size === 0) return null
  const parts = [...by.entries()].map(([c, m]) => money(m, c))
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

function periodSays(from: string, to: string, words?: string | null): string {
  const range = `${formatDay(from, { year: false })} – ${formatDay(to, { year: false })}`
  return words ? `${words} (${range})` : range
}

function listed(rows: readonly CommissionLine[]): string {
  const shown = rows.slice(0, 3).map(clause)
  const more = rows.length - shown.length
  return `${shown.join('; ')}${more > 0 ? `; and ${more} more on Commissions` : ''}`
}

/** The reader's own commissions for the period, in one or two sentences. Pure. */
export function ownCommissionSays(read: Pick<CommissionRead, 'from' | 'to' | 'periodWords' | 'selfId' | 'rows'>): string {
  const mine = read.rows.filter((r) => r.earnedById === read.selfId)
  const when = periodSays(read.from, read.to, read.periodWords)
  if (mine.length === 0) return `You have no commission on the record for ${when}. Checked just now.`
  const total = totalsSay(mine)
  const lead = total ? `For ${when} you have earned ${total} in commission` : `For ${when} no commission of yours can be worked out yet`
  return `${lead}: ${listed(mine)}. Checked just now.`
}

/** Other people's commissions for the period, read at the firm's reach. Pure. */
export function firmCommissionSays(rows: readonly CommissionLine[], opts: { from: string; to: string; periodWords?: string | null; name: string | null }): string {
  const when = periodSays(opts.from, opts.to, opts.periodWords)
  if (opts.name && rows.length === 0) return `${opts.name} has no commission on the record for ${when}. Checked just now.`
  if (rows.length === 0) return `Nobody at your firm has a commission on the record for ${when}. Checked just now.`
  const people = [...new Set(rows.map((r) => r.earnedBy))]
  const one = people.length === 1
  const who = one ? people[0] : `${people.length} people`
  const total = totalsSay(rows)
  const lead = total ? `For ${when} ${who} earned ${total} in commission` : `For ${when} no commission of ${who} can be worked out yet`
  const shown = rows.slice(0, 3).map((r) => (one ? clause(r) : `${r.earnedBy}, ${clause(r)}`))
  const more = rows.length - shown.length
  return `${lead}: ${shown.join('; ')}${more > 0 ? `; and ${more} more on Commissions` : ''}. Checked just now.`
}

export type CommissionAnswer = { says: string; links: Link[]; rows: CommissionLine[] }

/**
 * The answer, from the read and the question. A seat that reads only its
 * own is refused another person's, in the sentence naming who reads them,
 * and its own figure is never widened. Pure.
 */
export function commissionAnswer(read: CommissionRead, asked: CommissionAsked): CommissionAnswer {
  const self = read.rows.filter((r) => r.earnedById === read.selfId)
  if (asked.whose === 'OWN') return { says: ownCommissionSays(read), links: [COMMISSIONS_LINK], rows: self }
  // Asking about oneself by name is one's own.
  if (asked.name) {
    const theirs = rowsOfName(read.rows, asked.name)
    if (theirs.length && theirs.every((r) => r.earnedById === read.selfId)) return { says: ownCommissionSays(read), links: [COMMISSIONS_LINK], rows: self }
  }
  if (read.reach !== 'FIRM') return { says: othersRefusal(read.readers), links: [], rows: [] }
  const rows = asked.name ? rowsOfName(read.rows, asked.name) : read.rows
  return { says: firmCommissionSays(rows, { from: read.from, to: read.to, periodWords: read.periodWords, name: asked.name }), links: [COMMISSIONS_LINK], rows }
}

/** The rows as a table inside the reply: who, what kind, on which placement, the figure. */
export function commissionTable(rows: readonly CommissionLine[]): { caption: string; head: string[]; rows: { cells: string[]; href: string }[] } {
  return {
    caption: 'Commissions this period',
    head: ['Earned by', 'Commission', 'On', 'This period'],
    rows: rows.slice(0, 20).map((r) => ({
      cells: [
        r.earnedBy,
        r.kind === 'SALES' ? 'Sales' : 'Recruiting',
        r.person ? `${r.person}${r.client ? ` at ${r.client}` : ''}` : r.client ?? '—',
        r.amountMinor != null && r.currency ? money(r.amountMinor, r.currency) : 'Not worked out',
      ],
      href: COMMISSIONS_HREF,
    })),
  }
}

// ── The period a person names ─────────────────────────────────────────
//
// A commission is worked out once per pay period, a calendar month, under
// the row's cap (money's `monthPeriod` and `commissionAccruals`). So a
// longer period is its months, each read by money as its own period and
// then added up per row; it is never read as one long period, which would
// apply a month's cap once to a quarter. A period that has not started, or
// one shorter than a month, is said as such and no figure is given.

/** One calendar month: the year and the month, 0 for January. */
export interface MonthKey { y: number; m: number }

export type CommissionWhen =
  | { kind: 'MONTHS'; months: MonthKey[]; words: string; from: string; to: string }
  | { kind: 'CANNOT'; says: string }

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10)
const add = (k: MonthKey, n: number): MonthKey => { const t = k.y * 12 + k.m + n; return { y: Math.floor(t / 12), m: ((t % 12) + 12) % 12 } }
const after = (a: MonthKey, b: MonthKey) => a.y * 12 + a.m > b.y * 12 + b.m

function span(first: MonthKey, last: MonthKey, words: string): CommissionWhen {
  const months: MonthKey[] = []
  for (let k = first; !after(k, last); k = add(k, 1)) months.push(k)
  return { kind: 'MONTHS', months, words, from: iso(first.y, first.m, 1), to: iso(last.y, last.m + 1, 0) }
}

/**
 * The period a commission question names, as the months money works it
 * out over, and the words the answer says it in. This month where none is
 * named. Pure.
 */
export function periodAsked(raw: string, today: Date): CommissionWhen {
  const lower = raw.toLowerCase().replace(/[’‘]/g, "'")
  const now: MonthKey = { y: today.getUTCFullYear(), m: today.getUTCMonth() }
  const qStart: MonthKey = { y: now.y, m: now.m - (now.m % 3) }
  if (/\b(next|coming) (month|quarter|year)\b/.test(lower)) {
    return { kind: 'CANNOT', says: 'That period has not started, so no commission is earned in it yet. Ask for this month, last month, a month by name, this quarter or this year.' }
  }
  if (/\b(this|last|past|previous) week\b|\b(today|yesterday)\b|\bweekly\b/.test(lower)) {
    return { kind: 'CANNOT', says: 'Commission is worked out by the month, so there is no figure for a week or a day. Ask for this month, last month, a month by name, this quarter or this year.' }
  }
  if (/\b(last|previous) quarter\b/.test(lower)) return span(add(qStart, -3), add(qStart, -1), 'last quarter')
  if (/\b(this|current) quarter\b|\bquarter to date\b|\bso far this quarter\b|\bqtd\b/.test(lower)) return span(qStart, now, now.m % 3 === 2 ? 'this quarter' : 'this quarter so far')
  if (/\b(last|previous) year\b/.test(lower)) return span({ y: now.y - 1, m: 0 }, { y: now.y - 1, m: 11 }, `${now.y - 1}`)
  if (/\b(this|current) year\b|\bso far this year\b|\byear to date\b|\bytd\b/.test(lower)) return span({ y: now.y, m: 0 }, now, 'so far this year')
  if (/\b(last|previous|past) month\b/.test(lower)) { const k = add(now, -1); return span(k, k, 'last month') }
  const named = lower.match(new RegExp(`\\b(${MONTHS.join('|')})(?:\\s+(\\d{4}))?\\b`))
  // "May I …" is not the month: May is read as the month only after "in", "for" or "of", or with its year.
  if (named && !(named[1] === 'may' && !named[2] && !/\b(in|for|during|of|over) may\b/.test(lower))) {
    const m = MONTHS.indexOf(named[1])
    const y = named[2] ? Number(named[2]) : m > now.m ? now.y - 1 : now.y
    const k: MonthKey = { y, m }
    if (after(k, now)) return { kind: 'CANNOT', says: `${MONTH_NAMES[m]} ${y} has not started, so no commission is earned in it yet.` }
    return span(k, k, k.y === now.y && k.m === now.m ? 'this month' : `${MONTH_NAMES[m]} ${y}`)
  }
  return span(now, now, 'this month')
}

/**
 * One period's lines from its months, added up per commission row: a row
 * whose figure money could not work out in any one month is not worked out
 * for the period, with that month's reason; never a partial sum said as
 * the whole. Pure.
 */
export function mergeMonths(perMonth: ReadonlyArray<readonly CommissionLine[]>): CommissionLine[] {
  const out = new Map<string, CommissionLine>()
  let n = 0
  for (const lines of perMonth) {
    for (const l of lines) {
      const key = l.rowId ?? `line-${n++}`
      const prev = out.get(key)
      if (!prev) { out.set(key, { ...l }); continue }
      if (prev.amountMinor == null) continue
      if (l.amountMinor == null || !l.currency) { out.set(key, { ...prev, amountMinor: null, blankedBecause: l.blankedBecause }); continue }
      out.set(key, { ...prev, amountMinor: prev.amountMinor + l.amountMinor, currency: prev.currency ?? l.currency })
    }
  }
  return [...out.values()]
}
