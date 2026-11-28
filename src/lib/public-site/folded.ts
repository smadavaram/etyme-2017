/**
 * The four product pages that folded into the four steps, and the step
 * each went to.
 *
 * On 2026-10-15 the founder said "build it" on the menu told as a story:
 * four steps, one page each. The eight product pages became four. A link
 * already sent, bookmarked or indexed must still land somewhere real, so
 * each removed address answers with a permanent redirect to the step it
 * folded into, read by its route file under `app/(site)`. next.config is
 * not the market's, so the map lives beside the pages it points at, the
 * way `./docs/redirects` does for the documentation.
 */

export const FOLDED: Record<'/governance' | '/contracts' | '/compliance' | '/chain', '/requisitions' | '/submissions' | '/invoices'> = {
  '/governance': '/requisitions',
  '/contracts': '/submissions',
  '/compliance': '/submissions',
  '/chain': '/invoices',
}

export type FoldedRoute = keyof typeof FOLDED

/** Where a folded product page goes now, or null when the address was never one of them. */
export function foldedInto(route: string): string | null {
  return (FOLDED as Record<string, string>)[route] ?? null
}
