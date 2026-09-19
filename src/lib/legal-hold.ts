/**
 * A company saying a subject's records may not be deleted yet, and what
 * the subject is told about it.
 *
 * ── A hold suspends deletion for everybody, not just its holder ──────
 *
 * Said plainly because it is uncomfortable, and the schema says it too:
 * a hold placed by one company suspends the scheduled deletion and the
 * erasure of that subject wherever it would have happened, not only on
 * that company's own rows. The records a litigation needs are usually
 * somebody else's — the supplier's timesheets in the client's case, the
 * client's approvals in the supplier's.
 *
 * Three counterweights, and all three are in this file:
 *
 *   A company may only hold a subject it actually has a relationship
 *   with. Otherwise any firm could freeze any person's erasure by
 *   naming them, and there would be no way to tell a litigation hold
 *   from a grudge.
 *
 *   The subject is told the reason and never the matter reference. The
 *   reason is written to be shown to them — the schema requires it and
 *   says why — and the matter is the holder's own business.
 *
 *   A hold has a review date, because a hold with none is a retention
 *   schedule set by forgetting.
 *
 * ── One company's lift does not release another's hold ───────────────
 *
 * This is the whole reason a hold is a row and not a boolean. A client
 * under audit and a supplier in litigation are two separate obligations
 * over one contractor, and with a boolean the second company's lift
 * would release the first company's hold and the records would go —
 * which is the exact failure a litigation hold exists to prevent, and it
 * would be invisible.
 *
 * Pure. No database in this file.
 *
 * Owned by etyme-regulatory (`lib/legal-hold` in `lib/domains.ts`).
 */

export interface Hold {
  id: string
  placedByCompanyId: string
  placedByCompanyName: string
  subjectPersonId: string | null
  subjectCompanyId: string | null
  /** Shown to the subject. Required by the schema for that reason. */
  reason: string
  /** The holder's own case number. Never leaves the holder. */
  matter: string | null
  placedAt: Date
  reviewBy: Date | null
  liftedAt: Date | null
}

export interface Subject {
  personId?: string | null
  companyId?: string | null
}

/** Holds that still bite on this subject. */
export function liveHoldsOn(holds: Hold[], subject: Subject): Hold[] {
  return holds.filter(
    (h) =>
      !h.liftedAt &&
      ((subject.personId != null && h.subjectPersonId === subject.personId) ||
        (subject.companyId != null && h.subjectCompanyId === subject.companyId))
  )
}

/** Whether anything stops a deletion of this subject tonight. */
export function isHeld(holds: Hold[], subject: Subject): boolean {
  return liveHoldsOn(holds, subject).length > 0
}

export interface ToldTheSubject {
  held: boolean
  /** What the person reads. Reasons, never matters. */
  says: string
  /** The reasons alone, one per hold, for a list on a screen. */
  reasons: string[]
}

/**
 * What the subject is told.
 *
 * The holder is named and the matter is not. Naming the holder is the
 * honest half — a person whose erasure is suspended is entitled to know
 * who suspended it and why — and the matter reference identifies a case
 * the holder has not chosen to disclose.
 */
export function toldTheSubject(holds: Hold[], subject: Subject): ToldTheSubject {
  const live = liveHoldsOn(holds, subject)
  if (live.length === 0) {
    return { held: false, says: 'Nothing is being kept back on anybody’s instruction.', reasons: [] }
  }

  const reasons = live.map((h) => `${h.placedByCompanyName} asked us to keep these: ${h.reason}`)
  return {
    held: true,
    says:
      (live.length === 1
        ? 'One company has asked that your records be kept for now, and gave this reason:'
        : `${live.length} companies have asked that your records be kept for now, and gave these reasons:`) +
      `\n${reasons.map((r) => `— ${r}`).join('\n')}\n` +
      'Nothing has been erased and your request stays open. It runs by itself the day the ' +
      'last of these is lifted, and we will write to you then.',
    reasons,
  }
}

// ── Who may place one ─────────────────────────────────────────────────

/**
 * What ties a company to a subject. Any one of these is enough.
 *
 * This is the route's check and not the database's, because the
 * relationship is spread across four tables and a foreign key cannot
 * express "has ever traded with".
 */
export interface Relationship {
  /** A sell or buy contract line naming the person, either side. */
  contract?: boolean
  /** A bench listing the person granted this company. */
  listing?: boolean
  /** A seat at this company — the person works here. */
  seat?: boolean
  /** A submission this company made or received naming the person. */
  submission?: boolean
  /** Holding itself, for an audit of its own books. */
  itself?: boolean
  /** An agreement between the two companies, for a company subject. */
  agreement?: boolean
}

export interface MayHold {
  ok: boolean
  /** Why not, in a sentence that says what is missing and what to do. */
  says: string
}

export function mayHold(rel: Relationship, subjectIsCompany = false): MayHold {
  const tied =
    rel.contract || rel.listing || rel.seat || rel.submission || rel.itself || rel.agreement
  if (tied) {
    return {
      ok: true,
      says: rel.itself
        ? 'A company may always hold its own records.'
        : 'This company has traded with the subject, so it may ask for the records to be kept.',
    }
  }

  return {
    ok: false,
    says: subjectIsCompany
      ? 'A legal hold can only be placed on a firm this company has actually traded with — ' +
        'an agreement, an order or a contract between the two. There is none on file, so ' +
        'there is nothing here for this company to be answerable for. If there is a matter, ' +
        'the firm that holds the records is the one to place the hold.'
      : 'A legal hold can only be placed on somebody this company has actually engaged — a ' +
        'contract, a bench listing, a submission or a seat here. There is none on file. A ' +
        'hold suspends a person’s erasure everywhere, not only in this company’s records, ' +
        'so a firm that has never engaged them cannot be the one to place it.',
  }
}

// ── Lifting ───────────────────────────────────────────────────────────

export interface MayLift {
  ok: boolean
  says: string
}

/**
 * Only the company that placed a hold may lift it.
 *
 * A hold placed by one client is not lifted by another, and that is the
 * point of the model: two obligations over one person are two rows, and
 * releasing one leaves the other standing.
 */
export function mayLift(hold: Hold, byCompanyId: string): MayLift {
  if (hold.liftedAt) {
    return { ok: false, says: 'This hold was already lifted. The row stays on the record as the answer to why something was still here.' }
  }
  if (hold.placedByCompanyId !== byCompanyId) {
    return {
      ok: false,
      says:
        `${hold.placedByCompanyName} placed this hold and only ${hold.placedByCompanyName} can ` +
        'lift it. A hold another company placed is another company’s obligation, and lifting ' +
        'it from here would release records somebody else is answerable for.',
    }
  }
  return { ok: true, says: 'Yours to lift.' }
}

/** A hold nobody has looked at since its review date. */
export function overdueForReview(holds: Hold[], now: Date): Hold[] {
  return holds.filter((h) => !h.liftedAt && h.reviewBy != null && h.reviewBy <= now)
}
