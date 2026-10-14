import { reportError } from '@/lib/alerts'
import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'

/** Where a row may be written: the client, or a transaction the caller holds. */
type AccessLogWriter = Pick<Prisma.TransactionClient, 'accessLog'>

/**
 * CLAUDE.md invariant: "Every read of another person's data writes an
 * AccessLog row, including refusals."
 *
 * This helper makes it easy to log access from any API route.
 * Call `logAccess`/`logBulkAccess` after successful reads. A refusal is
 * written with `recordRefusal`, awaited before the 403 goes out, so a
 * serverless host cannot drop it.
 */

export type AccessAction =
  | 'PROFILE_VIEW'        // viewed a consultant's full profile
  | 'TALENT_VIEW_ANON'    // viewed anonymised talent in a list
  | 'SUBMIT'              // submitted a person to a requirement
  | 'MARKETING_REQUEST'   // shared a person's bench listing
  | 'TENURE_VIEW'         // viewed a person's tenure data
  | 'COMPLIANCE_CHECK'    // ran compliance checks on a person
  | 'CONTRACT_VIEW'       // viewed a person's contract details
  | 'TIMESHEET_VIEW'      // viewed a person's timesheet
  | 'PAYROLL_VIEW'        // viewed a person's payroll data
  | 'MATCH_VIEW'          // viewed match scores for a person
  | 'RELEASING_SOON_VIEW' // saw somebody listed as coming free before they are
  | 'CLASSIFICATION_CALL' // took a position on whether somebody is employed
  | 'DNR_VIEW'            // read the do-not-return list, which names people and why
  // ── A file a client entrusted to us before they were a customer ────
  //
  // A contractor census is the one read in this product where the
  // subject never agreed to anything with us and has no account: a
  // client sends their own file, and the people in it are their
  // contractors. The census agreement promises in writing that one named
  // person at Etyme opens it and that every open is recorded, so the
  // read needs a name of its own rather than being filed under
  // CONTRACT_VIEW, which is a customer reading their own book.
  | 'CENSUS_READ'         // opened a client's census file, or the contractors read out of it
  // ── The subject's own record, read for their own sake ──────────────
  //
  // Both of these are reads of somebody's whole file, and both are the
  // ones a regulator asks about first. An export is every category the
  // privacy notice names, in one document; an erasure reads the lot in
  // order to decide what goes. A person reading their own file is still
  // logged here, unlike the rest of `/api/me`, because this read is the
  // one that produces a file somebody else could later be handed.
  | 'DATA_EXPORT'         // produced or downloaded an export of everything held
  | 'ERASURE'             // read the whole footprint in order to erase it
  // ── A read made from a desk the client granted somebody else ───────
  //
  // A program office that is not the client acts in a seat the client
  // grants it (`lib/program-seat`, 2026-09-20). Every read under that
  // seat was filed as CONTRACT_VIEW, which is a customer reading its own
  // book, and the one question a client asks afterwards — "who looked at
  // my workforce, and on whose authority" — could then only be answered
  // by grepping the reason column for a seat id.
  //
  // So the read has a name of its own. The reason beside it is
  // `seatTrail`, which names the office, the client's own role the seat
  // holds, the client that granted it and the seat id, in one sentence a
  // client can read back. The action is what makes the whole class of
  // them findable in a query: every read a firm made inside somebody
  // else's program, and nothing else.
  | 'PROGRAM_READ'        // read a client's program from a seat that client granted
  // ── A person's own papers, opened or sent outside the company ──────
  //
  // These four were written by hand in their routes, outside this file,
  // until 2026-10-08 — one of them ending in `.catch(() => {})`, so a
  // failed write vanished. They are named here so every access-log row
  // in the product goes through one door, and the check that a refusal
  // is awaited can see all of them.
  | 'DOCUMENT_FILE_READ'          // opened the file behind a document somebody asked for
  | 'DOCUMENTS_SHARED_EXTERNALLY' // sent a person's documents to somebody outside the company
  | 'SHARED_DOCUMENTS_OPENED'     // the outside recipient opened that share
  | 'SHARED_DOCUMENTS_WITHDRAWN'  // the share was withdrawn
  // ── Three more that were written by hand until 2026-10-08 ──────────
  //
  // The first two are etyme-supply's routes, the third etyme-demand's.
  // Reviewed by regulatory the same day and kept: each names one read a
  // client could ask about by itself. CONTEXT_SWITCH is the person's own
  // session rather than a read of somebody else; it is kept because which
  // seat a later read was made from is the first thing an audit of that
  // read needs.
  | 'RESUME_READ'         // opened the file behind somebody's CV, or was refused it
  | 'CONTEXT_SWITCH'      // a person moved their own session to another seat they hold
  | 'WEEK_APPROVAL_WORDS_VIEW'    // read who approved a week by email, on the timesheet list
  // ── A week approved at the top without the client signing in ───────
  //
  // `lib/week-approval` (etyme-architect): the client's approver approves
  // by a one-time link, or a desk attaches the client's approval as
  // evidence, and every rung it applies to may read who approved and on
  // what. These are the names that file has always written; they are
  // here so its one seam can go through recordRefusal and recordAccess.
  // Integration tests and the client's own trail read them, so they do
  // not move.
  | 'APPROVAL_LINK_SEND'        // sent the client's approver a link, or was refused
  | 'APPROVAL_EVIDENCE_ATTACH'  // attached the client's approval as evidence, or was refused
  | 'WEEK_APPROVAL_VIEW'        // read who approved a week, or was refused
  | 'APPROVAL_LINK_VIEW'        // the client's approver opened the link, or found it closed
  | 'WEEK_SIGNATURE_VIEW'       // read, or was refused, a signature on the week
  | 'APPROVAL_EVIDENCE_VIEW'    // read, or was refused, the evidence behind an approval
  // ── The shared sample seat the home page frames ────────────────────
  //
  // `lib/sample-seat` (etyme-architect, 2026-10-14): anybody, with no
  // account, reads the seeded Northbend program manager's screens, and
  // every write is refused at the caller check. The refusal is a row of
  // its own so "what did strangers try to change through the sample" is
  // one query. Its subject is the person whose seat the sample borrows,
  // because the row needs a person and that is the seat the write was
  // tried in; its actor is SAMPLE, never her. It holds the method and the
  // route and nothing about the visitor: no address, no browser.
  | 'SAMPLE_WRITE'              // the shared sample tried to change something, and was refused

interface LogAccessBase {
  /** The person whose data was accessed */
  subjectId: string
  /**
   * The person doing the accessing (if known). Where a twin made the
   * read, this is the person whose authority it acted on — the program
   * owner — and `actorKind` says it was the twin, not them.
   */
  actorPersonId?: string
  /** The company context of the accessor */
  actorCompanyId?: string
  /** What kind of access */
  action: AccessAction
  /** Was the access permitted? */
  allowed?: boolean
  /** Why it was refused, or context for the access */
  reason?: string
}

/** The twins that may read. One today; the column is a string so the next is a line here. */
export type TwinKind = 'PROGRAM_MANAGER'

/** Who made a read, as the `actorKind` column holds it. A string column: a new kind is a line here. */
export type ActorKind = 'PERSON' | 'TWIN' | 'SAMPLE'

/**
 * Who made the read. PERSON, the default, is somebody at a desk. TWIN is
 * the job twin acting on `actorPersonId`'s authority, and then the row
 * must say which twin — so the trail reads "the program manager twin, for
 * Dana Whitfield", never as though Dana had looked herself.
 *
 * SAMPLE is the shared sample seat the home page frames (`lib/sample-seat`):
 * a stranger with no account, reading through the seeded program
 * manager's seat. The row must name the seat (`actorSampleSeat`, the
 * Context id), and it never carries the person who holds that seat:
 * unlike a twin, the sample acts on nobody's authority, and her own
 * access review must not read strangers as her. The seat is written into
 * the reason, because the table has no column for it (no schema change).
 */
type ActorFields =
  | { actorKind?: 'PERSON'; actorTwinKind?: never; actorSampleSeat?: never }
  | { actorKind: 'TWIN'; actorTwinKind: TwinKind; actorSampleSeat?: never }
  | { actorKind: 'SAMPLE'; actorSampleSeat: string; actorTwinKind?: never }

type LogAccessParams = LogAccessBase & ActorFields

/** `Omit` that keeps the PERSON/TWIN/SAMPLE pairing instead of flattening it. */
type Without<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/**
 * The two actor columns, as written. A TWIN row with no twin named is
 * refused here rather than written as a read nobody can attribute, and so
 * is a SAMPLE row that names no seat; a PERSON row never carries either.
 */
export function actorColumns(p: { actorKind?: ActorKind; actorTwinKind?: TwinKind; actorSampleSeat?: string }): {
  actorKind: ActorKind
  actorTwinKind: TwinKind | null
} {
  if (p.actorKind === 'TWIN') {
    if (!p.actorTwinKind) throw new Error('A read made by a twin must name which twin made it.')
    return { actorKind: 'TWIN', actorTwinKind: p.actorTwinKind }
  }
  if (p.actorKind === 'SAMPLE') {
    if (!p.actorSampleSeat?.trim()) throw new Error('A read made through the shared sample must name the seat it was made through.')
    return { actorKind: 'SAMPLE', actorTwinKind: null }
  }
  return { actorKind: 'PERSON', actorTwinKind: null }
}

/**
 * Everything on a row except the subject, the action and `allowed`: the
 * actor columns, and the person and reason as they may be written for
 * that actor. A SAMPLE row drops the person whatever the caller passed —
 * it is the sample, never the person whose seat it borrows — and its
 * reason begins with the seat, so the row can be read back whole.
 */
function actorRow(p: LogAccessBase & { actorKind?: ActorKind; actorTwinKind?: TwinKind; actorSampleSeat?: string }): {
  actorPersonId: string | null
  actorCompanyId: string | null
  actorKind: ActorKind
  actorTwinKind: TwinKind | null
  reason: string | null
} {
  const actor = actorColumns(p)
  if (actor.actorKind === 'SAMPLE') {
    const seat = `Through the shared sample, seat ${p.actorSampleSeat!.trim()}.`
    return {
      actorPersonId: null,
      actorCompanyId: p.actorCompanyId ?? null,
      ...actor,
      reason: p.reason ? `${seat} ${p.reason}` : seat,
    }
  }
  return {
    actorPersonId: p.actorPersonId ?? null,
    actorCompanyId: p.actorCompanyId ?? null,
    ...actor,
    reason: p.reason ?? null,
  }
}

/**
 * The actor fields for a caller, the way every route should fill them.
 *
 * A route that writes `actorPersonId: caller.person.id` files a read made
 * through the shared sample seat as the seeded program manager whose seat
 * it borrows — measured 2026-10-14: one look at the home page's frame
 * wrote sixteen CONTRACT_VIEW rows under her name. The caller check knows
 * the caller is the sample (`readOnly`, set only by the sample door in
 * `lib/api-context`), and the log cannot learn it any other way: a scope
 * entered inside the caller check ends when the check returns. So the
 * route hands the caller over, and this decides.
 *
 * Structural rather than `CallerContext`, so the log does not import the
 * caller check that imports it.
 */
export function accessActor(caller: {
  person: { id: string }
  company: { id: string } | null
  context?: { id: string } | null
  readOnly?: boolean
}): { actorPersonId?: string; actorCompanyId?: string } & ActorFields {
  const actorCompanyId = caller.company?.id
  if (caller.readOnly) {
    // A read-only caller with no seat to name is refused by the log, as it should be.
    return { actorKind: 'SAMPLE', actorSampleSeat: caller.context?.id ?? '', actorCompanyId }
  }
  return { actorPersonId: caller.person.id, actorCompanyId }
}

/**
 * Write an access log entry. Fire-and-forget — never blocks the response.
 *
 * A failure is reported, not swallowed. The trail is the evidence that
 * the company wall held, so a run of writes failing silently means the
 * evidence is missing exactly when somebody comes asking for it — and a
 * console line on a serverless host is nobody's alarm. `reportError`
 * writes an Incident and mails staff (CLAUDE.md, lib/alerts).
 *
 * Still not awaited: the invariant is that the read is recorded, not
 * that the reader waits for it.
 */
export function logAccess(params: LogAccessParams): void {
  const { subjectId, action, allowed = true } = params
  const row = actorRow(params)

  // Fire-and-forget — don't await, don't block the response
  prisma.accessLog
    .create({
      data: {
        subjectId,
        ...row,
        action,
        allowed,
      },
    })
    .catch((err) => {
      void reportError(
        'access-log',
        new Error(
          `Could not record a ${action} of ${subjectId}. The read happened and is not in the trail. ` +
            `Cause: ${err instanceof Error ? err.message : String(err)}`
        ),
        { personId: row.actorPersonId, companyId: row.actorCompanyId }
      )
    })
}

/**
 * Log access for multiple subjects in a single call (e.g., listing bench/talent).
 * Creates one row per subject. Fire-and-forget.
 */
export function logBulkAccess(
  subjectIds: string[],
  params: Without<LogAccessParams, 'subjectId'>
): void {
  if (subjectIds.length === 0) return
  const row = actorRow({ ...params, subjectId: '' })

  const data = subjectIds.map((subjectId) => ({
    subjectId,
    ...row,
    action: params.action,
    allowed: params.allowed ?? true,
  }))

  prisma.accessLog
    .createMany({ data })
    .catch((err) => {
      void reportError(
        'access-log',
        new Error(
          `Could not record a ${params.action} of ${subjectIds.length} people. The reads happened and are not in the trail. ` +
            `Cause: ${err instanceof Error ? err.message : String(err)}`
        ),
        { personId: row.actorPersonId, companyId: row.actorCompanyId }
      )
    })
}

/**
 * The same rows, written before the response goes out.
 *
 * `logAccess` and `logBulkAccess` are fire-and-forget because the
 * invariant is that the read is recorded, not that the reader waits for
 * it, and a bench list of two hundred people should not pay for its own
 * audit trail.
 *
 * A census file is the one read where that trade is the wrong way
 * round. The client was promised in writing — in the census agreement
 * they accepted by name — that every open of their file is recorded, and
 * they are not a customer, have no account, and cannot come and look. On
 * a serverless host a fire-and-forget write can lose the race with the
 * function freezing after the response. Once a staff member has opened
 * one file, waiting for one row is a cost nobody can measure.
 *
 * A failure here throws rather than reporting quietly, so the caller can
 * decide: a route that cannot record a read of somebody's file should
 * not hand over the file.
 *
 * `db` is a transaction the caller already holds, where the row must
 * commit or roll back with the change it records — a person shown to a
 * partner firm is never shown without the row, and the row never names a
 * share that rolled back. Omitted, the row is written on its own.
 */
export async function recordAccess(
  subjectIds: string[],
  params: Without<LogAccessParams, 'subjectId'>,
  db: AccessLogWriter = prisma
): Promise<number> {
  if (subjectIds.length === 0) return 0
  const row = actorRow({ ...params, subjectId: '' })
  const written = await db.accessLog.createMany({
    data: subjectIds.map((subjectId) => ({
      subjectId,
      ...row,
      action: params.action,
      allowed: params.allowed ?? true,
    })),
  })
  return written.count
}

/**
 * A refused read, written before the refusal goes out.
 *
 * CLAUDE.md: "Every read of another person's data writes an AccessLog
 * row, including refusals." `logAccess` and `logBulkAccess` do not wait
 * for their write, and on a serverless host the function can be frozen
 * the moment the response is sent — so a 403 sent ahead of its row can
 * leave no row at all. A refused read is the one row an auditor asks for
 * first ("who tried to look, and was stopped"), and it is one write on a
 * path that has already decided to say no, so waiting for it costs the
 * refused caller a few milliseconds and nothing else.
 *
 * Successful bulk reads stay fire-and-forget on purpose: a list of two
 * hundred people should not pay for its own trail on every page load, and
 * `recordAccess` exists for the reads where that trade is wrong.
 *
 * Unlike `recordAccess` this never throws. A refusal that could not be
 * recorded is still a refusal: turning it into a 500 tells the caller
 * nothing true, and the alternative — letting the read through because
 * the log failed — is the one outcome the log exists to prevent. The
 * failure is reported instead, awaited too, so the incident outlives the
 * response the same way the row was meant to.
 *
 * Next 14 has no `after()`, and `waitUntil` would add a platform
 * dependency for one row; awaiting is the smallest thing that is true
 * on every host.
 */
export async function recordRefusal(
  subjectIds: readonly string[],
  // `allowed: false` may be written at the call site so the route reads
  // as what it is; nothing else is accepted, because this is refusals only.
  params: Without<LogAccessParams, 'subjectId' | 'allowed'> & { allowed?: false }
): Promise<number> {
  const subjects = [...new Set(subjectIds)]
  if (subjects.length === 0) return 0
  try {
    // Inside the try: a refusal is a refusal even when its actor is malformed.
    const row = actorRow({ ...params, subjectId: '' })
    const written = await prisma.accessLog.createMany({
      data: subjects.map((subjectId) => ({
        subjectId,
        ...row,
        action: params.action,
        allowed: false,
      })),
    })
    return written.count
  } catch (err) {
    await reportError(
      'access-log',
      new Error(
        `Could not record a refused ${params.action} of ${subjects.length} ${subjects.length === 1 ? 'person' : 'people'}. ` +
          `The refusal was sent and is not in the trail. ` +
          `Cause: ${err instanceof Error ? err.message : String(err)}`
      ),
      { personId: params.actorKind === 'SAMPLE' ? null : params.actorPersonId ?? null, companyId: params.actorCompanyId ?? null }
    ).catch(() => undefined)
    return 0
  }
}
