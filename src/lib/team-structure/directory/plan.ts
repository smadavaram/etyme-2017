import type { DirectoryPerson } from './csv'

/**
 * What a directory would change on the tree, shown before anything is
 * made (founder, 2026-11-09). Pure: the directory's people on one side,
 * the tree and the seats on the other, and a list of changes the Owner or
 * Admin ticks. The rules, in the decision's words:
 *
 *   - `department` becomes a box; `manager` its lead and the box above;
 *     `officeLocation` the site, matched to Settings → Sites by name;
 *     `country` the site's country; `jobTitle` the role beside the name.
 *   - Nothing is deleted. A box no longer in the directory is shown, not
 *     removed.
 *   - An edit made on the screen wins: where the tree was last changed by
 *     a person on the screen and the directory disagrees, the change is
 *     listed as "asks you", unticked.
 *   - A department already on the tree is matched, never re-parented by
 *     the file: a move of an existing box, and replacing a lead the
 *     company already named, always ask, unticked. And a lead is read off
 *     the directory only where most of the box's people report to them,
 *     counting the seats on the record under the box as well as the
 *     file's rows (walk 10: one row of thirty-seven moved Operations).
 *   - A seat moved off a region or a site reads more than it did, so that
 *     move asks too.
 *   - People are matched to their seats by email and nothing else. A
 *     person with no seat is never made one; they are listed as an
 *     invitation to send.
 *   - Contractors are not in a directory and are never moved.
 *
 * Two readings the decision left open, each a coordinator's call:
 *   - A department's lead is the manager more than half its people report
 *     to (ties by name). The box above it is that lead's own department
 *     where it differs, else the department of the lead's manager.
 *   - A directory that names no box above a department never moves the
 *     box: silence is not an instruction to put it at the top.
 *
 * The job title is shown and never written: a role in Etyme is a set of
 * permissions, changed under Users & permissions, never by an import.
 */

export interface PlanUnit {
  id: string
  parentId: string | null
  name: string
  kind: string
  leadContextId: string | null
  /** The box's place or lead was last set by a person on the screen. */
  movedOnScreen: boolean
  leadOnScreen: boolean
}

export interface PlanSeat {
  contextId: string
  email: string
  name: string
  orgUnitId: string | null
  movedOnScreen: boolean
  /** Holds settings.manage: never put on a region or a site (lib/team-structure/write). */
  setsUp: boolean
}

export interface PlanSite {
  /** The SITE box standing for the site. */
  unitId: string
  /** The site's name on Settings → Sites. */
  name: string
  country: string
}

export type Ref = { id: string } | { newDepartment: string }

export type Op =
  | { act: 'ADD'; name: string; parent: Ref | null }
  | { act: 'MOVE'; unit: Ref; parent: Ref }
  | { act: 'LEAD'; unit: Ref; contextId: string }
  | { act: 'MOVE_PERSON'; contextId: string; unit: Ref }

export interface Change {
  key: string
  tag: 'ADD' | 'MOVE' | 'LEAD' | 'PERSON' | 'ASKS'
  says: string
  /** Ticked when the preview opens. */
  ticked: boolean
  /** Whether a tick can make it; an "asks you" line that only informs cannot. */
  tickable: boolean
  op: Op | null
}

export interface Plan {
  changes: Change[]
  invitations: { name: string; email: string; department: string | null; jobTitle: string | null }[]
  /** Boxes on the tree the directory does not name: shown, never removed. */
  kept: string[]
}

const key = (s: string) => s.trim().toLowerCase()
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const NARROWING = new Set(['REGION', 'SITE'])

type Lead = { person: DirectoryPerson | { email: string; name: string }; reporting: number; of: number; most: boolean } | null

/** "Operations'" and "Finance's": the possessive a person writes. */
export const possessive = (name: string) => (/s$/i.test(name.trim()) ? `${name.trim()}'` : `${name.trim()}'s`)

export function planFromDirectory(input: {
  people: readonly DirectoryPerson[]
  units: readonly PlanUnit[]
  seats: readonly PlanSeat[]
  sites: readonly PlanSite[]
  companyName: string
}): Plan {
  const { people, units, seats, sites, companyName } = input
  const byEmail = new Map(people.map((p) => [p.email, p]))
  const seatByEmail = new Map(seats.map((s) => [key(s.email), s]))
  const unitByName = new Map<string, PlanUnit>()
  for (const u of units) if (!unitByName.has(key(u.name))) unitByName.set(key(u.name), u)
  const unitById = new Map(units.map((u) => [u.id, u]))
  const siteByName = new Map(sites.map((s) => [key(s.name), s]))

  // ── The departments, each with its lead and the department above ──
  const departments = new Map<string, { name: string; members: DirectoryPerson[] }>()
  for (const p of people) {
    if (!p.department) continue
    const k = key(p.department)
    if (!departments.has(k)) departments.set(k, { name: p.department.trim(), members: [] })
    departments.get(k)!.members.push(p)
  }
  // A box's people are the seats on the record under it and the file's
  // people in its department, counted once: a five-row file speaks for the
  // five, never for the thirty-seven the record already holds (walk 10).
  const under = (rootId: string) => {
    const ids = new Set<string>([rootId])
    for (let grew = true; grew;) {
      grew = false
      for (const u of units) if (u.parentId && ids.has(u.parentId) && !ids.has(u.id)) { ids.add(u.id); grew = true }
    }
    return ids
  }
  const leadOf = new Map<string, Lead>()
  for (const [k, d] of departments) {
    const counts = new Map<string, number>()
    for (const m of d.members) if (m.manager && m.manager !== m.email) counts.set(m.manager, (counts.get(m.manager) ?? 0) + 1)
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? null
    const existing = unitByName.get(k) ?? null
    const people = new Set<string>(d.members.map((m) => m.email))
    if (existing) {
      const ids = under(existing.id)
      for (const s of seats) if (s.orgUnitId && ids.has(s.orgUnitId)) people.add(key(s.email))
    }
    if (!top) { leadOf.set(k, null); continue }
    const [email, reporting] = top
    leadOf.set(k, { person: byEmail.get(email) ?? { email, name: seatByEmail.get(email)?.name ?? email }, reporting, of: people.size, most: reporting * 2 > people.size })
  }
  const above = new Map<string, string | null>()
  for (const k of departments.keys()) {
    const lead = leadOf.get(k)
    // The box above is read off the lead, so only a lead most of the box's
    // people report to may say where the box sits.
    const full = lead?.most && 'department' in lead.person ? lead.person : null
    let parent: string | null = null
    if (full?.department && key(full.department) !== k) parent = key(full.department)
    else if (full?.manager) {
      const boss = byEmail.get(full.manager)
      if (boss?.department && key(boss.department) !== k) parent = key(boss.department)
    }
    above.set(k, parent && departments.has(parent) ? parent : null)
  }
  // A loop in the directory (A under B under A) is not followed.
  for (const k of departments.keys()) {
    const seen = new Set<string>([k])
    let at = above.get(k) ?? null
    while (at) {
      if (seen.has(at)) { above.set(k, null); break }
      seen.add(at)
      at = above.get(at) ?? null
    }
  }

  const changes: Change[] = []
  const refOf = (k: string): Ref => {
    const u = unitByName.get(k)
    return u ? { id: u.id } : { newDepartment: departments.get(k)!.name }
  }
  const nameOfRef = (r: Ref | null) => (!r ? companyName : 'id' in r ? unitById.get(r.id)?.name ?? companyName : r.newDepartment)
  const sameRef = (r: Ref | null, id: string | null) => (r === null ? id === null : 'id' in r && r.id === id)

  for (const [k, d] of departments) {
    const existing = unitByName.get(k) ?? null
    const parentKey = above.get(k) ?? null
    const parent = parentKey ? refOf(parentKey) : null
    const lead = leadOf.get(k) ?? null
    const leadSeat = lead?.most ? seatByEmail.get(key(lead.person.email)) ?? null : null
    const count = lead ? `${lead.reporting} of its ${plural(lead.of, 'person', 'people')} report to ${lead.person.name} in the directory` : ''

    if (!existing) {
      changes.push({
        key: `add:${k}`, tag: 'ADD', ticked: true, tickable: true,
        op: { act: 'ADD', name: d.name, parent },
        says: `New department "${d.name}" under ${nameOfRef(parent)}${leadSeat ? `, led by ${leadSeat.name}` : ''}. ${plural(d.members.length, 'person is', 'people are')} in the ${d.name} department in the directory.`,
      })
    } else if (parent && !sameRef(parent, existing.parentId)) {
      // A department already drawn is matched, and moving it is always the
      // Owner's to say: asked, unticked.
      changes.push({
        key: `move:${existing.id}`, tag: 'ASKS', ticked: false, tickable: true, op: { act: 'MOVE', unit: { id: existing.id }, parent },
        says: `The directory puts ${existing.name} under ${nameOfRef(parent)}, where it sits under ${nameOfRef(existing.parentId ? { id: existing.parentId } : null)}: ${count}. It stays unless you tick this.`,
      })
    }

    if (leadSeat && (!existing || existing.leadContextId !== leadSeat.contextId)) {
      const was = existing?.leadContextId ? seats.find((s) => s.contextId === existing.leadContextId)?.name ?? 'somebody no longer seated' : null
      if (!existing) {
        changes.push({ key: `lead:new:${k}`, tag: 'LEAD', ticked: true, tickable: true, op: { act: 'LEAD', unit: { newDepartment: d.name }, contextId: leadSeat.contextId }, says: `${leadSeat.name} leads ${d.name}: ${count}.` })
      } else if (was) {
        // A lead the company already named is replaced only on the Owner's tick.
        changes.push({
          key: `lead:${existing.id}`, tag: 'ASKS', ticked: false, tickable: true, op: { act: 'LEAD', unit: { id: existing.id }, contextId: leadSeat.contextId },
          says: `${possessive(existing.name)} lead is ${was}. The directory says ${leadSeat.name}: ${count}. ${was} stays unless you tick this.`,
        })
      } else {
        changes.push({ key: `lead:${existing.id}`, tag: 'LEAD', ticked: true, tickable: true, op: { act: 'LEAD', unit: { id: existing.id }, contextId: leadSeat.contextId }, says: `${leadSeat.name} leads ${existing.name}: ${count}.` })
      }
    }
  }

  // ── People, by email only ──
  const invitations: Plan['invitations'] = []
  for (const p of people) {
    const seat = seatByEmail.get(key(p.email))
    if (!seat) {
      invitations.push({ name: p.name, email: p.email, department: p.department, jobTitle: p.jobTitle })
      continue
    }
    const site = p.officeLocation ? siteByName.get(key(p.officeLocation)) ?? null : null
    if (site && p.country && key(p.country) !== key(site.country)) {
      changes.push({ key: `country:${seat.contextId}`, tag: 'ASKS', ticked: false, tickable: false, op: null, says: `The directory puts ${p.name}'s office, ${site.name}, in ${p.country}; Sites says ${site.country}. Correct whichever is wrong; nothing is changed here.` })
    }
    const target: Ref | null = p.department ? refOf(key(p.department)) : site ? { id: site.unitId } : null
    if (!target) {
      if (seat.orgUnitId === null) changes.push({ key: `none:${seat.contextId}`, tag: 'ASKS', ticked: false, tickable: false, op: null, says: `${p.name} is in no department in the directory. Stays where they are until you say.` })
      continue
    }
    if (sameRef(target, seat.orgUnitId)) continue
    const targetKind = 'id' in target ? unitById.get(target.id)?.kind ?? null : 'DEPARTMENT'
    const from = seat.orgUnitId ? unitById.get(seat.orgUnitId)?.name ?? 'no team' : 'no team'
    const says = `${p.name} moves from ${from} to ${nameOfRef(target)}${p.department ? `: the directory's department is ${p.department}` : `: the directory's office is ${site!.name}`}${p.jobTitle ? ` (${p.jobTitle})` : ''}.`
    if (seat.setsUp && targetKind && NARROWING.has(targetKind)) {
      changes.push({ key: `person:${seat.contextId}`, tag: 'ASKS', ticked: false, tickable: false, op: null, says: `${says} ${seat.name} sets up ${companyName}, and a seat on a region or a site loses Settings, so this is not made.` })
      continue
    }
    const fromKind = seat.orgUnitId ? unitById.get(seat.orgUnitId)?.kind ?? null : null
    if (!seat.movedOnScreen && fromKind && NARROWING.has(fromKind) && targetKind !== fromKind) {
      // Off a region or a site, a seat reads more than it did: the Owner says so.
      changes.push({ key: `person:${seat.contextId}`, tag: 'ASKS', ticked: false, tickable: true, op: { act: 'MOVE_PERSON', contextId: seat.contextId, unit: target }, says: `${says} ${seat.name} reads only ${from} today, so this stays unless you tick it.` })
      continue
    }
    changes.push(seat.movedOnScreen
      ? { key: `person:${seat.contextId}`, tag: 'ASKS', ticked: false, tickable: true, op: { act: 'MOVE_PERSON', contextId: seat.contextId, unit: target }, says: `${says} They were placed on this screen, so they stay unless you tick this.` }
      : { key: `person:${seat.contextId}`, tag: 'PERSON', ticked: true, tickable: true, op: { act: 'MOVE_PERSON', contextId: seat.contextId, unit: target }, says })
  }

  const kept = units
    .filter((u) => (u.kind === 'DEPARTMENT' || u.kind === 'TEAM') && !departments.has(key(u.name)))
    .map((u) => `${u.name} is not in your directory. It stays on the tree.`)

  return { changes, invitations, kept }
}

/** The order the ticked changes are made in: new boxes first (parents before children), then moves, leads, people. */
export function applyOrder(changes: readonly Change[]): Change[] {
  const rank = (c: Change) => (c.op?.act === 'ADD' ? 0 : c.op?.act === 'MOVE' ? 1 : c.op?.act === 'LEAD' ? 2 : 3)
  const adds = changes.filter((c) => c.op?.act === 'ADD')
  const ordered: Change[] = []
  const placed = new Set<string>()
  for (let guard = 0; ordered.length < adds.length && guard < adds.length + 1; guard++) {
    for (const c of adds) {
      if (ordered.includes(c)) continue
      const op = c.op as Extract<Op, { act: 'ADD' }>
      const waitsOn = op.parent && 'newDepartment' in op.parent ? key(op.parent.newDepartment) : null
      if (!waitsOn || placed.has(waitsOn) || !adds.some((a) => key((a.op as Extract<Op, { act: 'ADD' }>).name) === waitsOn)) {
        ordered.push(c)
        placed.add(key(op.name))
      }
    }
  }
  for (const c of adds) if (!ordered.includes(c)) ordered.push(c)
  return [...ordered, ...changes.filter((c) => c.op && c.op.act !== 'ADD').sort((a, b) => rank(a) - rank(b))]
}
