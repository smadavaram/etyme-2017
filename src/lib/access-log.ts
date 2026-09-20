import { reportError } from '@/lib/alerts'
import { prisma } from '@/lib/db'

/**
 * CLAUDE.md invariant: "Every read of another person's data writes an
 * AccessLog row, including refusals."
 *
 * This helper makes it easy to log access from any API route.
 * Call it after successful reads and for refusals (allowed: false).
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

interface LogAccessParams {
  /** The person whose data was accessed */
  subjectId: string
  /** The person doing the accessing (if known) */
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
  const { subjectId, actorPersonId, actorCompanyId, action, allowed = true, reason } = params

  // Fire-and-forget — don't await, don't block the response
  prisma.accessLog
    .create({
      data: {
        subjectId,
        actorPersonId: actorPersonId ?? null,
        actorCompanyId: actorCompanyId ?? null,
        action,
        allowed,
        reason: reason ?? null,
      },
    })
    .catch((err) => {
      void reportError(
        'access-log',
        new Error(
          `Could not record a ${action} of ${subjectId}. The read happened and is not in the trail. ` +
            `Cause: ${err instanceof Error ? err.message : String(err)}`
        ),
        { personId: actorPersonId ?? null, companyId: actorCompanyId ?? null }
      )
    })
}

/**
 * Log access for multiple subjects in a single call (e.g., listing bench/talent).
 * Creates one row per subject. Fire-and-forget.
 */
export function logBulkAccess(
  subjectIds: string[],
  params: Omit<LogAccessParams, 'subjectId'>
): void {
  if (subjectIds.length === 0) return

  const data = subjectIds.map((subjectId) => ({
    subjectId,
    actorPersonId: params.actorPersonId ?? null,
    actorCompanyId: params.actorCompanyId ?? null,
    action: params.action,
    allowed: params.allowed ?? true,
    reason: params.reason ?? null,
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
        { personId: params.actorPersonId ?? null, companyId: params.actorCompanyId ?? null }
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
 */
export async function recordAccess(
  subjectIds: string[],
  params: Omit<LogAccessParams, 'subjectId'>
): Promise<number> {
  if (subjectIds.length === 0) return 0
  const written = await prisma.accessLog.createMany({
    data: subjectIds.map((subjectId) => ({
      subjectId,
      actorPersonId: params.actorPersonId ?? null,
      actorCompanyId: params.actorCompanyId ?? null,
      action: params.action,
      allowed: params.allowed ?? true,
      reason: params.reason ?? null,
    })),
  })
  return written.count
}
