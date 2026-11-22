/**
 * Which console a seat opens on.
 *
 * The browser walk of 2026-09-21 opened `/dashboard` as thirty-eight
 * seats and three of them were shown somebody else's product. The worst
 * was an integrator: `kind === 'GSI'` sat in the same redirect as CLIENT
 * and MSP, so Tellisford Solutions, Sundara Systems and a Sundara
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
import { consoleHome, readsOnlyOwnWork } from '@/lib/console-home'
import { getNavForKind } from '@/components/shell/sidebar'
import { pinnedOn, landingFor, ASK_ETYME_HREF } from '@/lib/nav-table'
import { deskHome } from '@/components/desk-home'
import { readFileSync } from 'fs'
import { join } from 'path'

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

  it('a one-person corporation opens in Ask Etyme, which her menu draws first, above her own work, from day one', () => {
    expect(consoleHome({ kind: 'CONSULTANT_CORP' }).href).toBe('/dashboard/conversations/etyme')
    // A new firm of one has no placement yet, so nothing makes her a worker,
    // and she still lands on a page her own menu names (round two, item 38).
    // What needs her is Ask Etyme's greeting since 2026-10-12.
    const fresh = getNavForKind('CONSULTANT_CORP', false)
    expect(fresh[0].label).toBe('Ask Etyme')
    expect(pinnedOn(fresh)[0].href).toBe(consoleHome({ kind: 'CONSULTANT_CORP' }).href)
    // Her own pages are there before any placement says she is a worker.
    expect(fresh.map((s) => s.label)).toContain('Your work')
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
  // Ask Etyme counts: the menu draws it above the sections (pinnedOn).
  const reachable = (kind: any, isConsultant: boolean) => {
    const menu = getNavForKind(kind, isConsultant, { worker: true })
    return [...pinnedOn(menu), ...menu.flatMap((s) => s.items)].map((i) => i.href.split('?')[0])
  }

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

  it('reads her seven links — Ask Etyme, her work, her hours, her bills, her contracts, her paperwork and Settings — and nothing else', () => {
    expect(solo.map((s) => s.label)).toEqual(['Ask Etyme', 'Your work', 'Timesheets', 'Bills', 'Contracts', 'Paperwork', 'Settings'])
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

  it('gives the MSP its own menu back the moment it holds no seat at the client', () => {
    expect(getNavForKind('MSP', false).map((s) => s.label)).toEqual(
      ['Ask Etyme', 'Today', 'Network', 'Jobs', 'Submissions', 'Contracts', 'Timesheets', 'Bills', 'Invoice receipts', 'Settings']
    )
  })
})

describe('a worker’s dashboard opens on their own work', () => {
  const karthik = ['assignments.read', 'timesheets.read']

  it('a worker whose seat reads only their own work opens on that work, not on the firm’s Today', () => {
    expect(consoleHome({ kind: 'GSI', worker: true, permissions: karthik }).href).toBe('/dashboard/my-work')
  })

  it('a worker who also runs a desk at the firm still opens on the firm’s book', () => {
    expect(consoleHome({ kind: 'GSI', worker: true, permissions: [...karthik, 'submissions.create'] }).href).toBe('/dashboard')
    expect(consoleHome({ kind: 'GSI', worker: true, permissions: ['*'] }).href).toBe('/dashboard')
  })

  it('staff whose seat holds no desk open on their own work even before any work is theirs, and staff with a desk keep the firm’s Today (sign-up walk, round five)', () => {
    // Reading only one's own work is not a desk, so the firm's Today is not theirs to read.
    expect(consoleHome({ kind: 'GSI', worker: false, permissions: karthik }).href).toBe('/dashboard/my-work')
    expect(consoleHome({ kind: 'GSI', worker: false, permissions: [...karthik, 'consultants.read'] }).href).toBe('/dashboard')
  })

  it('a seat not yet known is not read as reading only its own work', () => {
    expect(readsOnlyOwnWork(null)).toBe(false)
    expect(readsOnlyOwnWork(undefined)).toBe(false)
    expect(consoleHome({ kind: 'GSI', worker: true, permissions: null }).href).toBe('/dashboard')
  })

  it('the dashboard, the menu and the header all ask with the worker and the seat, so the three doors agree', () => {
    for (const f of ['src/app/dashboard/page.tsx', 'src/components/shell/sidebar.tsx', 'src/components/shell/header.tsx']) {
      const src = readFileSync(join(process.cwd(), f), 'utf8')
      const call = src.slice(src.indexOf('consoleHome({'), src.indexOf('consoleHome({') + 300)
      expect(call, f).toMatch(/worker/)
      expect(call, f).toMatch(/permissions/)
    }
  })
})

describe('a firm that chose the decision queue as its home', () => {
  it('a company with no home setting lands where it always did', () => {
    for (const kind of ['VENDOR', 'CLIENT', 'GSI', 'MSP'] as const) {
      expect(landingFor({ kind, permissions: ['*'], homePage: null })).toBe(landingFor({ kind, permissions: ['*'] }))
      expect(consoleHome({ kind, permissions: ['*'], homePage: null }).href).toBe(consoleHome({ kind, permissions: ['*'] }).href)
    }
  })

  it('a seat that works at a firm whose home is the decision queue lands on the decision queue', () => {
    for (const kind of ['VENDOR', 'CLIENT', 'GSI', 'MSP'] as const) {
      expect(landingFor({ kind, permissions: ['*'], homePage: 'DECISIONS' })).toBe('/dashboard/decisions')
    }
  })

  it('a worker’s own page and a one-person firm do not move when the firm chose the decision queue', () => {
    expect(landingFor({ kind: 'VENDOR', isConsultant: true, homePage: 'DECISIONS' })).not.toBe('/dashboard/decisions')
    expect(landingFor({ kind: 'VENDOR', worker: true, permissions: ['assignments.read', 'timesheets.read'], homePage: 'DECISIONS' })).not.toBe('/dashboard/decisions')
    expect(landingFor({ kind: 'CONSULTANT_CORP', homePage: 'DECISIONS' })).not.toBe('/dashboard/decisions')
  })

  it('the dashboard, the menu, the header and the tab row all read the firm’s home setting, so a seat returns to the decision queue', () => {
    for (const f of ['src/app/dashboard/page.tsx', 'src/components/shell/sidebar.tsx', 'src/components/shell/header.tsx', 'src/components/shell/section-pills.tsx']) {
      const src = readFileSync(join(process.cwd(), f), 'utf8')
      const call = src.slice(src.indexOf('consoleHome({'), src.indexOf('consoleHome({') + 300)
      expect(call, f).toMatch(/homePage/)
    }
    // And the session carries it from /api/me.
    expect(readFileSync(join(process.cwd(), 'src/app/api/me/route.ts'), 'utf8')).toMatch(/homePage: true/)
  })

  it('a seat that reads one region still opens on Ask Etyme when the firm’s home is the decision queue', () => {
    expect(landingFor({ kind: 'CLIENT', permissions: ['*'], region: 'Latin America', homePage: 'DECISIONS' })).not.toBe('/dashboard/decisions')
    expect(deskHome({ kind: 'CLIENT', isConsultant: false, role: 'Hiring Manager', permissions: ['*'], region: 'Latin America', homePage: 'DECISIONS' })).toBe(ASK_ETYME_HREF)
  })

  it('every door that lands a seat reads the firm’s home setting: the demo door, a seat switch, a password set and the role-changed email', () => {
    const demo = readFileSync(join(process.cwd(), 'src/app/api/demo/route.ts'), 'utf8')
    const calls = demo.split('landingFor({').slice(1).map((c) => c.slice(0, 500))
    expect(calls.length).toBe(3)
    for (const c of calls) expect(c).toMatch(/homePage: homeSetting\(/)
    expect(readFileSync(join(process.cwd(), 'src/components/session-provider.tsx'), 'utf8')).toMatch(/line\.hat === 'firm' \? START_HREF/)
    expect(readFileSync(join(process.cwd(), 'src/app/(auth)/reset/[token]/form.tsx'), 'utf8')).toMatch(/j\.data\.landing \?\? START_HREF/)
    const access = readFileSync(join(process.cwd(), 'src/app/api/access/route.ts'), 'utf8')
    expect(access.slice(access.indexOf('landing: consoleHome({'), access.indexOf('landing: consoleHome({') + 400)).toMatch(/homePage/)
  })
})
