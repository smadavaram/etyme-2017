import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  mayAskAboutOwner, mayAskToPass, mayDecide, decidersFor, passCardSays, liveOwners, LADDER, type Seat,
} from '@/lib/owner-rules'
import { canSuspend, canRevoke, type AccessRow } from '@/lib/account-lifecycle'
import { rolesFor, ADMIN_PERMISSIONS, ADMIN_LOSES, isNarrowedAdmin } from '@/lib/company-defaults'
import { ACTIONS } from '@/lib/autonomy'

/**
 * Owners, Admin, and passing ownership (founder, 2026-11-11). The rules
 * are pure (lib/owner-rules); the routes under /api/settings/owners read
 * them, and the access route reads the same rule through
 * lib/account-lifecycle once it says which seats are Owners.
 */

const seat = (id: string, role: string | null, live = true): Seat => ({ contextId: `c-${id}`, personId: `p-${id}`, name: id, roleName: role, live })
const sharath = seat('Sharath', 'Owner')
const madhavi = seat('Madhavi', 'Owner')
const vikash = seat('Vikash', 'Admin')
const oliver = seat('Oliver', 'Account Manager')

const row = (id: string, isOwner: boolean | undefined, perms: string[] = ['team.manage']): AccessRow => ({
  contextId: `c-${id}`, personId: `p-${id}`, hasSignedIn: true, roleId: 'r', rolePermissions: perms,
  suspendedAt: null, revokedAt: null, isOwner,
})

describe('who may act on an Owner', () => {
  it('an Admin cannot remove an Owner', () => {
    const v = mayAskAboutOwner({ kind: 'REMOVE', actor: vikash, subject: madhavi, seats: [sharath, madhavi, vikash] })
    expect(v).toEqual({ ok: false, says: 'Only an Owner removes an Owner. An Admin never can.' })
  })

  it('an Admin cannot move an Owner to another role', () => {
    const v = mayAskAboutOwner({ kind: 'DEMOTE', actor: vikash, subject: madhavi, seats: [sharath, madhavi, vikash], toRoleName: 'Admin' })
    expect(v.ok).toBe(false)
  })

  it('an Admin cannot pause or end an Owner’s seat through Users & permissions', () => {
    const all = [row('Sharath', true), row('Madhavi', true), row('Vikash', false)]
    expect(canSuspend(all[0], all, { isOwner: false }).allowed).toBe(false)
    expect(canSuspend(all[0], all, { isOwner: false }).reason).toMatch(/Only an Owner pauses an Owner/)
    expect(canRevoke(all[0], all, { isOwner: false }).reason).toMatch(/An Admin never can/)
  })

  it('an Owner’s seat is never ended on Users & permissions, even by an Owner: it needs another Owner’s yes', () => {
    const all = [row('Sharath', true), row('Madhavi', true)]
    const v = canRevoke(all[1], all, { isOwner: true })
    expect(v.allowed).toBe(false)
    expect(v.reason).toMatch(/needs another Owner’s yes/)
  })

  it('a seat whose caller has not said who the Owners are is judged as before', () => {
    const all = [row('A', undefined), row('B', undefined)]
    expect(canRevoke(all[0], all).allowed).toBe(true)
  })

  it('the last Owner is never removed or moved', () => {
    const v = mayAskAboutOwner({ kind: 'REMOVE', actor: sharath, subject: sharath, seats: [sharath, vikash] })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.says).toMatch(/only Owner. There is never no Owner/)
    const m = mayAskAboutOwner({ kind: 'DEMOTE', actor: sharath, subject: sharath, seats: [sharath, vikash], toRoleName: 'Admin' })
    expect(m.ok).toBe(false)
  })

  it('the last live Owner is never paused, and a paused Owner does not count as the second', () => {
    const paused = { ...row('Madhavi', true), suspendedAt: new Date() }
    const all = [row('Sharath', true), paused]
    expect(canSuspend(all[0], all, { isOwner: true }).allowed).toBe(false)
  })

  it('removing one of two Owners needs the other’s yes, and the asker cannot give it', () => {
    const seats = [sharath, madhavi, vikash]
    expect(mayAskAboutOwner({ kind: 'REMOVE', actor: sharath, subject: madhavi, seats }).ok).toBe(true)
    const deciders = decidersFor({ kind: 'REMOVE', askedByPersonId: sharath.personId, subject: madhavi, seats })
    expect(deciders.map((d) => d.name)).toEqual(['Madhavi'])
    const self = mayDecide({ kind: 'REMOVE', askedByPersonId: sharath.personId, deciderPersonId: sharath.personId, subject: madhavi, seats, expired: false, pending: true })
    expect(self).toEqual({ ok: false, says: 'Nobody decides their own ask. Another Owner says yes to this.' })
    const admin = mayDecide({ kind: 'REMOVE', askedByPersonId: sharath.personId, deciderPersonId: vikash.personId, subject: madhavi, seats, expired: false, pending: true })
    expect(admin.ok).toBe(false)
    const other = mayDecide({ kind: 'REMOVE', askedByPersonId: sharath.personId, deciderPersonId: madhavi.personId, subject: madhavi, seats, expired: false, pending: true })
    expect(other.ok).toBe(true)
  })

  it('a yes is refused when the Owner being removed has meanwhile become the last one', () => {
    const seats = [{ ...sharath, live: false }, madhavi]
    const v = mayDecide({ kind: 'REMOVE', askedByPersonId: sharath.personId, deciderPersonId: madhavi.personId, subject: madhavi, seats, expired: false, pending: true })
    expect(v.ok).toBe(false)
  })

  it('an ask unanswered for seven days lapses, and nothing changes', () => {
    const v = mayDecide({ kind: 'REMOVE', askedByPersonId: sharath.personId, deciderPersonId: madhavi.personId, subject: madhavi, seats: [sharath, madhavi], expired: true, pending: true })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.says).toMatch(/lapsed after seven days/)
  })
})

describe('passing ownership', () => {
  it('only an Owner passes ownership', () => {
    expect(mayAskToPass({ actor: vikash, subject: oliver, after: 'ADMIN' })).toEqual({ ok: false, says: 'Only an Owner passes ownership. An Admin never can.' })
  })

  it('pass ownership needs the new Owner’s yes, and nobody else’s', () => {
    const seats = [sharath, madhavi, oliver]
    expect(mayAskToPass({ actor: sharath, subject: oliver, after: 'ADMIN' }).ok).toBe(true)
    expect(decidersFor({ kind: 'PASS', askedByPersonId: sharath.personId, subject: oliver, seats }).map((d) => d.name)).toEqual(['Oliver'])
    const byOtherOwner = mayDecide({ kind: 'PASS', askedByPersonId: sharath.personId, deciderPersonId: madhavi.personId, subject: oliver, seats, expired: false, pending: true })
    expect(byOtherOwner).toEqual({ ok: false, says: 'Only Oliver says yes to becoming an Owner.' })
    expect(mayDecide({ kind: 'PASS', askedByPersonId: sharath.personId, deciderPersonId: oliver.personId, subject: oliver, seats, expired: false, pending: true }).ok).toBe(true)
  })

  it('the person taking over reads who asked and what the asker becomes', () => {
    expect(passCardSays({ askerName: 'sharath@etyme.com', companyName: 'Tapin', after: 'ADMIN' }))
      .toBe('sharath@etyme.com wants to pass Tapin’s ownership to you. After this you are an Owner of Tapin. They will be an Admin.')
  })

  it('both changes of a pass land together in one transaction, with the ask marked accepted and the row logged', () => {
    const src = readFileSync('src/app/api/settings/owners/act.ts', 'utf8')
    const pass = src.slice(src.indexOf('export async function landPass'), src.indexOf('export async function landOwnerChange'))
    expect(pass).toContain('prisma.$transaction(async (tx)')
    for (const write of ['roleId: owner', "l.after === 'ADMIN'", "l.after === 'LEAVE'", "state: 'ACCEPTED'", "action: 'OWNERSHIP_PASSED'"]) {
      expect(pass.lastIndexOf(write), write).toBeGreaterThan(pass.indexOf('prisma.$transaction'))
    }
  })

  it('a pass is never to oneself or to somebody already an Owner', () => {
    expect(mayAskToPass({ actor: sharath, subject: sharath, after: 'ADMIN' }).ok).toBe(false)
    expect(mayAskToPass({ actor: sharath, subject: madhavi, after: 'ADMIN' }).ok).toBe(false)
  })

  it('every ownership act has a place in the autonomy ladder, as a person’s own act', () => {
    for (const a of ['OWNERSHIP_ASKED', 'OWNERSHIP_DECLINED', 'OWNERSHIP_WITHDRAWN', 'OWNERSHIP_PASSED', 'OWNER_REMOVED', 'OWNER_MOVED', 'ADMIN_NARROWED']) {
      expect(ACTIONS[a]?.kind, a).toBe('ATTRIBUTED')
    }
  })
})

describe('Admin runs the system; the Owner runs the business', () => {
  it('the ladder reads Superadmin, then Owner, then Admin', () => {
    expect([...LADDER]).toEqual(['Superadmin', 'Owner', 'Admin'])
  })

  it('a company formed under the proof rule gets an Admin who holds people and settings and no money or contract act', () => {
    for (const kind of ['VENDOR', 'CLIENT', 'MSP', 'GSI', 'CONSULTANT_CORP'] as const) {
      const admin = rolesFor(kind, { narrowAdmin: true }).find((r) => r.name === 'Admin')
      expect(admin, kind).toBeDefined()
      expect([...admin!.permissions].sort()).toEqual([...ADMIN_PERMISSIONS].sort())
      expect(isNarrowedAdmin(admin!.permissions)).toBe(true)
      for (const p of ADMIN_LOSES) expect(admin!.permissions).not.toContain(p)
    }
  })

  it('every company formed before keeps the roles it shipped with, the broad Admin included', () => {
    const admin = rolesFor('VENDOR').find((r) => r.name === 'Admin')!
    expect(isNarrowedAdmin(admin.permissions)).toBe(false)
    expect(rolesFor('CLIENT').some((r) => r.name === 'Admin')).toBe(false)
  })

  it('no default grant widens a narrowed Admin again', () => {
    const src = readFileSync('src/lib/company-roles.ts', 'utf8')
    expect(src).toContain('isNarrowedAdmin(role.permissions)) continue')
  })

  it('the role named Admin is never called a manager or an IT owner on the Owners screen', () => {
    const page = readFileSync('src/app/dashboard/settings/owners/page.tsx', 'utf8')
    expect(page).not.toMatch(/IT owner|Admin \(manager\)|super-owner|Tenant Admin/i)
  })

  it('liveOwners skips a paused Owner', () => {
    expect(liveOwners([sharath, { ...madhavi, live: false }]).map((s) => s.name)).toEqual(['Sharath'])
  })
})

describe('Users & permissions holds the same Owner rules', () => {
  it('an Admin can never pause or end an Owner from Users & permissions, and an Owner can pause or end an Admin', async () => {
    const { canSuspend, canRevoke } = await import('@/lib/account-lifecycle')
    const seat = (id: string, isOwner: boolean, perms: string[]) => ({
      contextId: id, personId: id, hasSignedIn: true, roleId: id, rolePermissions: perms,
      suspendedAt: null, revokedAt: null, isOwner,
    })
    const owner = seat('o', true, ['team.manage', 'settings.manage'])
    const admin = seat('a', false, ['team.manage', 'settings.manage'])
    const all = [owner, admin] as never[]
    expect(canSuspend(owner as never, all, { isOwner: false }).allowed).toBe(false)
    expect(canRevoke(owner as never, all, { isOwner: false }).allowed).toBe(false)
    expect(canRevoke(owner as never, all, { isOwner: false }).reason).toMatch(/An Admin never can/)
    expect(canSuspend(admin as never, all, { isOwner: true }).allowed).toBe(true)
    expect(canRevoke(admin as never, all, { isOwner: true }).allowed).toBe(true)
  })

  it('the route that pauses and ends a seat says who is acting and whether the seat is an Owner’s', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/app/api/access/[contextId]/route.ts', 'utf8')
    expect(src).toMatch(/isOwner: r\.role\?\.name === OWNER_ROLE/)
    expect(src).toMatch(/canSuspend\(target, all, actor\)/)
    expect(src).toMatch(/canRevoke\(target, all, actor\)/)
  })
})
