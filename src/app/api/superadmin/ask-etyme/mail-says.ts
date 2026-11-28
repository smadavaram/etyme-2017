/**
 * The sentence over "Email that did not go" on Etyme's staff screen. It
 * never says every email left unless email is set up and nothing failed
 * or was held back (walk fdb, 2026-11-14: six invitations never left and
 * the screen said "Nothing failed"). Where no email sender is set up, it
 * says so first. Pure.
 */
export const NO_SENDER_SAYS = 'No email sender is set up on this deployment, so no email can leave from here yet.'

export function mailListSays(listed: number, mailSetUp: boolean): string {
  const list = listed === 0 ? null : `The newest ${listed} that did not go, newest first.`
  if (!mailSetUp) return list ? `${NO_SENDER_SAYS} ${list}` : NO_SENDER_SAYS
  return list ?? 'Every email sent from here has left. Nothing failed or was held back.'
}
