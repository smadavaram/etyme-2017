/**
 * Whether a week's hours are already on a bill to the same firm, however
 * that bill was made.
 *
 * ── Why ──────────────────────────────────────────────────────────────
 *
 * A firm's bill to the firm above reaches the record two ways. It is
 * generated here, as an `Invoice` with a line per week; or the firm above
 * records it as an invoice receipt it was sent — a `VendorBill`, which
 * carries a period and a total and no lines. Generation only asked the
 * first: "not yet billed by us" meant no `InvoiceLine` of ours on the
 * week. So on 2026-09-30 Techpeple pressed Generate and billed Computer
 * Systems $16,992 for 144 hours, and its own check said "Nothing here has
 * been billed before" — while Computer Systems already held Techpeple's
 * invoice INV-CPRLJK for Aug 29 – Sep 26, approved, covering 120 of those
 * hours. $14,160 owed twice.
 *
 * ── The rule ─────────────────────────────────────────────────────────
 *
 * A bill never covers hours already on a bill to the same firm. A week
 * is read by its worked days. Every worked day inside the period of a
 * live invoice receipt the payer recorded from this firm — for this
 * person, or for nobody named — is already billed. All of them: the week
 * is left off and the sentence names the receipt. Some of them: the week
 * is left off too, and the sentence says which days, because a receipt
 * carries no lines and billing "the rest" would be a guess at what the
 * receipt holds. Nothing is apportioned.
 *
 * A receipt that names no line and no person could hold anybody's hours.
 * It is read as covering, and the sentence says it cannot tell, because
 * refusing a bill a person can clear is cheaper than paying twice.
 *
 * Pure: no database.
 */

export interface ReceiptOnRecord {
  number: string
  payerName: string
  /** YYYY-MM-DD, both ends inclusive. */
  periodStart: string
  periodEnd: string
  /** The people the receipt's line pays for; null where it names no line. */
  personIds: readonly string[] | null
}

export interface WeekToBill {
  personId: string
  personName: string
  /** { "2026-08-31": 8, … } */
  days: Record<string, number>
  periodStart: string
  periodEnd: string
}

export interface Cover {
  covered: 'WHOLE' | 'PART' | 'NONE'
  /** The receipts that hold any of the week's worked days. */
  receipts: string[]
  /** The worked days already on one of them. */
  days: string[]
  says: string | null
}

const plain = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export function billedElsewhere(week: WeekToBill, receipts: readonly ReceiptOnRecord[]): Cover {
  const worked = Object.entries(week.days)
    .filter(([, h]) => Number(h) > 0)
    .map(([d]) => d.slice(0, 10))
    .sort()
  // A week with no daily breakdown is read by its own dates.
  const days = worked.length > 0 ? worked : [week.periodStart.slice(0, 10), week.periodEnd.slice(0, 10)]

  const onIt = new Set<string>()
  const hit: ReceiptOnRecord[] = []
  for (const r of receipts) {
    if (r.personIds && !r.personIds.includes(week.personId)) continue
    const inside = days.filter((d) => d >= r.periodStart && d <= r.periodEnd)
    if (inside.length === 0) continue
    hit.push(r)
    for (const d of inside) onIt.add(d)
  }

  if (onIt.size === 0) return { covered: 'NONE', receipts: [], days: [], says: null }

  const whole = days.every((d) => onIt.has(d))
  const names = hit.map((r) => r.number)
  const payer = hit[0].payerName
  const unnamed = hit.some((r) => r.personIds === null)
  const which = names.length === 1 ? `invoice ${names[0]}` : `invoices ${names.join(' and ')}`
  const week_ = `${week.personName}’s week of ${plain(week.periodStart)}`
  const doubt = unnamed
    ? ` ${names.length === 1 ? 'It names' : 'One of them names'} no person, so it may hold these hours; cancel it or correct it if it does not.`
    : ''
  const covered = [...onIt].sort()
  const says = whole
    ? `${week_} is already on ${which}, which ${payer} recorded from you, so it is not billed again.${doubt}`
    : `${covered.map(plain).join(', ')} of ${week_} ${covered.length === 1 ? 'is' : 'are'} already on ${which}, ` +
      `which ${payer} recorded from you. The week is left off rather than split, because an invoice receipt ` +
      `carries no lines to say which hours it holds. Bill the rest by hand, or correct ${names.length === 1 ? 'that invoice' : 'those invoices'}.${doubt}`

  return { covered: whole ? 'WHOLE' : 'PART', receipts: names, days: covered, says }
}

/** A bill the supplier generated here, as the payer's intake reads it. */
export interface BillOnRecord {
  number: string
  vendorName: string
  lines: ReadonlyArray<{ personId: string; personName: string; days: Record<string, number> }>
}

/**
 * The other direction: an invoice receipt about to be recorded, over
 * days a bill the same supplier generated here already holds.
 *
 * The receipt carries a period and, where it is on a buy line, the
 * people that line pays. Any worked day of theirs inside the period on
 * a live generated bill is already owed once. Null where none is.
 */
export function alreadyOnABill(
  receipt: { periodStart: string; periodEnd: string; personIds: readonly string[] | null },
  bills: readonly BillOnRecord[]
): { bills: string[]; says: string } | null {
  const hits: { number: string; vendorName: string; person: string; days: string[] }[] = []
  for (const b of bills) {
    for (const l of b.lines) {
      if (receipt.personIds && !receipt.personIds.includes(l.personId)) continue
      const days = Object.entries(l.days)
        .filter(([d, h]) => Number(h) > 0 && d.slice(0, 10) >= receipt.periodStart && d.slice(0, 10) <= receipt.periodEnd)
        .map(([d]) => d.slice(0, 10))
        .sort()
      if (days.length > 0) hits.push({ number: b.number, vendorName: b.vendorName, person: l.personName, days })
    }
  }
  if (hits.length === 0) return null
  const first = hits[0]
  const numbers = [...new Set(hits.map((h) => h.number))]
  const span = first.days.length === 1 ? plain(first.days[0]) : `${plain(first.days[0])} – ${plain(first.days[first.days.length - 1])}`
  return {
    bills: numbers,
    says:
      `${first.person}’s hours for ${span} are already on ${first.vendorName}’s bill ${numbers.join(' and ')}, ` +
      `so recording this invoice would owe them twice. Pay that bill, or ask ${first.vendorName} to cancel it first.`,
  }
}

/** Another invoice receipt the payer holds from the same supplier, on the same buy line. */
export interface ReceiptAlready {
  number: string
  vendorName: string
  /** YYYY-MM-DD, both ends inclusive. */
  periodStart: string
  periodEnd: string
  receivedAt: string
  /**
   * Where the other receipt was typed in with lines, the weeks its hours
   * lines name — and those are the only weeks it holds, whatever its
   * period says: a receipt with one expense line over October holds no
   * week of October. Absent on a receipt typed in as a total, which holds
   * every worked day inside its period.
   */
  heldTimesheetIds?: readonly string[] | null
}

/** One week the payer accepted inside the receipt being recorded or paid. */
export interface AcceptedWeekRead {
  /** The timesheet, where the reader has it — what a receipt's hours line names. */
  id?: string
  personName: string | null
  /** { "2026-10-05": 8, … }, the days the buy line pays for. Null where the week has no daily breakdown. */
  days: Record<string, number> | null
  periodStart: string
  periodEnd: string
}

/**
 * The same supplier's work, received twice: a week this receipt bills
 * that another live receipt on the same buy line already holds.
 *
 * Release walk, 2026-10-18: Techpeple's $4,720 week for Helena Marsh was
 * received under TP-A, then again under TP-A2, and both were paid — the
 * number was the only thing the intake compared. A typed-in receipt
 * carries a period and a total and no lines, so the week is found from
 * the days: a worked day inside this receipt's period and inside the
 * other's is the same work on two receipts. A week with no daily
 * breakdown is read by its own dates, so it counts as held wherever its
 * dates meet the other receipt — refusing a receipt a person can clear is
 * cheaper than paying twice, the same rule as `billedElsewhere`.
 *
 * Pure: no database. Null where nothing is held twice.
 */
export function alreadyReceived(
  receipt: { periodStart: string; periodEnd: string },
  weeks: readonly AcceptedWeekRead[],
  others: readonly ReceiptAlready[]
): { number: string; says: string } | null {
  for (const w of weeks) {
    const worked = w.days
      ? Object.entries(w.days).filter(([, h]) => Number(h) > 0).map(([d]) => d.slice(0, 10))
      : [w.periodStart.slice(0, 10), w.periodEnd.slice(0, 10)]
    const mine = worked.filter((d) => d >= receipt.periodStart && d <= receipt.periodEnd)
    if (mine.length === 0) continue
    for (const o of others) {
      const holds = o.heldTimesheetIds != null
        ? w.id != null && o.heldTimesheetIds.includes(w.id)
        : mine.some((d) => d >= o.periodStart && d <= o.periodEnd)
      if (!holds) continue
      const whose = w.personName ? `${w.personName}’s week of ${plain(w.periodStart.slice(0, 10))}` : `The week of ${plain(w.periodStart.slice(0, 10))}`
      return { number: o.number, says: heldSays(whose, o) }
    }
  }
  return null
}

/**
 * The sentence refusing work another receipt already holds — a week, an
 * expense or a milestone — naming that receipt and when it came in.
 * `what` is the thing held, said as its subject: "Helena Marsh’s week of
 * Oct 11", "Helena Marsh’s travel expense of $250.00".
 */
export function heldSays(what: string, o: Pick<ReceiptAlready, 'number' | 'vendorName' | 'receivedAt'>): string {
  return (
    `${what} is already on ${o.vendorName}’s invoice ${o.number}, received ` +
    `${plainYear(o.receivedAt)}, so this invoice would owe it twice. Paying the same work twice is not ` +
    `a judgment call, so nobody can wave it through.`
  )
}

const plainYear = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
