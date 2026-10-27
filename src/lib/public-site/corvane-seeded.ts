/**
 * Is Corvane Packaging in this deployment's world yet?
 *
 * The release walk on production (4bac05708, 2026-10-27) found the map's
 * four "Open the demo as …" links landing on the demo door's 404
 * NOT_SEEDED, because the map is drawn from the seed's code and the
 * world on that deployment had not been seeded again since Corvane was
 * added. A link to a door that will refuse is a link that lies, so the
 * page asks first: one read of the company by its slug, server-side,
 * nothing about anybody in it.
 *
 * Any failure reads as "not seeded": the cost of a wrong "no" is one
 * sentence instead of a link, the cost of a wrong "yes" is a 404.
 *
 * And it is bounded. The home page is drawn without waiting on anything
 * (`home-rhythm.test.ts`), and this is the one read it makes: a database
 * slower than `SEEDED_WAIT_MS` reads as "not seeded" rather than holding
 * the page, so the map and the panel are never late for it.
 *
 * Server only: it reaches the database client.
 */

import { prisma } from '@/lib/db'
import { CORVANE_DEMO_AS } from './corvane-map'

/** The one read this needs, so a test can hand in its own. */
export interface CompanyBySlug {
  company: { findUnique(args: { where: { slug: string }; select: { id: true } }): Promise<{ id: string } | null> }
}

/**
 * The longest the home page waits to learn whether Corvane is seeded.
 * Long enough for a cold database connection on the host, so a seeded
 * deployment is not told "being set up" on its first visit; short enough
 * that a stalled database costs under a second, never a blank page.
 */
export const SEEDED_WAIT_MS = 800

export async function corvaneIsSeeded(
  db: CompanyBySlug = prisma as unknown as CompanyBySlug,
  waitMs: number = SEEDED_WAIT_MS,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), waitMs) })
  const read = db.company
    .findUnique({ where: { slug: CORVANE_DEMO_AS }, select: { id: true } })
    .then((c) => c !== null, () => false)
  try {
    return await Promise.race([read, late])
  } finally {
    clearTimeout(timer)
  }
}
