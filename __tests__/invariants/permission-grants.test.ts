import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { PERMISSIONS } from '@/lib/permissions'
import {
  checkGrant,
  checkRevoke,
  effectivePermissions,
  grantedPermissions,
  holdsGrantRight,
  scopeFrom,
  unitAndBelow,
  GRANT_RIGHT,
  NARROWED_AT_THE_QUERY,
  type GrantAsk,
  type GrantRow,
  type Seat,
} from '@/lib/permission-grants/rules'
import { GRANT_LABELS } from '@/lib/permission-grants/words'
import { GIVE_ACCESS_FIELDS, giveAccessBody, fieldsDrawn } from '@/lib/permission-grants/form'
import { withGrants } from '@/components/session-provider'

/**
 * The Owner decides who sees what, by team, by role or for the whole
 * company (founder, 2026-11-08).
 */

const CO = 'co-brightmoor'
const recruiterSeat: Seat = { companyId: CO, roleId: 'role-recruiter', contextId: 'ctx-dana' }
const RECRUITER = ['consultants.read', 'submissions.read', 'submissions.create']

const grant = (g: Partial<GrantRow>): GrantRow => ({
  companyId: CO, permission: 'margin.read', roleId: null, contextId: null, scope: 'COMPANY', orgUnitId: null, revokedAt: null, ...g,
})

const UNITS = [
  { id: 'u-east', parentId: null },
  { id: 'u-dayton', parentId: 'u-east' },
  { id: 'u-dayton-plant', parentId: 'u-dayton' },
  { id: 'u-west', parentId: null },
]

/** Pretend, for one test, that a reader narrows margin by team. */
function withNarrowed<T>(p: string, run: () => T): T {
  const set = NARROWED_AT_THE_QUERY as Set<string>
  const had = set.has(p)
  set.add(p)
  try { return run() } finally { if (!had) set.delete(p) }
}

const ask = (over: Partial<GrantAsk> = {}): GrantAsk => ({
  companyName: 'Brightmoor Staffing',
  granter: { isOwner: true, hasGrantRight: false, permissions: [...PERMISSIONS], scope: { has: true, scope: 'COMPANY', unitIds: [] } },
  permission: 'margin.read',
  roleId: 'role-recruiter',
  contextId: null,
  holder: { kind: 'ROLE', name: 'Everybody in Recruiter' },
  holderSets: [{ name: 'Recruiter', roleName: 'Recruiter', permissions: RECRUITER }],
  alreadyHeld: false,
  scope: 'COMPANY',
  orgUnitId: null,
  unitAtCompany: false,
  reason: 'The recruiting leads review margin weekly',
  ...over,
})

describe('what a seat holds: its role and the grants that reach it', () => {
  it('a recruiter with no grant still reads no margin, so a firm that never opens grants works as today', () => {
    expect(effectivePermissions(RECRUITER, recruiterSeat, [])).toEqual(RECRUITER)
    expect(scopeFrom({ rolePermissions: RECRUITER, seat: recruiterSeat, grants: [], units: UNITS }, 'margin.read'))
      .toEqual({ has: false, scope: 'NONE', unitIds: [] })
  })

  it('a grant to the recruiter role reaches every seat in that role, and a grant to one seat reaches that seat only', () => {
    const toRole = grant({ roleId: 'role-recruiter' })
    expect(effectivePermissions(RECRUITER, recruiterSeat, [toRole])).toContain('margin.read')
    const toOther = grant({ contextId: 'ctx-somebody-else' })
    expect(effectivePermissions(RECRUITER, recruiterSeat, [toOther])).not.toContain('margin.read')
    const toDana = grant({ contextId: 'ctx-dana' })
    expect(grantedPermissions(RECRUITER, recruiterSeat, [toDana])).toEqual(['margin.read'])
  })

  it('a revoked grant reads as nothing', () => {
    const gone = grant({ roleId: 'role-recruiter', revokedAt: new Date('2026-11-01') })
    expect(effectivePermissions(RECRUITER, recruiterSeat, [gone])).not.toContain('margin.read')
  })

  it('a grant written at another company never reaches a seat here', () => {
    const elsewhere = grant({ companyId: 'co-northbend', roleId: 'role-recruiter' })
    expect(effectivePermissions(RECRUITER, recruiterSeat, [elsewhere])).not.toContain('margin.read')
    expect(scopeFrom({ rolePermissions: RECRUITER, seat: recruiterSeat, grants: [elsewhere], units: UNITS }, 'margin.read').has).toBe(false)
  })

  it('a grant naming both a role and a seat, or neither, reads as nothing', () => {
    expect(effectivePermissions(RECRUITER, recruiterSeat, [grant({ roleId: 'role-recruiter', contextId: 'ctx-dana' })])).toEqual(RECRUITER)
    expect(effectivePermissions(RECRUITER, recruiterSeat, [grant({})])).toEqual(RECRUITER)
  })

  it('the right to give access is never a permission any route is asked over', () => {
    const right = grant({ permission: GRANT_RIGHT, contextId: 'ctx-dana' })
    expect(effectivePermissions(RECRUITER, recruiterSeat, [right])).toEqual(RECRUITER)
    expect(holdsGrantRight(recruiterSeat, [right])).toBe(true)
    expect(holdsGrantRight(recruiterSeat, [grant({ permission: GRANT_RIGHT, roleId: 'role-recruiter' })])).toBe(false)
  })

  it('a team grant does not open the door until that permission’s reader narrows its query, so it can never widen to the whole firm', () => {
    // What each person costs is read by no reader that narrows by team yet.
    const team = grant({ permission: 'consultants.cost', contextId: 'ctx-dana', scope: 'UNIT', orgUnitId: 'u-dayton' })
    expect(effectivePermissions(RECRUITER, recruiterSeat, [team])).not.toContain('consultants.cost')
    expect(scopeFrom({ rolePermissions: RECRUITER, seat: recruiterSeat, grants: [team], units: UNITS }, 'consultants.cost').has).toBe(false)
  })

  it('margin and profit and loss are read by team, because Profitability, its cuts and the postings narrow at the query', () => {
    expect(NARROWED_AT_THE_QUERY.has('margin.read')).toBe(true)
    expect(NARROWED_AT_THE_QUERY.has('pnl.read')).toBe(true)
    // Cash flow's payroll reads the whole firm only.
    expect(NARROWED_AT_THE_QUERY.has('payroll.read')).toBe(false)
    const team = grant({ contextId: 'ctx-dana', scope: 'UNIT', orgUnitId: 'u-dayton' })
    expect(effectivePermissions(RECRUITER, recruiterSeat, [team])).toContain('margin.read')
    expect(scopeFrom({ rolePermissions: RECRUITER, seat: recruiterSeat, grants: [team], units: UNITS }, 'margin.read').scope).toBe('UNIT')
  })
})

describe('over what a seat holds a permission', () => {
  it('a role’s own permission reads across the whole company', () => {
    expect(scopeFrom({ rolePermissions: RECRUITER, seat: recruiterSeat, grants: [], units: UNITS }, 'submissions.read'))
      .toEqual({ has: true, scope: 'COMPANY', unitIds: [] })
  })

  it('a team grant reads the team and every team under it, and no team beside it', () => {
    withNarrowed('margin.read', () => {
      const team = grant({ contextId: 'ctx-dana', scope: 'UNIT', orgUnitId: 'u-dayton' })
      const answer = scopeFrom({ rolePermissions: RECRUITER, seat: recruiterSeat, grants: [team], units: UNITS }, 'margin.read')
      expect(answer.scope).toBe('UNIT')
      expect(answer.unitIds.sort()).toEqual(['u-dayton', 'u-dayton-plant'])
      expect(answer.unitIds).not.toContain('u-east')
      expect(answer.unitIds).not.toContain('u-west')
    })
  })

  it('a team grant naming a unit that is not in this company’s tree reaches nothing', () => {
    withNarrowed('margin.read', () => {
      const team = grant({ contextId: 'ctx-dana', scope: 'UNIT', orgUnitId: 'u-at-another-firm' })
      expect(scopeFrom({ rolePermissions: RECRUITER, seat: recruiterSeat, grants: [team], units: UNITS }, 'margin.read'))
        .toEqual({ has: false, scope: 'NONE', unitIds: [] })
    })
  })

  it('the widest of several grants wins, and a company grant is never narrowed by a team grant beside it', () => {
    withNarrowed('margin.read', () => {
      const grants = [
        grant({ contextId: 'ctx-dana', scope: 'PERSON' }),
        grant({ contextId: 'ctx-dana', scope: 'UNIT', orgUnitId: 'u-west' }),
        grant({ roleId: 'role-recruiter', scope: 'COMPANY' }),
      ]
      expect(scopeFrom({ rolePermissions: RECRUITER, seat: recruiterSeat, grants, units: UNITS }, 'margin.read').scope).toBe('COMPANY')
      expect(scopeFrom({ rolePermissions: RECRUITER, seat: recruiterSeat, grants: grants.slice(0, 1), units: UNITS }, 'margin.read').scope).toBe('PERSON')
    })
  })

  it('a seat at no company holds nothing over anything', () => {
    expect(scopeFrom({ rolePermissions: ['*'], seat: { companyId: null, roleId: null, contextId: 'x' }, grants: [], units: [] }, 'margin.read').scope).toBe('NONE')
  })

  it('a unit tree with a loop in it is read once and does not hang', () => {
    expect(unitAndBelow('a', [{ id: 'a', parentId: 'b' }, { id: 'b', parentId: 'a' }]).sort()).toEqual(['a', 'b'])
  })
})

describe('giving access', () => {
  it('the Owner gives a recruiter role the right to read what placements make, with a reason', () => {
    expect(checkGrant(ask())).toEqual({ ok: true })
  })

  it('each missing field is refused in a sentence naming the field', () => {
    const cases: [Partial<GrantAsk>, string][] = [
      [{ permission: '' }, 'permission'],
      [{ permission: 'margin.peek' }, 'permission'],
      [{ roleId: null, contextId: null }, 'who'],
      [{ roleId: 'r', contextId: 'c' }, 'who'],
      [{ holder: null }, 'who'],
      [{ scope: '' }, 'scope'],
      [{ scope: 'UNIT', orgUnitId: null }, 'orgUnitId'],
      [{ scope: 'UNIT', orgUnitId: 'u-x', unitAtCompany: false }, 'orgUnitId'],
      [{ reason: '  ' }, 'reason'],
    ]
    for (const [over, field] of cases) {
      const v = checkGrant(ask(over))
      expect(v.ok, JSON.stringify(over)).toBe(false)
      if (!v.ok) {
        expect(v.field).toBe(field)
        expect(v.says).toMatch(/\.$/)
        expect(v.says).not.toMatch(/margin\.read|team\.manage/)
      }
    }
  })

  it('somebody who is neither the Owner nor given the right by name cannot give access', () => {
    const v = checkGrant(ask({ granter: { isOwner: false, hasGrantRight: false, permissions: [...PERMISSIONS], scope: { has: true, scope: 'COMPANY', unitIds: [] } } }))
    expect(v).toMatchObject({ ok: false, field: null })
    if (!v.ok) expect(v.says).toContain('Only the Owner')
  })

  it('an Admin the Owner gave the right to by name may give access, never beyond what the Admin holds', () => {
    const admin = (permissions: string[]) => ({ isOwner: false, hasGrantRight: true, permissions, scope: { has: permissions.includes('margin.read'), scope: permissions.includes('margin.read') ? 'COMPANY' as const : 'NONE' as const, unitIds: [] } })
    expect(checkGrant(ask({ granter: admin(PERMISSIONS.filter((p) => p !== 'pnl.read')) }))).toEqual({ ok: true })
    const v = checkGrant(ask({ granter: admin(['team.manage']) }))
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.says).toContain('do not hold yourself')
  })

  it('only the Owner gives the right to give access, only to one person by name, and only for the whole company', () => {
    const toPerson = { permission: GRANT_RIGHT, roleId: null, contextId: 'ctx-admin', holder: { kind: 'PERSON' as const, name: 'Imelda Santoro' } }
    expect(checkGrant(ask(toPerson))).toEqual({ ok: true })
    expect(checkGrant(ask({ ...toPerson, granter: { isOwner: false, hasGrantRight: true, permissions: [...PERMISSIONS], scope: { has: true, scope: 'COMPANY', unitIds: [] } } })).ok).toBe(false)
    expect(checkGrant(ask({ permission: GRANT_RIGHT }))).toMatchObject({ ok: false, field: 'who' })
    expect(checkGrant(ask({ ...toPerson, scope: 'PERSON' }))).toMatchObject({ ok: false, field: 'scope' })
  })

  it('profit and loss and payroll are given to a person by name, by the Owner, and never to a role', () => {
    for (const p of ['pnl.read', 'payroll.read', 'payroll.run', 'payroll.approve']) {
      expect(checkGrant(ask({ permission: p })), p).toMatchObject({ ok: false, field: 'who' })
      expect(checkGrant(ask({ permission: p, roleId: null, contextId: 'ctx-dana', holder: { kind: 'PERSON', name: 'Dana Whitfield' } })), p).toEqual({ ok: true })
      const byAdmin = checkGrant(ask({
        permission: p, roleId: null, contextId: 'ctx-dana', holder: { kind: 'PERSON', name: 'Dana Whitfield' },
        granter: { isOwner: false, hasGrantRight: true, permissions: [...PERMISSIONS], scope: { has: true, scope: 'COMPANY', unitIds: [] } },
      }))
      expect(byAdmin.ok, p).toBe(false)
    }
  })

  it('a grant that would let one seat raise an order and bill on it is refused, naming both', () => {
    const v = checkGrant(ask({
      permission: 'orders.raise',
      holderSets: [{ name: 'Accounts Receivable', roleName: 'Accounts Receivable', permissions: ['invoices.read', 'invoices.issue'] }],
    }))
    expect(v).toMatchObject({ ok: false, field: 'permission' })
    if (!v.ok) {
      expect(v.says).toContain('raise an order to a supplier')
      expect(v.says).toContain('send a bill to a customer')
      expect(v.says).toContain('may not hold together')
    }
  })

  it('held-apart pairs are checked on every seat a role grant reaches, not only on the role', () => {
    const v = checkGrant(ask({
      permission: 'orders.raise',
      holderSets: [
        { name: 'Contract Manager', roleName: 'Contract Manager', permissions: ['assignments.read'] },
        { name: 'Marisa Delacroix', roleName: 'Contract Manager', permissions: ['assignments.read', 'requirements.write'] },
      ],
    }))
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.says).toContain('Marisa Delacroix')
  })

  it('a team grant is refused until the page behind that permission reads by team, rather than opening the whole company’s', () => {
    const v = checkGrant(ask({ permission: 'consultants.cost', scope: 'UNIT', orgUnitId: 'u-dayton', unitAtCompany: true }))
    expect(v).toMatchObject({ ok: false, field: 'scope' })
    if (!v.ok) expect(v.says).toContain('whole company')
    expect(checkGrant(ask({ scope: 'UNIT', orgUnitId: 'u-dayton', unitAtCompany: true }))).toEqual({ ok: true })
  })

  it('somebody who holds a permission for one team only can give it for that team or less, never the whole company', () => {
    withNarrowed('margin.read', () => {
      const lead = { isOwner: false, hasGrantRight: true, permissions: ['margin.read'], scope: { has: true, scope: 'UNIT' as const, unitIds: ['u-dayton', 'u-dayton-plant'] } }
      expect(checkGrant(ask({ granter: lead }))).toMatchObject({ ok: false, field: 'scope' })
      expect(checkGrant(ask({ granter: lead, scope: 'UNIT', orgUnitId: 'u-west', unitAtCompany: true }))).toMatchObject({ ok: false, field: 'scope' })
      expect(checkGrant(ask({ granter: lead, scope: 'UNIT', orgUnitId: 'u-dayton-plant', unitAtCompany: true }))).toEqual({ ok: true })
    })
  })

  it('a grant of something the holder already holds across the company is refused in a sentence', () => {
    const v = checkGrant(ask({ alreadyHeld: true }))
    expect(v).toMatchObject({ ok: false, field: 'permission' })
    if (!v.ok) expect(v.says).toContain('can already')
  })
})

describe('taking access away', () => {
  it('the Owner revokes a grant in one press, and a grant already taken away says so', () => {
    expect(checkRevoke({ isOwner: true, hasGrantRight: false, grant: { permission: 'margin.read', revokedAt: null }, companyName: 'Brightmoor' })).toEqual({ ok: true })
    expect(checkRevoke({ isOwner: true, hasGrantRight: false, grant: { permission: 'margin.read', revokedAt: new Date() }, companyName: 'Brightmoor' }).ok).toBe(false)
    expect(checkRevoke({ isOwner: true, hasGrantRight: false, grant: null, companyName: 'Brightmoor' }).ok).toBe(false)
  })

  it('only the Owner takes away the right to give access', () => {
    expect(checkRevoke({ isOwner: false, hasGrantRight: true, grant: { permission: GRANT_RIGHT, revokedAt: null }, companyName: 'B' }).ok).toBe(false)
    expect(checkRevoke({ isOwner: false, hasGrantRight: false, grant: { permission: 'margin.read', revokedAt: null }, companyName: 'B' }).ok).toBe(false)
  })
})

describe('the Give access dialog and its route', () => {
  it('every permission has a plain label, and none of them says its own key', () => {
    for (const p of PERMISSIONS) {
      expect(GRANT_LABELS[p], p).toBeTruthy()
      expect(GRANT_LABELS[p]).not.toContain('.')
    }
    expect(GRANT_LABELS['margin.read']).toBe('read what placements make')
    expect(GRANT_LABELS['pnl.read']).toBe('read the firm’s profit and loss')
    expect(GRANT_LABELS['invoices.read']).toBe('read bills and what came in')
    expect(GRANT_LABELS['payroll.read']).toBe('read payroll')
  })

  it('every question the route asks, the dialog has a field for', () => {
    const named = new Set<string>()
    const cases: Partial<GrantAsk>[] = [
      { permission: '' }, { roleId: null, contextId: null }, { scope: '' },
      { scope: 'UNIT', orgUnitId: null }, { reason: '' },
    ]
    for (const c of cases) {
      const v = checkGrant(ask(c))
      if (!v.ok && v.field) named.add(v.field)
    }
    for (const f of named) expect(GIVE_ACCESS_FIELDS as readonly string[]).toContain(f)
    expect(fieldsDrawn('UNIT')).toContain('orgUnitId')
    expect(fieldsDrawn('COMPANY')).not.toContain('orgUnitId')
  })

  it('a dialog filled in for a role posts exactly one holder and the route’s rules accept it', () => {
    const body = giveAccessBody({ permission: 'margin.read', who: 'role:role-recruiter', scope: 'COMPANY', orgUnitId: 'ignored', reason: 'Weekly review' })
    expect(body).toEqual({ permission: 'margin.read', roleId: 'role-recruiter', contextId: null, scope: 'COMPANY', orgUnitId: null, reason: 'Weekly review' })
    expect(checkGrant(ask({ ...body, holder: { kind: 'ROLE', name: 'Everybody in Recruiter' } } as Partial<GrantAsk>))).toEqual({ ok: true })
    const person = giveAccessBody({ permission: 'pnl.read', who: 'person:ctx-dana', scope: 'COMPANY', orgUnitId: '', reason: 'Runs finance' })
    expect(person.contextId).toBe('ctx-dana')
    expect(person.roleId).toBeNull()
  })

  it('the route records every grant and every revoke on the automation log and as an access event', () => {
    const src = readFileSync('src/app/api/settings/grants/route.ts', 'utf8')
    expect(src).toContain("action: 'PERMISSION_GRANTED'")
    expect(src).toContain("action: 'PERMISSION_REVOKED'")
    expect(src).toContain("type: 'access.granted'")
    expect(src).toContain("type: 'access.revoked'")
    // Every holder and every unit is looked up at the caller's own company.
    expect(src).toMatch(/role\.findFirst\(\{\s*where: \{ id: roleId, companyId \}/)
    expect(src).toMatch(/context\.findFirst\(\{\s*where: \{ id: contextId, companyId, revokedAt: null \}/)
    expect(src).toMatch(/orgUnit\.findFirst\(\{ where: \{ id: orgUnitId, companyId \}/)
  })
})

describe('the one caller check and the menu read grants', () => {
  it('the caller check asks for the seat’s grants and puts them in the permissions every route is asked over', () => {
    const src = readFileSync('src/lib/api-context.ts', 'utf8')
    expect(src).toContain('seatPermissions(')
    expect(src).toContain('permissions: held.permissions')
  })

  it('the menu draws a granted link only for the seat the grant belongs to', () => {
    expect(withGrants(RECRUITER, 'ctx-dana', { contextId: 'ctx-dana', permissions: ['margin.read'] })).toContain('margin.read')
    expect(withGrants(RECRUITER, 'ctx-other', { contextId: 'ctx-dana', permissions: ['margin.read'] })).not.toContain('margin.read')
    expect(withGrants(RECRUITER, 'ctx-dana', null)).toEqual(RECRUITER)
  })
})

describe('Give access on Users & permissions', () => {
  it('a seat that may not read who holds what is shown nothing, never the route’s refusal in a red box', () => {
    const src = readFileSync('src/components/settings/give-access.tsx', 'utf8')
    expect(src).toMatch(/if \(!res\.ok\) \{ setData\(null\); setRefused\(true\); return \}/)
    expect(src).toContain('if (refused || !data) return null')
  })

  it('the form is drawn only for a seat that may give access', () => {
    const src = readFileSync('src/components/settings/give-access.tsx', 'utf8')
    expect(src).toMatch(/\{data\.canGive && \(\s*<form/)
  })
})
