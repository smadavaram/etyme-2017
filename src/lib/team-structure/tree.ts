/**
 * Team structure is one tree the Owner draws (founder, 2026-11-09, "Build
 * it", on the drawing of Corvane Packaging). The company at the top, then
 * departments, regions, sites and teams; each box has one named lead, its
 * people, its contractors, its open jobs, its nearest time limit and the
 * countries, currencies and time zones under it.
 *
 * This file is the tree's rules with no database in them: the order of
 * the boxes beside each other, what a move may not do, what a delete
 * moves up and when it is refused, what a box rolls up, and the sentence
 * each says. `read.ts` and `write.ts` are the database half.
 *
 * One consequence the drawing does not show and the screen must say: the
 * box a seat sits on decides what it reads. A seat on a REGION box reads
 * that region's sites and nothing else, a seat on a SITE box that site
 * (lib/region-scope, app/api/program/reader-scope), and a seat on any
 * other box the whole company, unless the company turned account walls
 * on (lib/account-walls). So moving a person, deleting the box they sit
 * on, or changing its kind can change what they read, and every one of
 * those acts says so in its sentence. Being a box's lead changes nothing
 * they read: a lead is a name, never a permission.
 */

export const SHOW_NAMES = 10

/** The kinds a person picks from; the older kinds still read in words. */
export const KINDS_OFFERED = ['DEPARTMENT', 'REGION', 'SITE', 'TEAM'] as const
export const KIND_WORDS: Record<string, string> = {
  DEPARTMENT: 'Department',
  REGION: 'Region',
  SITE: 'Site',
  TEAM: 'Team',
  BU: 'Business unit',
  PRACTICE: 'Practice',
  ACCOUNT: 'Account',
  PROJECT: 'Project',
}
export const kindWord = (kind: string) => KIND_WORDS[kind] ?? 'Team'
export const isKnownKind = (kind: string) => Object.prototype.hasOwnProperty.call(KIND_WORDS, kind)

export interface UnitRow {
  id: string
  parentId: string | null
  name: string
  kind: string
  position: number | null
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const and = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

/** The boxes directly under a parent (null is the company), in the Owner's order: numbered first, then by name. */
export function childrenOf<T extends UnitRow>(units: readonly T[], parentId: string | null): T[] {
  return units
    .filter((u) => (u.parentId ?? null) === parentId)
    .sort((a, b) => {
      const pa = a.position ?? Number.MAX_SAFE_INTEGER
      const pb = b.position ?? Number.MAX_SAFE_INTEGER
      return pa - pb || a.name.localeCompare(b.name)
    })
}

/** Whether `id` is `ancestorId` or anywhere below it. Bounded, so a cycle in old data cannot hang a request. */
export function isAtOrUnder(units: readonly UnitRow[], id: string | null, ancestorId: string): boolean {
  const byId = new Map(units.map((u) => [u.id, u]))
  let at: string | null = id
  for (let i = 0; at && i < 64; i++) {
    if (at === ancestorId) return true
    at = byId.get(at)?.parentId ?? null
  }
  return false
}

/** The boxes above a box, nearest first, not counting itself. */
export function ancestorsOf(units: readonly UnitRow[], id: string): UnitRow[] {
  const byId = new Map(units.map((u) => [u.id, u]))
  const out: UnitRow[] = []
  let at = byId.get(id)?.parentId ?? null
  for (let i = 0; at && i < 64; i++) {
    const u = byId.get(at)
    if (!u || out.includes(u)) break
    out.push(u)
    at = u.parentId
  }
  return out
}

/** The nearest REGION at or above `id` (null is the company), which is the region label a site under it carries. */
export function regionAt(units: readonly UnitRow[], id: string | null): UnitRow | null {
  if (!id) return null
  const self = units.find((u) => u.id === id)
  if (!self) return null
  return [self, ...ancestorsOf(units, id)].find((u) => u.kind === 'REGION') ?? null
}

/** The kind a new box takes from the box it is put under: a department under the company, a region under a department, a site under a region, a team elsewhere. */
export function kindUnder(parentKind: string | null): string {
  if (parentKind === null) return 'DEPARTMENT'
  if (parentKind === 'DEPARTMENT') return 'REGION'
  if (parentKind === 'REGION') return 'SITE'
  return 'TEAM'
}

// ── Moving a box ─────────────────────────────────────────────────────

export type Verdict = { ok: true } | { ok: false; says: string }

export function checkMove(units: readonly UnitRow[], unitId: string, parentId: string | null): Verdict {
  const unit = units.find((u) => u.id === unitId)
  if (!unit) return { ok: false, says: 'That box is not on your team structure.' }
  if (parentId !== null && !units.some((u) => u.id === parentId)) return { ok: false, says: 'The box you dropped it on is not on your team structure.' }
  if (parentId !== null && isAtOrUnder(units, parentId, unitId)) return { ok: false, says: 'A box cannot go under itself or a box below it.' }
  return { ok: true }
}

/**
 * The ids of the boxes under `parentId` once `unitId` is put there at
 * place `at` (0 first; null or past the end is last). The box is taken out
 * of wherever it was first, so a move along one row keeps everybody else
 * in order.
 */
export function orderAfterMove(units: readonly UnitRow[], unitId: string, parentId: string | null, at: number | null): string[] {
  const row = childrenOf(units, parentId).map((u) => u.id).filter((id) => id !== unitId)
  const place = at === null || at < 0 || at > row.length ? row.length : at
  row.splice(place, 0, unitId)
  return row
}

// ── What a seat reads, by the box it sits on ─────────────────────────

export type Reach = { kind: 'REGION' | 'SITE' | 'UNIT'; label: string } | { kind: 'COMPANY' }

/**
 * What a seat on this box reads, in the record's own terms: a REGION box
 * narrows to the region, a SITE box to the site, any other box to itself
 * and below only where account walls are on, and no box is the whole
 * company.
 */
export function reachOf(unit: Pick<UnitRow, 'kind' | 'name'> | null, accountWalls: boolean): Reach {
  if (!unit) return { kind: 'COMPANY' }
  if (unit.kind === 'REGION') return { kind: 'REGION', label: unit.name }
  if (unit.kind === 'SITE') return { kind: 'SITE', label: unit.name }
  return accountWalls ? { kind: 'UNIT', label: unit.name } : { kind: 'COMPANY' }
}

export function reachWords(r: Reach, companyName: string): string {
  if (r.kind === 'COMPANY') return `the whole of ${companyName}`
  if (r.kind === 'UNIT') return `only ${r.label} and the teams under it`
  return `only ${r.label}`
}

const sameReach = (a: Reach, b: Reach) => a.kind === b.kind && (a.kind === 'COMPANY' || (b.kind !== 'COMPANY' && a.label === b.label))

/** "Valeria Montes will read the whole of Corvane Packaging rather than only Latin America." Empty where nothing changes. */
export function reachChangeSays(names: string[], before: Reach, after: Reach, companyName: string): string {
  if (!names.length || sameReach(before, after)) return ''
  const who = names.length > 3 ? `${and(names.slice(0, 3))} and ${plural(names.length - 3, 'other')}` : and(names)
  return `${who} will read ${reachWords(after, companyName)} rather than ${reachWords(before, companyName)}.`
}

// ── Deleting a box ───────────────────────────────────────────────────

export interface DeleteFacts {
  unit: UnitRow
  parent: UnitRow | null
  companyName: string
  childNames: string[]
  people: string[]
  /** Contractors on a live line charged to this box. */
  contractors: number
  /** Things that hold the box and must be moved by their own screen first. */
  holds: { what: string; where: string }[]
  accountWalls: boolean
}

/**
 * Whether a box may be deleted, and what the confirmation says. What was
 * under it moves up one level, teams and people; contractors charged to a
 * box that is not a site move up with it. A site with contractors at it
 * is refused: the contractors' lines are charged to it, and deleting the
 * place a contractor works is not a team change. A box that rules,
 * budgets, orders or access grants name is refused too, because moving
 * those up one level would widen them, and they each have a screen of
 * their own.
 */
export function deletePlan(f: DeleteFacts): { ok: false; says: string } | { ok: true; says: string; movesUpTo: string | null } {
  const up = f.parent?.name ?? f.companyName
  if (f.unit.kind === 'SITE' && f.contractors > 0) {
    return {
      ok: false,
      says: `${f.unit.name} has ${plural(f.contractors, 'contractor')} charged to it. Move them to another box first. A site with contractors at it cannot be deleted.`,
    }
  }
  if (f.holds.length) {
    const what = and([...new Set(f.holds.map((h) => h.what))])
    const where = and([...new Set(f.holds.map((h) => h.where))])
    return { ok: false, says: `${cap(what)} name ${f.unit.name}. Move them under ${where} first, so nothing reaches wider by accident.` }
  }
  const moving = [
    f.childNames.length ? `its ${plural(f.childNames.length, 'team')}` : '',
    f.people.length ? plural(f.people.length, 'person', 'people') : '',
    f.contractors ? plural(f.contractors, 'contractor') : '',
  ].filter(Boolean)
  const reach = reachChangeSays(f.people, reachOf(f.unit, f.accountWalls), reachOf(f.parent, f.accountWalls), f.companyName)
  const says = moving.length
    ? `Delete ${f.unit.name}? ${cap(and(moving))} move up under ${up}. Nobody's history or time on site changes.${reach ? ` ${reach}` : ''}`
    : `Delete ${f.unit.name}? Nothing is under it.`
  return { ok: true, says, movesUpTo: f.parent?.id ?? null }
}

// ── What a box rolls up ──────────────────────────────────────────────

export interface UnitFacts {
  people: number
  contractors: number
  openJobs: number
  /** Days to the nearest time limit among this box's own contractors; null where no limit is set or nobody is counted. */
  nearestLimitDays: number | null
  countries: string[]
  currencies: string[]
  timeZones: string[]
}

export interface RollUp extends UnitFacts {
  sites: number
  teams: number
}

const merge = (a: string[], b: string[]) => [...new Set([...a, ...b])].sort()

/** Each box with everything under it added in. A time limit is the smallest, never a sum. */
export function rollUp(units: readonly UnitRow[], own: ReadonlyMap<string, UnitFacts>): Map<string, RollUp> {
  const out = new Map<string, RollUp>()
  const empty: UnitFacts = { people: 0, contractors: 0, openJobs: 0, nearestLimitDays: null, countries: [], currencies: [], timeZones: [] }
  const visit = (u: UnitRow, depth: number): RollUp => {
    const mine = own.get(u.id) ?? empty
    const r: RollUp = { ...mine, countries: [...mine.countries], currencies: [...mine.currencies], timeZones: [...mine.timeZones], sites: u.kind === 'SITE' ? 1 : 0, teams: 0 }
    if (depth < 64) {
      for (const c of childrenOf(units, u.id)) {
        const k = visit(c, depth + 1)
        r.people += k.people
        r.contractors += k.contractors
        r.openJobs += k.openJobs
        r.sites += k.sites
        r.teams += 1
        r.nearestLimitDays = k.nearestLimitDays === null ? r.nearestLimitDays : r.nearestLimitDays === null ? k.nearestLimitDays : Math.min(r.nearestLimitDays, k.nearestLimitDays)
        r.countries = merge(r.countries, k.countries)
        r.currencies = merge(r.currencies, k.currencies)
        r.timeZones = merge(r.timeZones, k.timeZones)
      }
    }
    out.set(u.id, r)
    return r
  }
  for (const top of childrenOf(units, null)) visit(top, 0)
  return out
}

/** The one line of figures under a box's lead: "14 people · 2 open jobs · limit in 18 days". */
export function boxLine(r: Pick<RollUp, 'people' | 'contractors' | 'openJobs' | 'nearestLimitDays'>): string {
  return [
    plural(r.people, 'person', 'people'),
    r.contractors ? plural(r.contractors, 'contractor') : '',
    r.openJobs ? plural(r.openJobs, 'open job') : '',
    r.nearestLimitDays !== null && r.nearestLimitDays <= 30
      ? r.nearestLimitDays < 0 ? 'past the time limit' : `limit in ${plural(r.nearestLimitDays, 'day')}`
      : '',
  ].filter(Boolean).join(' · ')
}

/** The names a box shows, and the "and N more" under them. */
export function namesShown<T>(names: readonly T[], all: boolean): { shown: T[]; more: number } {
  if (all || names.length <= SHOW_NAMES) return { shown: [...names], more: 0 }
  return { shown: names.slice(0, SHOW_NAMES), more: names.length - SHOW_NAMES }
}
