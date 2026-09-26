/**
 * What each reader of the roles list is allowed to be told.
 *
 * ── Why this is a file and not three lines in the route ──────────────
 *
 * `GET /api/requirements` is read by two different kinds of reader at
 * once: the company that raised the role, and every supplier it was sent
 * to. The route already knew that — `billMin` and `endClientCompany` are
 * gated on `r.companyId === mineId` — but the gate was written inline
 * beside each field, so the next field added inherited nothing and the
 * decision had to be made again from scratch.
 *
 * It was not made. The route loads the whole row (`include`, not
 * `select`), so `approvalState`, `archivedAt`, `headcount` and
 * `cancelReason` were all sitting in memory and none of them was sent.
 * `lib/requisition-stage` needs three of those four to answer where a
 * role has got to, so nothing downstream of this list could tell a live
 * role from one that was called off last Tuesday. A supplier went on
 * working a withdrawn role, which is the exact waste the list exists to
 * prevent.
 *
 * So the mapping lives here, as one pure function over one row, and the
 * visibility question is answered once per field in a place a test can
 * reach without a database.
 *
 *
 * ── The three classes of field ───────────────────────────────────────
 *
 * **Everybody.** Whether the role is still live, and why it stopped.
 * `archivedAt` and `cancelReason` are the supplier's own business: a
 * recruiter who does not know a role was withdrawn keeps sourcing for
 * it, and nobody is served by that. `headcount` goes with them because
 * it is what turns "archived" into "all three seats filled" — a reason
 * rather than a filing state.
 *
 * **The buyer only.** `approvalState` is the client's internal
 * governance — which of its own desks has signed and which has not. That
 * is the same class of fact as `billMin` and `endClientCompany`: true
 * about the buyer, none of a supplier's business, and worth money to a
 * competitor. A supplier gets `''`, which is not a lie by omission but a
 * deliberate value: `stageOf` matches `approvalState` against three
 * named strings and falls past all three on an empty one, so a supplier
 * still reads OPEN, CANCELLED and ARCHIVED correctly off the other two
 * columns. An empty string can never promote a live role to ARCHIVED —
 * only `REJECTED` does that, and a supplier never receives it.
 *
 * **Everybody, but derived.** `paused`. There is a real argument for
 * telling a supplier that approval is outstanding: it says do not submit
 * yet, and a recruiter who submits into a paused role has wasted an
 * afternoon. The argument is answered without opening the chain, because
 * the only approval state that changes what a supplier may *do* is a
 * published role sent back for re-approval after a change to the money
 * (`lib/requisition-change`). `POST /api/submissions` already refuses
 * that one in a sentence — "… is paused while X re-approves the money" —
 * so the fact is already the supplier's; the list is only saying it
 * before the work rather than after. One boolean, in the door's own
 * word, carrying no desk, no name and no ordering.
 *
 * Distribution is the reason nothing else leaks here:
 * `/api/requisitions/[id]/distribute` refuses to invite a supplier until
 * the requisition is approved, so DRAFT, CHANGES_REQUESTED and REJECTED
 * cannot reach a supplier's list at all. PENDING_APPROVAL can, and only
 * by the re-approval route above.
 */

/** The row as the route loads it, narrowed to what this decides about. */
export interface RequirementRow {
  id: string
  title: string
  skills: string[]
  location: string | null
  billMin: number | null
  billMax: number | null
  months: number | null
  startDate: Date | null
  status: string
  approvalState: string
  archivedAt: Date | null
  headcount: number
  cancelReason: string | null
  source: string | null
  marginClass: string | null
  rateVisible: boolean
  endClientVisible: boolean
  companyId: string
  company: { id: string; name: string } | null
  endClientCompany: { id: string; name: string } | null
  _count: { submissions: number; matches: number; invitations: number }
  createdAt: Date
}

export interface RequirementForReader {
  id: string
  title: string
  skills: string[]
  location: string | null
  billMin: number | null | undefined
  billMax: number | null | undefined
  months: number | null
  startDate: string | null
  status: string
  /** The client's own chain, or `''` for anybody who is not the client. */
  approvalState: string
  archivedAt: string | null
  headcount: number
  cancelReason: string | null
  /** Published, but no submissions accepted while the money is re-approved. */
  paused: boolean
  source: string | null
  marginClass: string | null
  rateVisible: boolean
  company: { id: string; name: string } | null
  endClientCompany: { id: string; name: string } | null
  counts: { submissions: number; matches: number; invitations: number }
  createdAt: string
}

/**
 * Whether a published role is refusing submissions while its money goes
 * back through approval.
 *
 * Kept beside the mapper rather than inside it because the submissions
 * door asks the same question about the same two columns, and two places
 * deciding "paused" from two expressions is how the stage function and
 * `mayEdit` drifted apart in the first place.
 */
export function isPaused(r: { status: string; approvalState: string }): boolean {
  return r.status === 'OPEN' && r.approvalState === 'PENDING_APPROVAL'
}

/**
 * One row, as the reader in `mineId` is allowed to see it.
 *
 * `mineId` is the company whose desk the caller is at — their own firm,
 * or the client's where a program office is seated, which is why it is
 * passed in rather than read off the caller here.
 */
export function requirementForReader(r: RequirementRow, mineId: string): RequirementForReader {
  const mine = r.companyId === mineId

  return {
    id: r.id,
    title: r.title,
    skills: r.skills,
    location: r.location,
    // The buyer's own band. What a supplier may charge lives on their
    // invitation precisely so no recipient reads another's number, and
    // this is the buyer's ceiling rather than anybody's offer.
    billMin: mine ? r.billMin : undefined,
    billMax: mine ? r.billMax : undefined,
    months: r.months,
    startDate: r.startDate?.toISOString() ?? null,
    status: r.status,
    // The client's governance, and the client's alone. See the header.
    approvalState: mine ? r.approvalState : '',
    // Still live, or put away. Everybody's business — a supplier working
    // a role that was withdrawn is the waste this list exists to stop.
    archivedAt: r.archivedAt?.toISOString() ?? null,
    headcount: r.headcount,
    cancelReason: r.cancelReason,
    paused: isPaused(r),
    source: r.source,
    marginClass: r.marginClass,
    rateVisible: r.rateVisible,
    company: r.company,
    // Naming the end client hands a supplier the relationship and a
    // competitor the account. Off unless the firm that holds it said
    // otherwise, exactly like the rate band above.
    endClientCompany: mine || r.endClientVisible ? r.endClientCompany : null,
    counts: {
      submissions: r._count.submissions,
      matches: r._count.matches,
      invitations: r._count.invitations,
    },
    createdAt: r.createdAt.toISOString(),
  }
}
