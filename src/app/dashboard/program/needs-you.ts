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

/**
 * Whose book the queue on this page is — the clause, or nothing.
 *
 * ── What was wrong ───────────────────────────────────────────────────
 *
 * Aptiva Workforce holds one seat, at Cavanaugh Glassworks. Its program
 * page is headed "Workforce · Cavanaugh Glassworks", every figure on it
 * is Cavanaugh's, and "Yours today" offered "Ruben Ortega — 40h ·
 * Harlow Health" with an Approve button beside it. Nothing there is a
 * leak — Aptiva really is Ruben's supplier into Harlow Health, and the
 * week really is Aptiva's to accept. It is two books on one page with
 * nothing saying which is which, and the reader most likely to be
 * confused is the one holding the seat: a program manager signing what
 * they think is the client's week.
 *
 * `/api/decisions` answers for the caller's own company and only ever
 * has. A seat does not carry the client's queue — and that gap is worth
 * saying out loud on the screen rather than leaving a reader to work out
 * why the client's unsigned weeks are not here.
 *
 * ── Why a clause and not a filter ────────────────────────────────────
 *
 * Dropping the reader's own work off the page would hide real work with
 * an Approve button on it, and showing the client's would be a read of
 * the client's book that has to be logged against the seat — which is
 * the seat's whole discipline and a bigger piece of work than a
 * sentence. So the page says whose these are, and says what is not here.
 */
export function whoseQueue(reading: {
  /** The reader's own firm. */
  company?: string | null
  /** True when the page is being read from a seat somebody granted. */
  seated?: boolean
  /** Whose book the rest of the page is. */
  clientName?: string | null
}): string | null {
  if (!reading?.seated) return null
  const mine = reading.company?.trim()
  const theirs = reading.clientName?.trim()
  // Named, or nothing. A clause that says "somebody else's work" without
  // saying whose is a sentence a reader cannot act on.
  if (!mine || !theirs) return null
  return (
    `These are ${possessive(mine)} own to decide. The seat ${theirs} granted you does not ` +
    `carry ${possessive(theirs)} queue — its weeks are signed from its own desks.`
  )
}

/**
 * "Cavanaugh Glassworks'" and "Aptiva Workforce's".
 *
 * The same rule `lib/page-framing` uses, so a page carrying both
 * sentences does not spell one firm two ways.
 */
function possessive(name: string): string {
  return name.endsWith('s') ? `${name}'` : `${name}'s`
}

/**
 * What "Yours today" says when nothing is in the reader's queue — and it
 * must not contradict the headline above it.
 *
 * The tester read "2 things need you. 1 start is held up by paperwork. 1
 * supplier has people on site with no agreement on file." and, directly
 * under it, "Nothing is waiting on you." Both were computed honestly: the
 * box counted decisions and the headline counted everything. So when the
 * queue is empty and the headline is not, the box says where the things
 * the headline counted are, instead of saying there are none.
 */
export function emptyQueueSays(c: {
  counts: DeskCounts
  /** Approvals waiting on somebody else — the hiring managers who own them. */
  approvalsWithOthers: number
  /** Things already done today, shown under the box. */
  doneToday: number
}): string {
  const elsewhere: string[] = []
  if (c.counts.blockedStarts > 0) {
    elsewhere.push(`${plural(c.counts.blockedStarts, 'start', 'starts')} held up by paperwork, under Starting soon`)
  }
  if (c.counts.suppliersWithNoAgreement > 0) {
    elsewhere.push(
      `${plural(c.counts.suppliersWithNoAgreement, 'supplier', 'suppliers')} with no agreement on file, under Suppliers`
    )
  }
  const first = elsewhere.length > 0
    ? `No approvals or weeks to sign. What needs you is below: ${elsewhere.join('; ')}.`
    : c.doneToday > 0
      ? 'Queue clear. Everything below was done today.'
      : 'Every week is signed, every claim reviewed, every invoice inside its terms. Nothing is waiting on you.'
  if (c.approvalsWithOthers > 0) {
    const n = c.approvalsWithOthers
    return `${first} ${plural(n, 'approval', 'approvals')} ${n === 1 ? 'is' : 'are'} waiting on the hiring managers who own them`
  }
  return first
}

/**
 * The rows "Yours today" draws besides the decisions: one per start that
 * paperwork will refuse, one per supplier with people on site and no
 * agreement on file.
 *
 * ── One list, one count ──────────────────────────────────────────────
 *
 * The tester read "2 things need you" over a box saying "Nothing is
 * waiting on you" (2026-10-03), and then, once that sentence was fixed,
 * a box that pointed somewhere else for what the headline counted. The
 * headline adds up decisions, held starts and suppliers with no
 * agreement; the box under it now draws exactly those, so the number at
 * the top is the number of rows underneath. `deskCounts` counts these
 * same rows, so the two cannot drift apart.
 */
export interface DeskItem {
  key: string
  kind: 'START' | 'AGREEMENT'
  /** The short word in the row's left column. */
  label: string
  who: string
  says: string
  href: string
}

export function deskItems(input: {
  startingSoon: {
    contractId: string
    person: { name: string }
    vendor: { name: string; via?: string }
    paperwork: { outcome: 'PASS' | 'WARN' | 'BLOCK'; says: string; fix?: string | null }
  }[]
  vendors: { id: string; name: string; agreement?: boolean; headcount?: number }[]
}): DeskItem[] {
  const starts: DeskItem[] = input.startingSoon
    .filter((c) => c.paperwork.outcome === 'BLOCK')
    .map((c) => ({
      key: `start-${c.contractId}`,
      kind: 'START',
      label: 'Start held',
      who: `${c.person.name} — through ${c.vendor.via ?? c.vendor.name}`,
      says: c.paperwork.fix ? `${c.paperwork.says} ${c.paperwork.fix}` : c.paperwork.says,
      href: `/dashboard/placements/${c.contractId}`,
    }))
  const agreements: DeskItem[] = input.vendors
    // `=== false`, as in deskCounts: an unread answer is not a finding.
    .filter((v) => v.agreement === false)
    .map((v) => ({
      key: `agreement-${v.id}`,
      kind: 'AGREEMENT',
      label: 'No agreement',
      who: v.name,
      says:
        (v.headcount ?? 0) > 0
          ? `${plural(v.headcount!, 'person is', 'people are')} on site through ${v.name}, ` +
            'and no agreement with them is on file. Put one on file.'
          : `No agreement with ${v.name} is on file. Put one on file.`,
      href: '/dashboard/program/agreements',
    }))
  return [...starts, ...agreements]
}

/**
 * The line under the On site tile. The tile counts people working today;
 * the Contractors tab beside it counts them and anybody signed who has
 * not started, so the tile names the difference rather than leaving two
 * numbers for one question.
 */
export function onSiteSub(notStarted: number): string {
  return notStarted > 0
    ? `working today; ${notStarted} more signed, not started`
    : 'working today'
}
