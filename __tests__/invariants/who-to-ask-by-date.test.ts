import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { seatsFrom } from '@/lib/company-seats'

/**
 * Who to ask is read from seats that still work (fix list layer 4,
 * 2026-11-15). A seat past its end date no longer signs in, and the
 * sentence "Raising a bill is for the Accounts Receivable here. Ask them."
 * still named its role, so a person was told to ask somebody who could not
 * act. The roles now come from the one seat reader (`readCompanySeats`),
 * which ends such a seat and keeps an Owner, or the last seat that may
 * manage access, open past its date. Made-up firm, made-up people; every
 * date is relative to the clock or to a `now` passed in.
 */

const DAY = 86_400_000
const h = vi.hoisted(() => ({ rows: [] as any[], roles: [] as { id: string; name: string; permissions: string[] }[] }))

vi.mock('@/lib/db', () => ({
  prisma: {
    company: { findUnique: async () => ({ name: 'Northwind Staffing' }) },
    context: { findMany: async () => h.rows },
    role: {
      findMany: async ({ where }: any) =>
        h.roles.filter((r) => (where.id.in as string[]).includes(r.id)).map((r) => ({ id: r.id, permissions: r.permissions })),
    },
  },
}))

const OWNER = { id: 'role-owner', name: 'Owner', permissions: ['*'] }
const AR = { id: 'role-ar', name: 'Accounts Receivable', permissions: ['invoices.issue', 'invoices.read'] }
const HR = { id: 'role-hr', name: 'HR', permissions: ['people.read'] }

function row(id: string, role: typeof OWNER, expiresAt: Date | null, email: string) {
  return {
    id, personId: `p-${id}`, type: 'EMPLOYEE', roleId: role.id, orgUnitId: null, grantedAt: new Date(0),
    invitedAt: null, lastUsedAt: new Date(0), suspendedAt: null, revokedAt: null, expiresAt,
    role: { name: role.name, permissions: role.permissions },
    person: { name: email.split('@')[0], primaryEmail: email, credentials: [{ id: `cred-${id}` }] },
  }
}

const caller = { publicSeat: false, company: { id: 'northwind', name: 'Northwind Staffing', kind: 'VENDOR' } } as any

beforeEach(() => {
  h.roles = [OWNER, AR, HR]
  h.rows = []
})

describe('the sentence naming who to ask reads only seats that still work', () => {
  it('a role whose only seat has passed its end date is never named as the one to ask', async () => {
    const { whoRaisesBillsSays } = await import('@/lib/money/who-raises-bills')
    const ago = new Date(Date.now() - 3 * DAY)
    h.rows = [
      row('owner', OWNER, null, 'dana.reyes@northwind-staffing.example'),
      row('ar', AR, ago, 'milo.ferris@northwind-staffing.example'),
    ]
    const says = await whoRaisesBillsSays(caller)
    expect(says).toBe('Raising a bill is for the Owner here. Ask them.')
    expect(says).not.toMatch(/Accounts Receivable/)
  })

  it('a role whose seat ends later is still named as one to ask', async () => {
    const { whoRaisesBillsSays } = await import('@/lib/money/who-raises-bills')
    const ahead = new Date(Date.now() + 30 * DAY)
    h.rows = [
      row('owner', OWNER, null, 'dana.reyes@northwind-staffing.example'),
      row('ar', AR, ahead, 'milo.ferris@northwind-staffing.example'),
    ]
    expect(await whoRaisesBillsSays(caller)).toMatch(/Owner/)
    expect(await whoRaisesBillsSays(caller)).toMatch(/Accounts Receivable/)
  })

  it('an Owner kept open past the end date is still named as the one to ask', async () => {
    const { whoHereMaySays } = await import('@/lib/money/who-raises-bills')
    const ago = new Date(Date.now() - 10 * DAY)
    h.rows = [
      row('owner', OWNER, ago, 'dana.reyes@northwind-staffing.example'),
      row('hr', HR, null, 'ines.okafor@northwind-staffing.example'),
    ]
    expect(await whoHereMaySays(caller, { doing: 'Starting a placement', needs: 'assignments.write' }))
      .toBe('Starting a placement is for the Owner here. Ask them.')
  })

  it('where every seat that may do it has ended, the sentence falls back to the role set’s names', async () => {
    const { whoRaisesBillsSays } = await import('@/lib/money/who-raises-bills')
    const { refusalFor } = await import('@/lib/api-context')
    h.rows = [
      row('hr', HR, null, 'ines.okafor@northwind-staffing.example'),
      row('ar', AR, new Date(Date.now() - DAY), 'milo.ferris@northwind-staffing.example'),
    ]
    expect(await whoRaisesBillsSays(caller)).toBe(refusalFor(caller, { doing: 'Raising a bill', needs: 'invoices.issue' }))
  })
})

describe('the roles to name are counted the way the one seat reader counts them', () => {
  it('a seat past its end date leaves no role to name, and a kept Owner stays, on a fixed day', async () => {
    const { rolesThatMay } = await import('@/lib/money/who-raises-bills')
    const now = new Date('2030-03-10T12:00:00Z')
    const seats = seatsFrom([
      row('owner', OWNER, new Date(now.getTime() - 5 * DAY), 'dana.reyes@northwind-staffing.example'),
      row('ar', AR, new Date(now.getTime() - DAY), 'milo.ferris@northwind-staffing.example'),
    ], 'Northwind Staffing', now)
    const perms = new Map([OWNER, AR].map((r) => [r.id, r.permissions]))
    expect(rolesThatMay(seats, perms, 'invoices.issue')).toEqual(['Owner'])
  })

  it('a paused seat, a consultant on the books and the sample seat are never named', async () => {
    const { rolesThatMay } = await import('@/lib/money/who-raises-bills')
    const perms = new Map([[AR.id, AR.permissions]])
    const base = { roleId: AR.id, roleName: AR.name, state: 'WITH_ACCESS' as const, isPerson: true, isSample: false }
    expect(rolesThatMay([{ ...base, state: 'PAUSED' }, { ...base, isPerson: false }, { ...base, isSample: true }], perms, 'invoices.issue')).toEqual([])
    expect(rolesThatMay([base], perms, 'invoices.issue')).toEqual(['Accounts Receivable'])
  })

  it('who here may is read through the one seat reader, never its own query of seats', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/money/who-raises-bills.ts'), 'utf8')
    expect(src).toContain('await readCompanySeats(caller.company.id)')
    expect(src).not.toMatch(/prisma\.context\.findMany/)
  })
})

describe('the start, the week page and Contacts name roles from seats that still work', () => {
  it('a role whose only seat has passed its end date is not among the firm’s seated roles', async () => {
    const { seatedRoles } = await import('@/app/api/contracts/[id]/activate/gate')
    h.rows = [
      row('owner', OWNER, null, 'dana.reyes@northwind-staffing.example'),
      row('ar', AR, new Date(Date.now() - 2 * DAY), 'milo.ferris@northwind-staffing.example'),
      row('hr', HR, new Date(Date.now() + 60 * DAY), 'ines.okafor@northwind-staffing.example'),
    ]
    expect(await seatedRoles('northwind')).toEqual(['Owner', 'HR'])
  })

  it('an Owner kept open past the end date is still among the firm’s seated roles', async () => {
    const { seatedRoles } = await import('@/app/api/contracts/[id]/activate/gate')
    h.rows = [row('owner', OWNER, new Date(Date.now() - 2 * DAY), 'dana.reyes@northwind-staffing.example')]
    expect(await seatedRoles('northwind')).toEqual(['Owner'])
  })

  it('a paused seat’s role is not among the firm’s seated roles, as before', async () => {
    const { liveRoleNames } = await import('@/app/api/contracts/[id]/activate/gate')
    expect(liveRoleNames([{ roleName: 'HR', state: 'PAUSED' }, { roleName: 'Owner', state: 'WITH_ACCESS' }, { roleName: null, state: 'WAITING_FOR_ROLE' }])).toEqual(['Owner'])
  })
})
