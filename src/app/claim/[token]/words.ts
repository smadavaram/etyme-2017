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

/**
 * The same line for a client a supplier invited. A supplier does not
 * approve its client, so it never says "approved by": it says what the
 * supplier keeps and what taking it means.
 */
export function clientClaimLine(supplier: string, taken = false): string {
  const said = `${supplier}, your supplier, keeps a record of your work together on Etyme.`
  return taken ? said : `${said} Set a password to take it.`
}

/** The page's first line: who the claim is from, in the words for whoever is claiming. */
export function claimLine(claim: { company: string; invitedBy: string; invitedAs?: 'CLIENT' | 'SUPPLIER' }, taken = false): string {
  return claim.invitedAs === 'CLIENT' ? clientClaimLine(claim.invitedBy, taken) : approvedLine(claim.company, claim.invitedBy, taken)
}

/** The eyebrow over the company's name. */
export function claimEyebrow(invitedAs?: 'CLIENT' | 'SUPPLIER'): string {
  return invitedAs === 'CLIENT' ? 'Client account' : 'Supplier account'
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
