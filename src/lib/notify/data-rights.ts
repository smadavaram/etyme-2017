/**
 * What we say to somebody who asks for their data, or asks to be gone.
 *
 * ── The one sentence this file exists to stop ────────────────────────
 *
 * "All of your personal data will be permanently deleted."
 *
 * It is the sentence every erasure template on the internet contains,
 * and in a staffing system it is a lie. Whoever employed somebody keeps
 * payroll and tax records for the period their tax law sets. Whoever
 * took their I-9 keeps it, and what stands behind it, for the period the
 * law sets. The client whose site they stood on keeps the days they
 * stood there, because a client has to be able to answer for how long
 * somebody was on its site and that obligation is the client's, not
 * ours. Promising deletion of any of those is a written
 * misrepresentation on the first document a regulator reads.
 *
 * So the categories carry their own fate here, and the letter is
 * assembled from the fates rather than from a paragraph somebody wrote
 * once. A category nobody has classified is named as unclassified and
 * promised nothing, which is the honest answer and the useful one — the
 * same rule as a number nobody can stand behind.
 *
 * ── Three fates, not two ─────────────────────────────────────────────
 *
 * Forgotten — the content goes and does not come back.
 * Under a marker — the row stays because a date or an amount hangs off
 *   it and two firms' books have to keep adding up; the name does not.
 * Kept — kept whole, by somebody who is required to keep it, with the
 *   reason and the period said in the letter.
 *
 * The fate names are for the machine. Nothing in a subject or a body
 * ever prints one: a person reads "forgotten", "under a marker" and
 * "kept", which is what those three things are in their own words.
 *
 * ── Whose words the categories are ───────────────────────────────────
 *
 * The category names come from `HELD` in `lib/legal`, verbatim, because
 * the privacy notice promises those exact categories and a letter that
 * renames them is a letter that cannot be checked against the promise.
 *
 * Owned by etyme-conversation. The models and the routes that will call
 * these are etyme-regulatory's; nothing here touches a database, so the
 * words can be written and read back before the first column exists.
 */

import { HELD } from '@/lib/legal'
import {
  andList, bullets, day, hello, notice, paragraphs,
  type Audience, type Notice, type TeamsCard,
} from '@/lib/notify/letters'

// ── What a person holds, by the notice's own names ────────────────────

/** The categories the privacy notice says are held about this reader. */
export function categoriesFor(audience: Audience): string[] {
  const mine = audience === 'candidate'
    ? ['Candidates', 'Everybody']
    : ['Business users', 'Everybody']
  return HELD.filter((h) => mine.includes(h.about)).map((h) => h.category)
}

/**
 * What an export does not contain, said out loud.
 *
 * A file that quietly omits things reads as a complete file. Both of
 * these are true of the product today — a client's interview notes stay
 * with the client, and a rate is a term between the two firms on a
 * contract — and a person is better served knowing where to ask than
 * concluding the record does not exist.
 */
export const NOT_IN_AN_EXPORT: string[] = [
  'Notes a client wrote about an interview. They stay with the client who wrote them, ' +
    'and are not shown to the supplier or to you.',
  'The rate on a contract you are named on but are not a party to. That is a term ' +
    'between the two firms that signed it, and each reads its own side.',
]

// ── The fate of each category when somebody asks to be forgotten ──────

export type Fate = 'FORGOTTEN' | 'UNDER_A_MARKER' | 'KEPT'

export interface CategoryFate {
  /** Exactly as `HELD` names it. */
  category: string
  fate: Fate
  /** Why, in the reader's words. One sentence, no code. */
  why: string
  /**
   * How long it stays, for a kept category. Never a number of years
   * nobody has decided: the period is set by the law where the work
   * happened, and saying so is more honest than inventing seven.
   */
  until: string | null
  /** A true thing that complicates the headline, where there is one. */
  caveat?: string
}

/**
 * The fates, one per category the privacy notice names.
 *
 * Read against `HELD` by the test, so a category added to the notice
 * with no fate here fails the build rather than silently falling into
 * "we will not promise either way".
 */
export const FATES: CategoryFate[] = [
  {
    category: 'Identity and sign-in',
    fate: 'FORGOTTEN',
    why: 'Your name, your email address and every way you sign in are erased, and you will not be able to sign in again.',
    until: null,
  },
  {
    category: 'A consultant own profile',
    fate: 'FORGOTTEN',
    why: 'Your headline, skills, location, rate floor, mobile number, availability and your public page, if you had one, are erased.',
    until: null,
  },
  {
    category: 'Resumes',
    fate: 'FORGOTTEN',
    why: 'Every file you uploaded and the text read out of it are erased.',
    until: null,
    caveat:
      'A copy already sent to a company is in that company\'s own records and Etyme cannot unsend it. ' +
      'We tell each company that received one that you have asked to be forgotten.',
  },
  {
    category: 'Bars and preferences',
    fate: 'FORGOTTEN',
    why: 'A star or a bar a company set against your name is removed with the name it was set against.',
    until: null,
  },
  {
    category: 'Messages',
    fate: 'UNDER_A_MARKER',
    why: 'A message you sent stays on the thread it was written on, because it is the other company\'s record of the conversation too. Your name on it becomes a marker.',
    until: null,
  },
  {
    category: 'Onboarding paperwork',
    fate: 'UNDER_A_MARKER',
    why: 'The checklist of what a placement needed stays as that placement\'s record. Documents that are not required by law are erased with it.',
    until: null,
  },
  {
    category: 'Money about a person',
    fate: 'KEPT',
    why: 'Payroll, tax, the hours signed and the invoices between two firms. Whoever paid you is required to keep these, and two firms\' books have to go on adding up.',
    until: 'the period the tax and payroll law sets where you were paid',
  },
  {
    category: 'Time on site',
    fate: 'KEPT',
    why: 'The days you worked at each client stay in that client\'s tenure ledger, counted once per day. A client has to be able to answer for how long somebody was on its site, and that duty is the client\'s.',
    until: 'as long as the client is answerable for the time you spent there',
  },
  {
    category: 'Checks somebody else ran',
    fate: 'KEPT',
    why: 'An I-9, and what stands behind it, is kept by the employer that took it. So is a background check or a screening they are required to hold.',
    until: 'the period the law sets where you worked',
  },
  {
    category: 'Work authorization and immigration',
    fate: 'KEPT',
    why: 'A visa petition is the employer\'s file with the government. They keep it.',
    until: 'the period the law sets where the petition was filed',
  },
  {
    category: 'Positions taken about how somebody is engaged',
    fate: 'KEPT',
    why: 'Whether a company treated you as its employee or as a contractor is that company\'s own position, and it has to be able to answer for it.',
    until: 'as long as the employment records it belongs to are kept',
  },
  {
    category: 'Logs',
    fate: 'KEPT',
    why: 'Who read your record, from which company, why, and whether they were refused. This is the log that protects you; erasing it would erase the evidence of every read. Where it names you as the subject it carries a marker.',
    until: 'as long as the records it is evidence about',
  },
  {
    category: 'Company and supplier records',
    fate: 'KEPT',
    why: 'A company\'s own legal and trading records are the company\'s, not a person\'s, and are not erased by a person\'s request.',
    until: 'as long as the company keeps them',
  },
  {
    category: 'Payment details',
    fate: 'KEPT',
    why: 'A bank name, the name on the account and four digits, held against a company rather than against you.',
    until: 'as long as the company keeps them',
  },
]

/** The fate of one category, or null where nobody has classified it. */
export function fateOf(category: string): CategoryFate | null {
  return FATES.find((f) => f.category === category) ?? null
}

export interface ErasurePlan {
  forgotten: CategoryFate[]
  underAMarker: CategoryFate[]
  kept: CategoryFate[]
  /** Categories with no fate. Promised nothing, and named. */
  unclassified: string[]
}

/**
 * What actually happens to each category.
 *
 * The caller passes what is held, never what to delete. A caller who
 * could hand in a delete list could hand in one containing payroll,
 * and the letter would promise it.
 */
export function erasurePlan(categories: string[]): ErasurePlan {
  const plan: ErasurePlan = { forgotten: [], underAMarker: [], kept: [], unclassified: [] }
  for (const c of categories) {
    const f = fateOf(c)
    if (!f) { plan.unclassified.push(c); continue }
    if (f.fate === 'FORGOTTEN') plan.forgotten.push(f)
    else if (f.fate === 'UNDER_A_MARKER') plan.underAMarker.push(f)
    else plan.kept.push(f)
  }
  return plan
}

function fateLines(fates: CategoryFate[]): string[] {
  return fates.map((f) => {
    const until = f.until ? ` Kept for ${f.until}.` : ''
    const caveat = f.caveat ? ` ${f.caveat}` : ''
    return `${f.category} — ${f.why}${until}${caveat}`
  })
}

// ── 1. The export is ready ────────────────────────────────────────────

export interface ExportReady {
  person: { name: string | null; audience: Audience }
  /** What is in the file, by the privacy notice's own category names. */
  categories: string[]
  downloadUrl: string
  /** The day and the hour the link stops working. */
  linkExpiresAt: Date
  /** For "about six days" — the letter says both, because one of them is the one they read. */
  now: Date
  /** Where a question goes. */
  contactEmail: string
  /** What the file does not contain. Defaults to the two true omissions. */
  notIncluded?: string[]
  timeZone?: string
}

/**
 * Your export is ready.
 *
 * Names what is in it rather than how many things are in it, says when
 * the link dies, and says that opening it is logged — including by us.
 * A person who did not ask for this file needs to know that last part
 * first, which is why it is not in a footer.
 */
export function exportReadyNotice(input: ExportReady): Notice {
  const tz = input.timeZone
  const expires = day(input.linkExpiresAt, tz)
  const daysLeft = Math.max(
    0,
    Math.round((input.linkExpiresAt.getTime() - input.now.getTime()) / 86_400_000)
  )
  const notIncluded = input.notIncluded ?? NOT_IN_AN_EXPORT

  const body = paragraphs(
    hello(input.person.name),
    'Your export is ready. Everything Etyme holds about you is in one file:',
    bullets(input.categories),
    `Download it here:\n${input.downloadUrl}`,
    `The link works until ${expires} — ${daysLeft === 1 ? 'about a day' : `about ${daysLeft} days`}. ` +
      'After that it stops working, and you can ask for another whenever you want one.',
    'Every time this file is opened, a line is written saying who opened it, from which ' +
      'company and why. That includes us. If you did not ask for this file, reply to this ' +
      'message and we will kill the link.',
    notIncluded.length > 0
      ? `What is not in it:\n${bullets(notIncluded)}`
      : null,
    `Questions: ${input.contactEmail}`
  )

  const card: TeamsCard = {
    title: 'A data export is ready to download',
    text: `Everything Etyme holds about ${input.person.name ?? 'this person'} is in one file. Every read of it is logged.`,
    facts: [
      { name: 'In the file', value: andList(input.categories) },
      { name: 'Link works until', value: expires },
    ],
    action: { label: 'Download the file', url: input.downloadUrl },
  }

  return notice({
    audience: input.person.audience,
    subject: 'Your Etyme export is ready',
    body,
    card,
  })
}

// ── 2. We have your request to be forgotten ───────────────────────────

export interface ErasureRequested {
  person: { name: string | null; audience: Audience }
  /** Something short they can quote back at us. */
  reference: string
  requestedAt: Date
  /** The day it runs. Until then nothing has changed. */
  completesOn: Date
  /** Everything held about them, by category. The fates decide the rest. */
  categories: string[]
  /** Where they stop it. */
  withdrawUrl: string
  contactEmail: string
  timeZone?: string
}

/**
 * We have your request — here is exactly what will and will not happen.
 *
 * The kept list is not an apology and it is not buried. Somebody asking
 * to be forgotten is owed the truth about the parts that will not be,
 * before the day it runs rather than after.
 */
export function erasureReceivedNotice(input: ErasureRequested): Notice {
  const tz = input.timeZone
  const plan = erasurePlan(input.categories)
  const runs = day(input.completesOn, tz)

  const body = paragraphs(
    hello(input.person.name),
    `We have your request to be forgotten, made on ${day(input.requestedAt, tz)}. ` +
      `Nothing has changed yet. It runs on ${runs}.`,
    plan.forgotten.length > 0
      ? `Forgotten on ${runs}, and not recoverable:\n${bullets(fateLines(plan.forgotten))}`
      : null,
    plan.underAMarker.length > 0
      ? 'Kept under a marker — the record stays because a date or an amount hangs off it ' +
        `and two firms' books have to go on adding up; your name on it does not:\n${bullets(fateLines(plan.underAMarker))}`
      : null,
    plan.kept.length > 0
      ? 'Kept, because whoever holds it is required to keep it. We are not going to tell ' +
        'you these will be deleted, because they will not be:\n' + bullets(fateLines(plan.kept))
      : null,
    plan.unclassified.length > 0
      ? 'Nobody has classified these yet, so we will not promise you either way until ' +
        `somebody has. Ask and a person will answer:\n${bullets(plan.unclassified)}`
      : null,
    `To stop this before ${runs}, use this link:\n${input.withdrawUrl}\n` +
      'After it runs we cannot undo it.',
    `Questions: ${input.contactEmail}. Quote ${input.reference}.`
  )

  return notice({
    audience: input.person.audience,
    subject: `Your request to be forgotten runs on ${runs}`,
    body,
    card: {
      title: 'A request to be forgotten was received',
      text: 'Nothing has changed yet. It runs on the date below unless it is withdrawn first.',
      facts: [
        { name: 'Reference', value: input.reference },
        { name: 'Asked on', value: day(input.requestedAt, tz) },
        { name: 'Runs on', value: runs },
      ],
      action: { label: 'Withdraw the request', url: input.withdrawUrl },
    },
  })
}

// ── 3. It is done ─────────────────────────────────────────────────────

export interface ErasureDone {
  /** What to call them, from the request. The account no longer knows. */
  person: { name: string | null; audience: Audience }
  reference: string
  completedOn: Date
  categories: string[]
  /**
   * The address they gave when they asked. Required, and used: the
   * address on the account is a marker by the time this is sent, so a
   * letter routed the usual way would go to nobody.
   */
  replyTo: string
  contactEmail: string
  timeZone?: string
}

/**
 * It is done, said to the address they gave at the time of asking.
 *
 * This is the last message Etyme sends them, and it says so. A person
 * who has been forgotten cannot look any of this up later, so the
 * reference and the kept list are in the letter rather than behind a
 * link they can no longer sign in to open.
 */
export function erasureCompleteNotice(input: ErasureDone): Notice {
  const tz = input.timeZone
  const plan = erasurePlan(input.categories)
  const done = day(input.completedOn, tz)

  const body = paragraphs(
    hello(input.person.name),
    `On ${done} we ran the request you made to be forgotten.`,
    plan.forgotten.length > 0
      ? `Forgotten:\n${bullets(fateLines(plan.forgotten))}`
      : null,
    plan.underAMarker.length > 0
      ? `Kept under a marker, carrying no name:\n${bullets(fateLines(plan.underAMarker))}`
      : null,
    plan.kept.length > 0
      ? `Still held, by whoever is required to hold it, and for how long:\n${bullets(fateLines(plan.kept))}`
      : null,
    plan.unclassified.length > 0
      ? `Nobody has classified these, so nothing was promised about them either way:\n${bullets(plan.unclassified)}`
      : null,
    'We are writing to this address because you gave it when you asked. The address on ' +
      'your account is a marker now, and this is the last message Etyme will send you.',
    `If you need anything about this afterward: ${input.contactEmail}, quoting ${input.reference}.`
  )

  return notice({
    audience: input.person.audience,
    subject: 'Your Etyme record has been forgotten',
    body,
    to: input.replyTo,
    card: {
      title: 'A request to be forgotten has run',
      text: 'The record is erased. What is kept, and for how long, is in the letter sent to the person.',
      facts: [
        { name: 'Reference', value: input.reference },
        { name: 'Ran on', value: done },
        { name: 'Still held', value: plan.kept.length > 0 ? andList(plan.kept.map((k) => k.category)) : 'Nothing' },
      ],
      action: null,
    },
  })
}

// ── 4. Telling the companies that hold the person ─────────────────────

/** How this company knew them. It decides what the letter says. */
export type Holding =
  /** Employed or paid them — the W2 employer or the firm that ran payroll. */
  | 'EMPLOYER'
  /** Listed them on its bench, or submitted them. */
  | 'SUPPLIER'
  /** The site they worked on. */
  | 'CLIENT'

export interface ErasureHolderNotice {
  company: { name: string; holding: Holding }
  /** They already know who this is; the letter has to name them to be actionable. */
  person: { name: string }
  reference: string
  completedOn: Date
  /** Where a question goes. */
  contactEmail: string
  timeZone?: string
}

const WHAT_STAYS: Record<Holding, string> = {
  EMPLOYER:
    'Your payroll, tax and I-9 records are yours and are untouched — the law says keep ' +
    'them, and nothing here has changed them. In Etyme, the contracts, timesheets and ' +
    'invoices keep their hours and their amounts under a marker instead of a name.',
  SUPPLIER:
    'Their bench listing with you is closed and their profile and resumes are gone from ' +
    'your searches. Contracts, timesheets and invoices keep their hours and their amounts ' +
    'under a marker instead of a name, so your books go on adding up.',
  CLIENT:
    'The days they worked on your sites stay in your tenure ledger, counted once per day, ' +
    'under a marker instead of a name. Your contracts and invoices keep their amounts.',
}

/**
 * The firm that employed, listed or hosted them is told.
 *
 * Not a request and not a warning — a firm reading this has nothing to
 * do, and the letter says so in as many words rather than leaving a
 * compliance officer wondering what is being asked of them.
 */
export function erasureHolderNotice(input: ErasureHolderNotice): Notice {
  const tz = input.timeZone
  const done = day(input.completedOn, tz)

  const body = paragraphs(
    `${input.person.name} asked to be forgotten, and on ${done} that request ran.`,
    WHAT_STAYS[input.company.holding],
    'Nothing else changes, and there is nothing for you to do. We are telling you ' +
      'because it is your record that changed, not because there is a step for you.',
    `Questions: ${input.contactEmail}. Quote ${input.reference}.`
  )

  return notice({
    audience: 'business',
    subject: `${input.person.name} has been forgotten — your hours and amounts are unchanged`,
    body,
    card: {
      title: `${input.person.name} has been forgotten`,
      text: 'Your records keep the days and the amounts under a marker. Nothing for you to do.',
      facts: [
        { name: 'Ran on', value: done },
        { name: 'Reference', value: input.reference },
        { name: 'Action needed', value: 'None' },
      ],
      action: null,
    },
  })
}
