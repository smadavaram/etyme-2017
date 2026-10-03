/**
 * Every "Fix it" on Missing paperwork opens a page that exists.
 *
 * ── What was wrong ───────────────────────────────────────────────────
 *
 * The release walk of 2026-09-21 clicked "Fix it →" on
 * `/dashboard/loose-ends` as three different firms and got
 * "404 — This page could not be found" every time. Six of the seven
 * kinds of loose end linked at `/dashboard/contracts/<id>`,
 * `/dashboard/timesheets/<id>` or `/dashboard/submissions/<id>`, and
 * none of those three folders has ever held an `[id]` route. Only the
 * profitability link resolved.
 *
 * So the one screen in the product whose entire job is "here is what is
 * unfinished, go and finish it" was a dead end — on the page that
 * exists precisely because a missing buy contract shows a hundred per
 * cent margin and nobody audits good news.
 *
 * ── Why a test and not a fix ─────────────────────────────────────────
 *
 * An href is a string. Nothing about writing one tells you whether
 * there is anything on the other end, and a page that 404s renders
 * green in every unit test ever written about it. So this reads the
 * `src/app` route tree and resolves each link against it, the way the
 * browser will.
 */

import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { looseEnd, type EndKind, type Subject } from '@/lib/loose-ends'

const APP = join(process.cwd(), 'src/app')

const KINDS: EndKind[] = [
  'NO_PROJECT_ORDER',
  'NO_BUY_CONTRACT',
  'NO_PAY_RATE',
  'ORDER_WITHOUT_COST',
  'APPROVED_NEVER_ACCEPTED',
  'AWARDED_NO_CONTRACT',
  'BUY_WITHOUT_ORDER',
]

const NOW = new Date('2026-09-21T00:00:00Z')

/** Everything the API knows when it builds a row. */
const full: Subject = {
  id: 'rec_1',
  label: 'Helena Marsh',
  client: 'Northbend Athletic',
  amountCents: 960_000,
  since: new Date('2026-06-01T00:00:00Z'),
  placementId: 'sell_1',
  requirementId: 'req_1',
}

/** Nothing but the record itself — an imported row, or one raised by hand. */
const bare: Subject = {
  id: 'rec_1',
  label: 'Helena Marsh',
  since: new Date('2026-06-01T00:00:00Z'),
}

/**
 * Walk the App Router the way Next does: a literal folder, else the one
 * dynamic segment at that level, and a `page.tsx` at the end of it.
 */
function resolves(href: string): boolean {
  const path = href.split('?')[0].split('#')[0]
  let dir = APP
  for (const segment of path.split('/').filter(Boolean)) {
    const literal = join(dir, segment)
    if (existsSync(literal)) {
      dir = literal
      continue
    }
    const dynamic = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith('[') && e.name.endsWith(']'))
      .map((e) => e.name)[0]
    if (!dynamic) return false
    dir = join(dir, dynamic)
  }
  return existsSync(join(dir, 'page.tsx'))
}

describe('Every Fix it link on Missing paperwork opens a page that exists', () => {

  it('proves the check itself by failing on the route that was never built', () => {
    // If this ever passes, somebody added the page and the rest of this
    // file stops meaning anything.
    expect(resolves('/dashboard/contracts/abc123')).toBe(false)
    expect(resolves('/dashboard/placements/abc123')).toBe(true)
  })

  it('opens a page that exists for every one of the seven kinds of gap', () => {
    const dead = KINDS
      .map((k) => ({ k, href: looseEnd(k, full, NOW).href }))
      .filter((r) => !resolves(r.href))
    expect(dead.map((d) => `${d.k} → ${d.href}`)).toEqual([])
  })

  it('still opens a page that exists when nothing but the broken record is known', () => {
    const dead = KINDS
      .map((k) => ({ k, href: looseEnd(k, bare, NOW).href }))
      .filter((r) => !resolves(r.href))
    expect(dead.map((d) => `${d.k} → ${d.href}`)).toEqual([])
  })

  it('sends a placement billed with no cost behind it to that placement', () => {
    expect(looseEnd('NO_BUY_CONTRACT', full, NOW).href).toBe('/dashboard/placements/sell_1')
  })

  it('sends a buy contract with no pay rate to the placement it funds, not to itself', () => {
    // The sentence names the buy contract; the link opens the sell line,
    // because a placement page is the only screen that shows both legs.
    const end = looseEnd('NO_PAY_RATE', full, NOW)
    expect(end.says).toContain('buy contract with no pay rate')
    expect(end.href).toBe('/dashboard/placements/sell_1')
  })

  it('falls back to the contracts list, never to an id nothing serves', () => {
    expect(looseEnd('NO_PAY_RATE', bare, NOW).href).toBe('/dashboard/contracts?side=buy')
    expect(looseEnd('NO_BUY_CONTRACT', bare, NOW).href).toBe('/dashboard/contracts?side=sell')
  })

  it('sends hours the client approved and nobody accepted to that week', () => {
    expect(looseEnd('APPROVED_NEVER_ACCEPTED', full, NOW).href).toBe('/dashboard/timesheets?id=rec_1')
  })

  it('sends an award with no contract behind it to the submissions for that role', () => {
    expect(looseEnd('AWARDED_NO_CONTRACT', full, NOW).href).toBe(
      '/dashboard/submissions?requirementId=req_1'
    )
  })

  it('sends an order earning with no cost against it to its own profitability', () => {
    expect(looseEnd('ORDER_WITHOUT_COST', full, NOW).href).toBe('/dashboard/profitability?order=rec_1')
  })

  it('never builds a link out of a contract, timesheet or submission id again', () => {
    const shapes = KINDS.flatMap((k) => [looseEnd(k, full, NOW).href, looseEnd(k, bare, NOW).href])
    for (const href of shapes) {
      expect(href).not.toMatch(/^\/dashboard\/(contracts|timesheets|submissions)\/[^/?]+/)
    }
  })
})
