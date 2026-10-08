/**
 * When "What is coming" offers to try again.
 *
 * A button reading "Try again" under a refusal tells the reader the
 * refusal is a fault a retry would fix. It is not: a 403 says this desk
 * does not read the page, and pressing the button would ask the same
 * question and get the same sentence. A 401 is the same — the session
 * has ended, and signing in, not retrying, is the way back.
 *
 * So the button is offered where a retry can change the answer: the
 * server failed, it was briefly unavailable, it was asked too often, or
 * it could not be reached at all (status 0).
 */
export function mayTryAgain(status: number): boolean {
  if (status === 0) return true
  if (status === 429) return true
  return status >= 500
}
