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

  it('the person taking over reads who asked and what the asker becomes, the asker named again and never "They"', () => {
    expect(passCardSays({ askerName: 'sharath@etyme.com', companyName: 'Tapin', after: 'ADMIN' }))
      .toBe('sharath@etyme.com wants to pass Tapin’s ownership to you. After this you are an Owner of Tapin. sharath@etyme.com will be an Admin.')
  })

  it('a landed pass is said to the new Owner, to the Owner who passed it and in the log each in its own words, from the owner-words sentences and nothing typed beside them', async () => {
    const words = await import('@/lib/notify/owner-words')
    const { passLandedWords, saidNoNotice } = await import('@/app/api/settings/owners/act')
    const f = { askerName: 'Camille Ostrander', subjectName: 'Lorena Kellerman', companyName: 'Tapin', after: 'ADMIN' as const }
    const landed = passLandedWords(f)
    expect(landed.forNewOwner).toBe('You are now an Owner of Tapin. Camille Ostrander is now an Admin.')
    expect(landed.forNewOwner).toBe(words.passDoneForNewOwner(f))
    expect(landed.forAsker).toEqual({ title: words.passDoneTitleForAsker(f), body: words.passDoneForAsker(f) })
    expect(landed.forRecord).toBe(words.passDoneForOthers(f))
    expect(landed.forRecord).not.toContain('now: Admin')
    const no = { deciderName: 'Ines Okafor', kind: 'REMOVE' as const, subjectName: 'Ines Okafor', companyName: 'Tapin' }
    expect(saidNoNotice(no)).toEqual({ title: words.saidNoTitle(no), body: words.saidNoBody(no) })
    expect(saidNoNotice(no).body).toBe('Ines Okafor said no to being removed as an Owner of Tapin. Nothing changed.')

    // The landing route sends exactly those: the pass's words to the asker and the screen, the no's notice.
    const route = readFileSync('src/app/api/settings/owners/[id]/route.ts', 'utf8')
    expect(route).toContain('title: words.forAsker.title, body: words.forAsker.body')
    expect(route).toContain('message: words.forNewOwner')
    expect(route).toContain('title: no.title, body: no.body')
    expect(route).not.toContain('said no to your ask about')
    const act = readFileSync('src/app/api/settings/owners/act.ts', 'utf8')
    expect(act).toContain('summary: words.forRecord')
    expect(act).not.toContain('passedLine(')
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

describe('what Users & permissions draws on each row, from the register', () => {
  it('the register offers an Admin no Pause or End on an Owner’s row', async () => {
    const { offersFor } = await import('@/app/api/access/row-acts')
    const owner = row('Sharath', true)
    const other = row('Madhavi', true)
    const admin = row('Vikash', false)
    const offer = offersFor([owner, other, admin], { isOwner: false }, true).get(owner.contextId)!
    expect([offer.pause, offer.end, offer.reinstate]).toEqual([false, false, false])
  })

  it('the register offers an Owner Pause and End on an Admin’s row, each with what it does', async () => {
    const { offersFor } = await import('@/app/api/access/row-acts')
    const owner = row('Sharath', true)
    const admin = row('Vikash', false)
    const offer = offersFor([owner, admin], { isOwner: true }, true).get(admin.contextId)!
    expect([offer.pause, offer.end, offer.reinstate]).toEqual([true, true, false])
    expect(offer.pauseSays.length).toBeGreaterThan(0)
  })

  it('the last Owner is never offered Pause or End, not even by another reader who is an Owner', async () => {
    const { offersFor } = await import('@/app/api/access/row-acts')
    const owner = row('Sharath', true)
    const admin = row('Vikash', false)
    const offer = offersFor([owner, admin], { isOwner: true }, true).get(owner.contextId)!
    expect([offer.pause, offer.end]).toEqual([false, false])
  })

  it('a reader who cannot change access is offered nothing on any row', async () => {
    const { offersFor } = await import('@/app/api/access/row-acts')
    const owner = row('Sharath', true)
    const admin = row('Vikash', false)
    for (const o of offersFor([owner, admin], { isOwner: true }, false).values()) {
      expect([o.pause, o.reinstate, o.end]).toEqual([false, false, false])
    }
  })

  it('the access route reads the same verdict for Reinstate as the register, with the reader as actor', () => {
    const src = readFileSync('src/app/api/access/[contextId]/route.ts', 'utf8')
    expect(src).toContain("canReinstate(target, actor)")
  })

  it('a paused person is told the reason with one stop, however the reason was typed', async () => {
    const { clause } = await import('@/lib/owner-rules')
    expect(`paused it: ${clause('On leave until March.')}. Nothing`).toBe('paused it: On leave until March. Nothing')
    const src = readFileSync('src/app/api/access/[contextId]/route.ts', 'utf8')
    expect(src).toContain('paused it: ${clause(reason)}.')
  })
})

describe('withdrawing an invitation on Users & permissions (founder, 2026-11-12)', () => {
  const waiting = (id: string, isOwner = false): AccessRow => ({ ...row(id, isOwner, []), hasSignedIn: false })

  it('somebody invited who never signed in is offered Withdraw invitation, not Pause or End access', async () => {
    const { offersFor } = await import('@/app/api/access/row-acts')
    const owner = row('Sharath', true)
    const sidhu = waiting('Sidhu')
    const offer = offersFor([owner, sidhu], { isOwner: true, personId: owner.personId }, true).get(sidhu.contextId)!
    expect([offer.withdraw, offer.pause, offer.end]).toEqual([true, false, false])
    expect(offer.withdrawSays).toContain('The invitation is cancelled, and the link in it stops working.')
  })

  it('a waiting row keeps End access behind Withdraw, drawn only if the person turns out to have history', async () => {
    const { offersFor } = await import('@/app/api/access/row-acts')
    const owner = row('Sharath', true)
    const sidhu = waiting('Sidhu')
    const offer = offersFor([owner, sidhu], { isOwner: true, personId: owner.personId }, true).get(sidhu.contextId)!
    expect(offer.endInstead).toBe(true)
    expect(offer.endSays.length).toBeGreaterThan(0)
  })

  it('a person who has signed in is offered End access and not Withdraw invitation', async () => {
    const { offersFor } = await import('@/app/api/access/row-acts')
    const owner = row('Sharath', true)
    const admin = row('Vikash', false)
    const offer = offersFor([owner, admin], { isOwner: true, personId: owner.personId }, true).get(admin.contextId)!
    expect([offer.withdraw, offer.end]).toEqual([false, true])
  })

  it('an Admin is never offered an act on an Owner’s waiting seat', async () => {
    const { offersFor, withdrawVerdict } = await import('@/app/api/access/row-acts')
    const owner = row('Sharath', true)
    const admin = row('Vikash', false)
    const invitedOwner = waiting('Madhavi', true)
    const all = [owner, admin, invitedOwner]
    const offer = offersFor(all, { isOwner: false, personId: admin.personId }, true).get(invitedOwner.contextId)!
    expect([offer.withdraw, offer.pause, offer.end, offer.endInstead]).toEqual([false, false, false, false])
    expect(withdrawVerdict(invitedOwner, all, { isOwner: false }).reason).toBe('They are invited as an Owner. Only an Owner withdraws an Owner’s invitation. An Admin never can.')
  })

  it('an Owner withdraws another Owner’s invitation while a signed-in Owner stays, and never so that no Owner is left', async () => {
    const { withdrawVerdict } = await import('@/app/api/access/row-acts')
    const owner = row('Sharath', true)
    const invitedOwner = waiting('Madhavi', true)
    expect(withdrawVerdict(invitedOwner, [owner, invitedOwner], { isOwner: true, personId: owner.personId }).allowed).toBe(true)
    const pausedOwner = { ...owner, suspendedAt: new Date('2026-11-10') }
    expect(withdrawVerdict(invitedOwner, [pausedOwner, invitedOwner], { isOwner: true }).reason).toBe('There would be no Owner left. Pass ownership first.')
  })

  it('nobody withdraws their own seat', async () => {
    const { withdrawVerdict } = await import('@/app/api/access/row-acts')
    const owner = row('Sharath', true)
    const me = waiting('Vikash')
    expect(withdrawVerdict(me, [owner, me], { isOwner: false, personId: me.personId }).reason).toBe('This is your own seat. Somebody else here withdraws it.')
  })

  it('a person who signed in has no invitation left to withdraw, and is told to end their access instead', async () => {
    const { withdrawVerdict } = await import('@/app/api/access/row-acts')
    const owner = row('Sharath', true)
    const admin = row('Vikash', false)
    expect(withdrawVerdict(admin, [owner, admin], { isOwner: true }).reason).toBe('They have signed in, so there is no invitation left to withdraw. End their access instead.')
  })

  it('an Admin who tries to withdraw a signed-in Owner is told only an Owner removes an Owner, never to end their access', async () => {
    const { withdrawVerdict } = await import('@/app/api/access/row-acts')
    const owner = row('Sharath', true)
    const admin = row('Vikash', false)
    const said = withdrawVerdict(owner, [owner, admin], { isOwner: false, personId: admin.personId }).reason
    expect(said).toBe('They are an Owner. Only an Owner removes an Owner, from Settings → Owners, with another Owner’s yes. An Admin never can.')
    expect(said).not.toContain('End their access')
    const src = readFileSync('src/app/api/access/[contextId]/route.ts', 'utf8')
    expect(src).toContain('const endInstead = target.hasSignedIn && !target.isOwner')
  })

  it('an Admin is not shown Change role on an Owner’s row, and an Owner is', async () => {
    const { mayChangeRole } = await import('@/app/api/access/row-acts')
    expect(mayChangeRole({ mayGrant: true, targetIsOwner: true, actorIsOwner: false })).toBe(false)
    expect(mayChangeRole({ mayGrant: true, targetIsOwner: true, actorIsOwner: true })).toBe(true)
    expect(mayChangeRole({ mayGrant: true, targetIsOwner: false, actorIsOwner: false })).toBe(true)
    expect(mayChangeRole({ mayGrant: false, targetIsOwner: false, actorIsOwner: true })).toBe(false)
    const page = readFileSync('src/app/dashboard/access/page.tsx', 'utf8')
    expect(page).toContain('p.acts?.changeRole !== false')
    expect(page).toContain('w.acts?.changeRole === false ? null')
  })

  it('the people line ends its first sentence with a period before it lists the consultants on the books', async () => {
    const { peopleHeadline } = await import('@/app/api/access/row-acts')
    expect(peopleHeadline('11 people: 11 with access', 4)).toBe('11 people: 11 with access. Also listed: 4 consultants on your books, not counted among your people.')
    expect(peopleHeadline('11 people: 11 with access', 0)).toBe('11 people: 11 with access')
    expect(peopleHeadline('2 people: 2 with access.', 1)).toBe('2 people: 2 with access. Also listed: 1 consultant on your books, not counted among your people.')
  })

  it('an invitation refused for work on this company’s record says it cannot be withdrawn, counts that work, and never says deleting', async () => {
    const { withdrawHistorySays } = await import('@/app/api/access/row-acts')
    const said = withdrawHistorySays({ approvals: 0, submissions: 1, contracts: 1, timesheets: 13 })
    expect(said).toBe('They have 1 submission, 1 contract and 13 timesheets on this company’s record, so the invitation cannot be withdrawn. End their access instead. The record stays, and they cannot get back in.')
    expect(said).not.toContain('Deleting')
    expect(withdrawHistorySays({ approvals: 0, submissions: 0, contracts: 0, timesheets: 0 })).toBeNull()
    const src = readFileSync('src/app/api/access/[contextId]/route.ts', 'utf8')
    expect(src).toContain("prisma.timesheet.count({\n      where: {\n        personId: ctx.personId,\n        sellContract: { OR: [{ companyId: here }")
  })

  it('pressing Change role with no role picked says "Pick a role."', () => {
    const page = readFileSync('src/app/dashboard/access/page.tsx', 'utf8')
    expect(page).toContain("if (!form.roleId) { setSaid({ contextId, text: 'Pick a role.', tone: 'error' }); return }")
  })

  it('a reader who cannot change access is offered no Withdraw either', async () => {
    const { offersFor } = await import('@/app/api/access/row-acts')
    const owner = row('Sharath', true)
    const sidhu = waiting('Sidhu')
    for (const o of offersFor([owner, sidhu], { isOwner: true }, false).values()) {
      expect([o.withdraw, o.endInstead]).toEqual([false, false])
    }
  })
})
