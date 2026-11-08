/**
 * Who sees what, said in Ask Etyme (founder, 2026-11-08: "The Owner
 * decides who sees what, by team, by role or for the whole company").
 * Pure: no database, no request. The reads are in ./read; the rules are
 * the architect's lib/permission-grants, and the one route that gives
 * access is POST /api/settings/grants. Nothing here writes a grant.
 *
 * Three things:
 *  - a refused or narrowed read says how far the reader reaches, and who
 *    may give more ("You read what placements make for the Dayton team;
 *    ask the Owner for the firm's.");
 *  - the Owner's words "let Maya read margin for the Dayton team" become
 *    a give-access card, Yes and Not now, whose yes posts to the one route;
 *  - "Who can see margin?" is answered from the roles and the grants, by name.
 */

import { GRANT_LABELS } from '@/lib/permission-grants/words'
import type { Permission } from '@/lib/permissions'

type Link = { label: string; href: string }

/** Users & permissions, where every grant is listed with Revoke. */
export const ACCESS_HREF = '/dashboard/access'
export const ACCESS_LINK: Link = { label: 'Open Users & permissions', href: ACCESS_HREF }

/** The act kind the give-access card is drawn under (the role contract first, 2026-10-12). */
export const GIVE_ACCESS_ACT = 'access.grant'

export type AccessScope = 'COMPANY' | 'UNIT' | 'PERSON' | 'NONE'

export interface UnitFact { id: string; name: string; parentId: string | null }

function label(permission: string): string {
  return GRANT_LABELS[permission as Permission] ?? 'do this'
}

function andNames(xs: readonly string[]): string {
  if (xs.length <= 1) return xs[0] ?? ''
  if (xs.length === 2) return `${xs[0]} and ${xs[1]}`
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
}

function orNames(xs: readonly string[]): string {
  if (xs.length <= 1) return xs[0] ?? ''
  if (xs.length === 2) return `${xs[0]} or ${xs[1]}`
  return `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`
}

/** "Dayton" reads "the Dayton team"; "Dayton team" is not said twice. */
export function teamWords(names: readonly string[]): string {
  if (!names.length) return 'your team'
  const said = andNames(names)
  const plural = names.length > 1
  if (names.every((n) => /\bteams?$/i.test(n.trim()))) return `the ${said}`
  return `the ${said} ${plural ? 'teams' : 'team'}`
}

/**
 * The teams a UNIT scope was granted at: of the units it reaches (each
 * granted unit and every unit under it), those whose parent it does not
 * reach. A team under a granted team is not named twice.
 */
export function teamsGranted(unitIds: readonly string[], units: readonly UnitFact[]): string[] {
  const reached = new Set(unitIds)
  return units
    .filter((u) => reached.has(u.id) && !(u.parentId && reached.has(u.parentId)))
    .map((u) => u.name)
    .sort((a, b) => a.localeCompare(b))
}

/** Who may give access here: the Owner, and anybody the Owner gave that right to by name. */
export function giversSaid(named: readonly string[] = []): string {
  const others = [...new Set(named.map((n) => n.trim()).filter(Boolean))]
  return orNames(['the Owner', ...others])
}

/**
 * The line beside an answer read at less than the firm's reach, or null
 * where the reader reads the firm's. One sentence, never a code.
 */
export function scopeLine(permission: string, scope: AccessScope, teams: readonly string[] = [], givers: readonly string[] = []): string | null {
  if (scope === 'UNIT') return `You ${label(permission)} for ${teamWords(teams)}; ask ${giversSaid(givers)} for the firm’s.`
  if (scope === 'PERSON') return `You ${label(permission)} for your own work; ask ${giversSaid(givers)} for the firm’s.`
  return null
}

/**
 * A read refused because the seat holds nothing of it: who reads it here,
 * and who may give the reader access. One sentence.
 *
 * `desks`: the roles that hold it at this kind of firm, the reader's own
 * left out (never told to ask themselves); at most two are named.
 */
export function noAccessSays(p: { reads: string; desks: readonly string[]; holdsDesk: boolean; givers?: readonly string[] }): string {
  const who = giversSaid(p.givers)
  const desks = p.desks.slice(0, 2)
  // The Owner among the desks is asked once, for the access itself.
  if (desks.length && desks.some((d) => d.trim().toLowerCase() === 'owner')) return `Your ${orNames(desks)} reads ${p.reads}; ask ${who} to give you access.`
  if (desks.length) return `Your ${orNames(desks)} reads ${p.reads}; ask them, or ask ${who} to give you access.`
  if (p.holdsDesk) return `Your seat here does not hold that; ask ${who} to give you access on Users & permissions.`
  return `No role at your company reads ${p.reads} yet; ${who} gives access on Users & permissions.`
}

// ── "Who can see margin?" ─────────────────────────────────────────────

/** The words a person uses for a permission, mapped to it. Checked in order. */
const PERMISSION_WORDS: ReadonlyArray<[RegExp, Permission]> = [
  [/\bp ?& ?l\b|\bpnl\b|\bprofit and loss\b/, 'pnl.read'],
  [/\bmargins?\b|\bmark-?ups?\b|\bprofit(s|ability)?\b|\bwhat (our |the )?placements make\b/, 'margin.read'],
  [/\bpayroll\b|\bsalar(y|ies)\b|\bwages?\b/, 'payroll.read'],
  [/\brates?\b/, 'rates.read'],
  [/\bwhat (each person|people) costs?\b|\bcosts?\b/, 'consultants.cost'],
  [/\bbills?\b|\binvoices?\b/, 'invoices.read'],
  [/\btimesheets?\b|\bhours\b/, 'timesheets.read'],
]

export function permissionNamed(lower: string): Permission | null {
  for (const [re, p] of PERMISSION_WORDS) if (re.test(lower)) return p
  return null
}

/** "Who can see margin?", "Who has access to payroll?", "Who reads our P&L?": the permission asked about, or null. */
export function readWhoHolds(raw: string): Permission | null {
  const lower = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!/^who\b/.test(lower)) return null
  if (!/^who('s| is)? ?(can|may|could|gets? to|is allowed to|has access to|have access to|sees?|reads?|holds?)\b/.test(lower)) return null
  return permissionNamed(lower)
}

export interface RoleHolders { role: string; people: string[]; everything: boolean }
export interface GrantHeld { says: string; grantedBy: string; reason: string | null }

/** The answer to "who can see margin?", from the roles that hold it and every live grant of it. */
export function whoHoldsSays(permission: string, roles: readonly RoleHolders[], grants: readonly GrantHeld[]): string {
  const what = label(permission)
  const parts = roles.map((r) => (r.people.length ? `${r.role} (${andNames(r.people)})` : `${r.role} (nobody seated)`))
  const byRole = parts.length ? `By their role, ${andNames(parts)} may ${what}.` : `No role here may ${what}.`
  if (!grants.length) return `${byRole} Nobody has been given it beyond their role.`
  return `${byRole} Given beyond their role: ${grants.length === 1 ? 'one grant' : `${grants.length} grants`}, listed below.`
}

export function whoHoldsTable(roles: readonly RoleHolders[], grants: readonly GrantHeld[]): { caption: string; head: string[]; rows: { cells: string[] }[] } {
  return {
    caption: 'Who holds it',
    head: ['Who', 'How', 'Given by'],
    rows: [
      ...roles.map((r) => ({ cells: [r.people.length ? andNames(r.people) : 'Nobody seated', `Their role, ${r.role}`, '—'] })),
      ...grants.map((g) => ({ cells: [g.says.replace(/\.$/, ''), g.reason ? `Given: ${g.reason}` : 'Given', g.grantedBy] })),
    ],
  }
}

// ── "Let Maya read margin for the Dayton team" ───────────────────────

export interface GiveAccessAsked {
  /** The words naming who: "Maya", "the recruiters", "everybody in Recruiter". */
  who: string
  permission: Permission
  scope: 'COMPANY' | 'UNIT' | 'PERSON'
  /** The words naming the team, where the scope is a team. */
  team: string | null
  /** The sentence as typed, kept as the grant's reason. */
  quote: string
}

const COMPANY_WORDS = /^(the )?(whole )?(company|firm|business)$|^(everything|everyone|all|across the (company|firm))$/
const OWN_WORDS = /^(their|her|his|your) own( work)?$|^themselves$|^herself$|^himself$/

/**
 * "Let Maya read margin for the Dayton team", "Allow the recruiters to see
 * payroll", "Give Dana access to rates for the whole company": what the
 * Owner asked to give, or null where the sentence is not that.
 */
export function readGiveAccess(raw: string): GiveAccessAsked | null {
  const quote = raw.trim().replace(/\s+/g, ' ')
  const text = quote.replace(/[.?!]+$/, '')
  const m =
    text.match(/^(?:please )?(?:let|allow)\s+(.+?)\s+(?:to\s+)?(?:read|see|view|open)\s+(.+)$/i) ??
    text.match(/^(?:please )?give\s+(.+?)\s+(?:access to|the right to (?:read|see)|a read of)\s+(.+)$/i)
  if (!m) return null
  const who = m[1].trim()
  // "Let me see margin" is somebody asking to read it, not giving it.
  if (/^(me|us|myself|ourselves)$/i.test(who)) return null
  let rest = m[2].trim()
  let scope: GiveAccessAsked['scope'] = 'COMPANY'
  let team: string | null = null
  const at = rest.match(/^(.+?)\s+(?:for|across|in|on|at)\s+(.+)$/i)
  if (at) {
    rest = at[1].trim()
    const where = at[2].trim().toLowerCase()
    if (OWN_WORDS.test(where)) scope = 'PERSON'
    else if (!COMPANY_WORDS.test(where)) {
      scope = 'UNIT'
      team = at[2].trim().replace(/^the\s+/i, '').replace(/\s+(team|teams|office|unit)$/i, '').trim()
    }
  }
  const permission = permissionNamed(rest.toLowerCase())
  if (!permission || !who) return null
  return { who, permission, scope, team: team || null, quote }
}

export interface GrantOffer {
  canGive: boolean
  isOwner: boolean
  permissions: { key: string; label: string; personOnly: boolean; scopes: readonly string[] }[]
  roles: { id: string; name: string }[]
  people: { contextId: string; name: string; roleName: string | null }[]
  units: { id: string; name: string; parentId: string | null }[]
}

/** What the card's yes posts to POST /api/settings/grants, exactly the dialog's body. */
export interface GrantBody {
  permission: string
  roleId: string | null
  contextId: string | null
  scope: 'COMPANY' | 'UNIT' | 'PERSON'
  orgUnitId: string | null
  reason: string
}

export type GiveAccessDraft =
  | { ok: true; question: string; under: string; body: GrantBody
      /** The parts, for the sentence that sends the Owner to the page where no card can be drawn. */
      holder: string; what: string; reach: string }
  | { ok: false; says: string }

const norm = (s: string) => s.trim().toLowerCase().replace(/^(the|all|every|everybody in|everyone in|all the)\s+/, '').replace(/\s+/g, ' ')
const singular = (s: string) => s.replace(/(ies)$/, 'y').replace(/([^s])s$/, '$1')

function findRole(words: string, roles: GrantOffer['roles']): GrantOffer['roles'][number] | null {
  const w = norm(words)
  return roles.find((r) => {
    const n = r.name.toLowerCase()
    return n === w || n === singular(w) || singular(n) === singular(w)
  }) ?? null
}

function findPeople(words: string, people: GrantOffer['people']): GrantOffer['people'] {
  const w = norm(words)
  const full = people.filter((p) => p.name.toLowerCase() === w)
  if (full.length) return full
  return people.filter((p) => p.name.toLowerCase().split(/\s+/)[0] === w)
}

function findUnits(words: string, units: GrantOffer['units']): GrantOffer['units'] {
  const w = norm(words)
  const exact = units.filter((u) => norm(u.name) === w)
  return exact.length ? exact : units.filter((u) => norm(u.name).includes(w))
}

/**
 * The card for what the Owner asked, read against the people, roles and
 * teams Give access offers, or the one sentence that says why there is no
 * card. A card is drawn only where the route would take its yes as far as
 * these facts can tell: the seat may give access, the permission may go
 * that far, and a payroll or profit-and-loss right goes to a person.
 */
export function draftGiveAccess(asked: GiveAccessAsked, offer: GrantOffer): GiveAccessDraft {
  const what = label(asked.permission)
  if (!offer.canGive) return { ok: false, says: 'Only the Owner gives access here, or somebody the Owner has given that right to by name.' }

  const role = findRole(asked.who, offer.roles)
  const people = role ? [] : findPeople(asked.who, offer.people)
  if (!role && people.length > 1) {
    return { ok: false, says: `More than one person here is called ${asked.who.trim()}: ${andNames(people.map((p) => p.name))}. Say the full name.` }
  }
  const person = people[0] ?? null
  if (!role && !person) return { ok: false, says: `Nobody and no role here is called ${asked.who.trim()}. Say a person’s name or a role.` }

  const offered = offer.permissions.find((p) => p.key === asked.permission)
  if (!offered) return { ok: false, says: `Access to ${what} is not something this list gives.` }
  if (offered.personOnly && role) {
    return { ok: false, says: `The right to ${what} goes to one person by name, never to a role. Say the person.` }
  }
  if (offered.personOnly && !offer.isOwner) return { ok: false, says: `Only the Owner gives somebody the right to ${what}.` }

  let unit: GrantOffer['units'][number] | null = null
  if (asked.scope === 'UNIT') {
    const found = findUnits(asked.team ?? '', offer.units)
    if (found.length > 1) return { ok: false, says: `More than one team matches ${asked.team}: ${andNames(found.map((u) => u.name))}. Say which.` }
    unit = found[0] ?? null
    if (!unit) return { ok: false, says: `There is no team called ${asked.team} in your org tree. Say a team from your org tree.` }
  }
  if (!offered.scopes.includes(asked.scope)) {
    return {
      ok: false,
      says: `Etyme does not yet narrow the right to ${what} to one team or to somebody’s own work, so a narrower grant would open the whole company’s. Ask to give it for the whole company, or wait until that page reads by team.`,
    }
  }

  const holder = role ? `everybody in ${role.name}` : person!.name
  const reach = asked.scope === 'COMPANY' ? 'the company' : asked.scope === 'PERSON' ? 'their own work' : teamWords([unit!.name])
  const under = asked.scope === 'UNIT'
    ? `It reaches ${unit!.name} and every team under it. Revoke takes it back on Users & permissions.`
    : 'Revoke takes it back on Users & permissions.'
  return {
    ok: true,
    holder: role ? `everybody in ${role.name}` : person!.name,
    what,
    reach: asked.scope === 'COMPANY' ? 'the whole company' : asked.scope === 'PERSON' ? 'only their own work' : `the team ${unit!.name}`,
    question: `Give ${holder} the right to ${what} for ${reach}?`,
    under,
    body: {
      permission: asked.permission,
      roleId: role?.id ?? null,
      contextId: role ? null : person!.contextId,
      scope: asked.scope,
      orgUnitId: unit?.id ?? null,
      reason: `Asked in Ask Etyme: “${asked.quote}”`,
    },
  }
}
