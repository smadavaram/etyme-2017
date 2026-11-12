import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  mayAskAboutOwner, mayAskToPass, mayDecide, decidersFor, passCardSays, liveOwners, LADDER, type Seat,
  movesAloneAfterPass, movedAfterPassSays, ownerMovesOnOwnersPage, askSaysTo, addresseeBecomes,
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
    for (const a of ['OWNERSHIP_ASKED', 'OWNERSHIP_DECLINED', 'OWNERSHIP_WITHDRAWN', 'OWNERSHIP_PASSED', 'OWNER_REMOVED', 'OWNER_MOVED', 'ADMIN_NARROWED', 'OWNER_VERIFIED', 'OWNER_PROOF_RECORDED']) {
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
  })

  it('every kind of company has an Admin, so a previous Owner can always become one', () => {
    for (const kind of ['VENDOR', 'CLIENT', 'MSP', 'GSI'] as const) {
      expect(rolesFor(kind).some((r) => r.name === 'Admin'), kind).toBe(true)
    }
  })

  it('a client and an MSP, which had no Admin, get the narrowed one: people and settings, no money and no contracts', () => {
    for (const kind of ['CLIENT', 'MSP'] as const) {
      const admin = rolesFor(kind).find((r) => r.name === 'Admin')!
      expect([...admin.permissions].sort()).toEqual([...ADMIN_PERMISSIONS].sort())
      expect(isNarrowedAdmin(admin.permissions)).toBe(true)
    }
  })

  it('a one-person firm outside the proof rule stays as it is, with no Admin', () => {
    expect(rolesFor('CONSULTANT_CORP').map((r) => r.name)).toEqual(['Owner', 'Member'])
  })

  it('a company formed before the Admin existed gets it the next time Users & permissions or Settings → Owners is opened', () => {
    const roles = readFileSync('src/lib/company-roles.ts', 'utf8')
    expect(roles).toContain('for (const seed of rolesFor(kind as CompanyKind))')
    const owners = readFileSync('src/app/api/settings/owners/route.ts', 'utf8')
    expect(owners).toContain('await ensureDefaultRoles(company.id, company.kind)')
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

describe('after a pass, the new Owner may move the previous one to Admin alone', () => {
  // Madhavi passed Tapin's ownership to Sharath and stayed an Owner.
  const after = { actor: sharath, subject: madhavi, passedToActorBy: [madhavi.personId], seats: [sharath, madhavi, vikash] }

  it('the Owner who took over by a pass moves the Owner who passed it to Admin with no second yes', () => {
    expect(movesAloneAfterPass({ ...after, toRoleName: 'Admin' })).toBe(true)
  })

  it('the exception reaches only the person they took over from', () => {
    const third = seat('Priya', 'Owner')
    expect(movesAloneAfterPass({ ...after, subject: third, seats: [sharath, madhavi, third], toRoleName: 'Admin' })).toBe(false)
    expect(movesAloneAfterPass({ ...after, passedToActorBy: [], toRoleName: 'Admin' })).toBe(false)
  })

  it('the exception moves the previous Owner to Admin and to no other role, and never ends their seat', () => {
    expect(movesAloneAfterPass({ ...after, toRoleName: 'Account Manager' })).toBe(false)
    expect(movesAloneAfterPass({ ...after, toRoleName: null })).toBe(false)
  })

  it('an Admin, a paused Owner, or the previous Owner acting on the new one gets no exception', () => {
    expect(movesAloneAfterPass({ ...after, actor: vikash, toRoleName: 'Admin' })).toBe(false)
    expect(movesAloneAfterPass({ ...after, actor: { ...sharath, live: false }, toRoleName: 'Admin' })).toBe(false)
    expect(movesAloneAfterPass({ actor: madhavi, subject: sharath, passedToActorBy: [], seats: [sharath, madhavi], toRoleName: 'Admin' })).toBe(false)
  })

  it('the move is recorded in a sentence that says who took over from whom, and the previous Owner is told', () => {
    expect(movedAfterPassSays({ actorName: 'Sharath', subjectName: 'Madhavi', companyName: 'Tapin' }))
      .toBe('Sharath, who took over Tapin’s ownership from Madhavi, moved Madhavi from Owner to Admin. Madhavi agreed to the pass, so no second yes was asked.')
    const act = readFileSync('src/app/api/settings/owners/act.ts', 'utf8')
    expect(act).toContain("action: 'OWNER_MOVED'")
    expect(act).toContain('afterPass: true')
    expect(act).toMatch(/void notify\(\{\s*personId: l\.subject\.personId/)
    const owners = readFileSync('src/app/api/settings/owners/route.ts', 'utf8')
    expect(owners.indexOf('movesAloneAfterPass(')).toBeLessThan(owners.indexOf('mayAskAboutOwner({ kind, actor: me'))
  })
})

describe('Users & permissions never moves an Owner off Owner', () => {
  it('moving an Owner to another role from Users & permissions is refused and sends the person to Settings → Owners', () => {
    expect(ownerMovesOnOwnersPage('Madhavi'))
      .toBe('Madhavi is an Owner. Moving an Owner to another role needs another Owner’s yes, so it is done under Settings → Owners.')
    const src = readFileSync('src/app/api/access/route.ts', 'utf8')
    expect(src).toContain('if (target.role?.name === OWNER_DESK && role.name !== OWNER_DESK) {')
    expect(src).toContain('ownerMovesOnOwnersPage(target.person.name)')
    expect(src).toContain("href: '/dashboard/settings/owners'")
  })

  it('except the Owner who took over by a pass moving the previous Owner to Admin, written by the same function Settings → Owners uses', () => {
    const src = readFileSync('src/app/api/access/route.ts', 'utf8')
    expect(src).toContain('movesAloneAfterPass({')
    expect(src).toContain('await landMoveAfterPass({')
    // The refusal comes before any grant is assessed or written.
    expect(src.indexOf('ownerMovesOnOwnersPage(target.person.name)')).toBeLessThan(src.indexOf('const decision = assessGrant({'))
  })
})

describe('one ask, said to each reader', () => {
  const pass = { kind: 'PASS' as const, askerName: 'Camille Roux', subjectName: 'Lorena Kellerman', companyName: 'Tapin', after: 'ADMIN' as const, reason: 'Lorena runs it now', deciderNames: ['Lorena Kellerman'], youAreSubject: false }
  const remove = { kind: 'REMOVE' as const, askerName: 'Camille Roux', subjectName: 'Madhavi Rao', companyName: 'Tapin', reason: 'Left the firm', deciderNames: ['Madhavi Rao', 'Priya Nair'], youAreSubject: false }

  it('the Owner who asked reads her own pass as hers, waiting, never as one addressed to her', () => {
    const says = askSaysTo('ASKER', pass)
    expect(says).toBe('You asked Lorena Kellerman to take over Tapin’s ownership. Waiting for Lorena Kellerman’s yes. After it you will be an Admin.')
    expect(says).not.toMatch(/to you/)
  })

  it('the person taking over reads the card addressed to them', () => {
    expect(askSaysTo('ADDRESSEE', { ...pass, youAreSubject: true })).toBe(passCardSays({ askerName: 'Camille Roux', companyName: 'Tapin', after: 'ADMIN' }))
  })

  it('another Owner or an Admin reads who asked and whose yes it waits for', () => {
    expect(askSaysTo('OTHER', pass)).toBe('Camille Roux asked Lorena Kellerman to take over Tapin’s ownership. Waiting for Lorena Kellerman’s yes; Camille Roux will then be an Admin.')
  })

  it('the Owner who asked to remove an Owner reads whose yes it waits for, by name', () => {
    expect(askSaysTo('ASKER', remove)).toBe('You asked to remove Madhavi Rao as an Owner of Tapin: Left the firm. Waiting for the yes of Madhavi Rao or Priya Nair.')
  })

  it('the Owner being removed, asked for the yes, reads it about themselves', () => {
    expect(askSaysTo('ADDRESSEE', { ...remove, youAreSubject: true })).toMatch(/^Camille Roux asks to remove you as an Owner of Tapin/)
  })

  it('what the person saying yes becomes is said in a word', () => {
    expect(addresseeBecomes({ kind: 'PASS', youAreSubject: true, companyName: 'Tapin' })).toBe('Owner')
    expect(addresseeBecomes({ kind: 'REMOVE', youAreSubject: true, companyName: 'Tapin' })).toBe('No longer at Tapin')
    expect(addresseeBecomes({ kind: 'DEMOTE', toRoleName: 'Admin', youAreSubject: true, companyName: 'Tapin' })).toBe('Admin')
    expect(addresseeBecomes({ kind: 'REMOVE', youAreSubject: false, companyName: 'Tapin' })).toBeNull()
  })

  it('Settings → Owners says each ask to the reader reading it', () => {
    const src = readFileSync('src/app/api/settings/owners/route.ts', 'utf8')
    expect(src).toContain("const reader = a.askedById === personId ? 'ASKER' : mayDecide ? 'ADDRESSEE' : 'OTHER'")
    expect(src).toContain('says: askSaysTo(reader, {')
  })
})

describe('what a row on Users & permissions offers each reader', () => {
  it('an Admin is offered no Pause, Reinstate or End on an Owner’s row', async () => {
    const { rowActs } = await import('@/lib/account-lifecycle')
    const owner = row('Sharath', true)
    const other = row('Madhavi', true)
    const admin = row('Vikash', false)
    const acts = rowActs(owner, [owner, other, admin], { isOwner: false })
    expect([acts.pause.allowed, acts.end.allowed]).toEqual([false, false])
    const paused = { ...owner, suspendedAt: new Date('2026-11-10') }
    expect(rowActs(paused, [paused, other, admin], { isOwner: false }).reinstate.allowed).toBe(false)
    expect(rowActs(paused, [paused, other, admin], { isOwner: false }).reinstate.reason).toBe('Only an Owner lifts an Owner’s pause. An Admin never can.')
  })

  it('an Owner is offered Pause and End on an Admin’s row, and Reinstate once paused', async () => {
    const { rowActs } = await import('@/lib/account-lifecycle')
    const owner = row('Sharath', true)
    const admin = row('Vikash', false)
    const acts = rowActs(admin, [owner, admin], { isOwner: true })
    expect([acts.pause.allowed, acts.end.allowed, acts.reinstate.allowed]).toEqual([true, true, false])
    const paused = { ...admin, suspendedAt: new Date('2026-11-10') }
    expect(rowActs(paused, [owner, paused], { isOwner: true }).reinstate.allowed).toBe(true)
  })
})
