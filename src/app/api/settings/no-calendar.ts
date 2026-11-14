/**
 * What Settings, Cycles says to a company with no calendar of due dates
 * of its own (a template pack), in a payroll person's words.
 *
 * The Tapin walk, 2026-11-14: every seeded firm read "No template pack.
 * Contracts will generate no due dates at all, so nothing will ever be
 * owed or chased. This should not happen — tell somebody." That was
 * neither true nor a step. What is true, read off the contract doors:
 *
 *   - an award, an extension and a placement off the bench (and the
 *     contract terms and cycle completion behind them) fall back to the
 *     US IT pack, `'US_IT'`, so their dates come from it;
 *   - "Record a placement" (POST /api/contracts) and a submission turned
 *     into a contract (POST /api/submissions/[id]/convert) fall back to
 *     nothing, so a line made there gets no due dates.
 *
 * And the step: the Owner or an Admin sets a calendar here, through the
 * door sign-up uses (POST /api/companies/[id]/template-pack), with the
 * pack sign-up would have chosen for the company (`packFor`). Pure.
 */

/** The pack the award, extension and bench doors use where a company has none. */
export const FALLBACK_PACK_ID = 'US_IT'

export interface NoCalendar {
  /** The sentences, in order. */
  says: string[]
  /** The calendar the button sets, where this reader may set one. */
  offer: { id: string; label: string } | null
}

export function noCalendarSays(i: {
  companyName: string
  fallbackLabel: string
  offer: { id: string; label: string } | null
  canEdit: boolean
}): NoCalendar {
  const says = [
    `${i.companyName} has no calendar of due dates of its own yet.`,
    `A contract from an award, an extension or the bench uses the "${i.fallbackLabel}" calendar instead.`,
    'A placement recorded by hand, or a submission turned into a contract, gets no due dates.',
    'So no timesheet is due on it, and no bill or pay date is set.',
  ]
  if (i.canEdit && i.offer) {
    says.push(`Set the "${i.offer.label}" calendar below. Contracts made after that take their dates from it.`)
  } else {
    says.push('Your Owner or an Admin can set one here.')
  }
  return { says, offer: i.canEdit ? i.offer : null }
}
