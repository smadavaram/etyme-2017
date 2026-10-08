/**
 * What the claim page says to a firm that has no account yet.
 *
 * The page used to say "Sign in as priya@brookfield.example" and send
 * to the sign-in page, to a firm that had never been given a password
 * (sign-up walk, round one, item 38). Nobody at the firm can sign in to
 * an account they have not set up. So the page says who approved them
 * and offers the one thing they can do: set a password and take it.
 *
 * The password door reads the claim token and takes the company the
 * client already made, rather than founding a second one. Its link
 * shape is `/signup?claim=<token>`.
 */

export function approvedLine(company: string, approvedBy: string, taken = false): string {
  const said = `${company} was approved by ${approvedBy}.`
  // Once somebody has taken it, the offer is gone; the panel below says what to do.
  return taken ? said : `${said} Set a password to take this account.`
}

export const SET_PASSWORD = 'Set a password'

export const WORK_ACCOUNT = 'Or sign in with your work account'

/** The password door, carrying the claim so it takes this company. */
export function setPasswordHref(token: string): string {
  return `/signup?claim=${encodeURIComponent(token)}`
}

/** Where a work-account sign-in comes back to, so the claim can finish. */
export function backToClaim(token: string): string {
  return `/claim/${encodeURIComponent(token)}`
}

/** The jobs line, said once, only when there are jobs. */
export function jobsWaiting(n: number, from: string): string | null {
  if (n <= 0) return null
  return `${n} ${n === 1 ? 'job is' : 'jobs are'} waiting for you from ${from}.`
}
