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

export type PaperKind = 'DOCUMENT' | 'REQUEST'

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

export interface Paper {
  id: string
  kind: PaperKind
  /** What it is, as the person would say it. */
  name: string
  /** The ask it came in, where it came in a list of several. */
  partOf: string | null
  /** Who asked. */
  askedBy: string
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

/** "professional license (RN 154-882, WI)" → sentence case, for a row. */
function asRow(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1)
}

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
}): Paper[] {
  const papers: Paper[] = []

  for (const d of input.documents) {
    // Not asked yet is the company's business, not the person's.
    if (d.status === 'PENDING') continue
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

  // What still needs doing first, then the most recent ask. A page that
  // opens on what is finished makes somebody scroll to find their work.
  return papers.sort((a, b) => {
    if (!!a.todo !== !!b.todo) return a.todo ? -1 : 1
    return (b.askedAt ?? '').localeCompare(a.askedAt ?? '')
  })
}
