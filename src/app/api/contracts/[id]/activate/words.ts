/**
 * The words the activate route says about a placement: who may change
 * it, and where the work is done. Pure, and kept beside the route because
 * a route file may export only its handlers.
 */

import { formatDay } from '@/lib/format-date'

/**
 * The firms that may change a contract, each named once and joined the
 * way a person says a list: "A or B", "A, B or C". The client and the end
 * client are often the same firm, and naming it twice read as a mistake.
 */
export function partiesSay(names: ReadonlyArray<string | null | undefined>): string {
  const once = [...new Set(names.filter((n): n is string => Boolean(n && n.trim())).map((n) => n.trim()))]
  if (once.length <= 1) return once[0] ?? 'the firms on it'
  return `${once.slice(0, -1).join(', ')} or ${once[once.length - 1]}`
}

/** Where the work is done, as the worker reads it: "Northbend Athletic’s site in Tualatin, OR". */
export function siteSay(clientName: string, site: { name?: string | null; city?: string | null; state?: string | null; isRemote?: boolean | null } | null | undefined): string {
  if (!site) return clientName
  if (site.isRemote) return `${clientName}, working remotely`
  const place = [site.city, site.state].filter(Boolean).join(', ') || site.name || null
  return place ? `${clientName}’s site in ${place}` : clientName
}

/**
 * What starting a placement means on the day it is pressed. Cleared
 * ahead of the start day is not "work may begin": the worker would read
 * that as come in tomorrow. So before the start day it says who is
 * cleared and from which day, "Ingrid Sørensen is cleared to start on
 * Oct 27"; on or after it, work may begin. Days are calendar days in UTC,
 * as every stored start date is.
 */
export function startSays(
  name: string,
  startDate: Date,
  now: Date = new Date()
): { ahead: boolean; says: string; told: string } {
  const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const ahead = day(startDate) > day(now)
  if (!ahead) return { ahead, says: `${name} has started — work may begin`, told: 'has started — work may begin' }
  const on = formatDay(startDate, { year: startDate.getUTCFullYear() === now.getUTCFullYear() ? false : undefined })
  return { ahead, says: `${name} is cleared to start on ${on}`, told: `is cleared — you start on ${on}` }
}
