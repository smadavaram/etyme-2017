/**
 * Which console a seat opens on.
 *
 * The browser walk of 2026-09-21 opened `/dashboard` as thirty-eight
 * seats and three of them were shown somebody else's product. The worst
 * was an integrator: `kind === 'GSI'` sat in the same redirect as CLIENT
 * and MSP, so Teleworld Solutions, Sundara Systems and a Sundara
 * validation engineer holding two read permissions each opened Corveldt
 * Aerospace's own program dashboard — "2 contractors on site through 2
 * suppliers. $43,680 this month." Two competing suppliers reading the
 * buyer's headcount and spend.
 *
 * These are sentences about who opens what, and nothing else decides it:
 * the redirect, the sidebar's Dashboard link and the demo door all read
 * `consoleHome`.
 */

import { describe, it, expect } from 'vitest'
import { consoleHome } from '@/lib/console-home'
import { getNavForKind } from '@/components/shell/sidebar'

describe('a seat opens on its own book and nobody else’s', () => {
  it('an integrator opening its dashboard is shown its own book, never a client’s program', () => {
    const home = consoleHome({ kind: 'GSI' })
    expect(home.href).toBe('/dashboard')
    expect(home.says).toContain('never on a client')
  })

  it('a supplier opening its dashboard is shown its own book', () => {
    expect(consoleHome({ kind: 'VENDOR' }).href).toBe('/dashboard')
  })

  it('a client opening its dashboard is shown the program it runs', () => {
    expect(consoleHome({ kind: 'CLIENT' }).href).toBe('/dashboard/program')
  })

  it('a program office holding a client’s desk opens on that client’s program', () => {
    expect(consoleHome({ kind: 'MSP', seated: true }).href).toBe('/dashboard/program')
  })

  it('a program office with no desk anywhere opens on its own book, not a stranger’s program', () => {
    // A seat is granted by a client, and nothing else stands in for one.
    // Reading a program off a trading relationship is what handed a
    // supplier a buyer's spend.
    expect(consoleHome({ kind: 'MSP', seated: false }).href).toBe('/dashboard')
  })

  it('a consultant who types the dashboard URL is sent to their own work, not a vendor console', () => {
    expect(consoleHome({ kind: 'VENDOR', isConsultant: true }).href).toBe('/dashboard/my-work')
    expect(consoleHome({ kind: null }).href).toBe('/dashboard/my-work')
  })

  it('a one-person corporation opens on its own work, because its work is the whole book', () => {
    expect(consoleHome({ kind: 'CONSULTANT_CORP' }).href).toBe('/dashboard/my-work')
  })

  it('says why in a sentence, for every reader', () => {
    for (const kind of ['VENDOR', 'CLIENT', 'MSP', 'GSI', 'CONSULTANT_CORP'] as const) {
      expect(consoleHome({ kind }).says.length).toBeGreaterThan(20)
    }
  })
})

describe('the page a seat lands on is a page its own menu names', () => {
  // A door that drops somebody on a page with no way back is how the
  // integrator seat was lost for a week.
  const reachable = (kind: any, isConsultant: boolean) =>
    getNavForKind(kind, isConsultant, { worker: true })
      .flatMap((s) => s.items.map((i) => i.href.split('?')[0]))

  it('a consultant can get back to the work they were landed on', () => {
    expect(reachable(null, true)).toContain(consoleHome({ kind: null }).href)
  })

  it('a one-person corporation can get back to the work she was landed on', () => {
    expect(reachable('CONSULTANT_CORP', false))
      .toContain(consoleHome({ kind: 'CONSULTANT_CORP' }).href)
  })

  it('a client can get back to the program it was landed on', () => {
    expect(reachable('CLIENT', false)).toContain(consoleHome({ kind: 'CLIENT' }).href)
  })
})

describe('a one-person corporation reads a menu of what one person’s firm has', () => {
  const solo = getNavForKind('CONSULTANT_CORP', false, { worker: true })
  const hrefs = solo.flatMap((s) => s.items.map((i) => i.href))

  it('reads Today, Operate, Governance and her own section, and nothing else', () => {
    expect(solo.map((s) => s.label)).toEqual(['Today', 'Operate', 'Governance', 'You'])
  })

  it('is offered no bench, no pipeline and no recruiter’s commission', () => {
    for (const agency of [
      '/dashboard/leads', '/dashboard/bench', '/dashboard/consultants',
      '/dashboard/training', '/dashboard/payroll/commissions',
      '/dashboard/profitability', '/dashboard/scorecards', '/dashboard/rolloff',
    ]) {
      expect(hrefs, agency).not.toContain(agency)
    }
  })

  it('keeps the week she actually works: her contracts, her hours, her invoices', () => {
    for (const own of [
      '/dashboard/contracts', '/dashboard/timesheets', '/dashboard/invoices',
      '/dashboard/compliance', '/dashboard/my-work',
    ]) {
      expect(hrefs, own).toContain(own)
    }
  })

  it('is not handed a staffing agency’s menu by another name', () => {
    expect(hrefs.length).toBeLessThan(20)
    expect(solo).not.toEqual(getNavForKind('VENDOR', false, { worker: true }))
  })
})

describe('a program office at a client’s desk reads the client’s menu', () => {
  // The money pages already read the client's book through the seat
  // (lib/money/seated-books) and the menu above them still said Demand
  // and Supply. A menu naming a different job from the book underneath
  // it is the same lie a wrong eyebrow is, one layer up.
  const seated = getNavForKind('MSP', false, { seatedAtClient: 'Cavanaugh Glassworks' })

  it('shows the sections a client reads, not a program office’s own', () => {
    expect(seated.map((s) => s.label)).toEqual(
      getNavForKind('CLIENT', false).map((s) => s.label)
    )
  })

  it('gives the office its own menu back the moment it holds no desk', () => {
    expect(getNavForKind('MSP', false).map((s) => s.label)).toEqual(
      ['Today', 'Demand', 'Supply', 'Operate', 'Grow', 'Governance']
    )
  })
})
