/**
 * What a person signed in with no company reads on the buying side's
 * lists. Pure, and safe to import into a page.
 *
 * Round five, problem 17. Nina signed up as a candidate and is on
 * nobody's bench. Contractors told her "You are on their bench, not on
 * their staff", and Submissions showed "Loading…" for ever because it
 * waited for a company that was never coming. Each now says whose list
 * it is and where her own work is.
 */
export const NOT_AT_A_COMPANY =
  'This is a company’s list of the people who work for it, and you are not signed in at a company. ' +
  'Your own work is under Your work.'

export const SUBMISSIONS_NOT_AT_A_COMPANY =
  'A firm puts people forward for jobs, and you are not signed in at a firm. ' +
  'When a firm puts you forward, it shows under Your work.'

/**
 * Timesheets, to somebody signed in with no company (round six, problem
 * 11). Nina read "Your firm accepts them once the client has signed" and
 * "once your consultants file their hours": she has neither.
 */
export const TIMESHEETS_NOT_AT_A_COMPANY =
  'These are a company’s books, and you are not signed in at a company. Your own work is under Your work.'

/**
 * The same truth for any company page, in that page's own name (round
 * six, problem 9). Nina read "Invitations are addressed to a company",
 * "A program belongs to a company", "You must belong to a company." and
 * "No company context": system phrases, and the last two read as an
 * instruction to join one. Each now says whose page it is and where her
 * own work is.
 */
export function notAtACompany(what: string): string {
  return `${what} belongs to a company, and you are not signed in at one. Your own work is under Your work.`
}
