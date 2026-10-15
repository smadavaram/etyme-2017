/**
 * Old documentation addresses, and the page that replaced each.
 *
 * On 2026-10-15 the founder's "Build it" cut the documentation to one
 * screen a page: nine process pages became five, ten party pages became
 * one table, and the process overview became the documentation home. A
 * link already sent, bookmarked or indexed must still land somewhere
 * real, so every removed address answers with a permanent redirect to
 * its replacement, read by the route files under `app/(site)/docs`.
 * Nothing here is drawn; next.config is not the market's, so the map
 * lives beside the pages it points at.
 */

/** The nine process pages, by their old slug under /docs/process, and the step page each became part of. */
export const OLD_PROCESS: Record<string, string> = {
  'source-to-contract': '/docs/job',
  'contract-to-onboard': '/docs/candidates',
  'work-to-approve': '/docs/timesheets',
  expenses: '/docs/timesheets',
  'approve-to-bill': '/docs/invoices',
  'approve-to-pay': '/docs/invoices',
  'record-to-report': '/docs/invoices',
  'govern-and-protect': '/docs/when-work-ends',
  'when-work-ends': '/docs/when-work-ends',
}

/** The process overview, which the documentation home replaced. */
export const OLD_PROCESS_HOME = '/docs'

/** The ten party pages, by their old slug under /docs, all replaced by one table. */
export const OLD_PARTY_SLUGS = [
  'client', 'systems-integrator', 'msp-program-office', 'prime-vendor',
  'sub-vendor', 'bench-vendor', 'self-employed', 'candidate',
  'candidate-independent', 'candidate-employee',
] as const

export const WHO_DOES_WHAT_ROUTE = '/docs/who-does-what'

/**
 * Where an old address goes now, or null when it was never a page. A
 * process page read as one party (/docs/process/[stage]/[party]) goes
 * where the stage goes; the party it was read as is on the one table.
 */
export function replacementFor(path: string): string | null {
  const parts = path.replace(/^\/+|\/+$/g, '').split('/')
  if (parts[0] !== 'docs') return null
  if (parts[1] === 'process') {
    if (parts.length === 2) return OLD_PROCESS_HOME
    if (parts.length > 4) return null
    const to = OLD_PROCESS[parts[2]]
    if (!to) return null
    if (parts.length === 4 && !(OLD_PARTY_SLUGS as readonly string[]).includes(parts[3])) return null
    return to
  }
  if (parts.length === 2 && (OLD_PARTY_SLUGS as readonly string[]).includes(parts[1])) return WHO_DOES_WHAT_ROUTE
  return null
}

/** Every old address this file answers for, for the test and for the report. */
export function oldAddresses(): string[] {
  return [
    '/docs/process',
    ...Object.keys(OLD_PROCESS).map((s) => `/docs/process/${s}`),
    ...OLD_PARTY_SLUGS.map((s) => `/docs/${s}`),
  ]
}
