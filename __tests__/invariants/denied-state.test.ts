import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { deniedFor } from '@/lib/denied'

/**
 * The fifth state.
 *
 * CLAUDE.md names five states every screen owes a reader — loading,
 * empty, error, partial, denied — and denied was the only one nobody had
 * built. A release walk found the same screen twice: a demo door that
 * 404s sets no cookie, and `/dashboard/tenure` then drew a consultant's
 * sidebar, "Cross-vendor tenure at …." with a literal ellipsis where a
 * company name belongs, five stats at zero, an "Add consultant" button,
 * and "Not authenticated" printed in the table body, over ten 401s.
 *
 * These are the sentences that say it may not come back.
 */

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

describe('the denied state', () => {
  it('tells somebody the app cannot seat one sentence about why, in words rather than a status code', () => {
    const d = deniedFor({ code: 'UNAUTHORIZED', message: 'Not authenticated' })
    expect(d.heading).toBe('You are not signed in')
    // The machine's words never reach the reader.
    expect(d.says).not.toMatch(/Not authenticated|UNAUTHORIZED|401/)
    // A sentence, not a fragment: it says what is missing and what to do.
    expect(d.says.length).toBeGreaterThan(60)
    expect(d.says).toMatch(/\./)
  })

  it('names the demo link as the likely way somebody arrived signed out, because that is how they did', () => {
    const d = deniedFor({ code: 'UNAUTHORIZED', message: 'Not authenticated' })
    expect(d.says.toLowerCase()).toContain('demo')
  })

  it('offers a refused caller nothing the app would refuse — a door, never a control', () => {
    for (const code of ['UNAUTHORIZED', 'NOT_FOUND', 'SUSPENDED', 'ACCESS_ENDED', 'NO_SEAT', 'WHAT']) {
      const d = deniedFor({ code, message: 'something happened, and here is what to do.' })
      expect(d.doors.length).toBeGreaterThan(0)
      for (const door of d.doors) {
        // Every door is a way out of the app's refusal — never back into
        // the dashboard that has just refused them, and never an action.
        expect(door.href.startsWith('/dashboard')).toBe(false)
        expect(door.href).toMatch(/^\/(login|demo|start)$/)
      }
      // At most one primary, so there is one obvious thing to do.
      expect(d.doors.filter((x) => x.primary).length).toBeLessThanOrEqual(1)
    }
  })

  it('does not offer the dashboard to somebody the dashboard has just refused', () => {
    const d = deniedFor({ code: 'NO_SEAT', message: 'nobody has given you a seat yet.' })
    expect(d.doors.map((x) => x.label).join(' ')).not.toMatch(/dashboard|workspace/i)
  })

  it('repeats the seat sentence the identity door already wrote, rather than writing a second one', () => {
    // lib/api-context took a correction to get these right — a paused
    // seat is not an ended one and neither is "you never had one". A
    // second answer here would drift from it.
    const paused = 'Your access at Brightmoor Staffing is paused: under review. Somebody there can lift it.'
    expect(deniedFor({ code: 'SUSPENDED', message: paused }).says).toBe(paused)

    const ended = 'Your seat at Veritan Talent was removed, so there is nothing here for you to open now.'
    expect(deniedFor({ code: 'ACCESS_ENDED', message: ended }).says).toBe(ended)
  })

  it('still says something when the identity door starts refusing for a reason nobody wrote here', () => {
    const d = deniedFor({ code: 'SOMETHING_NEW', message: '' })
    expect(d.says.length).toBeGreaterThan(60)
    expect(d.heading).not.toBe('')
    expect(d.doors.length).toBeGreaterThan(0)
  })

  it("draws no menu of somebody else's workspace behind the refusal", () => {
    const screen = read('src/components/denied.tsx')
    for (const forbidden of ['Sidebar', 'DashboardShell', 'Header', 'SessionProvider']) {
      expect(screen).not.toContain(forbidden)
    }
  })

  it('refuses a caller in the layout, before any page draws a heading or a button', () => {
    const layout = read('src/app/dashboard/layout.tsx')
    // The gate is asked, and it returns before the shell.
    expect(layout).toContain('whyNotSeated')
    expect(layout).toContain('<DeniedScreen denied={denied} />')
    const gate = layout.indexOf('if (denied) return')
    const shell = layout.indexOf('<SessionProvider')
    expect(gate).toBeGreaterThan(-1)
    expect(gate).toBeLessThan(shell)
  })

  it('asks the same door every API route asks, so a page and a route cannot disagree about who is seated', () => {
    const layout = read('src/app/dashboard/layout.tsx')
    expect(layout).toContain('getCallerContext()')
  })
})

describe('a page never prints a company name it could not resolve', () => {
  it('shows no heading built from an unresolved name on the screen a refused caller reads', () => {
    const screen = read('src/components/denied.tsx')
    // The ellipsis placeholder is the tell: `{data?.client.name ?? '…'}`
    // is a screen asserting a fact it has not got.
    expect(screen).not.toContain('…')
    expect(screen).not.toMatch(/\?\?\s*'…'/)
  })
})

describe('a demo door that cannot be opened says which ones can', () => {
  it('names the desks a firm does have instead of only saying the one asked for is missing', () => {
    const route = read('src/app/api/demo/route.ts')
    expect(route).toContain('The desks it does ')
    expect(route).toContain('ask for one of those')
    // And a firm that is not in the world at all is a different sentence
    // from a firm that is there with nobody at that desk.
    expect(route).toContain("There is no ${asWorld} in this deployment's world")
  })
})

describe('a seeded order carries a number in the shape the product writes', () => {
  it('gives a seeded order a number a counterparty reads as its own purchase order, not a demo slug', () => {
    const seed = read('src/lib/seed-programmes.ts')
    // `PO-WORLD-CORNING-0001` was printed on Wrenfield Technical's own
    // compliance page as a commercial document number. A slug is an
    // address and nobody reads an address; this one was read.
    expect(seed).not.toContain('`PO-${slug.toUpperCase()}-0001`\n      const dOrder')
    expect(seed).toContain('`PO-${day(0).getUTCFullYear()}-${client.id.slice(-5).toUpperCase()}`')
  })

  it("gives one supplier a different number from each client that buys from it, because a purchase order is the buyer's own document", () => {
    const seed = read('src/lib/seed-order-to-cash.ts')
    // Keyed on the seller alone, three clients buying from one supplier
    // all raised "PO-2026-1H488" and the supplier read three of its
    // clients' orders under one reference.
    expect(seed).not.toContain('`PO-${day(0).getUTCFullYear()}-${p.sellerId.slice(-5).toUpperCase()}`\n    const already')
    expect(seed).toContain('${p.buyerId.slice(-3)}${p.sellerId.slice(-2)}')
  })

  it('renames a world seeded under the old slug rather than giving it a second order', () => {
    const seed = read('src/lib/seed-programmes.ts')
    // reseed-across-days requires a second seeding to be a true no-op.
    expect(seed).toContain('legacyNumber')
    expect(seed).toContain('db.workOrder.update')
  })
})
