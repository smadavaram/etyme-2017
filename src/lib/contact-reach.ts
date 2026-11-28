/**
 * Whether a contact can be reached at all, said once for the form and
 * the route.
 *
 * Its own file because the Add contact form runs in the browser and
 * lib/contacts reaches node:crypto through the demo-address check; one
 * sentence in two copies is one of them wrong within a month.
 */

/** Said when a contact has neither an email address nor a phone number. */
export const NO_WAY_TO_REACH =
  'Give an email address or a phone number, so somebody can reach them. Either one is enough.'

/** A rolodex row answers "who do I call"; a row with neither answers nothing. */
export function reachable(c: { email?: string | null; phone?: string | null }): boolean {
  return Boolean((c.email ?? '').trim() || (c.phone ?? '').trim())
}
