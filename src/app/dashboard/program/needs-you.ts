/**
 * What the client's desk says needs somebody, counted over everything
 * the same screen shows.
 *
 * ── Why this is a file and not a `.length` ───────────────────────────
 *
 * The release walk of 2026-09-21 opened Cavanaugh Glassworks and read
 * "Nothing needs you today." at the top of a page that went on to say,
 * six inches below, that Samuel Adeyinka cannot start without proof of
 * right to work in nine days and that Wrenfield Technical has a person
 * on site with no agreement on file. The headline was counting the
 * approval queue and calling that the desk.
 *
 * A headline that denies what the page shows is worse than no headline,
 * because a program manager who reads "nothing" twice stops reading it
 * at all — and the two things it was denying are the two with a legal
 * consequence: a start that will be refused, and somebody working
 * without paper between the firms.
 *
 * So the count is everything on the page that wants a person:
 *
 *   - a decision in the queue — the approvals, the weeks to sign, the
 *     bills in dispute; what the headline already counted
 *   - a start that paperwork will stop. A WARN is not counted: it says
 *     something and refuses nobody, and a control that fires on every
 *     row teaches everybody to route around it
 *   - a supplier with people on site and no agreement on file, which is
 *     one thing to fix however many people are under it
 *
 * Nothing here reads a database and nothing here fetches: the page has
 * all three lists already, and this is arithmetic over them.
 */

export interface DeskCounts {
  /** Decisions waiting on this desk. */
  queue: number
  /** Of those, the ones carrying an exception — a flag, a disputed bill. */
  exceptions: number
  /** Starts that paperwork will refuse on the day. */
  blockedStarts: number
  /** Suppliers with somebody on site and no agreement on file. */
  suppliersWithNoAgreement: number
}

export interface DeskHeadline {
  /** Everything on the page that needs somebody. */
  total: number
  /** The sentence itself, with no markup in it. */
  says: string
}

/** The three lists the page draws, reduced to what the sentence needs. */
export function deskCounts(input: {
  decisions: { urgency?: string | null; flag?: unknown; type?: string | null }[]
  startingSoon: { paperwork: { outcome: 'PASS' | 'WARN' | 'BLOCK' } }[]
  vendors: { agreement?: boolean; headcount?: number }[]
}): DeskCounts {
  return {
    queue: input.decisions.length,
    exceptions: input.decisions.filter((d) => d.flag || d.type === 'BILL_DISPUTED').length,
    blockedStarts: input.startingSoon.filter((c) => c.paperwork.outcome === 'BLOCK').length,
    // `agreement === false` is the page's own test: undefined means the
    // answer was never read, and counting an unknown as a finding is how
    // a number nobody can stand behind gets onto a screen.
    suppliersWithNoAgreement: input.vendors.filter((v) => v.agreement === false).length,
  }
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * The sentence at the top of the client's desk.
 *
 * Every clause names what it counted, because "3 things need you" over a
 * page with one approval on it is the same lie facing the other way.
 */
export function deskHeadline(c: DeskCounts): DeskHeadline {
  const total = c.queue + c.blockedStarts + c.suppliersWithNoAgreement
  if (total === 0) return { total, says: 'Nothing needs you today.' }

  const parts: string[] = [`${plural(total, 'thing needs', 'things need')} you.`]
  if (c.exceptions > 0) {
    parts.push(`${c.exceptions} ${c.exceptions === 1 ? 'has an exception' : 'have exceptions'}.`)
  }
  if (c.blockedStarts > 0) {
    parts.push(`${plural(c.blockedStarts, 'start is', 'starts are')} held up by paperwork.`)
  }
  if (c.suppliersWithNoAgreement > 0) {
    parts.push(
      `${plural(c.suppliersWithNoAgreement, 'supplier has', 'suppliers have')} people on site with no agreement on file.`
    )
  }
  return { total, says: parts.join(' ') }
}
