/**
 * Why a Timesheets page with nothing on it is empty, in a sentence, and
 * the one step that is missing.
 *
 * The founder's tester, 2026-11-14 (fix list, area E, item E1). A small
 * supplier opened Timesheets and read "No timesheets yet." whatever the
 * cause: nobody placed, or people placed who had never signed in, or
 * people who had signed in and not filed. The page knew none of it, so
 * nobody could tell which step was theirs.
 *
 * The route already reads the firm's lines; this says what they mean.
 * Two cases, because a third (weeks filed) is never an empty list:
 *
 *   - **Nobody is placed.** A seat that may record a placement is handed
 *     "Record a placement"; any other seat is told who records one, by
 *     the contracts route's own sentence, with no link.
 *   - **People are placed and nobody has filed.** Up to three by name,
 *     each with what is true of them: not signed in yet, or not filed a
 *     week yet. Only the worker files, from their own page (founder,
 *     2026-09-28), and a timesheet never comes by email (2026-11-14), so
 *     nothing here offers the firm a way to file for them or an email
 *     door. A firm's own hours-due day is said where it has one.
 *
 * A client, or a firm seated in a client's program, reads its own sites
 * and approves; it records no placement and is never told a supplier's
 * worker's sign-in. A one-person firm is the worker, and reads "you".
 *
 * Pure: no database, no clock.
 */

/** The address that opens Record a placement on Contracts. */
export const RECORD_A_PLACEMENT_HREF = '/dashboard/contracts?new=1'
/** Where a firm's people, and their invitations, are kept. */
export const CANDIDATES_HREF = '/dashboard/consultants'

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export interface EmptyLink {
  label: string
  href: string
}

export interface EmptyPerson {
  personId: string
  name: string
  /** Signed in to Etyme at least once, on any door. */
  signedIn: boolean
  /** The person reading the page. */
  isReader: boolean
}

export interface EmptyWhy {
  why: 'NOBODY_PLACED' | 'NOBODY_FILED'
  /** The heading of the empty list. */
  says: string
  /** The sentence under it, or null. */
  detail: string | null
  /** The act that unblocks it, for a seat that may do it. */
  link: EmptyLink | null
  /** Up to three placed people, each with what is true of them. */
  people: { personId: string; name: string; says: string; link: EmptyLink | null }[]
}

export interface EmptyFacts {
  /** A client reading its own sites, or a firm seated in a client's program. */
  asClient: boolean
  /** The client whose program a seated firm is reading; null otherwise. */
  seatedFor: string | null
  /** A one-person firm: she is the firm and the worker. */
  onePerson: boolean
  /** Lines in this reader's book, in any state. */
  anyLines: number
  /** The people on a line still open (not ended or cancelled), each once. */
  placed: EmptyPerson[]
  /** This seat may record a placement and may open Contracts. */
  mayRecord: boolean
  /** The contracts route's sentence naming who records one, for any other seat. */
  recordSays: string | null
  /** This seat may open Candidates and send an invitation again there. */
  mayOpenCandidates: boolean
  /** For any other seat: the sentence naming who sends it again, with no link. */
  inviteSays?: string | null
  /** The reader's own company's hours-due weekday (0 = Sunday), or null where it has none to say. */
  hoursDueWeekday: number | null
}

/** Shown by name, at most. */
export const NAMED_AT_MOST = 3

export function emptyWhy(f: EmptyFacts): EmptyWhy {
  const sites = f.seatedFor ? `${f.seatedFor}’s sites` : 'your sites'
  const due = f.hoursDueWeekday != null && WEEKDAY[f.hoursDueWeekday]
    ? `Each week’s hours are due the ${WEEKDAY[f.hoursDueWeekday]} after it ends, by your company’s settings.`
    : null

  if (f.placed.length === 0) {
    const yet = f.anyLines === 0 ? 'yet' : 'right now'
    if (f.asClient) {
      return {
        why: 'NOBODY_PLACED',
        says: `Nobody is working at ${sites} ${yet}, so there are no hours to approve.`,
        detail: 'A contract starts when a job request is awarded to a supplier. Its hours show here once the worker files them.',
        link: null,
        people: [],
      }
    }
    const says = f.onePerson
      ? `You have no placement ${yet}, so there are no hours to file.`
      : `Nobody is placed ${yet}, so there are no hours to file.`
    const starts = 'A placement starts when a client awards a submission.'
    return f.mayRecord
      ? {
          why: 'NOBODY_PLACED',
          says,
          detail: `${starts} Work you already run can be recorded now.`,
          link: { label: 'Record a placement', href: RECORD_A_PLACEMENT_HREF },
          people: [],
        }
      : {
          why: 'NOBODY_PLACED',
          says,
          detail: f.recordSays ? `${starts} ${f.recordSays}` : starts,
          link: null,
          people: [],
        }
  }

  // Ordered by name, then by id, so two people of one name keep one order.
  const sorted = [...f.placed].sort((a, b) => a.name.localeCompare(b.name) || a.personId.localeCompare(b.personId))
  const named = sorted.slice(0, NAMED_AT_MOST)
  const more = sorted.length - named.length

  if (f.asClient) {
    return {
      why: 'NOBODY_FILED',
      says: sorted.length === 1
        ? `${sorted[0].name} is working at ${sites}, and no week has been filed yet.`
        : `${sorted.length} people are working at ${sites}, and no week has been filed yet.`,
      detail:
        'Only the worker files hours, from their own page. Each week comes here to approve once it is filed.' +
        (more > 0 ? ` ${more} more ${more === 1 ? 'person has' : 'people have'} not filed either.` : ''),
      link: null,
      people: named.map((p) => ({ personId: p.personId, name: p.name, says: `${p.name} has not filed a week yet.`, link: null })),
    }
  }

  // A one-person firm reading her own placement: she is the one who files.
  if (sorted.length === 1 && sorted[0].isReader) {
    return {
      why: 'NOBODY_FILED',
      says: 'You have not filed a week yet.',
      detail: ['You file your own hours, from this page or from Your work.', due].filter(Boolean).join(' '),
      link: null,
      people: [],
    }
  }

  return {
    why: 'NOBODY_FILED',
    says: sorted.length === 1
      ? `${sorted[0].name} is placed, and no week has been filed yet.`
      : `${sorted.length} people are placed, and no week has been filed yet.`,
    detail: [
      'Only the worker files hours, from their own page. Nobody at the firm files for them.',
      due,
      more > 0 ? `${more} more ${more === 1 ? 'person has' : 'people have'} not filed either.` : null,
      // Somebody named has not signed in, and this seat cannot send the
      // invitation again: who can, once, with no link.
      !f.mayOpenCandidates && named.some((p) => !p.isReader && !p.signedIn) ? f.inviteSays ?? null : null,
    ].filter(Boolean).join(' '),
    link: null,
    people: named.map((p) => {
      if (p.isReader) return { personId: p.personId, name: p.name, says: 'You have not filed a week yet.', link: null }
      if (!p.signedIn) {
        return {
          personId: p.personId,
          name: p.name,
          says: `${p.name} has not signed in to Etyme yet, so no week can be filed.`,
          link: f.mayOpenCandidates ? { label: 'Open Candidates', href: CANDIDATES_HREF } : null,
        }
      }
      return { personId: p.personId, name: p.name, says: `${p.name} has signed in and has not filed a week yet.`, link: null }
    }),
  }
}

/**
 * The line at the top of a firm's Timesheets, beside the list.
 *
 * It read "<Firm> accepts them once the client has signed", which is not
 * so: on a direct placement the employer may accept before the client
 * approves, and one payroll person may attach the client's approval and
 * accept the same week (founder, 2026-11-14). It says who does what, and
 * no order.
 */
export function firmFilingSays(firmName: string | null): string {
  return (
    'Hours are filed by the person who worked them, from their own page. ' +
    'The client approves each week in Etyme, or its approval is attached to the week. ' +
    `${firmName ?? 'Your firm'} accepts each week it pays for.`
  )
}

/**
 * How many filed weeks still wait for the client's approval, for a firm
 * below the client. Null where none do.
 */
export function clientApprovalSays(count: number, attach: { may: boolean; whoSays: string | null }): string | null {
  if (count <= 0) return null
  const lead = count === 1
    ? '1 week waits for the client’s approval.'
    : `${count} weeks wait for the client’s approval.`
  return attach.may
    ? `${lead} Open the week to attach the approval the client gave.`
    : attach.whoSays
      ? `${lead} ${attach.whoSays}`
      : lead
}

/**
 * How the page draws it: the people and the reason as one paragraph, and
 * one button. The button is the act that unblocks it (Record a placement),
 * else the page a named person's invitation is on. The people's links all
 * open the same page, so one button stands for them.
 */
export function emptyDrawn(why: EmptyWhy): { detail: string | null; action: EmptyLink | null } {
  const detail = [...why.people.map((p) => p.says), why.detail].filter(Boolean).join(' ')
  return {
    detail: detail || null,
    action: why.link ?? why.people.find((p) => p.link)?.link ?? null,
  }
}
