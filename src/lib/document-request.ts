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
