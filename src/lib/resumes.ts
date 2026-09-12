/**
 * A consultant's CV, and the copy that actually went out.
 *
 * There was no resume anywhere in this build. A submission arrived at a
 * client with a name, a rate and no document — which is not a submission
 * anybody can act on. It was the largest single gap in the candidate audit
 * and it blocks the whole pipeline: a client reads the CV, not the row.
 *
 * ── Three rules ──────────────────────────────────────────────────────
 *
 * **It belongs to the person.** Not to the agency that typed it in. An
 * agency may upload on their behalf — recruiters usually have the CV
 * before the consultant has an account — and who did it is recorded, but
 * the file is the person's and leaves with them.
 *
 * **A version is never edited.** Uploading again makes a new one. The
 * client acted on the document that was sent, not on whatever the person
 * has since rewritten, so a submission points at a specific version and
 * that version stops changing the moment it is sent.
 *
 * **Deleting hides it, and does not unsend it.** A CV a client already
 * received exists in their inbox whatever we do. It disappears from the
 * person's list and stays readable to whoever it was actually sent to,
 * because pretending otherwise would be a lie the client could disprove
 * by scrolling up.
 */

export const MAX_BYTES = 5 * 1024 * 1024

/** What a client's recruiter can actually open. */
export const ACCEPTED: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
  'application/rtf': 'rtf',
  'text/rtf': 'rtf',
}

export interface Verdict {
  ok: boolean
  reason: string
}

export function checkUpload(file: {
  name: string
  type: string
  size: number
}): Verdict {
  if (file.size === 0) return { ok: false, reason: 'That file is empty.' }

  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      reason: `That is ${Math.round(file.size / 1024 / 1024)}MB. Five is the limit — a CV over that is usually a scan, and a client cannot search a scan.`,
    }
  }

  const kind = ACCEPTED[file.type] ?? extensionOf(file.name)
  if (!kind) {
    return {
      ok: false,
      reason: 'PDF, Word or plain text. Anything else and half the recruiters who receive it cannot open it.',
    }
  }

  return { ok: true, reason: `${kind.toUpperCase()}, ${Math.max(1, Math.round(file.size / 1024))}KB.` }
}

function extensionOf(name: string): string | null {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  return ['pdf', 'doc', 'docx', 'txt', 'rtf'].includes(ext) ? ext : null
}

/** What to call it when nobody named it. */
export function labelFor(fileName: string, when: Date): string {
  const stem = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()
  return stem.length > 2 ? stem.slice(0, 60) : `CV, ${when.toISOString().slice(0, 10)}`
}

export interface Actor {
  personId: string
  companyId: string | null | undefined
}

export interface Owner {
  personId: string
  /** Companies holding a live bench listing for them. */
  listedTo: string[]
}

/**
 * Who may put a CV on somebody's file.
 *
 * Them, or an agency they have put themselves on the bench of. A recruiter
 * holding the CV before the person has an account is the ordinary way this
 * starts, and refusing it would mean the document lives in an inbox
 * instead.
 */
export function mayUpload(actor: Actor, owner: Owner): Verdict {
  if (actor.personId === owner.personId) return { ok: true, reason: 'Their own CV.' }

  if (actor.companyId && owner.listedTo.includes(actor.companyId)) {
    return { ok: true, reason: 'Uploaded by an agency they are on the bench of.' }
  }

  return {
    ok: false,
    reason: 'Only the consultant, or an agency they have put themselves on the bench of, can add a CV.',
  }
}

/**
 * Who may open one.
 *
 * The person; an agency currently representing them; and anybody who was
 * actually sent it. That last one is the point of a version — a client
 * keeps what they were given.
 */
export function mayRead(
  actor: Actor,
  owner: Owner,
  sentTo: string[]
): Verdict {
  if (actor.personId === owner.personId) return { ok: true, reason: 'Their own CV.' }

  if (actor.companyId && owner.listedTo.includes(actor.companyId)) {
    return { ok: true, reason: 'They are on this agency’s bench.' }
  }

  if (actor.companyId && sentTo.includes(actor.companyId)) {
    return { ok: true, reason: 'This CV was sent to them with a submission.' }
  }

  return {
    ok: false,
    reason: 'This CV was never sent to you, and this person is not on your bench.',
  }
}

export interface Version {
  id: string
  label: string
  fileName: string
  sizeBytes: number
  isCurrent: boolean
  createdAt: Date
  deletedAt: Date | null
  /** Companies it has actually been sent to. */
  sentTo: string[]
}

/**
 * What a person sees of their own CVs.
 *
 * Newest first, deleted ones gone — except that a deleted version which
 * has been sent somewhere is still shown, greyed, because it is out there
 * and hiding that from the person it belongs to helps nobody.
 */
export function visibleTo(versions: Version[]): Version[] {
  return versions
    .filter((v) => v.deletedAt === null || v.sentTo.length > 0)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

/**
 * Which one goes with the next submission.
 *
 * The current one. A deleted version is never sent again, whatever a stale
 * flag says.
 */
export function toSend(versions: Version[]): Version | null {
  return versions.find((v) => v.isCurrent && v.deletedAt === null) ?? null
}

/**
 * Said on a submission with no CV behind it.
 *
 * Not a refusal — a recruiter working a role at eight at night should not
 * be stopped by a missing file — but it is the first thing a client will
 * ask for, so it is said loudly rather than discovered later.
 */
export function missingNote(personName: string): string {
  return `${personName} has no CV on file. It can go without one, and the client will ask for it.`
}

/**
 * Whether deleting this one leaves the person with nothing.
 *
 * Worth saying before they do it, not after.
 */
export function lastOne(versions: Version[], deletingId: string): boolean {
  return visibleTo(versions).filter((v) => v.deletedAt === null && v.id !== deletingId).length === 0
}
