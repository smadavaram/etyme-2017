import { describe, it, expect } from 'vitest'
import { menuFor, menuLinks, getNavForKind, routesOpenToADesklessSeat, openBecause, YOUR_COMMISSIONS } from '@/lib/nav-table'
import { rolesFor } from '@/lib/company-defaults'
import { desklessDoor } from '@/lib/deskless-door'
import { seatPermissions } from '@/components/session-provider'

const perms = (name: string) => [...(rolesFor('VENDOR').find((r) => r.name === name)!.permissions)]
const RECRUITER = perms('Recruiter')
const FINANCE = perms('Finance')
const hrefs = (p: readonly string[], earns: boolean) =>
  menuLinks(menuFor('VENDOR', false, { permissions: p, earnsCommission: earns })).map((l) => l.href)

describe('A person who earns commission finds it on the menu (2026-11-08)', () => {
  it('a recruiter who earns commission at the firm reads "Your commissions" under Accounting, after everything else in it', () => {
    const groups = menuFor('VENDOR', false, { permissions: RECRUITER, earnsCommission: true })
    const accounting = groups.find((g) => g.heading === 'Accounting')!
    expect(accounting.links.map((l) => l.label).at(-1)).toBe('Your commissions')
    expect(accounting.links.at(-1)!.href).toBe('/dashboard/my-work/commissions')
    // and Settings still comes after it, where the seat reads Settings
    const order = groups.map((g) => g.heading ?? g.links[0].label)
    if (order.includes('Settings')) expect(order.indexOf('Accounting')).toBeLessThan(order.indexOf('Settings'))
  })

  it('a recruiter who earns none is offered no such link', () => {
    expect(hrefs(RECRUITER, false)).not.toContain(YOUR_COMMISSIONS.href)
  })

  it('a seat that already reads every commission under Payroll is not offered a second door to its own', () => {
    expect(FINANCE).toContain('payroll.read')
    expect(hrefs(FINANCE, true)).not.toContain(YOUR_COMMISSIONS.href)
  })

  it('the link is the firm hat\'s: in the You hat, and on a consultant\'s or a one-person firm\'s menu, it is never drawn', () => {
    const you = getNavForKind('VENDOR', false, { permissions: RECRUITER, earnsCommission: true, worker: true, hat: 'you' })
    expect(you.flatMap((s) => s.items).map((i) => i.href)).not.toContain(YOUR_COMMISSIONS.href)
    const consultant = getNavForKind(null, true, { permissions: [], earnsCommission: true })
    expect(consultant.flatMap((s) => s.items).map((i) => i.href)).not.toContain(YOUR_COMMISSIONS.href)
    const solo = getNavForKind('CONSULTANT_CORP', false, { permissions: [], earnsCommission: true })
    expect(solo.flatMap((s) => s.items).map((i) => i.href)).not.toContain(YOUR_COMMISSIONS.href)
  })

  it('the page says why it needs no permission, and a seat with no desk is let through to its own commissions and nobody else\'s route', () => {
    expect(openBecause(YOUR_COMMISSIONS.href)).toBe('It answers this person about this person.')
    expect(routesOpenToADesklessSeat().menu).toContain('me/commissions')
    expect(desklessDoor({ path: '/api/me/commissions', method: 'GET', permissions: [], contextType: 'EMPLOYEE', companyKind: 'VENDOR', companyName: 'Brightmoor Staffing' }))
      .toMatchObject({ open: true })
  })
})

describe('The menu filters by the permissions /api/me answers for the seat (2026-11-08)', () => {
  it('where /api/me lists the seat\'s permissions with its grants, the menu reads that list and not the layout\'s', () => {
    const active = { id: 'ctx-1', permissions: ['submissions.read', 'margin.read'], role: { permissions: ['submissions.read'] } }
    expect(seatPermissions(active, { contextId: 'ctx-1', permissions: ['payroll.read'] })).toEqual(['submissions.read', 'margin.read'])
  })

  it('where /api/me gives no list, the role\'s permissions and the layout\'s grants for that same seat are read, and a grant for another seat never is', () => {
    const active = { id: 'ctx-1', role: { permissions: ['submissions.read'] } }
    expect(seatPermissions(active, { contextId: 'ctx-1', permissions: ['margin.read'] })).toEqual(['submissions.read', 'margin.read'])
    expect(seatPermissions(active, { contextId: 'ctx-2', permissions: ['margin.read'] })).toEqual(['submissions.read'])
    expect(seatPermissions(null, null)).toEqual([])
  })
})
