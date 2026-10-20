/**
 * The words the activate route says about a placement: who may change
 * it, and where the work is done. Pure, and kept beside the route because
 * a route file may export only its handlers.
 */

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
