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
 * Nothing here reads a database and nothing here fetches. Since
 * 2026-10-13 all three are rows of the one queue (`GET /api/decisions`),
 * so the page's headline, the Ask Etyme mark and the greeting say one
 * number; this is arithmetic over that queue.
 */

export interface DeskCounts {
  /** Everything waiting on this desk: the queue's length, which is the total. */
  queue: number
  /** Of those, the ones carrying an exception — a flag, a disputed bill. */
  exceptions: number
  /** Of those, starts that paperwork will refuse on the day. */
  blockedStarts: number
  /** Of those, suppliers with somebody on site and no agreement on file. */
  suppliersWithNoAgreement: number
}

export interface DeskHeadline {
  /** Everything on the page that needs somebody. */
  total: number
  /** The sentence itself, with no markup in it. */
  says: string
}

/**
 * The queue, reduced to what the sentence needs.
 *
 * ── One number, 2026-10-13 ───────────────────────────────────────────
 *
 * This used to add the page's own held starts and suppliers with no
 * agreement on top of the queue, so the dashboard said one number and the
 * Ask Etyme mark — which reads `GET /api/decisions` — said another. Both
 * kinds are in the queue now (START_HELD, NO_AGREEMENT), built from
 * `deskItems` below by the route, for the desk that may act on each. So
 * the total is the queue's length and nothing else, and the clauses name
 * what in it is which.
 */
export function deskCounts(input: {
  decisions: { urgency?: string | null; flag?: unknown; type?: string | null }[]
}): DeskCounts {
  return {
    queue: input.decisions.length,
    exceptions: input.decisions.filter((d) => d.flag || d.type === 'BILL_DISPUTED').length,
    blockedStarts: input.decisions.filter((d) => d.type === 'START_HELD').length,
    suppliersWithNoAgreement: input.decisions.filter((d) => d.type === 'NO_AGREEMENT').length,
  }
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * What one row of the queue is about, said as a noun phrase: whose it is
 * and what it is. "Ingrid Sørensen's start", "Teleworld's missing
 * agreement", "the HCM integration lead job request".
 *
 * `whose` is a person or a firm and takes the possessive; where nobody
 * owns the thing (a job request, a question from Ask Etyme) it is null
 * and `what` is the whole phrase. `whats` is the plural, so five weeks of
 * one person's are said once as "Marcus Oyelaran's five weeks".
 */
export interface Named {
  whose: string | null
  what: string
  whats: string
}

/** A row of `GET /api/decisions`, as far as the headline reads it. */
export interface QueueRow {
  type?: string | null
  title?: string | null
  /** What the row is about, set by the route that wrote the row. */
  named?: Named | null
  urgency?: string | null
  flag?: unknown
}

/** The thing each kind of row is about, where the route did not say. */
const THING: Record<string, [string, string]> = {
  TIMESHEET_APPROVAL: ['week', 'weeks'],
  EXPENSE_APPROVAL: ['expense', 'expenses'],
  EXPENSE_ACCEPTANCE: ['expense', 'expenses'],
  ROLLOFF_ACTION: ['last day', 'last days'],
  SUBMISSION_REVIEW: ['submission', 'submissions'],
  SUPPLIER_REVIEW: ['supplier review', 'supplier reviews'],
  CONTRACT_PAPERING: ['contract', 'contracts'],
  CONTRACT_START: ['start', 'starts'],
  START_HELD: ['start', 'starts'],
  NO_AGREEMENT: ['missing agreement', 'missing agreements'],
  BILL_DISPUTED: ['invoice receipt', 'invoice receipts'],
  INVOICE_OVERDUE: ['overdue bill', 'overdue bills'],
  RATE_CONFIRMATION: ['rate', 'rates'],
}

/**
 * The phrase for one row. The route names every row it writes
 * (`named`); this reads that, and only where a row carries none — an
 * older client, a test — does it fall back on the row's own title, whose
 * shapes are written in the same route.
 */
export function namedFor(row: QueueRow): Named {
  if (row.named && row.named.what) return row.named
  const type = row.type ?? ''
  const title = (row.title ?? '').trim()
  if (type === 'TWIN_QUESTION') {
    return { whose: null, what: 'a question from Ask Etyme', whats: 'questions from Ask Etyme' }
  }
  if (type === 'REQUISITION_APPROVAL') {
    const job = title.split(' — ').slice(1).join(' — ').trim()
    return job
      ? { whose: null, what: `the ${job} job request`, whats: 'job requests' }
      : { whose: null, what: 'a job request', whats: 'job requests' }
  }
  const thing = THING[type]
  // "Ingrid Sørensen — through Teleworld" names the person first; every
  // "Approve timesheet — Omar Haddad" names them after the dash.
  const who = type === 'START_HELD'
    ? title.split(' — ')[0]?.trim()
    : type === 'NO_AGREEMENT'
      ? title
      : title.includes(' — ') ? title.split(' — ').slice(1).join(' — ').trim() : ''
  if (thing && who) return { whose: who, what: thing[0], whats: thing[1] }
  if (thing) return { whose: null, what: `a ${thing[0]}`, whats: thing[1] }
  return { whose: null, what: 'one more thing', whats: 'more things' }
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

/** "five" up to ten, then the figure: how a person says a count aloud. */
export function countWord(n: number): string {
  return n >= 0 && n < WORDS.length ? WORDS[n] : String(n)
}

/**
 * "Cavanaugh Glassworks’" and "Aptiva Workforce’s", with the curly apostrophe
 * the chat and the page print, so the greeting, the mark and the page say
 * one identical sentence.
 *
 * The same rule `lib/page-framing` uses, so a page carrying both
 * sentences does not spell one firm two ways.
 */
export function possessive(name: string): string {
  return name.endsWith('s') ? `${name}’` : `${name}’s`
}

function phrase(n: Named, count: number): string {
  if (count === 1) return n.whose ? `${possessive(n.whose)} ${n.what}` : n.what
  return n.whose ? `${possessive(n.whose)} ${countWord(count)} ${n.whats}` : `${count} ${n.whats}`
}

/** "A", "A, and B", "A, B, and C" — the comma before the last "and" every time. */
function list(parts: string[]): string {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`
}

/**
 * The sentence at the top of the client's Today page — one sentence,
 * with the names in it.
 *
 * ── Names, not counts. The founder, 2026-10-19 ──────────────────────
 *
 * It read "2 things need you. 1 start is held up by paperwork. 1 supplier
 * has people on site with no agreement on file." — three sentences, and
 * not one name a program manager could act on without reading further.
 * Now: "Two things need you: Ingrid Sørensen's start, and Teleworld's
 * missing agreement." Up to three things are each named; past three the
 * first two are named and the rest are "and n more". The same person's
 * or firm's same kind of thing is said once ("Marcus Oyelaran's five
 * weeks"), and counts toward the total as five.
 *
 * Built from the queue's own rows, so the number in it is the queue's
 * length: the same number the Ask Etyme mark and the greeting read from
 * `GET /api/decisions`, which returns this sentence too.
 */
export function deskHeadline(queue: readonly QueueRow[]): DeskHeadline {
  const total = queue.length
  if (total === 0) return { total, says: 'Nothing needs you today.' }

  // One phrase per person-and-thing, in the queue's own order.
  const groups: { named: Named; count: number }[] = []
  for (const row of queue) {
    const n = namedFor(row)
    const same = groups.find((g) => g.named.whose === n.whose && g.named.what === n.what)
    if (same) same.count++
    else groups.push({ named: n, count: 1 })
  }

  const lead = `${countWord(total).replace(/^./, (c) => c.toUpperCase())} ${total === 1 ? 'thing needs' : 'things need'} you`
  if (groups.length <= 3) {
    return { total, says: `${lead}: ${list(groups.map((g) => phrase(g.named, g.count)))}.` }
  }
  const named = groups.slice(0, 2)
  const rest = total - named.reduce((sum, g) => sum + g.count, 0)
  return {
    total,
    says: `${lead}: ${list([...named.map((g) => phrase(g.named, g.count)), `${rest} more`])}.`,
  }
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
 * The rows for a start that paperwork will refuse and a supplier with
 * people on site and no agreement on file. Pure, so `GET /api/decisions`
 * builds its START_HELD and NO_AGREEMENT rows from these sentences and
 * the page draws them from the queue like any other row.
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
  /** What the headline calls it: "Ingrid Sørensen's start". */
  named: Named
}

export function deskItems(input: {
  startingSoon: {
    contractId: string
    person: { name: string }
    vendor: { name: string; via?: string }
    /**
     * `short` is the row's own sentence, where the start is held by
     * papers alone: the person is already named in `who`, so the row
     * says what is missing once and what to do once (`heldStartSays` in
     * app/api/program/desk-findings). Where it is absent — a license or a
     * supplier's cover holds the start — the clearance's own sentence.
     */
    paperwork: { outcome: 'PASS' | 'WARN' | 'BLOCK'; says: string; fix?: string | null; short?: string | null }
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
      says: c.paperwork.short
        ? c.paperwork.short
        : c.paperwork.fix ? `${c.paperwork.says} ${c.paperwork.fix}` : c.paperwork.says,
      href: `/dashboard/placements/${c.contractId}`,
      named: { whose: c.person.name, what: 'start', whats: 'starts' },
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
      named: { whose: v.name, what: 'missing agreement', whats: 'missing agreements' },
    }))
  return [...starts, ...agreements]
}

/**
 * The queue rows for those items, in the shape `GET /api/decisions`
 * returns every row in. One builder, read by the decision queue for a
 * client's own seat and by the program page for a seat another company
 * granted (`programQueue` in app/api/program), so a held start is one row
 * whichever door it reached.
 */
export function deskRows(
  items: DeskItem[],
  startOf: Map<string, Date>,
  now: Date
): {
  type: 'START_HELD' | 'NO_AGREEMENT'
  title: string
  subtitle: string
  named: Named
  urgency: 'HIGH' | 'MEDIUM'
  entityType: string
  entityId: string
  dueDate: string | null
  actionUrl: string
  amount: null
  createdAt: string
}[] {
  return items.map((item) => {
    const contractId = item.kind === 'START' ? item.key.replace(/^start-/, '') : null
    const startsOn = contractId ? startOf.get(contractId) ?? null : null
    return {
      type: item.kind === 'START' ? 'START_HELD' : 'NO_AGREEMENT',
      title: item.who,
      subtitle: item.says,
      named: item.named,
      // Neither has waited on anybody yet, so neither reads as "waited
      // more than five days"; a start inside a week is the one that is.
      urgency: startsOn && startsOn.getTime() - now.getTime() <= 7 * 86_400_000 ? 'HIGH' : 'MEDIUM',
      entityType: item.kind === 'START' ? 'SELL_CONTRACT' : 'COMPANY',
      entityId: contractId ?? item.key.replace(/^agreement-/, ''),
      dueDate: startsOn ? startsOn.toISOString() : null,
      actionUrl: item.href,
      amount: null,
      createdAt: (startsOn ?? now).toISOString(),
    }
  })
}

/**
 * The time beside a row under "Done today", or "today".
 *
 * A seeded row and a start carry a day, not a moment: midnight UTC, which
 * read "12:00 AM" on Cavanaugh's page as though somebody had acted at
 * midnight. A row stamped exactly at midnight UTC says "today"; every
 * other row is given to the clock the page passes in.
 */
export function doneAt(iso: string, clock: (iso: string) => string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return 'today'
  const midnight = at.getUTCHours() === 0 && at.getUTCMinutes() === 0 && at.getUTCSeconds() === 0 && at.getUTCMilliseconds() === 0
  return midnight ? 'today' : clock(iso)
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

/**
 * The row's sentence for a start held by papers, said once.
 *
 * ── What it replaced, 2026-10-19 ─────────────────────────────────────
 *
 * The row read "Ingrid Sørensen cannot start without proof of right to
 * work (I-9, checked with E-Verify). Get proof of right to work (I-9,
 * checked with E-Verify) on file, then activate." — the person named a
 * second time under her own name, and the paper named twice in full. The
 * clearance's sentence is right for a page that stands alone; a queue row
 * already says who in its first line. So the row says what is missing
 * once, the paper's acronym once and its plain name once, and what to do
 * in four words: "Cannot start without an I-9 (proof of right to work).
 * Get it on file, then activate."
 *
 * Only where papers alone hold the start. A license or a supplier's cover
 * that holds it has its own sentence — it names a number, a board, a
 * certificate — and returns null here, so the row keeps that one. Who
 * asked for an item, where it was the client's own order and not the
 * floor, still travels with it, because that is the half that says whom
 * to call.
 */
export interface HeldItem {
  key?: string
  label: string
  said?: string
  from?: 'DEFAULT' | 'ORDER' | 'LINE'
  asked?: string
  waived?: boolean
  waivedSays?: string | null
}

const RIGHT_TO_WORK = new Set(['RIGHT_TO_WORK', 'I9_EVERIFY'])
const RIGHT_TO_WORK_LABELS = new Set(['Proof of right to work', 'I-9 and E-Verify'])
const isRightToWork = (i: HeldItem) =>
  (i.key ? RIGHT_TO_WORK.has(i.key) : false) || RIGHT_TO_WORK_LABELS.has(i.label)

/**
 * An item inside the sentence. The route passes the clearance's own
 * phrase as `said` (`sentencePhrases` in lib/contract-clearance), so a
 * license names its board and a form keeps its capitals; a bare label is
 * lowercased only where it does not open on a form's name.
 */
function inRow(i: HeldItem): string {
  if (i.said) return i.said
  const l = i.label.trim()
  return /^[A-Z0-9-]{2,}\b/.test(l) ? l : l.charAt(0).toLowerCase() + l.slice(1)
}

export function heldStartSays(c: {
  outcome: 'PASS' | 'WARN' | 'BLOCK'
  blocking: HeldItem[]
  licenseBlocks: boolean
  coverBlocks: boolean
}): string | null {
  if (c.outcome !== 'BLOCK' || c.licenseBlocks || c.coverBlocks || c.blocking.length === 0) return null
  const phrases: string[] = []
  let rightToWork = false
  for (const i of c.blocking) {
    if (isRightToWork(i)) {
      if (!rightToWork) phrases.push('an I-9 (proof of right to work)')
      rightToWork = true
      continue
    }
    phrases.push(inRow(i))
  }
  const missing = phrases.length <= 1
    ? phrases.join('')
    : `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`
  const asked = c.blocking
    .filter((i) => i.from && i.from !== 'DEFAULT' && i.asked)
    .map((i) => `${i.label} is ${i.asked}.`)
  const refusedWaivers = c.blocking
    .filter((i) => i.waivedSays && !i.waived)
    .map((i) => i.waivedSays!.trim().replace(/([^.])$/, '$1.'))
  return [
    `Cannot start without ${missing}. Get ${phrases.length === 1 ? 'it' : 'them'} on file, then activate.`,
    ...asked,
    ...refusedWaivers,
  ].join(' ')
}
