/**
 * What we say to a client who sent us their own contractor data, and
 * what we say to the person here who is holding it.
 *
 * ── Six letters, and not one of them opens a sequence ────────────────
 *
 * `docs/census-brief.md`, correction 6: "There is no nurture sequence,
 * and the shipped decision says there should not be one." The public ask
 * form promises "there is no list to be added to and nothing automatic
 * happens next", and a census is the first thing a client ever does with
 * Etyme — so it is the worst possible place to break that promise.
 *
 * So these are five letters to the client, each triggered by something
 * the client did or by a day the agreement named, and one to the staff
 * person running it. No letter chases, no letter says "we will follow
 * up", and no letter is sent because time passed. After the page is
 * delivered the named person writes one follow-up by hand or nobody
 * writes at all.
 *
 * ── No letter states a date the row does not hold ────────────────────
 *
 * Every date in here arrives as a `Date` off `CensusRequest`:
 * `uploadExpires`, `deleteBy`, `deletedAt`. Nothing is computed from
 * "now" and nothing is inferred, because the one promise the whole
 * census design rests on is that the day the client was told is the day
 * the data goes (`lib/census`, at length, at the top). A letter that
 * recomputed a date would be the thing that made the two disagree, and
 * the client would be the one to find out.
 *
 * The five-working-days turnaround is the one thing said about time that
 * is not a date, and it is said as a working practice — "that is how we
 * work" — rather than as a commitment. It is not on any row and it is
 * never printed as a day.
 *
 * ── The same words as the page and the routes ────────────────────────
 *
 * `receiptSentence`, `deletionSentence`, `deletedSentence`,
 * `agreementSays` and `queueSays` are regulatory's, in `lib/census`, and
 * they are used verbatim rather than paraphrased. The confirmation the
 * client sees on the screen, the page the staff person sends and the
 * email that carries it say one sentence between them, because three
 * sentences about one date is three chances for them to differ.
 *
 * ── Who is reading ───────────────────────────────────────────────────
 *
 * A census contact is at a work address by construction — `checkAsk`
 * refuses a consumer one, in a sentence — so every client letter here is
 * `business`. There is no consultant anywhere in this flow: the census
 * is a company's own data about its own contractors, and the brief
 * forbids ever approaching one of them.
 *
 * No client letter carries a Teams card. The audience is a business one
 * and `channelsFor` says so, but the client has no `Company` row on the
 * platform and therefore no channel to post a card into — the address
 * they gave is the only route there is. Every client letter sets `to`
 * for that reason: the caller must not look an address up, because there
 * is nobody here to look up.
 *
 * Owned by etyme-conversation. Pure: the `CensusRequest` model, the
 * routes and the nightly sweep are etyme-regulatory's, and nothing here
 * touches a database. The call sites are listed on each function.
 */

import {
  ACCEPTED, MAX_CENSUS_BYTES, MAX_FILES, MAX_FILE_BYTES,
  agreementSays, deletedSentence, deletionSentence, mb, queueSays, receiptSentence,
  type Option,
} from '@/lib/census'
import {
  andList, bullets, day, hello, notice, paragraphs,
  type Notice, type TeamsCard,
} from '@/lib/notify/letters'

// ── What every census letter needs ────────────────────────────────────

export interface CensusContact {
  /** As they typed it when they asked. Null is allowed; `hello` copes. */
  name: string | null
  /** Where this goes. A work address, because `checkAsk` refused any other. */
  workEmail: string
}

export interface CensusLetter {
  contact: CensusContact
  /** As the client typed it. Not a `Company` — nothing here is verified. */
  companyName: string
  /**
   * The named person at Etyme, by address, off
   * `CensusRequest.assignedStaffEmail`. Null where nobody has been
   * assigned, which is said out loud rather than papered over: the
   * client was promised a name and a letter signed by nobody is the
   * promise quietly broken.
   */
  assignedTo: string | null
}

/**
 * The last line of every letter, which is a person and never a mailbox.
 *
 * "A named person at Etyme runs it. Not a bot" is the brief's third
 * promise to the committee, and a letter ending in `support@` is that
 * promise withdrawn. Where nobody is assigned the letter says so and
 * gives the one action that still works — reply to this — rather than
 * naming an address that is not a person.
 */
export function writeTo(assignedTo: string | null): string {
  return assignedTo
    ? `Questions go to ${assignedTo}, who runs your census and answers them personally.`
    : 'Nobody at Etyme is assigned to your census yet, and you were promised a name. ' +
      'Reply to this message and whoever takes it will write to you by name.'
}

/** The named person, said to the client, or the honest absence of one. */
function namedPerson(assignedTo: string | null, what: string): string {
  return assignedTo
    ? `${assignedTo} at Etyme ${what}`
    : `Nobody at Etyme is assigned to your census yet. Whoever takes it ${what}`
}

/** "the template" or "your own files", in the words the form used. */
function sending(option: Option): string {
  return option === 'TEMPLATE'
    ? 'the template, which is one row per contractor'
    : 'your own supplier invoices and timesheets'
}

/** CSV, PDF, XLSX and DOCX — read off what the upload route accepts. */
function kinds(): string {
  return andList([...new Set(Object.values(ACCEPTED))])
}

// ── 1. You asked for a census ─────────────────────────────────────────

export interface CensusAsked extends CensusLetter {
  /** Which of the two they chose on the form. */
  option: Option
  /** Off the row, counted once when they asked and never recomputed. */
  queuePosition: number
  /** The edition on the row, so the letter names what they will accept. */
  agreementVersion: string
  /** Where the one page is read and accepted. */
  agreementUrl: string
}

/**
 * We have your request — and nothing moves until your legal accepts.
 *
 * Sent from `POST /api/census/request`, which today tells staff and
 * returns a sentence to the screen and writes to the client not at all.
 * The person who asked closes the tab; this is the only thing they keep.
 *
 * No date anywhere in it, on purpose. At this moment the row holds none:
 * the upload link does not exist until the agreement is accepted and the
 * deletion date is not set until files arrive. A letter that said "we
 * will be in touch within a week" would be inventing the first of them.
 */
export function censusAskedNotice(input: CensusAsked): Notice {
  const body = paragraphs(
    hello(input.contact.name),
    `We have your request for a contractor census for ${input.companyName}. ` +
      `You are sending ${sending(input.option)}.`,
    queueSays(input.queuePosition),
    namedPerson(
      input.assignedTo,
      'runs this one, and every time one of your files is opened it is recorded against them by name.'
    ),
    'What happens next, in order:\n' + bullets([
      `Somebody at ${input.companyName} accepts the one-page census agreement by name — ` +
        `the ${input.agreementVersion} edition, at ${input.agreementUrl}.`,
      'A link to send your files is created at that moment, and not before.',
      `You send ${input.option === 'TEMPLATE' ? 'the filled template' : 'your files'} through it.`,
    ]),
    'Nothing moves until the agreement is accepted. There is nowhere to send a file to yet, ' +
      'which is what that promise means rather than a policy somebody wrote down.',
    'Nothing automatic happens next. You have not been added to a list and this is not the ' +
      'first of a series.',
    writeTo(input.assignedTo)
  )

  return notice({
    audience: 'business',
    to: input.contact.workEmail,
    subject: `Your contractor census for ${input.companyName}`,
    body,
  })
}

// ── 2. The agreement was accepted, so here is the link ────────────────

export interface CensusAgreed extends CensusLetter {
  /** Who accepted it, by name, off the row. */
  acceptedBy: string
  /** The edition they accepted, off the row. */
  agreementVersion: string
  /** `CensusRequest.uploadExpires`. Never recomputed here. */
  uploadExpires: Date
  /** The link the files go through. */
  uploadUrl: string
  option: Option
  /** Where the CSV template is, for the option that uses one. */
  templateUrl: string | null
}

/**
 * Accepted, by name, against an edition — and this is what to send.
 *
 * Sent from `POST /api/census/agree`, which mints the token and today
 * hands it back in JSON to whoever posted the form. If legal accepted it
 * and the program manager is the one who uploads, that link reaches
 * nobody; this letter is how it gets to the person with the files.
 *
 * `agreementSays` is regulatory's sentence and carries the date, so the
 * day the link dies is said once in the product and quoted here.
 */
export function censusAgreedNotice(input: CensusAgreed): Notice {
  const what = input.option === 'TEMPLATE'
    ? 'Send the filled template: one row per contractor — supplier, role, site, start date, ' +
      'end date, rate and hours a week. No names are needed; your own reference number is ' +
      'enough, and that is the point of the template.' +
      (input.templateUrl ? ` The template is at ${input.templateUrl}.` : '')
    : 'Send your own supplier invoices and timesheets as they are. We will read them; you do ' +
      'not have to tidy them first.'

  const body = paragraphs(
    hello(input.contact.name),
    `${input.acceptedBy} has accepted the census agreement for ${input.companyName}.`,
    agreementSays(input.acceptedBy, input.agreementVersion, input.uploadExpires),
    `Send your files here:\n${input.uploadUrl}`,
    what,
    'What we can take:\n' + bullets([
      `${kinds()} files.`,
      `${mb(MAX_FILE_BYTES)} for any one file.`,
      `${mb(MAX_CENSUS_BYTES)} for the whole census, across ${MAX_FILES} files at most.`,
    ]),
    namedPerson(
      input.assignedTo,
      'is the only person who opens them, and every read is recorded against them.'
    ),
    writeTo(input.assignedTo)
  )

  return notice({
    audience: 'business',
    to: input.contact.workEmail,
    subject: `The census agreement for ${input.companyName} was accepted — here is where to send your files`,
    body,
  })
}

// ── 3. Your files arrived, and here is the day they go ────────────────

export interface CensusReceived extends CensusLetter {
  /** How many arrived in this upload. */
  count: number
  /** How many bytes arrived in this upload. */
  bytes: number
  /** `CensusRequest.deleteBy`, set once at receipt. Read, never computed. */
  deleteBy: Date
}

/**
 * "Received, 4 files, 2.1 MB. Deleted on 20 October unless you start a
 * program."
 *
 * Sent from `POST /api/census/upload`, which composes exactly that
 * sentence for the screen and sends the client nothing. It is the
 * brief's own line, quoted from `receiptSentence` rather than rewritten,
 * so the email and the screen cannot come to say different days.
 *
 * The five working days are stated as a working practice. They are not
 * on the row, so they are never printed as a date, and the only date in
 * this letter is the one the sweep will read back.
 */
export function censusReceivedNotice(input: CensusReceived): Notice {
  const body = paragraphs(
    hello(input.contact.name),
    receiptSentence({ count: input.count, bytes: input.bytes, deleteBy: input.deleteBy }),
    namedPerson(
      input.assignedTo,
      'is the person who reads them. Nobody else at Etyme opens them, and every time one is ' +
      'opened a line is written saying who opened it and why.'
    ),
    'We usually have your page back inside five working days. That is how we work rather than ' +
      'a date we are promising you — the deletion date above is the only date on your census, ' +
      'and it does not move.',
    `No supplier of ${input.companyName} and no contractor of yours is contacted. That is in ` +
      'the agreement that was accepted, and it is the whole of our side of it.',
    writeTo(input.assignedTo)
  )

  return notice({
    audience: 'business',
    to: input.contact.workEmail,
    subject: `Your census files arrived — ${input.companyName}`,
    body,
  })
}

// ── 4. Here is the page ───────────────────────────────────────────────

/**
 * The six headings on the page, in its order and in its words.
 *
 * Copied from `lib/census-page`, which builds them inline, and held to
 * it by `census-letters.test.ts` — a heading renamed on the page and not
 * here fails the build rather than reaching a CFO as two different
 * documents. When that file exports them, import them instead.
 */
export const PAGE_SECTIONS = [
  'Contractors on your sites today',
  'Spend this quarter',
  'Same skill, different price',
  'Longest on your sites',
  'What we could not see',
  'How this was computed',
] as const

/**
 * The two ways to use Etyme, in the buyer's own two labels.
 *
 * The labels are `TWO_WAYS` on the home page and they are the buyer's
 * rather than ours: a program manager has already evaluated things
 * called both of those. One plain sentence each, no comparison and no
 * recommendation — this letter carries a page somebody will forward to
 * their CFO, and a pitch in the middle of it is what stops them
 * forwarding it.
 */
export const WAYS_FORWARD = [
  'Etyme as VMS software: your own program office runs the program on Etyme, and your own ' +
    'people hold the seats.',
  "Etyme as MSP provider: Etyme's program office runs it for you on the same record, in seats " +
    'your company grants and takes back.',
] as const

export interface CensusDelivered extends CensusLetter {
  /** True where the page rides with the letter as a printed sheet. */
  attached: boolean
  /** Where the same page is read live, where there is such a link. */
  pageUrl: string | null
  /** `CensusRequest.deleteBy`. Null only where nothing was ever received. */
  deleteBy: Date | null
}

/**
 * Your page, what is on it, and the two ways forward — with no urgency.
 *
 * Sent from `POST /api/census/review` with `act: 'DELIVER'`, which today
 * stores `pageHtml`, sets `DELIVERED` and returns a sentence to the
 * staff screen. The brief's step 6 has the named person emailing the
 * page; this is that email, and it is the last automatic one unless the
 * data is deleted.
 *
 * "What we could not see" is named out loud, because a client who finds
 * a gaps section unannounced reads it as an apology. It is the section
 * that makes the other four numbers believable and it is the reason a
 * CFO can quote them.
 *
 * The third choice is on the same list as the other two, in the same
 * voice. A page that offers two ways forward and hides "do nothing" has
 * turned a deletion date into a deadline, which is exactly what the
 * brief's sixth rule forbids.
 */
export function censusDeliveredNotice(input: CensusDelivered): Notice {
  const where = input.attached
    ? input.pageUrl
      ? `Your contractor census for ${input.companyName} is attached, and the same numbers are ` +
        `live at ${input.pageUrl}.`
      : `Your contractor census for ${input.companyName} is attached. It is one page.`
    : input.pageUrl
      ? `Your contractor census for ${input.companyName} is here:\n${input.pageUrl}`
      : `Your contractor census for ${input.companyName} is ready, and the person running it is ` +
        'sending you the page itself.'

  const body = paragraphs(
    hello(input.contact.name),
    where,
    'Six sections, in this order:\n' + bullets([...PAGE_SECTIONS]),
    '"What we could not see" is on the page on purpose. It is every gap in what you sent — a ' +
      'row with no end date, an invoice with no hours, a supplier with no rate — and it is ' +
      'what makes the other four numbers believable.',
    deletionSentence(input.deleteBy),
    'Where this can go from here:\n' + bullets([
      ...WAYS_FORWARD,
      input.deleteBy
        ? `Or do nothing, and the data is deleted on ${day(input.deleteBy)}.`
        : 'Or do nothing, and the data is deleted on the day you were given.',
    ]),
    writeTo(input.assignedTo)
  )

  return notice({
    audience: 'business',
    to: input.contact.workEmail,
    subject: `Your contractor census: ${input.companyName}`,
    body,
  })
}

// ── 5. It is gone ─────────────────────────────────────────────────────

export interface CensusDeleted extends CensusLetter {
  /** Kept on the row after the files went, which is how this can say it. */
  count: number
  bytes: number
  /** `CensusRequest.deletedAt`, the day the sweep ran. */
  deletedAt: Date
  /** Whether a page was ever sent, because what is left depends on it. */
  pageDelivered: boolean
  /** Where another census is asked for, whenever they want one. */
  askAgainUrl: string
}

/**
 * The day it said, the thing it said, done.
 *
 * Sent from `runCensusSweep` in `lib/data-request`, in the deletion loop
 * that today tells staff and leaves the client to take our word for it.
 * The brief is explicit: "the client is told the day it ran."
 *
 * Not an apology and not a pitch. The last line offers another census
 * because a client whose data we deleted on the day we promised is a
 * client who may well send more — but it is a door, not a chase, and
 * nothing follows this letter.
 */
export function censusDeletedNotice(input: CensusDeleted): Notice {
  const body = paragraphs(
    hello(input.contact.name),
    `Your contractor census data for ${input.companyName} has been deleted.`,
    deletedSentence({ count: input.count, bytes: input.bytes, deletedAt: input.deletedAt }),
    'What is left is one row saying it was done: how many files there were, how many bytes, and ' +
      'the day they went. That row is the proof we deleted on the day we said, which is why it ' +
      'is kept.' +
      (input.pageDelivered
        ? ' Your page stays exactly as it was sent to you.'
        : ' No page was ever sent from it, and that is on the row too.'),
    `If you want another census later, ask for one at ${input.askAgainUrl}. It starts over — a ` +
      'new agreement, a new link, and nothing of this one reused.',
    writeTo(input.assignedTo)
  )

  return notice({
    audience: 'business',
    to: input.contact.workEmail,
    subject: `Your census data for ${input.companyName} has been deleted`,
    body,
  })
}

// ── 6. The two the named person hears ─────────────────────────────────

/**
 * A staff letter, with the census it is about on it.
 *
 * `entityId` is the `CensusRequest` id and it is not decoration. For the
 * clock warning it is the memory: `runCensusSweep` asks for the
 * notifications written against these ids since the start of the day and
 * passes `warnedToday` into `censusSweep`, so a census warns once a
 * night rather than once a run. That only works if the notification
 * actually carries it — `notify({ personId, entityId: letter.entityId,
 * … })`. A warning delivered through `tellStaff` alone is invisible to
 * that check and the same census warns again tomorrow's run and the one
 * after, which is how a channel gets filtered to a folder in the week it
 * matters most.
 */
export interface CensusStaffNotice extends Notice {
  /** `CensusRequest.id`. Written to `Notification.entityId`. */
  entityId: string
}

function staffNotice(input: {
  entityId: string
  subject: string
  body: string
  card: TeamsCard
}): CensusStaffNotice {
  return {
    ...notice({ audience: 'business', subject: input.subject, body: input.body, card: input.card }),
    entityId: input.entityId,
  }
}

export interface CensusArrivedStaff {
  /** `CensusRequest.id`. */
  censusId: string
  companyName: string
  contact: { name: string; workEmail: string }
  /** Which desk they said they sit at, as the form recorded it. */
  desk: string | null
  option: Option
  /** What they think they buy from, or null where they did not say. */
  supplierCount: number | null
  queuePosition: number
  assignedTo: string | null
  /** Where the census is read on the staff screen. */
  reviewUrl: string
}

/**
 * A census has arrived and it is yours.
 *
 * Sent from `POST /api/census/request`, beside the `tellStaff` call that
 * already exists — this is the version addressed to the one person who
 * owns it rather than to the staff list, and it names what to do.
 *
 * What to do is deliberately small: write back by hand. Nothing in the
 * product chases this client, and the named person is the whole of the
 * follow-up, which is the shipped promise on the public form.
 */
export function censusArrivedStaffNotice(input: CensusArrivedStaff): CensusStaffNotice {
  const facts = [
    { name: 'Client', value: input.companyName },
    { name: 'Asked by', value: `${input.contact.name} (${input.contact.workEmail})` },
    { name: 'Sending', value: input.option === 'TEMPLATE' ? 'The template' : 'Their own files' },
    { name: 'Place in the line', value: String(input.queuePosition) },
  ]
  if (input.desk) facts.push({ name: 'Desk', value: input.desk })
  if (input.supplierCount != null) {
    facts.push({ name: 'Suppliers they think they have', value: String(input.supplierCount) })
  }

  const body = paragraphs(
    `${input.contact.name} (${input.contact.workEmail}) at ${input.companyName} has asked for a ` +
      'contractor census.',
    bullets([
      `Sending: ${input.option === 'TEMPLATE' ? 'the template' : 'their own supplier invoices and timesheets'}.`,
      `Desk: ${input.desk ?? 'not said'}.`,
      `Suppliers they think they buy from: ${input.supplierCount ?? 'not said'}.`,
      `Place in the line: ${input.queuePosition}.`,
    ]),
    input.assignedTo
      ? `It is assigned to ${input.assignedTo}, and the client has been told that name.`
      : 'Nobody is assigned to it, and the client was promised a name. That is the first thing to fix.',
    `What to do: write to ${input.contact.name} yourself. Nothing automatic follows this, and ` +
      'nothing is sent until somebody at their company accepts the one-page agreement by name — ' +
      'the upload link does not exist until they do.',
    `The census: ${input.reviewUrl}`
  )

  return staffNotice({
    entityId: input.censusId,
    subject: `Census asked for: ${input.companyName}`,
    body,
    card: {
      title: `${input.companyName} asked for a contractor census`,
      text: 'Nothing is sent until their own legal accepts the agreement by name. Write to them yourself.',
      facts,
      action: { label: 'Open the census', url: input.reviewUrl },
    },
  })
}

export interface CensusClockStaff {
  /** `CensusRequest.id`. The memory that stops a second warning tonight. */
  censusId: string
  companyName: string
  /** From the sweep's plan, counted against the row's own date. */
  daysLeft: number
  /** `CensusRequest.deleteBy`. The date the client holds in writing. */
  deleteBy: Date
  /** What it is still waiting on: RECEIVED or IN_REVIEW. */
  status: 'RECEIVED' | 'IN_REVIEW'
  assignedTo: string | null
  reviewUrl: string
}

/**
 * Their data goes in three days and their page has not gone.
 *
 * Sent from `runCensusSweep` in `lib/data-request`, in the warning loop,
 * as the body of the notification written to the named person — with
 * `entityId` set from this letter, which is what makes it once a night.
 *
 * `censusSweep` builds its own `says` for the automation plan and this
 * is what the person reads; both are built from the same two facts, the
 * row's `deleteBy` and the days left the plan counted, and neither
 * computes a date of its own.
 *
 * One warning, three days out, and then nothing until the day itself.
 * `WARN_WITHIN_DAYS` in `lib/census` is the whole schedule: a clock that
 * speaks every morning for a fortnight is a clock somebody mutes.
 */
export function censusClockStaffNotice(input: CensusClockStaff): CensusStaffNotice {
  const when = input.daysLeft === 1 ? 'tomorrow' : `in ${input.daysLeft} days`

  const body = paragraphs(
    `${input.companyName}'s census data is deleted on ${day(input.deleteBy)}, ${when}, and ` +
      'their page has not been sent.',
    input.status === 'RECEIVED'
      ? 'Their files are here and nobody has taken it into review yet.'
      : 'It is in review and the page has not gone out.',
    'The date is the one they were given in writing when their files arrived, and it does not ' +
      'move. A program starting is the only thing that changes it, and that is a cancellation ' +
      'with a reason rather than a new date.',
    input.assignedTo
      ? `${input.assignedTo} owns it.`
      : 'Nobody is assigned to it, which is the first thing to fix.',
    `What to do: send the page before ${day(input.deleteBy)}, or record that a program started ` +
      'and say why. Deleting data a client never got a page from is the failure this whole ' +
      'design exists to prevent.',
    `The census: ${input.reviewUrl}`
  )

  return staffNotice({
    entityId: input.censusId,
    subject: `${input.companyName}'s census data goes ${when} and the page has not gone`,
    body,
    card: {
      title: `${input.companyName}: ${input.daysLeft} day${input.daysLeft === 1 ? '' : 's'} left`,
      text: 'The deletion date was given to the client in writing and does not move. The page has to go before it.',
      facts: [
        { name: 'Client', value: input.companyName },
        { name: 'Deleted on', value: day(input.deleteBy) },
        { name: 'Days left', value: String(input.daysLeft) },
        { name: 'Census', value: input.censusId },
      ],
      action: { label: 'Open the census', url: input.reviewUrl },
    },
  })
}
