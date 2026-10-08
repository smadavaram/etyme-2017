/**
 * What a seat with no desk may do on the buying side. Pure: no database.
 *
 * Sign-up walk, round five (2026-10-08), problems 3 and 4. Karthik Menon
 * is Teleworld's own W2 validation engineer. His seat holds the two reads
 * every worker holds — the work he is on and his own hours — and no desk.
 * From his own menu he read all six of Teleworld's submissions with each
 * colleague's rate, read the client's rate band on Shared with you, and
 * put a stranger in front of Corveldt Aerospace by pasting a CV, which
 * landed the stranger on Teleworld's bench. A worker is somebody the work
 * is about, not a desk that sells.
 *
 * ── The predicate ────────────────────────────────────────────────────
 *
 * "Holds no desk" is the door's own rule, `isDeskless` in lib/nav-table:
 * a seat that holds nothing beyond a worker's own reads — nothing at all
 * (a Member not yet given a desk), or only `assignments.read` and
 * `timesheets.read`. One rule, so the door, the menu and these routes
 * cannot disagree about who holds a desk.
 */
import { isDeskless } from '@/lib/nav-table'
import { hasPermission } from '@/lib/permissions'
import { noDeskYet } from '@/lib/no-desk'

/** True for a seat that holds no desk: nothing, or only a worker's own reads. Null is "not known" and is never desk-less. */
export function holdsNoDesk(permissions: readonly string[] | null | undefined): boolean {
  return isDeskless(permissions)
}

/**
 * Whose submissions a list shows this seat.
 *
 * A seat with a desk reads what its firm's scope holds. A seat with no
 * desk reads only the submissions that name its holder, with no rate on
 * them: a rate is what the firm asked for the person, and is the selling
 * desk's to read. Asking for somebody else's by `personId=` is refused.
 */
export type SubmissionReach =
  | { ownOnly: false }
  | { ownOnly: true; personId: string }
  | { refused: true; askedPersonId: string }

export function submissionReach(input: {
  permissions: readonly string[] | null | undefined
  seated: boolean
  consultantSeat: boolean
  callerPersonId: string
  askedPersonId: string | null
}): SubmissionReach | { ownOnly: false } {
  if (input.seated || input.consultantSeat || !holdsNoDesk(input.permissions)) return { ownOnly: false }
  const asked = input.askedPersonId?.trim() || null
  if (asked && asked !== input.callerPersonId) return { refused: true, askedPersonId: asked }
  return { ownOnly: true, personId: input.callerPersonId }
}

/** The line the Submissions page shows over a desk-less seat's own rows. */
export function ownSubmissionsSays(company: string | null | undefined): string {
  const at = company?.trim() ? ` by ${company.trim().replace(/\.$/, '')}` : ''
  return (
    `These are the times you were put forward${at}. ` +
    'Your colleagues’ submissions and every rate are read by the recruiting desk.'
  )
}

/** The refusal when a desk-less seat asks for somebody else's submissions. Names nobody. */
export function othersSubmissionsRefused(company: string | null | undefined): string {
  return noDeskYet('Somebody else’s submissions', company)
}

/**
 * Whether this seat may put a new person in front of a client by
 * answering a job with a CV. Answering creates the person, lists them on
 * the firm's bench and submits them, so it is the recruiting desk's act
 * (`submissions.create`, held by Recruiter, Resource Manager and Account
 * Manager — lib/company-defaults). A delivery manager's carve-out covers
 * the firm's own employees only, and nobody answering with a pasted CV is
 * one.
 */
export type AnswerDoor =
  | { open: true }
  | { open: false; deskless: boolean }

export function mayAnswerWithCv(permissions: readonly string[] | null | undefined): AnswerDoor {
  const held = Array.isArray(permissions) ? permissions : []
  if (holdsNoDesk(held)) return { open: false, deskless: true }
  if (!hasPermission(held, 'submissions.create')) return { open: false, deskless: false }
  return { open: true }
}
