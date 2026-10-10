/**
 * Whose calendar a caller may change.
 *
 * ── What was wrong ───────────────────────────────────────────────────
 *
 * `GET /api/holidays` resolved the caller's own company and refused any
 * other. `POST` took `companyId` out of the request body and wrote to it,
 * and `DELETE` took a holiday id and deleted it wherever it lived. So any
 * signed-in person at any company could add days off to another firm's
 * calendar, or strip them out of it.
 *
 * That was always a cross-tenant write. Since 2026-09-17 it is also a way
 * to move somebody else's payroll: cycle dates shift off the days on this
 * calendar, so adding a Friday to a supplier's calendar moves the pay day
 * of everybody that supplier pays, and removing one moves it back.
 *
 * ── The rule ─────────────────────────────────────────────────────────
 *
 * The same rule `/api/settings/holidays` already applies, said in the
 * same words: your own company, and the permission that governs company
 * settings. A calendar is not read out of a body parameter.
 *
 * Pure, and beside the route rather than in it, so the refusals can be
 * read as sentences in a test without a database or a session.
 */

/** What the caller is, reduced to the three facts this decision needs. */
export interface CalendarCaller {
  companyId: string | null
  companyName?: string | null
  permissions: readonly string[]
}

export type CalendarVerdict =
  | { ok: true; companyId: string }
  | { ok: false; status: number; code: string; says: string }

/** The permission that governs a company's own settings, including this. */
export const CALENDAR_PERMISSION = 'settings.manage'

/**
 * Whether this caller may change this calendar, and whose it is.
 *
 * A refusal says what is wrong and what would be right, never a code —
 * the code is for the machine, the sentence is the product.
 */
export function mayEditCalendar(caller: CalendarCaller, named: string | null): CalendarVerdict {
  const mine = caller.companyId
  if (!mine) {
    return {
      ok: false,
      status: 403,
      code: 'NO_COMPANY',
      says: 'A holiday calendar belongs to a company, and this sign-in is not at one.',
    }
  }

  if (named && named !== mine) {
    const ours = caller.companyName ?? 'your own company'
    return {
      ok: false,
      status: 403,
      code: 'FORBIDDEN',
      says:
        `That calendar belongs to another company. You can only change ${ours}'s days off — ` +
        'and a day on a calendar moves the pay days behind it, so nobody moves anybody else’s.',
    }
  }

  if (!caller.permissions.includes(CALENDAR_PERMISSION)) {
    return {
      ok: false,
      status: 403,
      code: 'FORBIDDEN',
      says:
        'Changing the holiday calendar is a company setting. Ask an owner or an admin here to ' +
        'add the day, or to give you settings access.',
    }
  }

  return { ok: true, companyId: mine }
}
