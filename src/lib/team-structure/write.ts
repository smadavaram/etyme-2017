import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import type { ActRequest } from './acts'
import {
  checkMove,
  childrenOf,
  deletePlan,
  isAtOrUnder,
  kindUnder,
  kindWord,
  orderAfterMove,
  reachChangeSays,
  reachOf,
  regionAt,
  type UnitRow,
} from './tree'

/**
 * The tree's writes: every act on Settings → Team structure and every
 * change a directory import makes, in one transaction each, each kept as
 * an `OrgChange` with who, when, the sentence said, where it came from and
 * what puts it back. The rules are `tree.ts`; this finds the facts and
 * writes.
 *
 * Kept true on the way, because the record reads the tree in two places
 * by name: a REGION box's sites carry its name as their region label, and
 * a SITE box stands for the site of the same name. So renaming a region
 * renames the label on its sites, renaming a site box renames its site,
 * and moving a site box under another region gives its site that
 * region's label, each said in the sentence.
 *
 * And one refusal the drawing did not need: a seat that sets the company
 * up (settings.manage) is never put on a REGION or SITE box, by a move, a
 * delete or a change of kind. A seat there reads only its region or site,
 * and the door refuses it everything else, the team structure included,
 * so the Owner could lock the company out of its own settings.
 */

export interface Writer {
  companyId: string
  companyName: string
  accountWalls: boolean
  personId: string
  personName: string
}

export type Source = 'SCREEN' | 'DIRECTORY'
export type Done = { ok: true; says: string; changeId: string; unitId?: string | null } | { ok: false; status: number; says: string; field?: string }

type Tx = Prisma.TransactionClient
type Unit = UnitRow & { locationId: string | null; leadContextId: string | null; leadSetById: string | null; leadSetAt: Date | null }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const no = (says: string, status = 422, field?: string): Done => ({ ok: false, status, says, ...(field ? { field } : {}) })
const NARROWING = new Set(['REGION', 'SITE'])

async function unitsOf(tx: Tx, companyId: string): Promise<Unit[]> {
  return tx.orgUnit.findMany({
    where: { companyId },
    select: { id: true, parentId: true, name: true, kind: true, position: true, locationId: true, leadContextId: true, leadSetById: true, leadSetAt: true },
  })
}

async function seatsAt(tx: Tx, companyId: string, where: Prisma.ContextWhereInput) {
  const rows = await tx.context.findMany({
    where: { companyId, revokedAt: null, ...where },
    select: { id: true, orgUnitId: true, person: { select: { name: true } }, role: { select: { permissions: true } } },
  })
  return rows.map((r) => ({ id: r.id, orgUnitId: r.orgUnitId, name: r.person.name, setsUp: hasPermission(r.role?.permissions ?? [], 'settings.manage') }))
}

/** "Graham Ellery sets up Corvane Packaging, and a seat on a region reads only that region and loses Settings." */
function setupSeatSays(names: string[], companyName: string, where: string): string {
  const who = names.length === 1 ? `${names[0]} sets up ${companyName}` : `${names.join(' and ')} set up ${companyName}`
  return `${who}, and a seat on ${where} reads only that place and loses Settings, this screen included. Move somebody who does not set up the company, or change their role under Users & permissions first.`
}

/** Write one change, or `null` where the change is refused. Positions are renumbered 1… along a row. */
async function placeRow(tx: Tx, ids: string[]) {
  for (let i = 0; i < ids.length; i++) await tx.orgUnit.update({ where: { id: ids[i] }, data: { position: i + 1 } })
}

async function record(
  tx: Tx,
  w: Writer,
  source: Source,
  act: string,
  says: string,
  about: { orgUnitId?: string | null; contextId?: string | null; sellContractId?: string | null },
  undo: Prisma.InputJsonValue | null
) {
  const c = await tx.orgChange.create({
    data: {
      companyId: w.companyId, actorPersonId: w.personId, act, source, says,
      orgUnitId: about.orgUnitId ?? null, contextId: about.contextId ?? null, sellContractId: about.sellContractId ?? null,
      undo: undo ?? Prisma.JsonNull,
    },
    select: { id: true },
  })
  return c.id
}

/** The site labels under a subtree that change once its boxes sit where `units` says. */
function siteRegions(units: readonly Unit[], rootId: string): { locationId: string; region: string | null }[] {
  const out: { locationId: string; region: string | null }[] = []
  for (const u of units) {
    if (u.kind !== 'SITE' || !u.locationId || !isAtOrUnder(units, u.id, rootId)) continue
    out.push({ locationId: u.locationId, region: regionAt(units, u.parentId)?.name ?? null })
  }
  return out
}

async function relabelSites(tx: Tx, companyId: string, wanted: { locationId: string; region: string | null }[]) {
  const before: { locationId: string; region: string | null }[] = []
  for (const s of wanted) {
    const loc = await tx.companyLocation.findFirst({ where: { id: s.locationId, companyId }, select: { region: true } })
    if (!loc || loc.region === s.region) continue
    before.push({ locationId: s.locationId, region: loc.region })
    await tx.companyLocation.update({ where: { id: s.locationId }, data: { region: s.region } })
  }
  return before
}

/** The site a SITE box stands for: one of the company's sites with exactly its name that no other box already stands for. */
async function siteNamed(tx: Tx, companyId: string, name: string, units: readonly Unit[]): Promise<string | null> {
  const taken = new Set(units.map((u) => u.locationId).filter(Boolean))
  const sites = await tx.companyLocation.findMany({ where: { companyId, name }, select: { id: true } })
  return sites.find((s) => !taken.has(s.id))?.id ?? null
}

// ── The acts ─────────────────────────────────────────────────────────

export async function performAct(w: Writer, req: ActRequest, source: Source = 'SCREEN'): Promise<Done> {
  try {
    return await prisma.$transaction((tx) => act(tx, w, req, source), { timeout: 20_000 })
  } catch (e) {
    if (e instanceof Refused) return no(e.says, e.status, e.field)
    throw e
  }
}

class Refused extends Error {
  constructor(public says: string, public status = 422, public field?: string) {
    super(says)
  }
}

async function act(tx: Tx, w: Writer, req: ActRequest, source: Source): Promise<Done> {
  const units = await unitsOf(tx, w.companyId)
  const unit = (id: string | null) => (id ? units.find((u) => u.id === id) ?? null : null)
  const mustUnit = (id: string, field = 'unitId') => {
    const u = unit(id)
    if (!u) throw new Refused('That box is not on your team structure.', 404, field)
    return u
  }
  const nameOf = (id: string | null) => unit(id)?.name ?? w.companyName

  switch (req.act) {
    case 'ADD': {
      const parent = req.parentId ? mustUnit(req.parentId, 'parentId') : null
      const kind = req.kind ?? kindUnder(parent?.kind ?? null)
      const locationId = kind === 'SITE' ? await siteNamed(tx, w.companyId, req.name, units) : null
      const created = await tx.orgUnit.create({ data: { companyId: w.companyId, parentId: parent?.id ?? null, name: req.name, kind, locationId }, select: { id: true } })
      const withNew = [...units, { id: created.id, parentId: parent?.id ?? null, name: req.name, kind, position: null, locationId, leadContextId: null, leadSetById: null, leadSetAt: null }]
      await placeRow(tx, orderAfterMove(withNew, created.id, parent?.id ?? null, req.at))
      const says = `Added ${req.name} under ${parent?.name ?? w.companyName}. Give it a name and a lead.`
      const changeId = await record(tx, w, source, 'ADD', says, { orgUnitId: created.id }, { unitId: created.id })
      return { ok: true, says, changeId, unitId: created.id }
    }

    case 'RENAME': {
      const u = mustUnit(req.unitId)
      if (u.name === req.name) return no(`${u.name} is already called that.`, 422, 'name')
      await tx.orgUnit.update({ where: { id: u.id }, data: { name: req.name } })
      let also = ''
      let relabelled = 0
      let siteWas: string | null = null
      if (u.kind === 'REGION') {
        relabelled = (await tx.companyLocation.updateMany({ where: { companyId: w.companyId, region: u.name }, data: { region: req.name } })).count
        if (relabelled) also = ` Its ${plural(relabelled, 'site')} now say ${req.name} on Sites, so whoever sits on it reads the same places.`
      }
      if (u.kind === 'SITE' && u.locationId) {
        const loc = await tx.companyLocation.findFirst({ where: { id: u.locationId, companyId: w.companyId }, select: { name: true } })
        if (loc && loc.name !== req.name) {
          siteWas = loc.name
          await tx.companyLocation.update({ where: { id: u.locationId }, data: { name: req.name } })
          also = ' The site is renamed with it, on Sites too.'
        }
      }
      const says = `Renamed ${u.name} to ${req.name}.${also}`
      const changeId = await record(tx, w, source, 'RENAME', says, { orgUnitId: u.id }, { unitId: u.id, name: u.name, region: relabelled ? { from: req.name, to: u.name } : null, site: siteWas ? { locationId: u.locationId, name: siteWas } : null })
      return { ok: true, says, changeId, unitId: u.id }
    }

    case 'KIND': {
      const u = mustUnit(req.unitId)
      if (u.kind === req.kind) return no(`${u.name} is already a ${kindWord(u.kind).toLowerCase()}.`, 422, 'kind')
      const seated = await seatsAt(tx, w.companyId, { orgUnitId: u.id })
      if (NARROWING.has(req.kind)) {
        const setters = seated.filter((s) => s.setsUp).map((s) => s.name)
        if (setters.length) return no(setupSeatSays(setters, w.companyName, `a ${kindWord(req.kind).toLowerCase()}`), 409, 'kind')
      }
      const locationId = req.kind === 'SITE' && !u.locationId ? await siteNamed(tx, w.companyId, u.name, units) : u.locationId
      await tx.orgUnit.update({ where: { id: u.id }, data: { kind: req.kind, locationId } })
      const reach = reachChangeSays(seated.map((s) => s.name), reachOf(u, w.accountWalls), reachOf({ ...u, kind: req.kind }, w.accountWalls), w.companyName)
      const says = `${u.name} is now a ${kindWord(req.kind).toLowerCase()}.${reach ? ` ${reach}` : ''}`
      const changeId = await record(tx, w, source, 'KIND', says, { orgUnitId: u.id }, { unitId: u.id, kind: u.kind, locationId: u.locationId })
      return { ok: true, says, changeId, unitId: u.id }
    }

    case 'LEAD': {
      const u = mustUnit(req.unitId)
      let leadName: string | null = null
      if (req.contextId) {
        const seat = await tx.context.findFirst({ where: { id: req.contextId, companyId: w.companyId, revokedAt: null }, select: { person: { select: { name: true } } } })
        if (!seat) return no(`A box is led by somebody seated at ${w.companyName}. Invite them under Users & permissions first.`, 422, 'contextId')
        leadName = seat.person.name
      }
      if (u.leadContextId === req.contextId) return no(leadName ? `${leadName} already leads ${u.name}.` : `${u.name} has no lead.`, 422, 'contextId')
      await tx.orgUnit.update({ where: { id: u.id }, data: { leadContextId: req.contextId, leadSetById: w.personId, leadSetAt: new Date() } })
      const says = leadName
        ? `${leadName} now leads ${u.name}. Leading a box gives no access by itself; access is given under Users & permissions.`
        : `${u.name} has no named lead now.`
      const changeId = await record(tx, w, source, 'LEAD', says, { orgUnitId: u.id, contextId: req.contextId }, {
        unitId: u.id, leadContextId: u.leadContextId, leadSetById: u.leadSetById, leadSetAt: u.leadSetAt?.toISOString() ?? null,
      })
      return { ok: true, says, changeId, unitId: u.id }
    }

    case 'MOVE': {
      const u = mustUnit(req.unitId)
      const ok = checkMove(units, u.id, req.parentId)
      if (!ok.ok) return no(ok.says, 422, 'parentId')
      const oldRow = childrenOf(units, u.parentId).map((x) => ({ id: x.id, position: x.position }))
      const newRowBefore = childrenOf(units, req.parentId).map((x) => ({ id: x.id, position: x.position }))
      await tx.orgUnit.update({ where: { id: u.id }, data: { parentId: req.parentId } })
      const after = units.map((x) => (x.id === u.id ? { ...x, parentId: req.parentId } : x))
      await placeRow(tx, orderAfterMove(after, u.id, req.parentId, req.at))
      const relabelled = await relabelSites(tx, w.companyId, siteRegions(after, u.id))
      const same = (u.parentId ?? null) === req.parentId
      const also = relabelled.length ? ` ${plural(relabelled.length, 'site')} under it now ${relabelled.length === 1 ? 'reads' : 'read'} ${regionAt(after, req.parentId)?.name ?? 'no region'} on Sites.` : ''
      const says = same
        ? `${u.name} moved along its row under ${nameOf(req.parentId)}.`
        : `${u.name} is now under ${nameOf(req.parentId)}. Its people, contractors and jobs moved with it.${also}`
      const changeId = await record(tx, w, source, 'MOVE', says, { orgUnitId: u.id }, { unitId: u.id, parentId: u.parentId, rows: [...oldRow, ...newRowBefore], sites: relabelled })
      return { ok: true, says, changeId, unitId: u.id }
    }

    case 'DELETE': {
      const u = mustUnit(req.unitId)
      const parent = unit(u.parentId)
      const [seated, lines, deliveries, requirements, rules, budgets, seats, grants, internal, project] = await Promise.all([
        seatsAt(tx, w.companyId, { orgUnitId: u.id }),
        tx.sellContract.findMany({ where: { orgUnitId: u.id }, select: { id: true, state: true } }),
        tx.sellContract.findMany({ where: { deliveryUnitId: u.id }, select: { id: true } }),
        tx.requirement.findMany({ where: { orgUnitId: u.id }, select: { id: true } }),
        tx.approvalRule.count({ where: { orgUnitId: u.id } }),
        tx.costCenter.count({ where: { orgUnitId: u.id } }),
        tx.programSeat.count({ where: { orgUnitId: u.id } }),
        tx.permissionGrant.count({ where: { orgUnitId: u.id, revokedAt: null } }),
        tx.internalOrder.count({ where: { orgUnitId: u.id } }),
        tx.projectOrder.count({ where: { orgUnitId: u.id } }),
      ])
      const holds = [
        rules ? { what: 'approval rules', where: 'Program team' } : null,
        budgets ? { what: 'budgets', where: 'Settings' } : null,
        seats ? { what: 'MSP seats', where: 'MSPs' } : null,
        grants ? { what: 'access grants', where: 'Users & permissions' } : null,
        internal || project ? { what: 'orders', where: 'Contracts' } : null,
      ].filter(Boolean) as { what: string; where: string }[]
      const live = lines.filter((l) => !['ENDED', 'CANCELLED'].includes(l.state)).length
      const plan = deletePlan({
        unit: u, parent, companyName: w.companyName, childNames: childrenOf(units, u.id).map((c) => c.name),
        people: seated.map((s) => s.name), contractors: live, holds, accountWalls: w.accountWalls,
      })
      if (!plan.ok) return no(plan.says, 409)
      if (parent && NARROWING.has(parent.kind)) {
        const setters = seated.filter((s) => s.setsUp).map((s) => s.name)
        if (setters.length) return no(setupSeatSays(setters, w.companyName, parent.name), 409)
      }
      const kids = childrenOf(units, u.id).map((c) => c.id)
      const upRowBefore = childrenOf(units, u.parentId).map((x) => ({ id: x.id, position: x.position }))
      const kidRows = childrenOf(units, u.id).map((x) => ({ id: x.id, position: x.position }))
      const up = u.parentId ?? null
      await tx.orgUnit.updateMany({ where: { id: { in: kids } }, data: { parentId: up } })
      await tx.context.updateMany({ where: { id: { in: seated.map((s) => s.id) } }, data: { orgUnitId: up } })
      await tx.sellContract.updateMany({ where: { id: { in: lines.map((l) => l.id) } }, data: { orgUnitId: up } })
      await tx.sellContract.updateMany({ where: { id: { in: deliveries.map((l) => l.id) } }, data: { deliveryUnitId: up } })
      await tx.requirement.updateMany({ where: { id: { in: requirements.map((r) => r.id) } }, data: { orgUnitId: up } })
      // The teams under it take its place in the row above, in their order.
      const row = childrenOf(units, up).map((x) => x.id)
      const at = row.indexOf(u.id)
      row.splice(at, 1, ...kids)
      await tx.orgUnit.delete({ where: { id: u.id } })
      await placeRow(tx, row)
      const after = units.filter((x) => x.id !== u.id).map((x) => (kids.includes(x.id) ? { ...x, parentId: up } : x))
      const relabelled: { locationId: string; region: string | null }[] = []
      for (const k of kids) relabelled.push(...(await relabelSites(tx, w.companyId, siteRegions(after, k))))
      const changeId = await record(tx, w, source, 'DELETE', `Deleted ${u.name}. ${plan.says.replace(/^Delete [^?]+\? /, '')}`.trim(), { orgUnitId: null }, {
        unit: { ...u, leadSetAt: u.leadSetAt?.toISOString() ?? null },
        kids, rows: [...upRowBefore, ...kidRows], seats: seated.map((s) => s.id), lines: lines.map((l) => l.id),
        deliveries: deliveries.map((l) => l.id), requirements: requirements.map((r) => r.id), sites: relabelled,
      })
      return { ok: true, says: `Deleted ${u.name}.`, changeId, unitId: up }
    }

    case 'MOVE_PERSON': {
      const seat = await tx.context.findFirst({
        where: { id: req.contextId, companyId: w.companyId, revokedAt: null },
        select: { id: true, orgUnitId: true, person: { select: { name: true } }, role: { select: { permissions: true } } },
      })
      if (!seat) return no(`That person holds no seat at ${w.companyName}.`, 404, 'contextId')
      const to = req.unitId ? mustUnit(req.unitId) : null
      if ((seat.orgUnitId ?? null) === (to?.id ?? null)) return no(`${seat.person.name} is already ${to ? `on ${to.name}` : 'on no team'}.`, 422, 'unitId')
      if (to && NARROWING.has(to.kind) && hasPermission(seat.role?.permissions ?? [], 'settings.manage')) {
        return no(setupSeatSays([seat.person.name], w.companyName, to.name), 409, 'unitId')
      }
      const from = unit(seat.orgUnitId)
      await tx.context.update({ where: { id: seat.id }, data: { orgUnitId: to?.id ?? null } })
      const reach = reachChangeSays([seat.person.name], reachOf(from, w.accountWalls), reachOf(to, w.accountWalls), w.companyName)
      const says = `${seat.person.name} moved from ${from?.name ?? 'no team'} to ${to?.name ?? 'no team'}.${reach ? ` ${reach}` : ''}`
      const changeId = await record(tx, w, source, 'MOVE_PERSON', says, { orgUnitId: to?.id ?? null, contextId: seat.id }, { contextId: seat.id, orgUnitId: seat.orgUnitId })
      return { ok: true, says, changeId, unitId: to?.id ?? null }
    }

    case 'MOVE_CONTRACTOR': {
      const ids = new Set(units.map((u) => u.id))
      const line = await tx.sellContract.findUnique({ where: { id: req.sellContractId }, select: { id: true, orgUnitId: true, person: { select: { name: true } } } })
      // Only a line already charged to one of this company's boxes: the
      // charging unit is the client's own coding, never another firm's.
      if (!line || !line.orgUnitId || !ids.has(line.orgUnitId)) return no(`That contractor is not charged to a box at ${w.companyName}.`, 404, 'sellContractId')
      const to = mustUnit(req.unitId)
      if (line.orgUnitId === to.id) return no(`${line.person.name} is already charged to ${to.name}.`, 422, 'unitId')
      await tx.sellContract.update({ where: { id: line.id }, data: { orgUnitId: to.id } })
      const says = `${line.person.name} is now charged to ${to.name}, moved from ${nameOf(line.orgUnitId)}. Their supplier, rate and dates are unchanged.`
      const changeId = await record(tx, w, source, 'MOVE_CONTRACTOR', says, { orgUnitId: to.id, sellContractId: line.id }, { sellContractId: line.id, orgUnitId: line.orgUnitId })
      return { ok: true, says, changeId, unitId: to.id }
    }

    case 'UNDO':
      return undoLast(tx, w, units)
  }
}

// ── Undo ─────────────────────────────────────────────────────────────

type Row = { id: string; position: number | null }
type Undo = Record<string, any>

async function restoreRows(tx: Tx, companyId: string, rows: Row[]) {
  for (const r of rows) await tx.orgUnit.updateMany({ where: { id: r.id, companyId }, data: { position: r.position } })
}

async function restoreSites(tx: Tx, companyId: string, sites: { locationId: string; region: string | null }[] | undefined) {
  for (const s of sites ?? []) await tx.companyLocation.updateMany({ where: { id: s.locationId, companyId }, data: { region: s.region } })
}

/** The company's last change, put back, if the caller made it. Nothing older is touched. */
async function undoLast(tx: Tx, w: Writer, units: Unit[]): Promise<Done> {
  const last = await tx.orgChange.findFirst({
    where: { companyId: w.companyId, act: { not: 'UNDO' }, undoneAt: null },
    orderBy: { at: 'desc' },
    select: { id: true, act: true, says: true, undo: true, actorPersonId: true, actor: { select: { name: true } } },
  })
  if (!last) return no('Nothing to undo.', 422)
  if (last.actorPersonId !== w.personId) {
    return no(`The last change was ${last.actor?.name ?? 'somebody else'}'s: "${last.says}" Undo puts back your own last change only.`, 409)
  }
  const u: Undo = (last.undo as Undo) ?? {}
  const has = (id: string | null | undefined) => Boolean(id && units.some((x) => x.id === id))

  switch (last.act) {
    case 'ADD': {
      if (!has(u.unitId)) break
      const [kids, seats, lines, jobs] = await Promise.all([
        tx.orgUnit.count({ where: { parentId: u.unitId } }),
        tx.context.count({ where: { orgUnitId: u.unitId } }),
        tx.sellContract.count({ where: { orgUnitId: u.unitId } }),
        tx.requirement.count({ where: { orgUnitId: u.unitId } }),
      ])
      if (kids + seats + lines + jobs > 0) return no('Something has been put in that box since it was added. Delete it instead, which says what moves up.', 409)
      await tx.orgUnit.delete({ where: { id: u.unitId } })
      break
    }
    case 'RENAME':
      if (!has(u.unitId)) break
      await tx.orgUnit.update({ where: { id: u.unitId }, data: { name: u.name } })
      if (u.region) await tx.companyLocation.updateMany({ where: { companyId: w.companyId, region: u.region.from }, data: { region: u.region.to } })
      if (u.site) await tx.companyLocation.updateMany({ where: { id: u.site.locationId, companyId: w.companyId }, data: { name: u.site.name } })
      break
    case 'KIND':
      if (!has(u.unitId)) break
      await tx.orgUnit.update({ where: { id: u.unitId }, data: { kind: u.kind, locationId: u.locationId ?? null } })
      break
    case 'LEAD':
      if (!has(u.unitId)) break
      await tx.orgUnit.update({ where: { id: u.unitId }, data: { leadContextId: u.leadContextId ?? null, leadSetById: u.leadSetById ?? null, leadSetAt: u.leadSetAt ? new Date(u.leadSetAt) : null } })
      break
    case 'MOVE':
      if (!has(u.unitId)) break
      if (u.parentId && !has(u.parentId)) return no('The box it came from has been deleted since. Drag it where it should go.', 409)
      await tx.orgUnit.update({ where: { id: u.unitId }, data: { parentId: u.parentId ?? null } })
      await restoreRows(tx, w.companyId, u.rows ?? [])
      await restoreSites(tx, w.companyId, u.sites)
      break
    case 'DELETE': {
      const s = u.unit
      if (!s || units.some((x) => x.id === s.id)) break
      if (s.parentId && !has(s.parentId)) return no('The box it sat under has been deleted since, so it cannot go back where it was.', 409)
      await tx.orgUnit.create({
        data: {
          id: s.id, companyId: w.companyId, parentId: s.parentId ?? null, name: s.name, kind: s.kind, position: s.position ?? null,
          locationId: s.locationId ?? null, leadContextId: s.leadContextId ?? null, leadSetById: s.leadSetById ?? null, leadSetAt: s.leadSetAt ? new Date(s.leadSetAt) : null,
        },
      })
      const up = s.parentId ?? null
      // Back only what is still where the delete put it.
      await tx.orgUnit.updateMany({ where: { id: { in: u.kids ?? [] }, companyId: w.companyId, parentId: up }, data: { parentId: s.id } })
      await tx.context.updateMany({ where: { id: { in: u.seats ?? [] }, companyId: w.companyId, orgUnitId: up }, data: { orgUnitId: s.id } })
      await tx.sellContract.updateMany({ where: { id: { in: u.lines ?? [] }, orgUnitId: up }, data: { orgUnitId: s.id } })
      await tx.sellContract.updateMany({ where: { id: { in: u.deliveries ?? [] }, deliveryUnitId: up }, data: { deliveryUnitId: s.id } })
      await tx.requirement.updateMany({ where: { id: { in: u.requirements ?? [] }, orgUnitId: up }, data: { orgUnitId: s.id } })
      await restoreRows(tx, w.companyId, u.rows ?? [])
      await restoreSites(tx, w.companyId, u.sites)
      break
    }
    case 'MOVE_PERSON':
      if (u.orgUnitId && !has(u.orgUnitId)) return no('The box they came from has been deleted since. Drag them where they should go.', 409)
      await tx.context.updateMany({ where: { id: u.contextId, companyId: w.companyId }, data: { orgUnitId: u.orgUnitId ?? null } })
      break
    case 'MOVE_CONTRACTOR':
      if (!has(u.orgUnitId)) return no('The box they were charged to has been deleted since. Drag them where they should be charged.', 409)
      await tx.sellContract.update({ where: { id: u.sellContractId }, data: { orgUnitId: u.orgUnitId } })
      break
  }
  const now = new Date()
  await tx.orgChange.update({ where: { id: last.id }, data: { undoneAt: now, undoneById: w.personId } })
  const says = `Undone: ${last.says}`
  const changeId = await record(tx, w, 'SCREEN', 'UNDO', says, {}, null)
  return { ok: true, says, changeId }
}
