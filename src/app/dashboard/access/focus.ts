/**
 * Where a link into Users & permissions lands.
 *
 * Team structure links a name here with `?person=<contextId>` and its
 * "Give access to this team" item with `?unit=<id>`. Both used to open
 * the plain page, so the reader had to find the row again by eye. The
 * page reads the address once the register is drawn and scrolls to the
 * row (or to Give access), marked so it is plain which one was meant.
 *
 * A value that is not a plain id is ignored rather than put into a
 * selector, and a person whose row is not on the page lands on the page
 * as before: nothing is said about a seat this reader cannot see.
 */

const ID = /^[A-Za-z0-9_-]{1,64}$/

export interface AccessFocus {
  person: string | null
  unit: string | null
}

export function focusFromQuery(search: string): AccessFocus {
  const q = new URLSearchParams(search)
  const clean = (v: string | null) => (v && ID.test(v) ? v : null)
  return { person: clean(q.get('person')), unit: clean(q.get('unit')) }
}

/** The element id a person's row carries, so a link can land on it. */
export function personAnchor(contextId: string): string {
  return `access-person-${contextId}`
}

/** The element id the Give access section carries. */
export const GIVE_ACCESS_ANCHOR = 'give-access'

/** Said over Give access when a team's link landed here. */
export const UNIT_LANDED_SAYS =
  'You came here to give a team access. Under Give access, choose a team for how far it reaches, and pick the team.'

/** The mark on the row or section a link landed on. */
export const FOCUS_RING = 'ring-2 ring-etyme-action rounded-lg'
