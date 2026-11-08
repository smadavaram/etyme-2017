/**
 * What each person earned in commission, by month, from what was posted.
 *
 * Grouped by the person, the month the posting landed in, and the
 * currency. Until 2026-11-08 the Commissions page grouped by person and
 * month only and added every posting's amount under the first posting's
 * currency, so a recruiter paid in dollars on one placement and in rupees
 * on another read one figure that was neither. Rupees and dollars are
 * never added: a person paid in two currencies in one month reads two
 * totals, each on its own line, each with only its own postings under it.
 *
 * No database here.
 */

export interface PostingRead {
  amountCents: number
  currency: string
  postedAt: Date
  says: string | null
  person: { id: string; name: string } | null
  projectOrder: { code: string } | null
}

export interface Earning {
  personId: string | null
  name: string
  /** The month, "2026-11". */
  period: string
  /** One currency per row; a second currency in the same month is a second row. */
  currency: string
  amountCents: number
  lines: { says: string; amountCents: number; order: string }[]
}

export function earningsByPersonMonth(postings: readonly PostingRead[]): Earning[] {
  const byKey = new Map<string, Earning>()
  for (const p of postings) {
    const period = p.postedAt.toISOString().slice(0, 7)
    const currency = p.currency.toUpperCase()
    const key = `${p.person?.id ?? 'none'}:${period}:${currency}`
    const row = byKey.get(key) ?? {
      personId: p.person?.id ?? null,
      name: p.person?.name ?? 'Unattributed',
      period, currency, amountCents: 0, lines: [],
    }
    row.amountCents += p.amountCents
    row.lines.push({ says: p.says ?? '', amountCents: p.amountCents, order: p.projectOrder?.code ?? '—' })
    byKey.set(key, row)
  }
  return [...byKey.values()].sort((a, b) =>
    b.period.localeCompare(a.period) || a.name.localeCompare(b.name) || a.currency.localeCompare(b.currency))
}

/** How many person-months the rows cover, whatever the number of currencies in them. */
export function personMonths(earnings: readonly Earning[]): number {
  return new Set(earnings.map((e) => `${e.personId ?? 'none'}:${e.period}`)).size
}
