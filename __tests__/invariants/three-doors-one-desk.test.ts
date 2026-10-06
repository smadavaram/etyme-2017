import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { plusMenuFor, reachablePagesFor } from '@/components/shell/header'
import { deskOf, sidebarPropsFrom } from '@/components/shell/sidebar-props'
import { getNavForKind } from '@/components/shell/sidebar'
import { rolesFor } from '@/lib/company-defaults'
import { hasAnyPermission } from '@/lib/permissions'
import { SUPPLIER_SEATS, ALL_SEATS } from '@/app/demo/seats'
import { DESKS as DEMO_DESKS } from '@/lib/demo-desks'
import { NICHE_VENDOR, NICHE_DESKS } from '@/lib/seed-bench-profit'

/**
 * The sidebar, the + button and ⌘K are three doors into the same pages.
 *
 * An outside review of the live demo, 2026-10-05: Kestrel MSP, seated at
 * Talvern Medical's compliance desk, read Talvern's menu in the sidebar
 * and Kestrel's own + menu in the header — "Add consultant", "New
 * contract" — over Talvern's book, and Talvern's routes refused every
 * one. The sidebar read the seat; the header read the session's own
 * company. CLAUDE.md: "a menu entry the route will refuse is a menu
 * entry that lies", and the three doors are filtered from one answer.
 */

const role = (kind: 'CLIENT' | 'MSP' | 'VENDOR', name: string) =>
  rolesFor(kind).find((r) => r.name === name)!.permissions

/** Kestrel MSP, at its own company, holding Talvern Medical's compliance desk. */
const seatedOffice = {
  company: { id: 'kestrel', name: 'Kestrel MSP', slug: 'world-kestrel', kind: 'MSP' as const },
  contextType: 'EMPLOYEE' as const,
  isWorker: false,
  loading: false,
  // The office's own seat at the office holds the office's own role.
  permissions: role('MSP', 'Owner'),
  seat: {
    clientId: 'talvern', clientName: 'Talvern Medical', roleName: 'Compliance Officer',
    permissions: role('CLIENT', 'Compliance Officer'),
  },
}

/**
 * What each + item's form sends to, and what that route asks for on the
 * send — read off the route's own check, written here so the test does
 * not trust the header's own copy of it.
 */
const ROUTE_ASKS: Record<string, readonly string[] | 'worker' | null> = {
  '/dashboard/requirements?new=1': ['requirements.write'],
  '/dashboard/submissions?new=1': ['submissions.create', 'assignments.write'],
  '/dashboard/consultants?new=1': ['consultants.write'],
  '/dashboard/bench?new=1': ['consultants.write'],
  '/dashboard/contracts?new=1': ['assignments.write'],
  '/dashboard/timesheets?new=1': 'worker',
  '/dashboard/expenses?new=1': ['invoices.read'],
  '/dashboard/invoices?new=1': ['invoices.issue'],
  '/dashboard/conversations?new=1': null,
  '/dashboard/decisions': null,
}

const items = (menu: ReturnType<typeof plusMenuFor>) => menu.flatMap((s) => s.items)
const labels = (menu: ReturnType<typeof plusMenuFor>) => items(menu).map((i) => i.label)

describe('the + button, ⌘K and the sidebar read one desk', () => {
  it('a program office seated at a client’s desk gets the client’s + menu, with nothing the client’s routes would refuse', () => {
    const desk = deskOf(seatedOffice)
    expect(desk.menuKind).toBe('CLIENT')
    const menu = plusMenuFor(desk.menuKind, desk.isConsultant, desk.permissions, desk.worker)
    const sections = menu.map((s) => s.label)
    const clientSections = new Set(getNavForKind('CLIENT', false).map((s) => s.label))
    for (const s of sections) expect(clientSections, `the + menu says "${s}"`).toContain(s)
    for (const i of items(menu)) {
      const asks = ROUTE_ASKS[i.href]
      expect(asks, `${i.label} opens ${i.href}, which this test does not know`).not.toBeUndefined()
      if (asks === 'worker') throw new Error(`${i.label} is offered to somebody whose week it is not`)
      if (asks) expect(hasAnyPermission(seatedOffice.seat.permissions, asks as any), `${i.label} would be refused`).toBe(true)
    }
  })

  it('a seated compliance officer is offered no consultant, no contract and no job request — only what her desk may do', () => {
    const desk = deskOf(seatedOffice)
    const offered = labels(plusMenuFor(desk.menuKind, desk.isConsultant, desk.permissions, desk.worker))
    for (const write of ['Add consultant', 'Add to bench', 'New contract', 'Submit consultant', 'Generate bill', 'New job request', 'New requirement']) {
      expect(offered).not.toContain(write)
    }
    expect(offered).toContain('Review approvals')
  })

  it('reads the seat’s permissions, never the office’s own, wherever there is a seat', () => {
    expect(deskOf(seatedOffice).permissions).toEqual(seatedOffice.seat.permissions)
    expect(sidebarPropsFrom(seatedOffice).permissions).toEqual(deskOf(seatedOffice).permissions)
  })

  it('an office whose seat is revoked gets its own menu back, read off its own role', () => {
    const own = { ...seatedOffice, seat: null }
    const desk = deskOf(own)
    expect(desk.menuKind).toBe('MSP')
    expect(desk.permissions).toEqual(own.permissions)
    expect(plusMenuFor(desk.menuKind, false, desk.permissions, false).map((s) => s.label)).toEqual(['Demand', 'Supply', 'Operate'])
  })

  it('⌘K at a client’s desk finds the client’s pages and none that only the office’s own menu offers', () => {
    const desk = deskOf(seatedOffice)
    const found = reachablePagesFor(desk.companyKind, desk.isConsultant, {
      worker: desk.worker, permissions: desk.permissions, seatedAtClient: desk.seatedAtClient,
    }).map((p) => p.href)
    const sidebar = getNavForKind(desk.companyKind, false, {
      permissions: desk.permissions, seatedAtClient: desk.seatedAtClient,
    }).flatMap((s) => s.items.map((i) => i.href))
    expect(found).toEqual(sidebar)
    const clientHrefs = new Set(getNavForKind('CLIENT', false).flatMap((s) => s.items.map((i) => i.href)))
    for (const href of found) expect(clientHrefs, href).toContain(href)
  })

  it('a client’s own compliance officer is not offered a new job request, because sending one is refused', () => {
    const offered = labels(plusMenuFor('CLIENT', false, role('CLIENT', 'Compliance Officer'), false))
    expect(offered).not.toContain('New job request')
  })

  it('a client’s hiring manager is still offered a new job request', () => {
    expect(labels(plusMenuFor('CLIENT', false, role('CLIENT', 'Hiring Manager'), false))).toContain('New job request')
  })

  it('a supplier’s accounts receivable desk is offered the bill and not the consultant, the bench or the contract', () => {
    const ar = role('VENDOR', 'Accounts Receivable')
    const offered = labels(plusMenuFor('VENDOR', false, ar, false))
    for (const i of items(plusMenuFor('VENDOR', false, ar, false))) {
      const asks = ROUTE_ASKS[i.href]
      if (Array.isArray(asks)) expect(hasAnyPermission(ar, asks as any), `${i.label} would be refused`).toBe(true)
    }
    expect(offered).not.toContain('Add consultant')
  })

  it('only the person whose week it is is offered a new timesheet; the owner of the firm is not', () => {
    expect(labels(plusMenuFor('VENDOR', false, ['*'], false))).not.toContain('New timesheet')
    expect(labels(plusMenuFor('VENDOR', false, ['*'], true))).toContain('New timesheet')
  })

  it('the header reads the desk through the same helper the sidebar reads', () => {
    const header = readFileSync(join(process.cwd(), 'src/components/shell/header.tsx'), 'utf8')
    expect(header).toContain('const desk = deskOf(session)')
    expect(header).toContain('plusMenuFor(desk.menuKind, desk.isConsultant, permissions, desk.worker)')
    expect(header).not.toMatch(/plusMenuFor\(company\?\.kind/)
  })
})

describe('the demo offers a bench vendor’s door', () => {
  const door = SUPPLIER_SEATS.find((s) => s.slug === `world-${NICHE_VENDOR.slug}`)

  it('the demo offers a bench vendor’s door: Pellwright Validation Partners', () => {
    expect(door, 'no door for the seeded bench vendor').toBeTruthy()
    expect(door!.name).toBe(NICHE_VENDOR.name)
    expect(ALL_SEATS).toContain(door)
  })

  it('names it a bench vendor and says what a bench is, in the demo’s plain words', () => {
    expect(door!.where).toMatch(/^Bench vendor/)
    expect(door!.about).toContain('waiting for a project')
  })

  it('seats its owner and its finance desk, both desks the seed writes and the route answers to', () => {
    const desks = (door!.desks ?? []).map((d) => d.desk)
    expect(desks).toEqual(['finance', ''])
    expect(NICHE_DESKS.map((d) => d.desk)).toContain('finance')
    expect([...DEMO_DESKS]).toContain('finance')
  })
})

describe('a route judges a request by the same desk the shell draws', () => {
  // `permissionsToJudgeBy` in lib/program-seat is the server half of
  // `deskOf`: the screen and the route read one answer.
  it('a request made under a seat is judged by the client’s role the seat holds, never the office’s own', async () => {
    const { permissionsToJudgeBy } = await import('@/lib/program-seat')
    const seat = { role: { id: 'r', name: 'Compliance Officer', permissions: role('CLIENT', 'Compliance Officer') } }
    expect(permissionsToJudgeBy({ permissions: ['*'] }, seat)).toEqual(seat.role.permissions)
  })

  it('a request made with no seat is judged by the caller’s own role', async () => {
    const { permissionsToJudgeBy } = await import('@/lib/program-seat')
    expect(permissionsToJudgeBy({ permissions: role('MSP', 'Owner') }, null)).toEqual(role('MSP', 'Owner'))
  })

  it('the shell and the route give a seated office the same permissions', async () => {
    const { permissionsToJudgeBy } = await import('@/lib/program-seat')
    const seat = { role: { id: 'r', name: 'Compliance Officer', permissions: [...seatedOffice.seat.permissions] } }
    expect(permissionsToJudgeBy({ permissions: seatedOffice.permissions }, seat)).toEqual(deskOf(seatedOffice).permissions)
  })
})
