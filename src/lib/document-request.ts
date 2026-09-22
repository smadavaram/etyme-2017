/**
 * A document asked for, and what happens to it.
 *
 * DocInstance carried four statuses since the table existed — PENDING ·
 * SENT · SIGNED · UPLOADED — and one writer, which created PENDING. A
 * request for a W-9 or an NDA could be made and never sent, never
 * answered, never signed. The 2017 build had "attachable docs" flowing
 * both ways on every contract; the rebuild had a row that sat there.
 *
 * Four moves, decided here in words:
 *
 *   send     the company asks the subject for it; the subject is told
 *   upload   the subject (or the company, on their behalf) puts the file on
 *            record — for paperwork that needs no signature
 *   sign     the subject attests and signs, or the company records the
 *            signed copy it received — for paperwork that does
 *   (there is no "reject": a document is asked for until it is on file)
 *
 * Pure, so every refusal is a sentence tested by name.
 */

import { humanKey } from '@/lib/document-type'

export type DocStatus = 'PENDING' | 'SENT' | 'SIGNED' | 'UPLOADED'
export type DocAction = 'send' | 'upload' | 'sign'

export interface DocFacts {
  status: DocStatus | string
  templateName: string
  needsSignature: boolean
  /** The person the document is about, when it is about a person. */
  subjectPersonId: string | null
  /** The company that asked. */
  issuerName: string
}

export interface DocActor {
  personId: string
  /** Staff at the company that asked. */
  staffOfIssuer: boolean
}

export type DocVerdict =
  | { ok: true; next: DocStatus; says: string }
  | { ok: false; code: 'NOT_YOURS' | 'ALREADY_ON_FILE' | 'NEEDS_SIGNATURE' | 'NO_SIGNATURE_NEEDED' | 'NOT_SENT' | 'FILE_REQUIRED'; message: string }

const ON_FILE = ['SIGNED', 'UPLOADED']

export function mayAct(
  action: DocAction,
  doc: DocFacts,
  actor: DocActor,
  extra: { fileUrl?: string | null; attests?: boolean } = {}
): DocVerdict {
  const subject = actor.personId === doc.subjectPersonId
  const name = doc.templateName

  if (ON_FILE.includes(doc.status)) {
    return { ok: false, code: 'ALREADY_ON_FILE', message: `${name} is already on file.` }
  }

  if (action === 'send') {
    if (!actor.staffOfIssuer) {
      return { ok: false, code: 'NOT_YOURS', message: `Only ${doc.issuerName} can ask for ${name}.` }
    }
    return {
      ok: true, next: 'SENT',
      says: doc.status === 'SENT' ? `${name} asked for again.` : `${name} asked for. They have been told.`,
    }
  }

  if (!subject && !actor.staffOfIssuer) {
    return { ok: false, code: 'NOT_YOURS', message: `${name} was not asked of you, and it is not yours to put on file.` }
  }

  if (action === 'upload') {
    if (doc.needsSignature) {
      return {
        ok: false, code: 'NEEDS_SIGNATURE',
        message: `${name} needs a signature. Sign it, or record the signed copy you received.`,
      }
    }
    if (!extra.fileUrl) {
      return { ok: false, code: 'FILE_REQUIRED', message: `Attach the file. ${name} cannot be on file without one.` }
    }
    return { ok: true, next: 'UPLOADED', says: subject ? `${name} is on file. Thank you.` : `${name} recorded as received.` }
  }

  // sign
  if (!doc.needsSignature) {
    return { ok: false, code: 'NO_SIGNATURE_NEEDED', message: `${name} does not need a signature. Upload it.` }
  }
  if (subject) {
    if (!extra.attests) {
      return { ok: false, code: 'FILE_REQUIRED', message: `Confirm that you are signing ${name} as yourself.` }
    }
    return { ok: true, next: 'SIGNED', says: `${name} signed. Thank you.` }
  }
  // Staff recording a signed copy that arrived some other way.
  if (!extra.fileUrl) {
    return { ok: false, code: 'FILE_REQUIRED', message: `Attach the signed copy of ${name} you received.` }
  }
  return { ok: true, next: 'SIGNED', says: `Signed copy of ${name} recorded.` }
}

// ── A file, rather than a link to one ─────────────────────────────────
//
// Supply built the picker on the worker's page and found that nothing in
// this codebase stored a document's bytes: `DocInstance` carried a URL
// and a file name and no file. So a contractor standing in a corridor
// with a photograph of her I-9 on her phone had nowhere to put it, and
// the only way to answer a chase was to host the thing somewhere first —
// which is a thing a firm does and a person does not.
//
// The rules below are this document's and not a CV's, and the difference
// is the whole point: a CV is a document somebody typed and a compliance
// document is usually a photograph of a piece of paper. Images are
// first-class here and are refused on the resume door for good reasons
// that do not apply.

/**
 * How large a document may be.
 *
 * Ten megabytes rather than the CV door's five. A phone photograph of a
 * passport page at full resolution is commonly six to eight, and
 * refusing the picture somebody already has in order to keep a number
 * round is refusing the answer to get the limit tidy.
 */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024

/**
 * What a compliance desk can actually open.
 *
 * Photographs are in, and they are the common case. Anything a desk
 * would have to install software to read is out — a refusal now is
 * cheaper than a document sitting on a file nobody opens until an
 * auditor asks.
 */
export const ACCEPTED_DOCUMENTS: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'photo',
  'image/png': 'image',
  'image/heic': 'photo',
  'image/heif': 'photo',
  'image/webp': 'image',
  'image/tiff': 'scan',
  'application/msword': 'Word document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word document',
  'text/plain': 'text file',
  'application/rtf': 'document',
  'text/rtf': 'document',
}

const ACCEPTED_EXTENSIONS: Record<string, string> = {
  pdf: 'PDF', jpg: 'photo', jpeg: 'photo', png: 'image', heic: 'photo', heif: 'photo',
  webp: 'image', tif: 'scan', tiff: 'scan', doc: 'Word document', docx: 'Word document',
  txt: 'text file', rtf: 'document',
}

export interface UploadVerdict {
  ok: boolean
  /** What it is, where it is acceptable — "photo, 2.1MB". */
  says: string
}

/**
 * Whether this file may be recorded against a document request.
 *
 * Pure, and checked BEFORE anything is written. A file refused after the
 * row has moved leaves a request that says a document arrived and a
 * record with nothing in it, which is the state this whole file exists
 * to prevent.
 *
 * The refusal says what is wrong and what to do, never a code.
 */
export function checkDocumentUpload(file: { name: string; type: string; size: number }): UploadVerdict {
  if (!file.size) {
    return { ok: false, says: 'That file is empty. Pick it again — a photograph that did not finish saving often is.' }
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    const mb = Math.round((file.size / 1024 / 1024) * 10) / 10
    return {
      ok: false,
      says:
        `That is ${mb}MB and ten is the limit. If it is a photograph, your phone can send a smaller ` +
        `one — or photograph the page on its own rather than the whole document.`,
    }
  }
  const kind = ACCEPTED_DOCUMENTS[file.type.toLowerCase()] ?? ACCEPTED_EXTENSIONS[extensionOf(file.name)]
  if (!kind) {
    return {
      ok: false,
      says:
        'A PDF, a photograph or a Word document. Whoever checks this has to be able to open it, ' +
        'and a file they cannot open sits on your record as though it answered something.',
    }
  }
  return { ok: true, says: `${kind}, ${sizeSaid(file.size)}.` }
}

function extensionOf(name: string): string {
  return (name.toLowerCase().split('.').pop() ?? '').trim()
}

/** A size somebody reads, not a byte count. */
export function sizeSaid(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round((bytes / 1024 / 1024) * 10) / 10}MB`
  return `${Math.max(1, Math.round(bytes / 1024))}KB`
}

/** What the person is told when it is asked for. */
export function askNotice(doc: DocFacts): { title: string; body: string } {
  return {
    title: `${doc.issuerName} asks for ${doc.templateName}`,
    body: doc.needsSignature
      ? `Sign ${doc.templateName} from your page. It takes a minute.`
      : `Upload ${doc.templateName} from your page. A photo is fine.`,
  }
}

/** The word a row shows: what is true, not the enum. */
export function statusWord(status: string): string {
  switch (status) {
    case 'PENDING': return 'Not asked yet'
    case 'SENT': return 'Asked for'
    case 'SIGNED': return 'Signed'
    case 'UPLOADED': return 'On file'
    default: return status.toLowerCase()
  }
}

// ── Everything asked of one person, from wherever it was asked ────────
//
// A person's paperwork page listed `DocInstance` only, because that was
// the one table that asked for anything when the page was written. It is
// no longer: the nightly license chase raises a `DocumentPacket` against
// the person, with a link of their own, and an ICU nurse asked for her
// renewal by email opened her own page and found nothing on it.
//
// CLAUDE.md's rule for lists is the fix — fill from the work, not from
// data entry. The page is derived from everything that actually asks this
// person for something, in one shape, so a second kind of ask cannot go
// missing the same way.
//
// What does not change is what it may show: their own paperwork, and
// nothing about what the companies said to each other. Both kinds carry
// who asked, what it is, by when, and how to answer it — and nothing
// else about the request, because nothing else is theirs.

export type PaperKind = 'DOCUMENT' | 'REQUEST' | 'HELD' | 'OUTSTANDING'

/** A document sent to somebody for signature or upload. */
export interface SentDocument {
  id: string
  status: string
  templateName: string
  needsSignature: boolean
  /** The company that asked. */
  issuerName: string
  sentAt: Date | null
  signedAt: Date | null
}

/** One thing asked for inside a packet. */
export interface AskedItem {
  id: string
  label: string
  /** PENDING · RECEIVED · ACCEPTED · REJECTED */
  state: string
  required: boolean
  receivedAt: Date | null
  position: number
}

/** A packet raised against this person — the whole ask, and its items. */
export interface AskedPacket {
  id: string
  label: string
  /** The company that raised it. */
  askedBy: string
  /** The address it was sent to. The link is only offered to that address. */
  recipientEmail: string
  token: string
  /** The day the link stops working. Always set. */
  expiresAt: Date
  cancelledAt: Date | null
  createdAt: Date
  /**
   * The sentence the person was given — the chase's own words, written to
   * them. Null where the packet carried none.
   */
  reason: string | null
  items: AskedItem[]
}

/**
 * A document already on file about this person, and when it stops
 * counting.
 *
 * The third kind, added 2026-09-21. The page showed what somebody had
 * asked her for and never what she already held, so an ICU nurse could
 * read her own paperwork page, see nothing, and be three weeks from a
 * lapsed registration that would stop her working — because the chase
 * that would have told her does not fire until sixty days out, and the
 * verdict that already knew was on a screen at the agency.
 *
 * The rule this closes is the founder's: the list a worker sees and the
 * list clearance reads are the same items.
 */
export interface HeldRecord {
  id: string
  /** The type key — I9_EVERIFY, PROFESSIONAL_LICENSE, a client's own. */
  key: string
  /** What it is called, as the person would say it. */
  label: string
  /** CLEAR · CONDITIONAL · PENDING · EXPIRED · FAILED · … */
  status: string
  /** Who ran or issued it, where recorded. */
  provider: string | null
  validFrom: Date | null
  expiresAt: Date | null
  /** True where a lapse stops the work rather than starting a conversation. */
  stopsWork: boolean
}

export interface Paper {
  id: string
  kind: PaperKind
  /** What it is, as the person would say it. */
  name: string
  /** The ask it came in, where it came in a list of several. */
  partOf: string | null
  /**
   * Who asked. Null where nobody has — an item a line requires that no
   * company has yet opened a request for. It read as the worker's own
   * name before 2026-09-21, because the row's `owedByName` is the party
   * that OWES it, and a page saying "Helena Marsh asked for Helena
   * Marsh's I-9" reads as though she asked herself. `why` carries whose
   * order requires it, so a row with no asker is never mute.
   */
  askedBy: string | null
  /** Why, in their own words. Never a code. */
  why: string | null
  needsSignature: boolean
  status: string
  /** The word a row shows: what is true, not the enum. */
  word: string
  askedAt: string | null
  doneAt: string | null
  /** The day the ask closes, where it has one. */
  dueOn: string | null
  /** What is theirs to do, in a word: sign, upload, open, or nothing. */
  todo: 'sign' | 'upload' | 'open' | null
  /** Where they answer it. Null where the answer is given on this page. */
  link: string | null
  /**
   * The day it runs out, where the document has one. Null means nobody
   * recorded a date — which is not the same as "never expires" and is
   * said as such on the row.
   */
  runsOutOn?: string | null
  /**
   * True where work stops until this is on file. Only ever set on an
   * outstanding row: a document already held stops nothing by being held.
   */
  stopsWork?: boolean
  /** True where somebody accepted its absence, on the record, by name. */
  waived?: boolean
  /**
   * True where a paper for THIS row actually arrived and nobody has
   * checked it yet.
   *
   * Said rather than inferred, since 2026-09-21. The screen was reading
   * "sent" off the ABSENCE of somewhere to send it, so "nobody can send
   * this" and "this has been sent" were the same shape — and a document
   * nobody had ever sent read as sent. Two states that mean opposite
   * things must not share a signal.
   */
  received?: boolean
  /**
   * The type key, on an outstanding row. What a page posts to open an
   * ask for it — the document has no request behind it yet, so it has no
   * id of its own to act on.
   */
  documentTypeKey?: string
  /**
   * Where to open a request so a file can be sent against this item.
   * Null on every other kind, because those already have somewhere to
   * answer: a document is answered at /api/documents/:id, a packet at
   * the link it came with.
   */
  openAskAt?: string | null
}

/** The word a packet item shows. Received and accepted are not the same. */
export function askWord(state: string): string {
  switch (state) {
    case 'PENDING': return 'Asked for'
    case 'RECEIVED': return 'On file'
    case 'ACCEPTED': return 'Accepted'
    case 'REJECTED': return 'Sent back'
    default: return state.toLowerCase()
  }
}

const ANSWERED = ['RECEIVED', 'ACCEPTED']

/** A check that actually came back. Anything else is still a request. */
const ACCEPTED_CHECK = ['CLEAR', 'CONDITIONAL', 'EXPIRED']

/**
 * What a document on file says about itself, in the words a person uses.
 *
 * Four states rather than two, and the fourth is the one that caused the
 * 2017 bug: on file, no expiry recorded, on a kind that expires. It says
 * so rather than reading as permanent.
 */
export function heldWord(expiresAt: Date | null, on: Date, stopsWork = false): string {
  if (!expiresAt) {
    // The fourth state, and the one that went green in 2017: on file, no
    // expiry recorded, on a kind that expires. Saying "on file" of it
    // claims something nobody checked.
    return stopsWork ? 'On file — no expiry recorded' : 'On file'
  }
  const daysLeft = Math.ceil((expiresAt.getTime() - on.getTime()) / 86_400_000)
  if (daysLeft < 0) {
    const n = Math.abs(daysLeft)
    return `Ran out ${n === 1 ? 'yesterday' : `${n} days ago`}`
  }
  if (daysLeft === 0) return 'Runs out today'
  if (daysLeft <= 60) return `Runs out in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`
  return `On file until ${expiresAt.toISOString().slice(0, 10)}`
}

/** "professional license (RN 154-882, WI)" → sentence case, for a row. */
function asRow(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** The same, for a sentence somebody reads rather than a row. */
function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}


// ── What a line requires and nobody has filed ─────────────────────────
//
// "Ensure the loop of documents never cracks between parties."
// — the founder, 2026-09-21.
//
// The crack the release walk found: every chase letter ends "upload it
// from your Paperwork page", and the page read three tables — documents
// sent, packets raised, checks already on file — and never the one that
// says what this line actually requires. So Helena Marsh read three held
// documents and nothing outstanding, under a subtitle promising "and
// what is still being asked of you", while the client's own dashboard
// said her start was blocked on a document she could not see.
//
// This is the arithmetic that closes it, and it is pure on purpose: the
// SAME function answers the worker's page and the supplier's own
// compliance page, so the list a worker reads and the list clearance
// reads are the same items rather than two lists that agree by
// coincidence.

/** One item of a line's effective set, reduced to what this file needs. */
export interface RequiredItem {
  key: string
  label: string
  required: boolean
  /** WORKER · SUPPLIER · CUSTOMER · US. A position in the trade, never a person. */
  owedBy: string
  /** The firm or person behind the role, where the line names one. */
  owedByName: string | null
  /** True where a lapse or an absence stops the work. */
  blocks: boolean
  waived: boolean
  waivedSays: string | null
  /** Where it came from — "required by Cavanaugh Glassworks’s order PO-2026-2". */
  says: string
}

/** A document already on file, as the arithmetic needs it. */
export interface HeldKeyRecord {
  key: string
  validFrom: Date | null
  expiresAt: Date | null
  /** False where the check is still running, so it counts as nothing held. */
  accepted: boolean
  /**
   * True where the file is with whoever asked and nobody has checked it.
   * Holds nothing — that is what `accepted` is for — and says whose move
   * it is, so a worker who has sent a document is not asked for it
   * again the next morning.
   */
  received?: boolean
}

/**
 * Where an item stands on a line.
 *
 * WAIVED is a state and not an absence: Addendum E says WARN, capture a
 * reason, proceed and never silently permit, so a waived item stays on
 * the list, marked, with the reason and the name on it.
 */
export type OutstandingState =
  | 'MISSING'
  | 'LAPSED'
  | 'NOT_YET_VALID'
  /**
   * She sent it and nobody has checked it yet. Not held — a check still
   * running holds nothing — and not still owed by her either, because
   * asking again for what is sitting in somebody's queue is how a worker
   * learns the page is not worth reading.
   */
  | 'AWAITING_REVIEW'
  | 'WAIVED'

export interface OutstandingItem {
  key: string
  label: string
  owedBy: string
  owedByName: string | null
  /** True where the work stops until it is on file. */
  stopsWork: boolean
  state: OutstandingState
  /** What the row says, in words a person uses. Never the state name. */
  word: string
  /** Who asked for it, in their own words. */
  asked: string
  /** The day the one on file ran out, where there was one. */
  ranOutOn: Date | null
  waivedSays: string | null
}

/**
 * What already proves a document, where a different document proves it.
 *
 * CLAUDE.md's fourth property of paperwork: a document can require other
 * documents. This is that relation read the other way — the one the
 * release walk found on 2026-09-21, when Helena Marsh was chased for
 * proof of her right to work while holding a current I-9, an E-Verify
 * result and a permanent resident card. The matcher is keyed on the type
 * key, so nothing she held could satisfy an item asking for another key,
 * and she was asked to produce again what she had already produced.
 *
 * Asking a lawful permanent resident to re-prove her right to work is
 * not a harmless duplicate — re-verification of somebody whose status
 * does not expire is one of the named forms of document abuse this
 * file's own header exists to prevent.
 *
 * **The list is deliberately short, and a passport is not on it.** A
 * foreign passport proves identity and not the right to work; a US
 * passport does and we do not record which it is. Guessing the other
 * way would clear an item the law did not clear. An employment
 * authorization document and a permanent resident card each prove it on
 * their own, and a completed I-9 is the form recording that somebody
 * checked one.
 *
 * It lives here rather than on `RIGHT_TO_WORK.backedByAnyOf` in
 * `lib/document-type` because that file is `etyme-architect`'s, and
 * because `backedByAnyOf` means "what must stand behind this" rather
 * than "what stands in for this". The two readings are close enough that
 * merging them is the architect's call, not this file's.
 */
export const SATISFIED_BY: Record<string, readonly string[]> = {
  RIGHT_TO_WORK: ['GREEN_CARD', 'WORK_PERMIT', 'I9_EVERIFY'],
}

function inDate(h: HeldKeyRecord, on: Date): boolean {
  if (h.validFrom && h.validFrom.getTime() > on.getTime()) return false
  if (h.expiresAt && h.expiresAt.getTime() < on.getTime()) return false
  return true
}

/**
 * Everything a set requires that is not on file today.
 *
 * Pure: the caller reads the line's effective set and whatever is held,
 * and this decides what is still owed and what each row says.
 *
 * Four states, not two, and the fourth is the one that caused the 2017
 * bug — on file with no expiry recorded on a kind that expires — which
 * `heldWord` already says of a held row and which arrives here as a row
 * that counts, because a document with no end date is not an expired
 * one. What this adds is the state the old build had no word for at
 * all: required, never filed, and therefore invisible.
 */
export function outstandingItems(input: {
  items: RequiredItem[]
  /** What is already on file about whoever owes it. */
  held?: HeldKeyRecord[]
  /** Narrow to one party's items — WORKER on a person's own page. */
  owedBy?: string[]
  on?: Date
}): OutstandingItem[] {
  const on = input.on ?? new Date()
  const all = input.held ?? []
  // Only what actually came back counts as held. What was merely sent is
  // read further down, where it changes whose move it is and not whether
  // anything is on file.
  const held = all.filter((h) => h.accepted)
  const out: OutstandingItem[] = []

  for (const raw of input.items) {
    if (!raw.required) continue
    if (input.owedBy && !input.owedBy.includes(raw.owedBy)) continue

    // A type nobody defined arrives with its own key as its label,
    // because that is what `effectiveRequirements` falls back to. Helena
    // Marsh read "FURNACE_SAFETY_INDUCTION" on her own paperwork page on
    // the walk that found this. The key is for the machine; the sentence
    // is the product — and it is done here, once, so every reader of a
    // set gets it rather than each humanizing its own copy.
    const item = raw.label === raw.key ? { ...raw, label: humanKey(raw.key) } : raw

    // What she holds that answers this item: the type itself, and
    // anything that proves it outright.
    const answers = [item.key, ...(SATISFIED_BY[item.key] ?? [])]
    // Everything that answers this item and actually arrived: what came
    // back as a check, and what was sent as a paper. A check still
    // running arrived as nothing and is not here, so it can never be
    // read as a document that has run out.
    const mine = all.filter((h) => answers.includes(h.key) && (h.accepted || h.received))
    const current = mine.find((h) => h.accepted && inDate(h, on))

    if (item.waived) {
      out.push({
        key: item.key,
        label: item.label,
        owedBy: item.owedBy,
        owedByName: item.owedByName,
        stopsWork: false,
        state: 'WAIVED',
        word: 'Waived — on the list, not expected',
        asked: item.says,
        ranOutOn: null,
        waivedSays: item.waivedSays,
      })
      continue
    }

    // On file and in date. Nobody is waiting on anybody, so it is not
    // outstanding — the page shows it under what is held.
    if (current) continue

    // Sent, and with whoever asked. Still on her list, because it is not
    // done; no longer her move, because it is not hers.
    //
    // Only where it would cover today. A paper that arrived and has
    // already run out is a lapse and not a pending review — telling her
    // to wait for somebody to check a certificate that expired in March
    // is telling her to wait for nothing.
    const sent = mine.find((h) => !h.accepted && h.received && inDate(h, on))
    if (sent) {
      out.push({
        key: item.key,
        label: item.label,
        owedBy: item.owedBy,
        owedByName: item.owedByName,
        stopsWork: item.blocks,
        state: 'AWAITING_REVIEW',
        word: 'Sent — waiting for somebody to check it',
        asked: item.says,
        ranOutOn: null,
        waivedSays: null,
      })
      continue
    }

    // A certificate whose period has not begun is not a missing one: it
    // was asked for and supplied, and the person is still uncovered on
    // day one. Named apart so the sentence can say the true thing.
    const early = mine.find((h) => h.validFrom && h.validFrom.getTime() > on.getTime())
    const lapsed = mine
      .filter((h) => h.expiresAt && h.expiresAt.getTime() < on.getTime())
      .sort((a, b) => b.expiresAt!.getTime() - a.expiresAt!.getTime())[0]

    const state: OutstandingState = lapsed ? 'LAPSED' : early ? 'NOT_YET_VALID' : 'MISSING'
    const word =
      state === 'LAPSED'
        ? heldWord(lapsed!.expiresAt, on, item.blocks)
        : state === 'NOT_YET_VALID'
          ? `On file, but not in force until ${early!.validFrom!.toISOString().slice(0, 10)}`
          : item.blocks
            ? 'Not on file — work cannot start without it'
            : 'Not on file'

    out.push({
      key: item.key,
      label: item.label,
      owedBy: item.owedBy,
      owedByName: item.owedByName,
      stopsWork: item.blocks,
      state,
      word,
      asked: item.says,
      ranOutOn: lapsed?.expiresAt ?? null,
      waivedSays: null,
    })
  }

  // What stops the work first, then what somebody already filed and let
  // run out, then the rest by name.
  const rank: Record<OutstandingState, number> = { LAPSED: 0, NOT_YET_VALID: 1, MISSING: 2, AWAITING_REVIEW: 3, WAIVED: 4 }
  return out.sort(
    (a, b) =>
      Number(b.stopsWork) - Number(a.stopsWork) ||
      rank[a.state] - rank[b.state] ||
      a.label.localeCompare(b.label)
  )
}

// `humanKey` and `sayType` used to live here. They moved to
// `lib/document-type` in the architect's 204b4e02, which is the right
// home: a type key is the dictionary's vocabulary, and the copy here
// detected an undefined type by the label coming back equal to the key
// — which stopped being true the hour `labelFor` learned to humanize.
// A test that only checks the rendered name cannot see that, which is
// why `document-type.test.ts` and this file's own sentence both pin the
// caveat rather than the spelling.

/**
 * Everything asked of one person, in one list.
 *
 * Pure: the caller selects the rows and this decides what they say. Both
 * halves are already scoped to the person by the query that found them —
 * a document about them, a packet raised against them — so nothing here
 * can widen that.
 */
export function myPapers(input: {
  /** The caller's own address, so a link addressed elsewhere is withheld. */
  myEmail: string | null
  documents: SentDocument[]
  packets: AskedPacket[]
  /** What is already on file about them, and when each stops counting. */
  held?: HeldRecord[]
  /**
   * What the lines they are on require of them and nobody has filed.
   *
   * The half that was missing until 2026-09-21: every chase letter told
   * her to upload it from this page and this page did not know the
   * document existed. `outstandingItems` computes it from the line's own
   * effective set, so what she is asked for here and what the refusal at
   * activation names are the same items.
   */
  owed?: OutstandingItem[]
  /**
   * The `DocInstance` already open for a type key, where one is. A
   * second press is the same request rather than a second one.
   */
  asksByKey?: Record<string, string>
  /** The day it is read on. Only used to say how long is left. */
  on?: Date
}): Paper[] {
  const papers: Paper[] = []
  const now = input.on ?? new Date()

  // ── One document is one row on her page ────────────────────────────
  //
  // A `DocInstance` opened against a requirement is two things the
  // system knows about: a paper somebody asked for, and the answer to an
  // item on her list. It was emitted as both, with the SAME id — so one
  // upload rendered twice, once under "Sent, waiting to be checked" and
  // once under "Papers somebody sent you", marked "On file". Same
  // document, opposite words, and the second row claimed a firm had sent
  // it TO her when she had sent it to them.
  //
  // While the requirement is unanswered the OUTSTANDING row IS the
  // document: it carries the state, which item it answers, whose order
  // asked for it, and whether work stops without it. The DOCUMENT row
  // carries none of that. So the outstanding row wins and the duplicate
  // is not produced. Once the item is satisfied it leaves `owed`
  // altogether and the DOCUMENT row is the only one left, which is the
  // right row for a paper that is simply on file.
  const answering = new Set(
    (input.owed ?? []).map((o) => input.asksByKey?.[o.key]).filter((id): id is string => !!id)
  )

  for (const d of input.documents) {
    // Not asked yet is the company's business, not the person's.
    if (d.status === 'PENDING') continue
    if (answering.has(d.id)) continue
    papers.push({
      id: d.id,
      kind: 'DOCUMENT',
      name: d.templateName,
      partOf: null,
      askedBy: d.issuerName,
      why: null,
      needsSignature: d.needsSignature,
      status: d.status,
      word: statusWord(d.status),
      askedAt: d.sentAt?.toISOString() ?? null,
      doneAt: d.signedAt?.toISOString() ?? null,
      dueOn: null,
      todo: d.status === 'SENT' ? (d.needsSignature ? 'sign' : 'upload') : null,
      // Answered on the page itself, through /api/documents/:id.
      link: null,
    })
  }

  for (const p of input.packets) {
    // A withdrawn ask is not still asking anybody for anything.
    if (p.cancelledAt) continue
    // The token is the only credential the link carries, so it is offered
    // to the address it was sent to and to nobody else — even where the
    // packet is about the person reading the page.
    const mine =
      !!input.myEmail && p.recipientEmail.trim().toLowerCase() === input.myEmail.trim().toLowerCase()
    for (const item of [...p.items].sort((a, b) => a.position - b.position)) {
      const answered = ANSWERED.includes(item.state)
      papers.push({
        id: item.id,
        kind: 'REQUEST',
        name: asRow(item.label),
        partOf: p.label,
        askedBy: p.askedBy,
        why: p.reason,
        // A packet takes the file; it never asks anybody to sign.
        needsSignature: false,
        status: item.state,
        word: askWord(item.state),
        askedAt: p.createdAt.toISOString(),
        doneAt: item.receivedAt?.toISOString() ?? null,
        dueOn: p.expiresAt.toISOString(),
        // Answered at the link, not here — so the page never offers a
        // button that posts a packet item to the documents route.
        todo: answered || !mine ? null : 'open',
        link: mine ? `/packet/${p.token}` : null,
      })
    }
  }

  // ── What is already on file, and the day it runs out ───────────────
  //
  // Not an ask, so it never carries a `todo` — nobody is waiting on the
  // person for a document they have already given us. It is here because
  // the day it runs out is the one fact about her own file she cannot
  // get anywhere else, and she is the one who has to renew it.
  for (const h of input.held ?? []) {
    // A check still running is not a document she holds, and telling her
    // it is on file is how somebody relies on paperwork that does not
    // exist. Only what actually came back is shown.
    if (!ACCEPTED_CHECK.includes(h.status)) continue
    papers.push({
      id: h.id,
      kind: 'HELD',
      name: asRow(h.label),
      partOf: null,
      askedBy: h.provider ?? 'On your file',
      why: null,
      needsSignature: false,
      status: h.status,
      word: heldWord(h.expiresAt ?? null, now, h.stopsWork),
      askedAt: (h.validFrom ?? null)?.toISOString() ?? null,
      doneAt: (h.validFrom ?? null)?.toISOString() ?? null,
      dueOn: h.expiresAt?.toISOString() ?? null,
      runsOutOn: h.expiresAt?.toISOString() ?? null,
      todo: null,
      link: null,
    })
  }

  // ── What is still owed, and nobody has asked for yet ───────────────
  //
  // An item can be required on a line with no packet and no document
  // ever sent for it — which is most of them, because a set is a rule
  // and an ask is an act. She is told what it is, who asked, and whether
  // work stops without it, so the letter she was sent and the page it
  // sends her to say the same thing.
  for (const o of input.owed ?? []) {
    // Where a request has already been opened for this item, the row is
    // that request's — it has an id, a status and somewhere to answer.
    const ask = input.asksByKey?.[o.key] ?? null
    papers.push({
      id: ask ?? `owed:${o.key}`,
      kind: 'OUTSTANDING',
      name: asRow(o.label),
      partOf: null,
      // Nobody has asked yet. `owedByName` is the party that OWES it,
      // which on her own page is her, and "Helena Marsh asked for Helena
      // Marsh's I-9" reads as though she asked herself.
      askedBy: null,
      why: o.waivedSays ?? capitalize(o.asked),
      needsSignature: false,
      status: o.state,
      word: o.word,
      askedAt: null,
      doneAt: null,
      dueOn: null,
      runsOutOn: o.ranOutOn?.toISOString() ?? null,
      // Nothing was sent, so there is no link and no signature page. The
      // upload on her own page is the answer, and a waived item asks her
      // for nothing at all.
      todo: o.state === 'WAIVED' || o.state === 'AWAITING_REVIEW' ? null : 'upload',
      link: null,
      stopsWork: o.stopsWork,
      waived: o.state === 'WAIVED',
      // Only where a paper for this row actually arrived. Never inferred
      // from the row having nowhere to send it.
      received: o.state === 'AWAITING_REVIEW',
      documentTypeKey: o.key,
      // Nothing to post against until a request exists, so the page asks
      // for one here and then answers it at /api/documents/:id/upload —
      // the same door, and the same rule, as every other paper.
      openAskAt: o.state === 'WAIVED' || o.state === 'AWAITING_REVIEW' ? null : '/api/me/papers',
    })
  }

  // What still needs doing first, then the most recent ask. A page that
  // opens on what is finished makes somebody scroll to find their work.
  return papers.sort((a, b) => {
    // What stops her working comes first, whoever asked and whenever.
    if (!!a.stopsWork !== !!b.stopsWork) return a.stopsWork ? -1 : 1
    if (!!a.todo !== !!b.todo) return a.todo ? -1 : 1
    return (b.askedAt ?? '').localeCompare(a.askedAt ?? '')
  })
}

// ── A signed paper, and the day it stops counting ─────────────────────
//
// "Ensure the loop of documents never cracks between parties."
// — the founder, 2026-09-21.
//
// `Verification` has been watched since it was written: `cron/watch`
// reads what is running out and asks for the renewal. `DocInstance` —
// the other half of the paperwork, the papers somebody signs rather than
// the checks somebody runs — had no dates at all until this morning, so
// an NDA could be asked for, signed, and never looked at again. Nothing
// could say it had run out, nothing chased the replacement, and a lapse
// moved no verdict anywhere.
//
// Two things are needed for that to stop: knowing WHAT a signed paper
// is (a template called "Mutual NDA — 2026" has to resolve to the NDA a
// line requires), and knowing WHEN it stops counting. Both are below.
//
// This file writes no letters. It returns the facts, grouped by the
// party that owes each one, and `etyme-conversation` writes what each
// party is told — because who is told what, on which channel, how often,
// is that domain's question and not this one's.

/** The shipped types a template's own name can be recognized as. */
const NAMED_BY: { key: string; names: RegExp }[] = [
  // Spelled as a pattern rather than as the words, because a screen may
  // never put "master agreement" beside "master contract" — see
  // `order-lines.test.ts`. An agreement is "Agreement" or "MSA".
  { key: 'MSA', names: /\bmsa\b|\bmaster\s+(services?|agreem\w+)\b/i },
  // "confidentiality" used to be here and is not a word that names this
  // document. A client's "Product confidentiality undertaking" is its
  // own type, and matching it to the NDA between two firms put one
  // uploaded paper on two rows of a worker's file — one saying a
  // document had arrived when no such document existed. A pattern that
  // matches a concept rather than a name is a guess.
  { key: 'NDA', names: /\b(nda|non-?disclosure)\b/i },
  { key: 'NCA', names: /\b(nca|non-?compete|non-?competition|non-?solicit\w*)\b/i },
  { key: 'EMPLOYMENT_AGREEMENT', names: /\b(employment agreement|offer letter|contract of employment)\b/i },
  { key: 'SOW', names: /\b(sow|statement of work)\b/i },
  { key: 'W9', names: /\bw-?9\b/i },
]

/**
 * Which type of document a signed paper is, read off its own name.
 *
 * Null is a real answer and the honest failure: a non-disclosure
 * agreement filed under "Form 7" satisfies nothing, stays on the list,
 * and gets chased until somebody names it. Guessing the other way — a
 * paper nobody can identify counting as the one a line required — is how
 * a file looks complete and is not.
 *
 * A company's own dictionary is read first, by exact label, so a client
 * that invents "Hot floor induction" and sends it as a document for
 * signature gets it matched to the type its order asked for.
 */
export function typeKeyForTemplate(
  templateName: string,
  types: { key: string; label: string }[] = [],
  opts: {
    /**
     * Whether a paper whose name nobody recognizes may be guessed at
     * from the words in it.
     *
     * True for a verdict being assembled out of whatever is on file,
     * where a "Mutual NDA — 2026" ought to answer a line's NDA. **False
     * wherever a paper is being credited against a requirement**, which
     * is the reading that decides whether somebody is chased. A guess
     * that lands on the wrong row does not merely fail to satisfy an
     * item — it reports a document as having arrived when none has, and
     * a compliance record that says a paper exists when it does not is
     * the worst thing this file can produce.
     */
    guess?: boolean
  } = {}
): string | null {
  const name = templateName.trim()
  if (!name) return null
  const exact = types.find(
    (t) => t.label.trim().toLowerCase() === name.toLowerCase() || t.key.toLowerCase() === name.toLowerCase()
  )
  if (exact) return exact.key
  if (opts.guess === false) return null
  for (const row of NAMED_BY) {
    if (row.names.test(name)) return row.key
  }
  return null
}

/** A `DocInstance` row, as the arithmetic needs it. */
export interface SignedPaper {
  id: string
  status: string
  validFrom?: Date | null
  expiresAt?: Date | null
  signedAt?: Date | null
  countersignedAt?: Date | null
  template: { name: string; needsSignature?: boolean }
}

/**
 * What signed papers amount to, as documents held.
 *
 * A paper needing two signatures is held from the later of them — an
 * agreement is not executed until both firms have signed, and treating
 * one signature as the whole thing is how a half-executed agreement
 * reads as cover.
 */
export function heldFromDocInstances(
  rows: SignedPaper[],
  types: { key: string; label: string }[] = []
): { key: string; validFrom: Date | null; expiresAt: Date | null; accepted: boolean }[] {
  const out: { key: string; validFrom: Date | null; expiresAt: Date | null; accepted: boolean }[] = []
  for (const r of rows) {
    const key = typeKeyForTemplate(r.template.name, types)
    if (!key) continue
    if (!ON_FILE.includes(r.status)) continue
    const signed = r.countersignedAt && r.signedAt
      ? (r.countersignedAt > r.signedAt ? r.countersignedAt : r.signedAt)
      : (r.countersignedAt ?? r.signedAt ?? null)
    out.push({
      key,
      validFrom: r.validFrom ?? signed ?? null,
      expiresAt: r.expiresAt ?? null,
      accepted: true,
    })
  }
  return out
}

// ── What is running out, and who owes it ──────────────────────────────
//
// `cron/watch` has read `Verification` since it was written and there
// was nothing on the other cluster for it to read: a signed paper had no
// dates. Now it does, and this is what the nightly job asks.
//
// It sends nothing. It returns the facts, grouped by the party that owes
// each one, and `etyme-conversation` decides what each party is told, on
// which channel, how often — because a letter is that domain's question
// and a date is this one's. Returning a list rather than sending a
// letter is also what makes it testable on a fixed day.

import { prisma } from '@/lib/db'
import { requirementsFor, type OwedBy } from '@/lib/document-requirements'
import { labelFor } from '@/lib/document-type'

/** How far ahead a lapse is worth telling somebody about. */
export const CHASE_WINDOW_DAYS = 60

/** One document that is running out, or has. */
export interface LapsingDocument {
  /** Where the fact lives: a signed paper, or a check that was run. */
  kind: 'SIGNED_PAPER' | 'CHECK'
  /** The `DocInstance` or `Verification` id. */
  id: string
  /** The type key, where the document resolves to one. */
  key: string | null
  /** What it is called, in the words the parties use. */
  document: string
  /** The line it hangs off, where it hangs off one. */
  line: { side: 'SELL' | 'BUY'; id: string } | null
  /** WORKER · SUPPLIER · CUSTOMER · US, where the line's set says. */
  owedBy: OwedBy | null
  /** The firm or the person that owes it. Null is a real answer. */
  owedByName: string | null
  /** The person the document is about, where it is about one. */
  personId: string | null
  /** The firm the document is about, where it is about one. */
  companyId: string | null
  /**
   * The firm that should hear about it: whoever holds the line.
   *
   * Not always the party that owes the document — an NDA a worker owes
   * is chased by the firm that placed them — which is why `owedBy` and
   * this are two fields. The sentence names who owes it; this decides
   * whose desk reads it.
   */
  tellCompanyId: string | null
  expiresAt: Date
  /** Negative where it has already run out. */
  daysLeft: number
  lapsed: boolean
  /** True where the line's own set says a lapse stops the work. */
  stopsWork: boolean
  /** The fact, in one sentence. Never the letter — that is conversation's. */
  says: string
}

export interface DocumentWatch {
  on: Date
  windowDays: number
  /** Running out inside the window, still in date today. */
  lapsing: LapsingDocument[]
  /** Already run out. */
  lapsed: LapsingDocument[]
  /** The same rows, grouped by who has to do something about them. */
  byParty: {
    owedBy: OwedBy | null
    name: string | null
    personId: string | null
    companyId: string | null
    items: LapsingDocument[]
  }[]
}

function daysBetween(a: Date, b: Date): number {
  return Math.ceil((a.getTime() - b.getTime()) / 86_400_000)
}

function sentence(document: string, who: string | null, daysLeft: number): string {
  const whose = who ? `${who}’s ` : ''
  if (daysLeft < 0) {
    const n = Math.abs(daysLeft)
    return `${whose}${document} ran out ${n === 1 ? 'yesterday' : `${n} days ago`}.`
  }
  if (daysLeft === 0) return `${whose}${document} runs out today.`
  return `${whose}${document} runs out in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`
}

type Db = typeof prisma

/**
 * Every signed paper on a line that is inside the chase window or past
 * it, with the party that owes it.
 *
 * Who owes what is not decided here: it is read off the line's own set
 * through `lib/document-requirements`, the same door the refusal reads,
 * so the firm chased for a document and the firm refused for its absence
 * are the same firm.
 */
export async function lookAtDocInstances(
  now: Date = new Date(),
  opts: { windowDays?: number; db?: Db } = {}
): Promise<DocumentWatch> {
  const db = opts.db ?? prisma
  const windowDays = opts.windowDays ?? CHASE_WINDOW_DAYS
  const horizon = new Date(now.getTime() + windowDays * 86_400_000)

  const rows = await db.docInstance.findMany({
    where: {
      status: { in: ['SIGNED', 'UPLOADED'] },
      expiresAt: { not: null, lte: horizon },
      OR: [{ sellContractId: { not: null } }, { buyContractId: { not: null } }],
    },
    select: {
      id: true, subjectType: true, subjectId: true, expiresAt: true,
      sellContractId: true, buyContractId: true,
      sellContract: { select: { companyId: true } },
      buyContract: { select: { companyId: true } },
      template: { select: { name: true } },
    },
  })

  const found: LapsingDocument[] = []
  for (const r of rows) {
    if (!r.expiresAt) continue
    const lineId = r.sellContractId ?? r.buyContractId!
    const side: 'SELL' | 'BUY' = r.sellContractId ? 'SELL' : 'BUY'
    const set = await requirementsFor(
      side === 'SELL' ? { sellContractId: lineId } : { buyContractId: lineId },
      db as never
    )
    const key = typeKeyForTemplate(r.template.name, (set?.items ?? []).map((i) => ({ key: i.key, label: i.label })))
    const item = key ? (set?.items ?? []).find((i) => i.key === key) ?? null : null
    const daysLeft = daysBetween(r.expiresAt, now)
    found.push({
      kind: 'SIGNED_PAPER',
      id: r.id,
      key,
      document: item?.label ?? r.template.name,
      line: { side, id: lineId },
      owedBy: item?.owedBy ?? null,
      owedByName: item?.owedByName ?? null,
      personId: r.subjectType === 'PERSON' ? r.subjectId : null,
      companyId: r.subjectType === 'COMPANY' ? r.subjectId : null,
      tellCompanyId: r.sellContract?.companyId ?? r.buyContract?.companyId ?? null,
      expiresAt: r.expiresAt,
      daysLeft,
      lapsed: daysLeft < 0,
      stopsWork: item?.blocks ?? false,
      says: sentence(item?.label ?? r.template.name, item?.owedByName ?? null, daysLeft),
    })
  }

  return assembleWatch(now, windowDays, found)
}

/**
 * The checks that have to be run again, and are not.
 *
 * `BACKGROUND_CHECK` has carried `validMonths: 12` since the rules were
 * written and nothing ever re-asked at the twelve-month mark, the way
 * the license chase re-asks. It was not a silent permit — an absent
 * check already warns at every start — but a check that quietly ages out
 * on somebody who has been on a client's site for two years is exactly
 * the state CLAUDE.md names: on file, out of date, and green.
 *
 * It stays a WARN and becomes a chase. Nobody is stopped from working
 * over a screening that needs redoing; somebody is asked to redo it.
 */
export async function checksToRedo(
  now: Date = new Date(),
  opts: { windowDays?: number; db?: Db; types?: string[] } = {}
): Promise<DocumentWatch> {
  const db = opts.db ?? prisma
  const windowDays = opts.windowDays ?? CHASE_WINDOW_DAYS
  const horizon = new Date(now.getTime() + windowDays * 86_400_000)
  const types = (opts.types ?? ['BACKGROUND_CHECK', 'DRUG_SCREENING']) as never[]

  const rows = await db.verification.findMany({
    where: {
      type: { in: types },
      status: { in: ['CLEAR', 'CONDITIONAL'] },
      expiresAt: { not: null, lte: horizon },
      personId: { not: null },
      // Only where the person is actually working. A screening that aged
      // out on somebody who left two years ago is nobody's work.
      person: { sellContracts: { some: { state: { in: ['IN_PROGRESS', 'PAUSED'] } } } },
    },
    select: {
      id: true, type: true, expiresAt: true, personId: true,
      person: {
        select: {
          name: true,
          sellContracts: {
            where: { state: { in: ['IN_PROGRESS', 'PAUSED'] } },
            select: { companyId: true },
            take: 1,
          },
        },
      },
    },
  })

  const found: LapsingDocument[] = rows
    .filter((r) => r.expiresAt)
    .map((r) => {
      const daysLeft = daysBetween(r.expiresAt!, now)
      const label = labelFor(r.type)
      return {
        kind: 'CHECK' as const,
        id: r.id,
        key: r.type,
        document: label,
        line: null,
        owedBy: 'WORKER' as OwedBy,
        owedByName: r.person?.name ?? null,
        personId: r.personId,
        companyId: null,
        // The firm they are placed through does the chasing: a screening
        // is the employer's to re-run, not the worker's to go and buy.
        tellCompanyId: r.person?.sellContracts[0]?.companyId ?? null,
        expiresAt: r.expiresAt!,
        daysLeft,
        lapsed: daysLeft < 0,
        // A screening warns; it has never blocked and does not start now.
        stopsWork: false,
        says: sentence(label, r.person?.name ?? null, daysLeft),
      }
    })

  return assembleWatch(now, windowDays, found)
}

/**
 * Everything a chase or a lapse letter needs tonight, from both tables.
 *
 * This is the one line `api/cron/watch` calls.
 */
export async function documentsToChase(
  now: Date = new Date(),
  opts: { windowDays?: number; db?: Db } = {}
): Promise<DocumentWatch> {
  const [papers, checks] = await Promise.all([lookAtDocInstances(now, opts), checksToRedo(now, opts)])
  return assembleWatch(now, papers.windowDays, [
    ...papers.lapsed, ...papers.lapsing, ...checks.lapsed, ...checks.lapsing,
  ])
}

function assembleWatch(on: Date, windowDays: number, found: LapsingDocument[]): DocumentWatch {
  // Worst first: what has already run out, then what runs out soonest.
  const sorted = [...found].sort((a, b) => a.daysLeft - b.daysLeft)
  const byParty = new Map<string, DocumentWatch['byParty'][number]>()
  for (const f of sorted) {
    const id = `${f.owedBy ?? 'UNKNOWN'}:${f.personId ?? f.companyId ?? f.owedByName ?? 'nobody'}`
    const row = byParty.get(id)
    if (row) row.items.push(f)
    else byParty.set(id, {
      owedBy: f.owedBy,
      name: f.owedByName,
      personId: f.personId,
      companyId: f.companyId,
      items: [f],
    })
  }
  return {
    on,
    windowDays,
    lapsing: sorted.filter((f) => !f.lapsed),
    lapsed: sorted.filter((f) => f.lapsed),
    byParty: [...byParty.values()],
  }
}

/**
 * The same answer in the nightly watcher's own shape.
 *
 * `api/cron/watch` already reads six of these and knows how to route a
 * finding to the desk that can act on it, digest them and send one note
 * per company. It is `etyme-platform`'s file, so this is the one line it
 * adds, beside the six it already has:
 *
 *     ...(await documentFindings(now)),
 *
 * Nothing is sent from here and nothing is reopened: `NOTIFY_ONLY` on
 * every row, because what a lapsing agreement needs is a letter to the
 * party that owes it and that letter is `etyme-conversation`'s to write.
 */
export function asFindings(watch: DocumentWatch): {
  kind: string
  urgency: 'BLOCKING' | 'SOON' | 'WORTH_KNOWING'
  companyId: string
  subjectType: string
  subjectId: string
  headline: string
  detail: string
  action: 'NOTIFY_ONLY'
  daysUntil: number | null
}[] {
  const rows = [...watch.lapsed, ...watch.lapsing]
  return rows
    // A finding with no company has no desk to arrive at. Reported as a
    // gap in the return rather than sent to everybody.
    .filter((r) => !!r.tellCompanyId)
    .map((r) => ({
      kind: r.kind === 'CHECK' ? 'CHECK_DUE_AGAIN' : 'DOCUMENT_LAPSING',
      urgency: r.lapsed && r.stopsWork ? 'BLOCKING' : r.daysLeft <= 14 ? 'SOON' : 'WORTH_KNOWING',
      companyId: r.tellCompanyId!,
      subjectType: r.kind === 'CHECK' ? 'Verification' : 'DocInstance',
      subjectId: r.id,
      headline: r.says,
      detail:
        (r.owedByName ? `${r.owedByName} owes it. ` : '') +
        (r.stopsWork
          ? 'Work stops on this line while it is out of date.'
          : 'It stops nothing on its own, and it is still owed.'),
      action: 'NOTIFY_ONLY' as const,
      daysUntil: r.daysLeft,
    }))
}

/** Everything running out tonight, in the watcher's shape. One line. */
export async function documentFindings(
  now: Date = new Date(),
  opts: { windowDays?: number; db?: Db } = {}
) {
  return asFindings(await documentsToChase(now, opts))
}
