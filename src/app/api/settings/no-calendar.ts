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
 * And a W-2 line on such a placement, since a756434be (read off
 * POST /api/contracts and the Payroll route, 2026-11-14):
 *
 *   - where the company pays by its own periods (its first Sunday set),
 *     the line still has no dates written, but the Payroll page and the
 *     worker's own page read the company's periods live, so its hours are
 *     listed in them;
 *   - where it chose to pay every week or every other week and has not
 *     set the first Sunday, "Record a placement" refuses a W-2 line with
 *     the Owner's step (`firstDayNeededSays`); a converted submission is
 *     not refused, and gets no pay date;
 *   - otherwise no pay date is set, as before.
 *
 * And the step: the Owner or an Admin sets a calendar here, through the
 * door sign-up uses (POST /api/companies/[id]/template-pack), with the
 * pack sign-up would have chosen for the company (`packFor`). Pure.
 */

import { FIRST_PERIOD_LABEL } from '@/lib/pay-dates'

/** The pack the award, extension and bench doors use where a company has none. */
export const FALLBACK_PACK_ID = 'US_IT'

/** Where the company's payroll stands, for the W-2 sentence. */
export type NoCalendarPayroll = 'BY_PERIOD' | 'FIRST_DAY_NEEDED' | 'NONE'

export interface NoCalendar {
  /** The sentences, in order. */
  says: string[]
  /** The calendar the button sets, where this reader may set one. */
  offer: { id: string; label: string } | null
  /**
   * The line about the first Sunday, by its place in `says`, where this
   * reader may set it: Cycles draws a link after it that scrolls to the box
   * (#first-pay-day, E5). Null where there is no such line, or where the
   * reader cannot set it, and the line then names who does.
   */
  firstDayAt: number | null
}

export function noCalendarSays(i: {
  companyName: string
  fallbackLabel: string
  offer: { id: string; label: string } | null
  canEdit: boolean
  /** Where the company's payroll stands. Absent reads as NONE. */
  payroll?: NoCalendarPayroll
}): NoCalendar {
  const says = [
    `${i.companyName} has no calendar of due dates of its own yet.`,
    `A contract from an award, an extension or the bench uses the "${i.fallbackLabel}" calendar instead.`,
    'A placement recorded by hand, or a submission turned into a contract, gets no due dates.',
  ]
  let firstDayAt: number | null = null
  if (i.payroll === 'BY_PERIOD') {
    says.push('So no timesheet is due on it, and no bill date is set.')
    says.push('The Payroll page still lists a W-2 worker on it in your own pay periods.')
  } else if (i.payroll === 'FIRST_DAY_NEEDED') {
    says.push('So no timesheet is due on it, and no bill or pay date is set.')
    says.push(`A W-2 placement cannot be recorded by hand until "${FIRST_PERIOD_LABEL}" is set.` + (i.canEdit ? '' : ' The Owner or an Admin sets it in the Payroll box below.'))
    firstDayAt = i.canEdit ? says.length - 1 : null
  } else {
    says.push('So no timesheet is due on it, and no bill or pay date is set.')
  }
  if (i.canEdit && i.offer) {
    says.push(`Set the "${i.offer.label}" calendar below. Contracts made after that take their dates from it.`)
  } else {
    says.push('Your Owner or an Admin can set one here.')
  }
  return { says, offer: i.canEdit ? i.offer : null, firstDayAt }
}
