/**
 * Who may open the map (/map).
 *
 * The map shows how the system is built, which tests prove what, and what
 * is not built yet. It holds no customer data, but it is not for the
 * public either (round one of the sign-up walk). Two ways in:
 *
 *   1. Signed in as the Owner or Admin of a real company — never a seeded
 *      demo company, so the demo door does not open it.
 *   2. The map key this deployment was given (`MAP_TOKEN`), passed once as
 *      `/map?key=…` and then kept in a cookie.
 *
 * No database here: the middleware asks these rules, and a route that can
 * reach the database answers the seat question for it.
 */

export const MAP_COOKIE = 'etyme-map-key'

/** Said in the map's footer, and on the page that refuses. */
export const MAP_WHO =
  'Who may see this map: the Owner or Admin of a real company on Etyme, signed in, or somebody given this deployment\'s map key. Demo seats cannot open it.'

export const MAP_REFUSED = 'The map is for the people who run a company on Etyme. Sign in as its Owner or Admin to see it.'

/** The roles that open the map. */
export const MAP_ROLES = ['Owner', 'Admin'] as const

/**
 * Whether a given key matches the deployment's key. No key set means no
 * key opens it. Compared in time that does not depend on where the two
 * first differ.
 */
export function keyOpens(given: string | null | undefined, key: string | null | undefined): boolean {
  if (!key || !given) return false
  if (given.length !== key.length) return false
  let diff = 0
  for (let i = 0; i < key.length; i++) diff |= given.charCodeAt(i) ^ key.charCodeAt(i)
  return diff === 0
}

/** One seat a person holds, as the gate needs it. */
export interface MapSeat {
  role: string | null
  /** The company is seeded: marked as a demo, or on a domain nobody can register. */
  seed: boolean
}

/** Whether any of these seats opens the map. */
export function seatOpens(seats: readonly MapSeat[]): boolean {
  return seats.some((s) => !s.seed && s.role !== null && (MAP_ROLES as readonly string[]).includes(s.role))
}
