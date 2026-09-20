/**
 * The contractor census: what may happen to a file a client entrusted to
 * us, and the day it goes. No database in this file.
 *
 * A client sends us what they already have about their contractors and
 * gets back one page. Nobody at the client has signed in, so every
 * protection here is a rule rather than a permission: an agreement
 * accepted by name before a link exists, a link that runs out, a named
 * person at Etyme whose reads are recorded, and a date the data is
 * deleted on whatever else happens.
 *
 * ── The day the data goes, decided once ──────────────────────────────
 *
 * `docs/census-brief.md` promises deletion "30 days after the page is
 * delivered". The client is told a date at receipt — "Received, 4 files,
 * 2.1 MB. Deleted on 20 October unless you start a program." Those two
 * sentences cannot both be the rule: at receipt nobody knows the day the
 * page will be delivered, so a date quoted then either moves later (and
 * the client was told a day we did not keep) or is not the delivery
 * clock at all.
 *
 * **The decision, 2026-09-20: `deleteBy` is set once, at receipt, to
 * forty-five days after the files arrived.** It is the only day anything
 * reads — the confirmation, the delivered page and the nightly sweep all
 * read the same column, because there is nowhere else to read it from.
 *
 * Why forty-five. The client is promised a page inside five working
 * days; forty-five from receipt is that week plus the thirty days after
 * delivery the brief promises, with a few days of slack. Where review
 * takes longer than a fortnight the client gets fewer than thirty days
 * with their page and the data goes *sooner* than the brief's outside
 * figure, which is the safe direction to be wrong in: the promise is a
 * ceiling on how long we keep somebody's file, never a floor. What it
 * must never do is move outward, and nothing here moves it.
 *
 * The one thing that changes it is a program starting, and that is not a
 * move — it is a cancellation, recorded with a reason, in the same act.
 * `CENSUS_DELETION_CANCELLED` carries the sentence.
 *
 * The cost of setting it at receipt is that a census sitting in review
 * can reach its date with no page sent. That is what `censusSweep`'s
 * warning is for: three days out, while the page is unsent, the named
 * person hears about it. A silent deletion of data we never delivered a
 * page from is the failure this whole design exists to prevent.
 *
 * Owned by etyme-regulatory (`lib/census` in `lib/domains.ts`).
 */

import { domainOfEmail, isConsumerDomain } from '@/lib/company-domains'

// ── The editions and the windows ──────────────────────────────────────

/**
 * Which edition of the one-page agreement somebody accepted.
 *
 * CLAUDE.md's paperwork section: "the form itself has an edition", and
 * which edition somebody signed is the finding in an audit. Written into
 * `CensusRequest.agreementVersion` on acceptance, so a row says what was
 * accepted rather than only that something was.
 *
 * A date rather than a number, because the question a reader asks is
 * "which wording was that" and a date answers it against the history of
 * this file.
 */
export const AGREEMENT_VERSION = '2026-09-20'

/** How long the upload link lives once the agreement is accepted. */
export const UPLOAD_WINDOW_DAYS = 14

/** How long the census data is kept, counted from the day it arrived. */
export const KEPT_DAYS_AFTER_RECEIPT = 45

/**
 * The most one file may be, which is the resume limit and for the same
 * reason: over five megabytes it is a scan, and nobody can read a scan.
 */
export const MAX_FILE_BYTES = 5 * 1024 * 1024

/**
 * The most one census may be, all files together, and the most files.
 *
 * Chosen rather than derived, and stated here so the page can say it
 * before somebody spends twenty minutes uploading. Fifty megabytes is a
 * quarter's supplier invoices for a program of a few hundred
 * contractors; twenty files is four quarters from four suppliers. A
 * client with more than that is a client we should be talking to rather
 * than one who should be fighting an upload box.
 */
export const MAX_CENSUS_BYTES = 50 * 1024 * 1024
export const MAX_FILES = 20

/** What we can actually open, by the brief's own list. */
export const ACCEPTED: Record<string, string> = {
  'text/csv': 'CSV',
  'application/csv': 'CSV',
  'text/plain': 'CSV',
  'application/pdf': 'PDF',
  'application/vnd.ms-excel': 'XLSX',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'application/msword': 'DOCX',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
}

const EXTENSIONS: Record<string, string> = {
  csv: 'CSV', txt: 'CSV', pdf: 'PDF', xlsx: 'XLSX', xls: 'XLSX', docx: 'DOCX', doc: 'DOCX',
}

const DAY = 86_400_000

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY)
}

// ── The seven states, and the two that are terminal ───────────────────

export type CensusStatus =
  | 'REQUESTED'
  | 'AGREED'
  | 'RECEIVED'
  | 'IN_REVIEW'
  | 'DELIVERED'
  | 'PROGRAM_STARTED'
  | 'DELETED'

export const STATUSES: CensusStatus[] = [
  'REQUESTED', 'AGREED', 'RECEIVED', 'IN_REVIEW', 'DELIVERED', 'PROGRAM_STARTED', 'DELETED',
]

/** Which desk somebody sits at. OTHER exists so nobody is forced to lie. */
export const DESKS = ['PROGRAM', 'FINANCE', 'PROCUREMENT', 'OTHER'] as const
export type Desk = (typeof DESKS)[number]

/** Which of the two the brief offers. The lighter one is the default. */
export const OPTIONS = ['TEMPLATE', 'FILES'] as const
export type Option = (typeof OPTIONS)[number]

export interface Verdict {
  ok: boolean
  /** What is missing and what to do, in a sentence. Never a code. */
  says: string
}

// ── Asking for one ────────────────────────────────────────────────────

export interface Ask {
  companyName?: string | null
  contactName?: string | null
  workEmail?: string | null
  desk?: string | null
  supplierCount?: number | null
  option?: string | null
}

export interface CheckedAsk extends Verdict {
  /** The row's values, cleaned, where the ask stands up. */
  fields: {
    companyName: string
    contactName: string
    workEmail: string
    desk: Desk
    supplierCount: number | null
    option: Option
  } | null
}

/**
 * Whether this ask can be written down.
 *
 * Nothing here is verified and nothing downstream may treat it as though
 * it were: the company name does not match a `Company` and the address
 * is not a `Person`. What is checked is that it is a *work* address,
 * because a census is a company's own data about its own contractors and
 * the one personal thing Option A ever produces is the address of the
 * person who asked for it.
 */
export function checkAsk(ask: Ask): CheckedAsk {
  const companyName = (ask.companyName ?? '').trim()
  const contactName = (ask.contactName ?? '').trim()
  const workEmail = (ask.workEmail ?? '').trim().toLowerCase()

  if (companyName.length < 2) {
    return { ok: false, says: 'Which company is this for? We need the name to address the page to somebody.', fields: null }
  }
  if (contactName.length < 2) {
    return { ok: false, says: 'Your name, so the person who runs this knows who they are writing back to.', fields: null }
  }

  const email = checkWorkEmail(workEmail)
  if (!email.ok) return { ...email, fields: null }

  const desk = (ask.desk ?? 'OTHER').toUpperCase()
  if (!(DESKS as readonly string[]).includes(desk)) {
    return {
      ok: false,
      says: 'Tell us which desk you sit at — program, finance or procurement — or choose other. It decides how the page is written.',
      fields: null,
    }
  }

  const option = (ask.option ?? 'TEMPLATE').toUpperCase()
  if (!(OPTIONS as readonly string[]).includes(option)) {
    return {
      ok: false,
      says: 'Choose the template, which is a spreadsheet with one row per contractor, or your own files. The template holds almost no personal data, and that is the point.',
      fields: null,
    }
  }

  const count = ask.supplierCount
  if (count != null && (!Number.isInteger(count) || count < 0 || count > 10_000)) {
    return { ok: false, says: 'How many suppliers do you buy from? A round guess is fine, or leave it blank.', fields: null }
  }

  return {
    ok: true,
    says: 'Written down.',
    fields: {
      companyName,
      contactName,
      workEmail,
      desk: desk as Desk,
      supplierCount: count ?? null,
      option: option as Option,
    },
  }
}

/**
 * A work address, and a sentence when it is not one.
 *
 * The refusal names the address and says what to send instead. A census
 * is a company's data and the reply goes to a desk, not to a mailbox
 * somebody keeps their holiday photographs in — but a person reading
 * "invalid email" would think we could not read what they typed.
 */
export function checkWorkEmail(email: string): Verdict {
  const address = email.trim().toLowerCase()
  const domain = domainOfEmail(address)
  if (!domain) {
    return { ok: false, says: 'That does not read as an email address. It is where the page and the upload link go.' }
  }
  if (isConsumerDomain(domain)) {
    return {
      ok: false,
      says:
        `${address} is a personal address. A census is your company's own data about its own ` +
        'contractors, so it goes to and comes back from a work address — the one your ' +
        'procurement or legal team would recognize.',
    }
  }
  return { ok: true, says: `${address} is a work address.` }
}

/**
 * Where in the line somebody is, at the moment they ask.
 *
 * Stored rather than computed later, so the number on their confirmation
 * is the number they were told. The only true scarcity is that we run a
 * small number of censuses well at once, and the brief forbids inventing
 * any other — so this is a count of what is open, plus one, and nothing
 * about it is dressed up.
 */
export function queuePosition(openCount: number): number {
  return Math.max(0, Math.floor(openCount)) + 1
}

export function queueSays(position: number): string {
  if (position === 1) return 'Yours is next. We run a small number of these at once and nothing else is ahead of you.'
  return `There ${position - 1 === 1 ? 'is one census' : `are ${position - 1} censuses`} ahead of yours. We run a small number at once, which is why we say where you are.`
}

/**
 * The named person at Etyme who runs it. Not a bot.
 *
 * The first address on `ETYME_STAFF_EMAILS`, which is already who hears
 * when this deployment breaks. With the list unset the row is still
 * written — a client who asked is a client who asked — and the review
 * screen says nobody is assigned rather than showing a name that is not
 * a person.
 */
export function assignStaff(addresses: string[]): string | null {
  const first = addresses.map((a) => a.trim()).filter((a) => a.includes('@'))[0]
  return first ? first.toLowerCase() : null
}

export function assignmentSays(assigned: string | null): string {
  if (!assigned) {
    return (
      'Nobody at Etyme is assigned to this census yet. Set ETYME_STAFF_EMAILS on this ' +
      'deployment — it is the same list that hears when something breaks — and whoever is ' +
      'first on it runs the next one.'
    )
  }
  return `${assigned} runs this one, and every time they open one of your files it is recorded against them.`
}

// ── Accepting the agreement, which comes before anything moves ────────

export interface Acceptance {
  acceptedBy?: string | null
  status: CensusStatus
}

/**
 * Whether this census can be agreed to, and by whom.
 *
 * A name is required and is the whole point: the brief's promise is that
 * somebody at the client accepted, by name, and a row that says only
 * "accepted" cannot say who. Accepting twice is not an error — legal
 * re-reads it and presses the button again — but it does not mint a
 * second link.
 */
export function mayAgree(input: Acceptance): Verdict {
  const name = (input.acceptedBy ?? '').trim()
  if (name.length < 2) {
    return {
      ok: false,
      says: 'Type the name of whoever at your company is accepting this. It is what the record says was accepted, and by whom.',
    }
  }
  if (input.status === 'DELETED') {
    return { ok: false, says: 'This census has already been deleted. Ask for a new one and nothing of the old is reused.' }
  }
  if (input.status !== 'REQUESTED' && input.status !== 'AGREED') {
    return { ok: false, says: 'This census is already under way — the agreement was accepted before anything was sent.' }
  }
  return { ok: true, says: `Accepted by ${name}.` }
}

/** The day the upload link stops working, counted from acceptance. */
export function uploadExpiresFrom(acceptedAt: Date): Date {
  return addDays(acceptedAt, UPLOAD_WINDOW_DAYS)
}

export function agreementSays(name: string, version: string, expires: Date): string {
  return (
    `Accepted by ${name} against the ${version} edition. The link to send your files is ` +
    `open until ${day(expires)}; after that it stops working and we issue another rather ` +
    'than leaving one open.'
  )
}

// ── The link they upload through ──────────────────────────────────────

export interface UploadGate {
  status: CensusStatus
  uploadToken: string | null
  uploadExpires: Date | null
  agreementAcceptedAt: Date | null
  /** The token on the link somebody followed. */
  presented: string
  now: Date
}

/**
 * Whether a file may be sent, and a sentence when it may not.
 *
 * The token is the only credential, and it does not exist until the
 * agreement is accepted — deliberately, because a token that exists
 * before the agreement is a way around the agreement. The expiry is on
 * the row rather than inside a signature, so legal changing its mind
 * revokes the link the moment somebody clears the column.
 */
export function mayUpload(gate: UploadGate): Verdict {
  if (gate.status === 'DELETED') {
    return { ok: false, says: 'This census was deleted on the day we said it would be. Nothing more can be added to it.' }
  }
  if (!gate.agreementAcceptedAt || !gate.uploadToken) {
    return {
      ok: false,
      says:
        'Nothing can be sent until somebody at your company has accepted the one-page census ' +
        'agreement by name. The link to send files is created at that moment and not before.',
    }
  }
  if (gate.presented.trim().length === 0 || gate.presented !== gate.uploadToken) {
    return { ok: false, says: 'That link is not the one we sent for this census. Use the link in the email, or ask for another.' }
  }
  if (gate.uploadExpires && gate.now > gate.uploadExpires) {
    return {
      ok: false,
      says: `That link ran out on ${day(gate.uploadExpires)}. Reply to the person running your census and they will send another.`,
    }
  }
  return { ok: true, says: 'Send the files.' }
}

export interface IncomingFile {
  name: string
  type: string
  size: number
}

/** Whether one file can be taken. */
export function checkFile(file: IncomingFile): Verdict {
  if (file.size === 0) return { ok: false, says: `${file.name} is empty.` }
  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      says: `${file.name} is ${mb(file.size)}. Five megabytes is the limit for one file — split it, or send the template instead.`,
    }
  }
  const kind = ACCEPTED[file.type.toLowerCase()] ?? extensionOf(file.name)
  if (!kind) {
    return {
      ok: false,
      says: `We cannot open ${file.name}. Send a CSV, a PDF, an Excel file or a Word file — anything else and somebody here has to ask you for it again.`,
    }
  }
  return { ok: true, says: `${kind}, ${mb(file.size)}.` }
}

export interface BatchVerdict extends Verdict {
  /** The files that may be written, in the order they arrived. */
  accepted: IncomingFile[]
  /** One sentence per file that cannot be taken. Collected, never the first. */
  refused: { name: string; says: string }[]
  totalBytes: number
}

/**
 * A whole upload, checked together, with a sentence per file that fails.
 *
 * Per-item error collection rather than the first failure: somebody
 * dragging in eight files should be told which three we cannot open, not
 * told about one and left to find the rest by trying again.
 */
export function checkBatch(
  files: IncomingFile[],
  already: { count: number; bytes: number } = { count: 0, bytes: 0 }
): BatchVerdict {
  if (files.length === 0) {
    return { ok: false, says: 'No files arrived. Choose the ones to send.', accepted: [], refused: [], totalBytes: 0 }
  }

  const accepted: IncomingFile[] = []
  const refused: { name: string; says: string }[] = []
  let bytes = already.bytes
  let count = already.count

  for (const f of files) {
    const one = checkFile(f)
    if (!one.ok) {
      refused.push({ name: f.name, says: one.says })
      continue
    }
    if (count + 1 > MAX_FILES) {
      refused.push({
        name: f.name,
        says: `That would be more than ${MAX_FILES} files on one census. Send the ${MAX_FILES} that matter most, or ask for a second census.`,
      })
      continue
    }
    if (bytes + f.size > MAX_CENSUS_BYTES) {
      refused.push({
        name: f.name,
        says:
          `That would take this census over ${mb(MAX_CENSUS_BYTES)}` +
          `${already.bytes > 0 ? `, and ${mb(already.bytes)} has already arrived` : ''}. ` +
          'Send the template instead — it is one row per contractor and a fraction of the size.',
      })
      continue
    }
    accepted.push(f)
    bytes += f.size
    count += 1
  }

  if (accepted.length === 0) {
    return {
      ok: false,
      says: refused.map((r) => r.says).join(' '),
      accepted,
      refused,
      totalBytes: bytes - already.bytes,
    }
  }

  return {
    ok: true,
    says:
      `${accepted.length} file${accepted.length === 1 ? '' : 's'} received` +
      (refused.length > 0 ? `, and ${refused.length} we could not take.` : '.'),
    accepted,
    refused,
    totalBytes: bytes - already.bytes,
  }
}

// ── The day the data goes ─────────────────────────────────────────────

/**
 * The day this census is deleted, set once, at receipt.
 *
 * The long reasoning is at the top of this file. The short version: it is
 * counted from the day the files arrived because that is the day the
 * client is told a date, and a date somebody was told is a date that does
 * not move.
 */
export function deleteByFrom(receivedAt: Date): Date {
  return addDays(receivedAt, KEPT_DAYS_AFTER_RECEIPT)
}

/**
 * Whether a census that already has a deletion date may be given
 * another. It may not, and this says why.
 *
 * The one promise this whole design rests on is that the date on the
 * client's confirmation is the date the data goes. Recomputing it at
 * delivery — which is what "thirty days after the page is delivered"
 * would mean — moves it later than the day they were told, silently.
 */
export function mayResetDeleteBy(existing: Date | null): Verdict {
  if (!existing) return { ok: true, says: 'Nothing has been received yet, so there is no date to keep.' }
  return {
    ok: false,
    says:
      `This census is already set to be deleted on ${day(existing)}, which is the date the ` +
      'client was given in writing. It is not moved. A program starting cancels it, with a ' +
      'reason, and that is the only thing that changes it.',
  }
}

/** The sentence on the confirmation, the page and the review screen. */
export function deletionSentence(deleteBy: Date | null): string {
  if (!deleteBy) return 'Nothing has been received yet, so there is nothing to delete and no date.'
  return `Deleted on ${day(deleteBy)} unless you start a program.`
}

/** "Received, 4 files, 2.1 MB. Deleted on 20 October unless you start a program." */
export function receiptSentence(input: { count: number; bytes: number; deleteBy: Date }): string {
  return (
    `Received, ${input.count} file${input.count === 1 ? '' : 's'}, ${mb(input.bytes)}. ` +
    deletionSentence(input.deleteBy)
  )
}

/** What is left to say after the files are gone. */
export function deletedSentence(input: { count: number; bytes: number; deletedAt: Date }): string {
  return (
    `Deleted on ${day(input.deletedAt)}. There ${input.count === 1 ? 'was one file' : `were ${input.count} files`}, ` +
    `${mb(input.bytes)}, and none of it is here now.`
  )
}

// ── Who may open a file ───────────────────────────────────────────────

export interface Reader {
  /** True where the caller's address is on `ETYME_STAFF_EMAILS`. */
  staff: boolean
  email: string
}

/**
 * Whether this person may open this census, and whether they may open
 * the bytes inside it.
 *
 * Two gates, not one. Being Etyme staff lets somebody see the queue and
 * the state of a census. Opening a client's actual file is narrower: only
 * the person the census was assigned to, because the client was told a
 * name and "a named person at Etyme runs it" is the promise, not "our
 * staff".
 */
export function mayReviewCensus(reader: Reader): Verdict {
  if (!reader.staff) {
    return {
      ok: false,
      says:
        'A census is read by the person at Etyme running it. Your seat at your own company ' +
        'does not reach it, and that is the promise made to the client whose file it is.',
    }
  }
  return { ok: true, says: 'You are on the staff list.' }
}

export function mayOpenFile(reader: Reader, census: { assignedStaffEmail: string | null; status: CensusStatus }): Verdict {
  const staff = mayReviewCensus(reader)
  if (!staff.ok) return staff

  if (census.status === 'DELETED') {
    return { ok: false, says: 'This census was deleted on the day we said it would be. There is nothing left to open.' }
  }
  if (!census.assignedStaffEmail) {
    return {
      ok: false,
      says:
        'Nobody is assigned to this census, and the client was promised a named person. ' +
        'Assign it to yourself first — the name is what the promise is made of.',
    }
  }
  if (census.assignedStaffEmail.toLowerCase() !== reader.email.trim().toLowerCase()) {
    return {
      ok: false,
      says:
        `This census is ${census.assignedStaffEmail}'s, and the client was told that name. ` +
        'If it should be yours, reassign it — then the record says who read what, and when.',
    }
  }
  return { ok: true, says: 'Open it. The read is recorded against you.' }
}

// ── What the nightly sweep does with a census ─────────────────────────

export interface SweepCensus {
  id: string
  companyName: string
  status: CensusStatus
  deleteBy: Date | null
  deletedAt: Date | null
  receivedFileCount: number
  receivedBytes: number
  assignedStaffEmail: string | null
  /** Whether the named person has already been warned today. */
  warnedToday: boolean
}

export interface CensusDeletion {
  action: 'CENSUS_DELETED'
  requestId: string
  says: string
  /** Kept after the files go, because the row is what proves we did it. */
  fileCount: number
  bytes: number
}

export interface CensusWarning {
  action: 'CENSUS_CLOCK_WARNED'
  requestId: string
  daysLeft: number
  /** Who hears it. Null where nobody is assigned, and that is itself said. */
  owner: string | null
  says: string
}

export interface CensusPlan {
  deletions: CensusDeletion[]
  warnings: CensusWarning[]
}

/** How many days before the date the one warning goes. */
export const WARN_WITHIN_DAYS = 3

/**
 * What tonight's run should do with every census, given what it found.
 *
 * Nothing here writes. It returns the literal action the runner will log,
 * so the autonomy ladder can see every act the product performs
 * unprompted.
 *
 * Two things happen and they are different in kind. A census past its day
 * is **deleted**, with nobody asked, because a written agreement said the
 * day had come — which is why it is at the top of the ladder beside the
 * retention delete and not beside ending a contract. A census three days
 * out with its page still unsent produces a **warning to the named
 * person**, because data about to be deleted before the client ever saw
 * their page is somebody's problem tonight and not in three days.
 */
export function censusSweep(now: Date, rows: SweepCensus[]): CensusPlan {
  const plan: CensusPlan = { deletions: [], warnings: [] }

  for (const r of rows) {
    if (r.status === 'DELETED' || r.deletedAt) continue

    // A census that became a program keeps its data. The cancellation was
    // recorded with a reason when it happened; nothing is said again.
    if (r.status === 'PROGRAM_STARTED') continue
    if (!r.deleteBy) continue

    if (r.deleteBy <= now) {
      plan.deletions.push({
        action: 'CENSUS_DELETED',
        requestId: r.id,
        fileCount: r.receivedFileCount,
        bytes: r.receivedBytes,
        says:
          `${r.companyName} sent us ${r.receivedFileCount} file${r.receivedFileCount === 1 ? '' : 's'}, ` +
          `${mb(r.receivedBytes)}, for a contractor census. ${day(r.deleteBy)} is the day the ` +
          'agreement they accepted said it would be deleted, no program has started, and it is ' +
          'deleted. What is left is this row, saying how many there were and when they went. ' +
          'Nothing puts this back.',
      })
      continue
    }

    const daysLeft = Math.ceil((r.deleteBy.getTime() - now.getTime()) / DAY)
    const unsent = r.status === 'RECEIVED' || r.status === 'IN_REVIEW'
    if (unsent && daysLeft <= WARN_WITHIN_DAYS && !r.warnedToday) {
      plan.warnings.push({
        action: 'CENSUS_CLOCK_WARNED',
        requestId: r.id,
        daysLeft,
        owner: r.assignedStaffEmail,
        says:
          `${r.companyName}'s census data is deleted on ${day(r.deleteBy)}, ` +
          `${daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`}, and their page has not been sent. ` +
          'The date is the one they were given in writing and it does not move, so the page has ' +
          'to go before it. ' +
          (r.assignedStaffEmail
            ? `${r.assignedStaffEmail} owns it.`
            : 'Nobody is assigned to it, which is the first thing to fix.'),
      })
    }
  }

  return plan
}

/**
 * The order a census is torn down in, and why it is this way round.
 *
 * The files first, because they are the client's actual data and the
 * thing the promise is about. Then the rows imported into the sandbox,
 * then the sandbox company itself — which `etyme-money` creates at import
 * and this deletes, by the rule that whoever promised the date owns the
 * deletion.
 *
 * Last of all the request row is marked, never deleted: it is the proof
 * we did it on the day we said, and a count of zero file rows cannot say
 * what went.
 */
export const DELETION_ORDER = [
  'the files themselves, which is the client’s own data',
  'the rows imported from them into the sandbox',
  'the sandbox company, which held nothing else',
  'and last the request row is marked deleted, keeping the count and the byte total',
] as const

// ── Words ─────────────────────────────────────────────────────────────

function extensionOf(name: string): string | null {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  return EXTENSIONS[ext] ?? null
}

/** "2.1 MB", or "412 KB" where megabytes would read as 0.4. */
export function mb(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** "20 October", the way the confirmation says it. */
export function day(d: Date): string {
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}
