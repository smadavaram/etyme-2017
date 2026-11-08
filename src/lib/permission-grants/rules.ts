import { PERMISSIONS, HELD_APART, type Permission } from '@/lib/permissions'
import { GRANT_LABELS, GRANT_RIGHT_LABEL } from './words'

/**
 * The Owner gives access, by team, by role or for the whole company
 * (founder, 2026-11-08). The rules, with no database in them.
 *
 * A role carries permissions; a grant adds one, to a role at the company
 * or to one person's seat, over a scope: the whole company, one unit of
 * the org tree and everything under it, or the person's own work.
 *
 * ── The one deliberate narrowing ─────────────────────────────────────
 *
 * `hasPermission` answers yes or no and every route that asks it reads the
 * whole company's book. So a grant that reaches one team must not enter
 * the yes-or-no answer until the reader behind that permission narrows its
 * query to the team: otherwise "margin for the Dayton team" would open the
 * firm's whole Profitability page. `NARROWED_AT_THE_QUERY` names the
 * permissions whose readers do narrow; it is empty today, and a team or
 * own-work grant of anything else is refused in a sentence rather than
 * stored and silently widened. A domain whose reader starts calling
 * `permissionScope` asks the architect to add its permission here, in the
 * same commit.
 */

export const GRANT_RIGHT = 'grants.give' as const

export type GrantScope = 'COMPANY' | 'UNIT' | 'PERSON'
export type Scope = GrantScope | 'NONE'
export const GRANT_SCOPES: readonly GrantScope[] = ['COMPANY', 'UNIT', 'PERSON']

/** Given to one person by name, by the Owner, never to a role. */
export const PERSON_ONLY: readonly Permission[] = ['pnl.read', 'payroll.read', 'payroll.run', 'payroll.approve']

/** Permissions whose readers narrow at the query by a grant's scope. */
export const NARROWED_AT_THE_QUERY: ReadonlySet<string> = new Set<string>([])

/** Held by construction, and never named in a held-apart refusal (lib/permissions). */
const HOLDS_EVERYTHING = new Set(['Owner', 'Admin'])

export interface GrantRow {
  id?: string
  companyId: string
  permission: string
  roleId: string | null
  contextId: string | null
  scope: GrantScope | string
  orgUnitId: string | null
  revokedAt: Date | string | null
}

export interface Seat {
  companyId: string | null
  roleId: string | null
  contextId: string
}

export interface Unit {
  id: string
  parentId: string | null
}

export interface ScopeAnswer {
  has: boolean
  scope: Scope
  /** The units a UNIT scope reaches: each granted unit and every unit under it. Empty otherwise. */
  unitIds: string[]
}

const KNOWN = new Set<string>(PERMISSIONS)

export function isGrantable(permission: string): boolean {
  return KNOWN.has(permission) || permission === GRANT_RIGHT
}

/** "read what placements make", for a permission or the right to give access. */
export function labelOf(permission: string): string {
  if (permission === GRANT_RIGHT) return GRANT_RIGHT_LABEL
  return GRANT_LABELS[permission as Permission] ?? 'do something this list does not name'
}

/**
 * Does this grant reach this seat? At the seat's own company only, not
 * revoked, holding exactly one of a role and a seat, and a UNIT grant
 * naming its unit. Anything else reads as nothing.
 */
export function reaches(grant: GrantRow, seat: Seat): boolean {
  if (!seat.companyId || grant.companyId !== seat.companyId) return false
  if (grant.revokedAt) return false
  if (Boolean(grant.roleId) === Boolean(grant.contextId)) return false
  if (!isGrantable(grant.permission)) return false
  if (!GRANT_SCOPES.includes(grant.scope as GrantScope)) return false
  if (grant.scope === 'UNIT' && !grant.orgUnitId) return false
  if (grant.roleId) return grant.roleId === seat.roleId
  return grant.contextId === seat.contextId
}

/** Whether a grant counts toward the yes-or-no answer (see the note above). */
function opensTheDoor(grant: GrantRow): boolean {
  return grant.scope === 'COMPANY' || NARROWED_AT_THE_QUERY.has(grant.permission)
}

/**
 * The permissions a seat holds beyond its role, through grants that open
 * the door. Never the right to give access, which is not a permission any
 * route asks for.
 */
export function grantedPermissions(rolePermissions: readonly string[], seat: Seat, grants: readonly GrantRow[]): string[] {
  const out: string[] = []
  for (const g of grants) {
    if (g.permission === GRANT_RIGHT || !KNOWN.has(g.permission)) continue
    if (!reaches(g, seat) || !opensTheDoor(g)) continue
    if (rolePermissions.includes(g.permission) || out.includes(g.permission)) continue
    out.push(g.permission)
  }
  return out
}

/** The role's permissions and every grant that reaches the seat: what `hasPermission` is asked over. */
export function effectivePermissions(rolePermissions: readonly string[], seat: Seat, grants: readonly GrantRow[]): string[] {
  return [...rolePermissions, ...grantedPermissions(rolePermissions, seat, grants)]
}

/** A unit and every unit under it, at the company whose units these are. Safe on a cycle. */
export function unitAndBelow(unitId: string, units: readonly Unit[]): string[] {
  if (!units.some((u) => u.id === unitId)) return []
  const seen = new Set<string>([unitId])
  const queue = [unitId]
  while (queue.length) {
    const at = queue.shift()!
    for (const u of units) {
      if (u.parentId === at && !seen.has(u.id)) {
        seen.add(u.id)
        queue.push(u.id)
      }
    }
  }
  return [...seen]
}

/**
 * Over what does this seat hold this permission? The role's own
 * permissions read as the whole company; a grant reads at its scope, the
 * widest of several winning; `units` are the seat's own company's, so a
 * grant naming another company's unit reaches nothing. `has` is always the
 * answer `hasPermission` gives over `effectivePermissions`.
 */
export function scopeFrom(
  args: { rolePermissions: readonly string[]; seat: Seat; grants: readonly GrantRow[]; units: readonly Unit[] },
  permission: string
): ScopeAnswer {
  const none: ScopeAnswer = { has: false, scope: 'NONE', unitIds: [] }
  if (!args.seat.companyId) return none
  if (args.rolePermissions.includes('*') || args.rolePermissions.includes(permission)) {
    return { has: true, scope: 'COMPANY', unitIds: [] }
  }
  const live = args.grants.filter((g) => g.permission === permission && reaches(g, args.seat) && opensTheDoor(g))
  if (live.some((g) => g.scope === 'COMPANY')) return { has: true, scope: 'COMPANY', unitIds: [] }

  const unitIds = new Set<string>()
  for (const g of live) {
    if (g.scope === 'UNIT' && g.orgUnitId) for (const id of unitAndBelow(g.orgUnitId, args.units)) unitIds.add(id)
  }
  if (unitIds.size) return { has: true, scope: 'UNIT', unitIds: [...unitIds] }
  if (live.some((g) => g.scope === 'PERSON')) return { has: true, scope: 'PERSON', unitIds: [] }
  return none
}

/** Has the Owner given this seat the right to give access, by name? */
export function holdsGrantRight(seat: Seat, grants: readonly GrantRow[]): boolean {
  return grants.some((g) => g.permission === GRANT_RIGHT && g.contextId && reaches(g, seat))
}

// ── Giving one ─────────────────────────────────────────────────────────

export type Verdict = { ok: true } | { ok: false; field: string | null; says: string }

const no = (field: string | null, says: string): Verdict => ({ ok: false, field, says })

/** A set of permissions one holder would carry, checked against HELD_APART. */
export interface HolderSet {
  /** Who it is, as a sentence names them: "Recruiter", "Dana Whitfield". */
  name: string
  /** The role this set sits under, so Owner and Admin are never named. */
  roleName: string | null
  permissions: readonly string[]
}

export interface GrantAsk {
  companyName: string
  granter: {
    isOwner: boolean
    hasGrantRight: boolean
    /** The granter's effective permissions. */
    permissions: readonly string[]
    /** The granter's own reach over the permission being given. */
    scope: ScopeAnswer
  }
  permission?: string | null
  roleId?: string | null
  contextId?: string | null
  /** The holder, found at the granter's company; null where the id named nobody there. */
  holder: { kind: 'ROLE' | 'PERSON'; name: string } | null
  /** Every set the grant would join: the role itself and each seat in it, or the one seat. */
  holderSets: readonly HolderSet[]
  /** The holder already holds it across the company, through a role or a grant. */
  alreadyHeld: boolean
  scope?: string | null
  orgUnitId?: string | null
  /** The unit named is in the granter's company's tree. */
  unitAtCompany: boolean
  reason?: string | null
}

/**
 * May this grant be given? Every missing field is refused in a sentence
 * naming it (the dialog offers each), then who may give, then what a grant
 * can never do: go to the wrong kind of holder, exceed the giver, reach
 * further than the giver reaches, pair what is held apart.
 */
export function checkGrant(ask: GrantAsk): Verdict {
  const p = (ask.permission ?? '').trim()
  if (!p) return no('permission', 'Choose what they may do.')
  if (!isGrantable(p)) return no('permission', 'That is not something access can be given for. Choose one from the list.')
  const label = labelOf(p)

  if (!ask.roleId && !ask.contextId) return no('who', 'Choose who gets it: a role, or one person here.')
  if (ask.roleId && ask.contextId) return no('who', 'Give it to a role or to one person, not both.')
  if (!ask.holder) {
    return no('who', `That role or person is not at ${ask.companyName}. Access is given only to roles and people at your own company.`)
  }

  const scope = (ask.scope ?? '').trim()
  if (!GRANT_SCOPES.includes(scope as GrantScope)) {
    return no('scope', 'Choose how far it reaches: the whole company, one team, or only their own work.')
  }
  if (scope === 'UNIT' && !ask.orgUnitId) return no('orgUnitId', 'Choose the team. A team grant reaches that team and every team under it.')
  if (scope === 'UNIT' && !ask.unitAtCompany) return no('orgUnitId', `That team is not in ${ask.companyName}’s org tree.`)
  if (!(ask.reason ?? '').trim()) return no('reason', 'Say why. The reason is kept with the grant, for whoever reviews access later.')

  const g = ask.granter
  if (p === GRANT_RIGHT) {
    if (!g.isOwner) return no(null, 'Only the Owner gives somebody the right to give access.')
    if (ask.holder.kind !== 'PERSON') return no('who', 'The right to give access goes to one person by name, never to a role.')
    if (scope !== 'COMPANY') return no('scope', 'The right to give access is for the whole company or not at all.')
    if (ask.alreadyHeld) return no('who', `${ask.holder.name} can already give access.`)
  } else if (!g.isOwner && !g.hasGrantRight) {
    return no(null, 'Only the Owner gives access here, or somebody the Owner has given that right to by name.')
  }

  if ((PERSON_ONLY as readonly string[]).includes(p)) {
    if (!g.isOwner) return no(null, `Only the Owner gives somebody the right to ${label}.`)
    if (ask.holder.kind !== 'PERSON') return no('who', `The right to ${label} goes to one person by name, never to a role. Choose the person.`)
  }

  if (p !== GRANT_RIGHT) {
    if (!g.isOwner && !g.permissions.includes(p) && !g.permissions.includes('*')) {
      return no('permission', `You cannot give what you do not hold yourself, and you cannot ${label}.`)
    }
    if (!g.isOwner && g.scope.scope !== 'COMPANY') {
      const within =
        scope === 'PERSON' ||
        (scope === 'UNIT' && g.scope.scope === 'UNIT' && !!ask.orgUnitId && g.scope.unitIds.includes(ask.orgUnitId))
      if (!within) {
        return no('scope', g.scope.scope === 'UNIT'
          ? `You ${label} for your own team only, so you can give it for that team or less, never further.`
          : `You ${label} for your own work only, so you can give it only as their own work.`)
      }
    }
    if (scope !== 'COMPANY' && !NARROWED_AT_THE_QUERY.has(p)) {
      return no('scope',
        `Etyme does not yet narrow the right to ${label} to one team or to somebody’s own work, so a narrower grant would open the whole company’s. ` +
        'Give it for the whole company, or wait until that page reads by team.')
    }
    if (ask.alreadyHeld) return no('permission', `${ask.holder.name} can already ${label} across ${ask.companyName}.`)

    for (const set of ask.holderSets) {
      if (set.roleName && HOLDS_EVERYTHING.has(set.roleName)) continue
      if (set.permissions.includes('*')) continue
      for (const pair of HELD_APART) {
        const other = pair.a === p ? pair.b : pair.b === p ? pair.a : null
        if (!other || !set.permissions.includes(other)) continue
        return no('permission',
          `${set.name} would then ${labelOf(pair.a)} and ${labelOf(pair.b)}, which one seat may not hold together. ${pair.because}`)
      }
    }
  }
  return { ok: true }
}

/** May this grant be taken away by this person? */
export function checkRevoke(args: {
  isOwner: boolean
  hasGrantRight: boolean
  grant: { permission: string; revokedAt: Date | string | null } | null
  companyName: string
}): Verdict {
  if (!args.grant) return no('id', `There is no such grant at ${args.companyName}.`)
  if (args.grant.revokedAt) return no('id', 'This grant was already taken away.')
  if (args.grant.permission === GRANT_RIGHT && !args.isOwner) {
    return no(null, 'Only the Owner takes away the right to give access.')
  }
  if (!args.isOwner && !args.hasGrantRight) {
    return no(null, 'Only the Owner takes access away here, or somebody the Owner has given that right to by name.')
  }
  return { ok: true }
}
