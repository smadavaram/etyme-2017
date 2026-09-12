/**
 * Moving somebody on a sponsored visa to a different client.
 *
 * ── Why this is its own rule ─────────────────────────────────────────
 *
 * `visa-watch` already counts down to a petition's expiry at ninety,
 * sixty and thirty days. That is the easy half. The half that actually
 * catches people out is that an H-1B is not permission to work in the
 * United States — it is permission to work in a named job, for a named
 * employer, at a named place. Move the place and the permission may no
 * longer cover it.
 *
 * A staffing company moves people between clients constantly. That is
 * the business. It is also the single most common way an employer
 * accidentally puts somebody out of status, and the product is the only
 * thing in the building that knows the move is happening — it holds the
 * rolloff and the next contract, usually weeks before anybody tells HR.
 *
 * ── The law being encoded ────────────────────────────────────────────
 *
 * Matter of Simeio Solutions, 26 I&N Dec. 542 (AAO 2015): a change in
 * the beneficiary's place of employment that requires a new Labour
 * Condition Application is a material change to the terms of the
 * petition, and the employer must file an amended petition.
 *
 * A new LCA is required when the worksite falls outside the area of
 * intended employment on the existing one — broadly, a different
 * metropolitan statistical area (20 CFR 655.715, 655.734).
 *
 * Two things about timing, both routinely got wrong:
 *
 *   The amendment must be FILED before the person starts at the new
 *   site. It does not have to be approved — USCIS guidance following
 *   Simeio is explicit that work may begin on filing. Waiting for
 *   approval is unnecessary; starting before filing is unauthorised
 *   employment.
 *
 *   Short-term placement (20 CFR 655.735) allows up to thirty workdays
 *   in a year at a site outside the LCA area without a new LCA, and
 *   sixty in narrow circumstances. It is a real exemption and it is not
 *   a general one: it fails the moment the placement stops being
 *   temporary.
 *
 * A move within the same area of intended employment needs no new LCA
 * and no amendment — but it does need a posting notice at the new site,
 * which is why it warns rather than passes.
 *
 * ── Not built into the schema yet ────────────────────────────────────
 *
 * `VisaPetition` records type, status and expiry, and no worksite at
 * all, so nothing can currently compare where somebody was petitioned to
 * work against where they are about to be sent. These rules take both as
 * inputs and are tested on their own; wiring them needs columns on
 * VisaPetition, which queue through the architect.
 */

/**
 * Statuses whose permission is tied to a named worksite.
 *
 * The distinction that matters: a lawful permanent resident or a citizen
 * may work anywhere for anyone, so moving them between clients is a
 * commercial event and nothing more. Sponsored status is what makes the
 * move a legal one.
 */
export type SponsoredStatus = 'H1B' | 'H1B1' | 'E3'

const WORKSITE_TIED: readonly string[] = ['H1B', 'H1B1', 'E3']

/** Whether a move of this person is a legal question at all. */
export function worksiteTied(visaType: string | null): boolean {
  return visaType !== null && WORKSITE_TIED.includes(visaType.toUpperCase())
}

/**
 * The area of intended employment on the petition, and the one being
 * proposed.
 *
 * Deliberately an opaque key rather than a city string. Whether two
 * addresses sit in one metropolitan statistical area is a question for
 * an MSA table, not for string comparison — "Santa Clara" and "San Jose"
 * are one area and "Kansas City, KS" and "Kansas City, MO" are also one,
 * and no amount of comparing words gets either right.
 */
export interface Placement {
  /** Client the petition named. Null where nobody recorded it. */
  petitionedArea: string | null
  /** Where they are about to be sent. */
  proposedArea: string | null
  /** Workdays at the proposed site in the trailing year, if known. */
  workdaysThisYear?: number | null
  /** Whether an amended petition has already been filed for this move. */
  amendmentFiled?: boolean
}

export type Verdict = 'BLOCK' | 'WARN' | 'PASS'

export interface Decision {
  verdict: Verdict
  /** Said to a coordinator, in plain words. */
  reason: string
  /** What to do, where there is something to do. */
  action: string | null
}

/** Short-term placement, 20 CFR 655.735. Thirty workdays, sixty in narrow cases. */
export const SHORT_TERM_DAYS = 30

/**
 * May this person start at this client.
 *
 * Refuses to guess. An unknown area is treated as a different one,
 * because the failure that matters is starting somebody at a site the
 * petition never covered, and "we could not tell" must not resolve to
 * "carry on".
 */
export function mayMoveTo(visaType: string | null, p: Placement): Decision {
  if (!worksiteTied(visaType)) {
    return {
      verdict: 'PASS',
      reason: 'Their permission to work is not tied to a worksite, so moving them is a commercial decision.',
      action: null,
    }
  }

  if (p.amendmentFiled) {
    // Filed is the bar, not approved. Waiting for approval strands
    // people on the bench for months for no legal reason.
    return {
      verdict: 'PASS',
      reason: 'An amended petition has been filed for this move, which is what the law requires before they start.',
      action: null,
    }
  }

  if (!p.petitionedArea || !p.proposedArea) {
    return {
      verdict: 'BLOCK',
      reason:
        'They are on a visa tied to a named worksite, and either the petitioned location or the ' +
        'proposed one is not recorded. Nobody can say whether this move needs an amended petition.',
      action: 'Find the location on the approved petition and the address of the new site, then check again.',
    }
  }

  if (sameArea(p.petitionedArea, p.proposedArea)) {
    return {
      verdict: 'WARN',
      reason:
        'The new site is in the same area of employment as the petition, so no new LCA and no ' +
        'amended petition are needed.',
      action: 'Post the LCA notice at the new site. Nothing else is required.',
    }
  }

  const days = p.workdaysThisYear ?? null
  if (days !== null && days <= SHORT_TERM_DAYS) {
    return {
      verdict: 'WARN',
      reason:
        `The new site is outside the petitioned area, but they have worked ${days} of the ` +
        `${SHORT_TERM_DAYS} workdays a year short-term placement allows there.`,
      action: `Track the days. On day ${SHORT_TERM_DAYS + 1} this becomes an amended petition, filed before they attend.`,
    }
  }

  return {
    verdict: 'BLOCK',
    reason:
      'The new site is outside the area their petition covers, which is a material change to it. ' +
      'Starting there before an amended petition is filed is unauthorised employment.',
    action: 'File the amended petition. They may start once it is filed — approval is not required first.',
  }
}

/**
 * Whether two areas are one.
 *
 * Exact match on a normalised key, and unknown is never a match. This is
 * the conservative direction on purpose: treating two areas as the same
 * when they are not is how somebody works a month out of status, and
 * treating one area as two costs a phone call.
 */
export function sameArea(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

// ── The evidence a petition needs, and what it is not ─────────────────

/**
 * What an H-1B filing needs when the person works at a client site.
 *
 * Straight from a filing pack a real attorney sent: the chain has to be
 * evidenced end to end, because the question USCIS is asking is whether
 * a genuine employer-employee relationship survives three hops of
 * subcontracting.
 *
 * Every one of these is something the product already holds. That is
 * worth saying plainly — the system of record for a contingent workforce
 * is, without being designed for it, the evidence pack for a petition.
 */
export const CHAIN_EVIDENCE = [
  { key: 'CLIENT_LETTER', label: 'Client letter', from: 'The end client', why: 'Confirms the work, the site and the duration.' },
  { key: 'VENDOR_LETTER', label: 'Vendor letter', from: 'Each firm in between', why: 'Confirms the hop it sits on.' },
  { key: 'MSA', label: 'Master service agreement', from: 'Between each pair', why: 'Shows the commercial relationship is real.' },
  { key: 'SOW', label: 'Statement of work', from: 'Under the agreement', why: 'Shows the work is defined and the duration is genuine.' },
] as const

/**
 * A caution that belongs next to any list of documents.
 *
 * Everything in CHAIN_EVIDENCE and on a petition checklist — passport,
 * I-94, I-797, degree, EAD — is lawfully collected for a petition the
 * employer is filing. None of it may be demanded to verify employment
 * eligibility on an I-9.
 *
 * Section 1324b(a)(6) makes it document abuse to specify which documents
 * somebody must produce for an I-9: the employee chooses from the Lists
 * of Acceptable Documents, and asking a visa holder for their I-797
 * "because we have it on file anyway" is the exact violation. Two
 * processes, two purposes, and the fact that the same filing cabinet
 * holds both is why they get confused.
 */
export const I9_CAUTION =
  'These are for the petition the employer files, not for the I-9. On an I-9 the employee ' +
  'chooses which documents to show from the acceptable lists, and asking a visa holder for ' +
  'specific ones is document abuse under §1324b(a)(6) even when the file already holds them.'
