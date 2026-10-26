import { hasPermission, hasAnyPermission } from '@/lib/permissions'
import { ENDING_SOON_READERS } from '@/lib/releasing-soon'
import { formatDay } from '@/lib/format-date'

/**
 * A selling firm's Today page, in words: who may read which part of it,
 * and the sentences it is drawn with. No database and no React, so the
 * page, the route behind it and a test all read the same answer.
 *
 * ── The founder, 2026-10-19 ──────────────────────────────────────────
 *
 * "Nine links, no flip, and every first screen names a person": *a
 * firm's Today page reads what a firm asks on a Tuesday: billing this
 * month, signed and not yet billed, rolling off in 30 days, on the bench,
 * each with the names.* The page it replaces opened on "0.03 good
 * submissions a day, per job · target 5", "Cost per submission: free", a
 * pipeline estimate and the system's own activity log — numbers about
 * the product, not about the firm's people.
 *
 * The figures themselves are computed elsewhere and never here: billing
 * and the unbilled weeks are money's (`firmTuesday` in
 * lib/money/firm-today), who rolls off is read through supply's
 * `releasing` (lib/releasing-soon), who is on the bench through supply's
 * `benchSpell` (lib/bench-profit), and the bills still unpaid through the
 * receivable book (`loadBook` in app/api/ar/book). This file says them.
 */

/** Which parts of the page a seat reads, asked the way their routes ask. */
export interface TodayReads {
  /**
   * "Billing this month" and the figure beside each client. Every line of
   * it is a person's bill rate times their hours, and a supplier's own
   * seat reads a bill rate only with the price permission
   * (`canReadBillRate` in lib/permissions) — the same gate the Pipeline
   * tile had.
   */
  billing: boolean
  /** "Signed, not yet billed" and the unpaid bills: the receivable book's readers (`RECEIVABLE` in lib/money/desks). */
  bills: boolean
  /** Who is where and who rolls off: the readers of Ending soon (`ENDING_SOON_READERS`). */
  people: boolean
  /** The bench, read by whoever reads consultants, as the bench page is. */
  bench: boolean
  /**
   * Send on a drafted bill: the one permission the send route asks for
   * (`POST /api/invoices/:id/submit` gates on `invoices.issue`), so the
   * button is drawn only for a seat the route would let send it. Computed
   * by the route from the caller's own seat, never by the screen from its
   * session, so the two cannot disagree (second production walk,
   * 2026-10-26: Brightmoor's Owner holds it, so the Owner may send). What
   * the route still asks after the permission — a bill this firm raised,
   * matching its order and signed weeks — is answered by the route in a
   * sentence when Send is pressed, because the match writes and a read
   * may not.
   */
  send: boolean
}

/** The permission the bill-send route asks for. One name, read by Today and checked against the route by a test. */
export const SEND_BILL_PERMISSION = 'invoices.issue' as const

export function todayReads(permissions: readonly string[] | null | undefined, kind?: string | null): TodayReads {
  if (permissions == null) return { billing: false, bills: false, people: false, bench: false, send: false }
  return {
    billing: hasPermission(permissions, 'margin.read'),
    bills: hasPermission(permissions, 'invoices.read'),
    people: hasAnyPermission(permissions, ENDING_SOON_READERS),
    // A program office places nobody and runs no bench, whatever its seat
    // holds (lib/dashboard-reads, sign-up walk round three, item 15).
    bench: kind !== 'MSP' && hasPermission(permissions, 'consultants.read'),
    send: hasPermission(permissions, SEND_BILL_PERMISSION),
  }
}

/** Said where a part of the page is not this seat's to read, in place of a zero. */
export const NOT_YOURS_TODAY = {
  billing: 'Not yours to see: what the firm bills opens for the roles that read rates.',
  bills: 'Not yours to see: bills open for the roles that read them, Accounts Receivable and Finance.',
  people: 'Not yours to see: who is where opens for the roles that staff and run the firm’s work.',
  bench: 'Not yours to see: the bench opens for the roles that read consultants.',
} as const

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "Rolls off Northbend Athletic in 14 days · last day Nov 2, 2026", without the capital. */
export function rollOffSays(r: { client: string | null; days: number; lastDay: string; started?: boolean }): string {
  const when = r.days <= 0 ? 'today' : r.days === 1 ? 'tomorrow' : `in ${r.days} days`
  const where = r.client ? ` ${r.client}` : ''
  return [`rolls off${where} ${when}`, `last day ${formatDay(r.lastDay)}`, r.started ? 'roll-off started' : null]
    .filter(Boolean)
    .join(' · ')
}

/** "Felix Brenner, last day Nov 6": the name and the day, the year said where it is not this year's. */
export function lastDaySays(r: { name: string; lastDay: string }, asOf: string): string {
  const sameYear = r.lastDay.slice(0, 4) === asOf.slice(0, 4)
  return `${r.name}, last day ${formatDay(r.lastDay, { year: !sameYear })}`
}

/**
 * "Karthik Menon, since Sep 30" — the day they joined the bench, never a
 * count of days in a chip. The year is said where it is not this year's.
 */
export function benchSays(r: { name: string; since: string }, asOf: string): string {
  const sameYear = r.since.slice(0, 4) === asOf.slice(0, 4)
  return `${r.name}, since ${formatDay(r.since, { year: !sameYear })}`
}

/**
 * The one line under the headline: the picture of the firm today.
 * "5 people billing at 2 clients. 2 roll off within 30 days. 1 on the
 * bench. 3 weeks signed and not yet billed." A part the seat may not read
 * is left out rather than said as a zero.
 */
export function pictureLine(p: {
  /** People on site today, and the clients they are at; null where the seat reads neither. */
  onSite: { people: number; clients: number } | null
  rollingOff: number | null
  bench: number | null
  signedWeeks: number | null
}): string {
  const parts: string[] = []
  if (p.onSite) {
    parts.push(
      p.onSite.people === 0
        ? 'Nobody is billing today.'
        : `${plural(p.onSite.people, 'person', 'people')} billing at ${plural(p.onSite.clients, 'client')}.`
    )
  }
  if (p.rollingOff != null) {
    parts.push(
      p.rollingOff === 0
        ? 'Nobody rolls off within 30 days.'
        : `${p.rollingOff} roll${p.rollingOff === 1 ? 's' : ''} off within 30 days.`
    )
  }
  if (p.bench != null) parts.push(p.bench === 0 ? 'Nobody on the bench.' : `${p.bench} on the bench.`)
  if (p.signedWeeks != null) {
    parts.push(
      p.signedWeeks === 0
        ? 'Every signed week is billed.'
        : `${plural(p.signedWeeks, 'week')} signed and not yet billed.`
    )
  }
  return parts.join(' ')
}

/** Rows grouped by the client they are at, in the order of the client's name. Groups keep their rows' order. */
export function byClient<T>(rows: readonly T[], clientOf: (r: T) => string): { client: string; rows: T[] }[] {
  const groups = new Map<string, T[]>()
  for (const r of rows) {
    const c = clientOf(r)
    groups.set(c, [...(groups.get(c) ?? []), r])
  }
  return [...groups.entries()]
    .map(([client, rs]) => ({ client, rows: rs }))
    .sort((a, b) => a.client.localeCompare(b.client))
}

/**
 * "Rosa Delgado, 30 weeks · Ravi Subramanian, 1 week": whose weeks a
 * client's unbilled figure is made of, each person once, in the order
 * they first appear.
 */
export function weeksByPerson(weeks: readonly { personName: string }[]): string {
  const counts = new Map<string, number>()
  for (const w of weeks) counts.set(w.personName, (counts.get(w.personName) ?? 0) + 1)
  return [...counts.entries()].map(([name, n]) => `${name}, ${plural(n, 'week')}`).join(' · ')
}

/** A row of `GET /api/decisions`, as far as this page reads it. */
export interface QueueRowIn {
  type: string
  title: string
  subtitle: string
  entityId: string
  actionUrl: string
  dueDate?: string | null
  named?: { whose: string | null; what: string } | null
  flag?: unknown
  clientDecided?: unknown
}

/** Somebody rolling off, as this page reads them (see the route's `rollingOff`). */
export interface RollingOffIn {
  contractId: string
  client: string | null
  days: number
  lastDay: string
  started: boolean
}

/** The one thing a row's button does, through a route that already does it. */
export interface RowAct {
  label: string
  /** POST, always: every act here is one route that already exists. */
  url: string
  /** What the button says while the route is working. */
  busy: string
}

export interface QueueRowView {
  key: string
  /** Who the row is about, by name. */
  who: string
  /** What is in front of them, in words. */
  says: string
  /** The plain primary button, where one existing route does the act. */
  act: RowAct | null
  /** Where "Look" goes, and where the row goes when it has an act too. */
  href: string
}

/**
 * One row of "Yours to decide", by name, with its act.
 *
 * A row gets a button only where a single existing route does the whole
 * act and asks nothing more of the reader:
 *  - a roll-off nobody has started, for a seat that may end placements
 *    (`POST /api/contracts/:id/rolloff`, `assignments.terminate`);
 *  - a week to approve or accept that carries no flag and no overtime
 *    decided above (`POST /api/timesheets/:id/approve`) — a flagged week
 *    asks a reason, which is the week's own page.
 * Everything else is "Look", which opens where the row is worked.
 */
export function queueRowView(
  row: QueueRowIn,
  rolling: ReadonlyMap<string, RollingOffIn>,
  may: { terminate: boolean }
): QueueRowView {
  const key = `${row.type}-${row.entityId}`
  const who = row.named?.whose ?? (row.title.includes(' — ') ? row.title.split(' — ').slice(1).join(' — ') : row.title)

  if (row.type === 'ROLLOFF_ACTION') {
    const r = rolling.get(row.entityId)
    const says = r
      ? rollOffSays(r)
      : row.dueDate
        ? `rolls off · last day ${formatDay(row.dueDate)}`
        : 'rolls off soon'
    const act = r && !r.started && may.terminate
      ? { label: 'Start roll-off', url: `/api/contracts/${row.entityId}/rolloff`, busy: 'Starting…' }
      : null
    return { key, who, says, act, href: row.actionUrl }
  }

  if (row.type === 'TIMESHEET_APPROVAL') {
    const accept = /^Accept\b/.test(row.title)
    const plain = !row.flag && !row.clientDecided
    return {
      key,
      who,
      // The queue says its units in words (app/api/decisions/words), so the row prints what it wrote.
      says: `${accept ? 'week to accept' : 'week to approve'} · ${row.subtitle}`,
      act: plain
        ? { label: accept ? 'Accept' : 'Approve', url: `/api/timesheets/${row.entityId}/approve`, busy: accept ? 'Accepting…' : 'Approving…' }
        : null,
      href: row.actionUrl,
    }
  }

  return { key, who, says: row.subtitle, act: null, href: row.actionUrl }
}
