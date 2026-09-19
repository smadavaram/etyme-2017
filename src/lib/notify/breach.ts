/**
 * What we say when something leaked, and what we say to ourselves while
 * the clock is running.
 *
 * ── Why the words are written before the incident ────────────────────
 *
 * Because they will not be written well during one. A breach notice
 * drafted at eleven at night by whoever is awake is the one that says
 * "we take the security of your data extremely seriously", tells nobody
 * what actually happened, and is read by a journalist the following
 * week. The shape below is the one a good company sends: what happened,
 * what was in it, what we did, what you should do, who to ask. Five
 * headings, no apology theater, no legalese.
 *
 * ── The clocks are inputs, not constants ─────────────────────────────
 *
 * There are two: one to the supervisory authority and one to the people
 * affected. How long each runs is a legal question in every jurisdiction
 * this touches, and CLAUDE.md is explicit that a legal period invented by
 * an engineer is worse than a blank. So a clock arrives here with its
 * deadline already decided by whoever is entitled to decide it, and this
 * file says how long is left, how late it is, and who owns sending it.
 *
 * ── A nudge has a cost, and this one has the highest ─────────────────
 *
 * A clock that warns every hour is a clock somebody mutes on the second
 * day of the worst week of their year. `warningsDue` sends exactly two
 * per clock: one a day out, one when it is missed. Nothing in between,
 * and nothing at all once the notice has gone.
 *
 * Owned by etyme-conversation. Pure — the incident models and the routes
 * are etyme-regulatory's, and nothing here touches a database.
 */

import {
  andList, bullets, hello, moment, notice, paragraphs, remaining,
  type Audience, type Notice,
} from '@/lib/notify/letters'

/** The two notices a breach owes, and each is owed to somebody different. */
export type ClockId =
  /** The regulator. */
  | 'AUTHORITY'
  /** The people whose records were in it. */
  | 'PEOPLE'

export interface Clock {
  id: ClockId
  /**
   * When it runs out. Decided by counsel or by the policy they wrote,
   * never here: this file has no opinion on how many hours a
   * jurisdiction allows.
   */
  dueAt: Date
  /** The named person who owns sending it. A clock owned by nobody is missed. */
  owner: string
  /** Set once the notice actually went. An answered clock warns nobody. */
  notifiedAt?: Date | null
}

export interface Breach {
  /** Short, quotable, and the same string in every letter about it. */
  reference: string
  /** One sentence in plain words: what happened. */
  what: string
  discoveredAt: Date
  /** How it came to light — a job, a report, a customer. Null where unknown. */
  discoveredBy: string | null
  /** Which populations are in it. */
  populations: Audience[]
  /**
   * How many people. Null means nobody has counted yet, and the letter
   * says that rather than printing a plausible number somebody will
   * quote back for a year.
   */
  peopleAffected: number | null
  companiesAffected: string[]
  /** Which kinds of record, by the privacy notice's own category names. */
  categories: string[]
  clocks: Clock[]
  timeZone?: string
}

/** What a clock is called in a sentence. */
export function clockName(id: ClockId): string {
  return id === 'AUTHORITY' ? 'the supervisory authority' : 'the people affected'
}

function populationWords(populations: Audience[]): string {
  const said = populations.map((p) => (p === 'candidate' ? 'candidates' : 'business users'))
  return said.length > 0 ? andList(said) : 'nobody we have identified yet'
}

function howManyPeople(b: Breach): string {
  if (b.peopleAffected === null) return 'Not counted yet. Nobody should quote a number until it is.'
  if (b.peopleAffected === 1) return '1 person'
  return `${b.peopleAffected} people`
}

function whichData(b: Breach): string {
  return b.categories.length > 0
    ? andList(b.categories)
    : 'Not established yet. We will say which records when we know, rather than guess at it now.'
}

// ── 5. The staff alert, the moment a breach is recorded ───────────────

export interface StaffAlert {
  breach: Breach
  now: Date
  /** Where the incident is worked. */
  url: string
}

/**
 * Staff hear first, with both clocks and the hour each runs out.
 *
 * One action: open it. Everything else on this alert is what somebody
 * needs in order to decide who does what in the next hour.
 */
export function breachStaffAlert(input: StaffAlert): Notice {
  const b = input.breach
  const tz = b.timeZone

  const clockLines = b.clocks.map((c) => {
    const left = remaining(input.now, c.dueAt)
    return `${clockName(c.id)} — runs out ${moment(c.dueAt, tz)}, ${left.said}. ${c.owner} owns it.`
  })

  const body = paragraphs(
    `${b.what}`,
    `Discovered ${moment(b.discoveredAt, tz)}${b.discoveredBy ? `, by ${b.discoveredBy}` : ''}.`,
    'Who is affected:\n' + bullets([
      `People: ${howManyPeople(b)}`,
      `Populations: ${populationWords(b.populations)}`,
      `Companies: ${b.companiesAffected.length > 0 ? andList(b.companiesAffected) : 'None identified yet'}`,
      `Records: ${whichData(b)}`,
    ]),
    clockLines.length > 0
      ? `Two clocks are running:\n${bullets(clockLines)}`
      : 'No clock has been set on this yet. Somebody has to set both before anything else happens.',
    `Work it here:\n${input.url}`
  )

  return notice({
    audience: 'business',
    subject: `Breach ${b.reference} recorded — ${b.clocks.length === 2 ? 'two clocks running' : 'set the clocks'}`,
    body,
    card: {
      title: `Breach ${b.reference}`,
      text: b.what,
      facts: [
        { name: 'Discovered', value: moment(b.discoveredAt, tz) },
        { name: 'People', value: howManyPeople(b) },
        { name: 'Companies', value: b.companiesAffected.length > 0 ? andList(b.companiesAffected) : 'None identified yet' },
        { name: 'Records', value: whichData(b) },
        ...b.clocks.map((c) => ({
          name: clockName(c.id),
          value: `${moment(c.dueAt, tz)} — ${remaining(input.now, c.dueAt).said}, ${c.owner}`,
        })),
      ],
      action: { label: 'Open the incident', url: input.url },
    },
  })
}

// ── 6. The clock, a day out and again when it is missed ───────────────

export type WarningKind =
  /** Inside the last day. */
  | 'DAY_BEFORE'
  /** The deadline has passed with no notice sent. */
  | 'MISSED'

/** How long before a deadline the first and only early warning goes. */
export const WARN_WITHIN_HOURS = 24

export interface WarningDue {
  clock: Clock
  kind: WarningKind
}

/**
 * Which warnings are owed right now.
 *
 * Two per clock, ever: one inside the last day, one when it is missed.
 * A caller passes what it has already sent, and a clock that has been
 * answered is silent even after its deadline — the notice went, so
 * there is nothing to chase.
 */
export function warningsDue(input: {
  clocks: Clock[]
  now: Date
  alreadySent: { clockId: ClockId; kind: WarningKind }[]
}): WarningDue[] {
  const sent = new Set(input.alreadySent.map((s) => `${s.clockId}:${s.kind}`))
  const out: WarningDue[] = []

  for (const clock of input.clocks) {
    if (clock.notifiedAt) continue
    const left = remaining(input.now, clock.dueAt)

    if (left.state === 'LATE') {
      if (!sent.has(`${clock.id}:MISSED`)) out.push({ clock, kind: 'MISSED' })
      continue
    }
    if (left.hours < WARN_WITHIN_HOURS && !sent.has(`${clock.id}:DAY_BEFORE`)) {
      out.push({ clock, kind: 'DAY_BEFORE' })
    }
  }
  return out
}

export interface ClockWarning {
  breach: Breach
  clock: Clock
  now: Date
  url: string
}

/**
 * A day out, and again when it is missed.
 *
 * Hours while it is under a day, because at four in the afternoon
 * "tomorrow" is not a number anybody can act on. The owner is named in
 * both, because a deadline addressed to a team is a deadline addressed
 * to nobody.
 */
export function breachClockWarning(input: ClockWarning): Notice {
  const b = input.breach
  const tz = b.timeZone
  const who = clockName(input.clock.id)
  const left = remaining(input.now, input.clock.dueAt)
  const late = left.state === 'LATE'

  const subject = late
    ? `Overdue: ${who} has not been told about breach ${b.reference} — ${left.said}`
    : `${left.said} to tell ${who} about breach ${b.reference}`

  const body = paragraphs(
    late
      ? `The deadline to tell ${who} passed ${moment(input.clock.dueAt, tz)}. That is ${left.said}.`
      : `The deadline to tell ${who} is ${moment(input.clock.dueAt, tz)}. That is ${left.said}.`,
    `${input.clock.owner} owns this notice.`,
    `What happened: ${b.what}`,
    `Who is in it: ${howManyPeople(b)}, ${populationWords(b.populations)}. Records: ${whichData(b)}.`,
    late
      ? 'Send it now, and record the hour it went. A late notice that is recorded honestly ' +
        'is a different conversation from one that is not.'
      : 'Send it, and record the hour it went.',
    `${input.url}`
  )

  return notice({
    audience: 'business',
    subject,
    body,
    card: {
      title: late ? `Overdue — ${who}, breach ${b.reference}` : `${left.said} — ${who}, breach ${b.reference}`,
      text: b.what,
      facts: [
        { name: 'Deadline', value: moment(input.clock.dueAt, tz) },
        { name: late ? 'Late by' : 'Time left', value: left.said },
        { name: 'Owner', value: input.clock.owner },
      ],
      action: { label: late ? 'Send it now' : 'Send the notice', url: input.url },
    },
  })
}

// ── 7. The notice itself ──────────────────────────────────────────────

export interface BreachNotice {
  breach: Breach
  /** What has been done about it already. One line each. */
  whatWeDid: string[]
  /** What the reader should do. Empty is a real answer and is said as one. */
  whatToDo: string[]
  /** A person, not a mailbox nobody reads. */
  contact: { name: string; email: string }
  timeZone?: string
}

function noticeBody(input: {
  opening: string
  breach: Breach
  whatWeDid: string[]
  whatToDo: string[]
  contact: { name: string; email: string }
  tz?: string
}): string {
  const b = input.breach
  return paragraphs(
    input.opening,
    `What happened: ${b.what} We found it on ${moment(b.discoveredAt, input.tz)}${
      b.discoveredBy ? `, ${b.discoveredBy}` : ''
    }.`,
    `What was in it: ${whichData(b)}`,
    input.whatWeDid.length > 0
      ? `What we did:\n${bullets(input.whatWeDid)}`
      : 'What we did: nothing yet that we can describe honestly. We are writing now rather ' +
        'than waiting until there is a better sentence.',
    input.whatToDo.length > 0
      ? `What you should do:\n${bullets(input.whatToDo)}`
      : 'What you should do: nothing. There is no step for you. We are telling you because ' +
        'you should know, not because there is something for you to fix.',
    `Who to ask: ${input.contact.name}, ${input.contact.email}. Quote ${b.reference}.`
  )
}

/** The notice to a company whose people or records were in it. */
export function breachCompanyNotice(
  input: BreachNotice & { company: { name: string } }
): Notice {
  const b = input.breach
  const tz = input.timeZone ?? b.timeZone

  const body = noticeBody({
    opening:
      `This is a notice to ${input.company.name} about a security incident at Etyme that ` +
      'reached records connected to your company.',
    breach: b,
    whatWeDid: input.whatWeDid,
    whatToDo: input.whatToDo,
    contact: input.contact,
    tz,
  })

  return notice({
    audience: 'business',
    subject: `Security incident at Etyme affecting ${input.company.name} — ${b.reference}`,
    body,
    card: {
      title: `Security incident — ${b.reference}`,
      text: b.what,
      facts: [
        { name: 'Found', value: moment(b.discoveredAt, tz) },
        { name: 'Records', value: whichData(b) },
        { name: 'Your people', value: howManyPeople(b) },
        { name: 'Contact', value: `${input.contact.name}, ${input.contact.email}` },
      ],
      action: null,
    },
  })
}

/** The notice to a person whose own records were in it. */
export function breachPersonNotice(
  input: BreachNotice & { person: { name: string | null; audience: Audience }; replyTo?: string | null }
): Notice {
  const b = input.breach
  const tz = input.timeZone ?? b.timeZone

  const body = paragraphs(
    hello(input.person.name),
    noticeBody({
      opening: 'Something happened to your records at Etyme and you should know about it.',
      breach: b,
      whatWeDid: input.whatWeDid,
      whatToDo: input.whatToDo,
      contact: input.contact,
      tz,
    })
  )

  return notice({
    audience: input.person.audience,
    subject: `Your records were in a security incident at Etyme — ${b.reference}`,
    body,
    to: input.replyTo ?? null,
  })
}
