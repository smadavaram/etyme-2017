import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { performAct, type Writer } from '../write'
import type { ActRequest } from '../acts'
import type { DirectoryPerson } from './csv'
import { applyOrder, planFromDirectory, type Plan, type Ref } from './plan'

/**
 * The directory import's database half: the tree, the seats and the
 * sites a plan is made against, read at one company; and the ticked
 * changes made through the same acts the screen makes, each recorded as
 * from the directory (lib/team-structure/write). Nothing is deleted, no
 * seat is made, no contractor is touched.
 */

/** Whether the last change of a kind to a box or a seat was a person's on the screen and still stands. */
async function screenEdits(companyId: string) {
  const changes = await prisma.orgChange.findMany({
    where: { companyId, undoneAt: null, act: { in: ['MOVE', 'ADD', 'LEAD', 'MOVE_PERSON'] } },
    orderBy: { at: 'asc' },
    select: { act: true, source: true, orgUnitId: true, contextId: true },
  })
  const moved = new Map<string, string>()
  const lead = new Map<string, string>()
  const seat = new Map<string, string>()
  for (const c of changes) {
    if ((c.act === 'MOVE' || c.act === 'ADD') && c.orgUnitId) moved.set(c.orgUnitId, c.source)
    if (c.act === 'LEAD' && c.orgUnitId) lead.set(c.orgUnitId, c.source)
    if (c.act === 'MOVE_PERSON' && c.contextId) seat.set(c.contextId, c.source)
  }
  return { moved, lead, seat }
}

export async function planFor(companyId: string, companyName: string, people: readonly DirectoryPerson[]): Promise<Plan> {
  const [units, seats, edits] = await Promise.all([
    prisma.orgUnit.findMany({
      where: { companyId },
      select: { id: true, parentId: true, name: true, kind: true, leadContextId: true, location: { select: { name: true, country: true } } },
    }),
    prisma.context.findMany({
      where: { companyId, revokedAt: null },
      select: { id: true, orgUnitId: true, person: { select: { name: true, primaryEmail: true } }, role: { select: { permissions: true } } },
    }),
    screenEdits(companyId),
  ])
  return planFromDirectory({
    people,
    companyName,
    units: units.map((u) => ({
      id: u.id, parentId: u.parentId, name: u.name, kind: u.kind, leadContextId: u.leadContextId,
      movedOnScreen: edits.moved.get(u.id) === 'SCREEN', leadOnScreen: edits.lead.get(u.id) === 'SCREEN',
    })),
    seats: seats.map((s) => ({
      contextId: s.id, email: s.person.primaryEmail, name: s.person.name, orgUnitId: s.orgUnitId,
      movedOnScreen: edits.seat.get(s.id) === 'SCREEN', setsUp: hasPermission(s.role?.permissions ?? [], 'settings.manage'),
    })),
    sites: units.filter((u) => u.kind === 'SITE' && u.location).map((u) => ({ unitId: u.id, name: u.location!.name, country: u.location!.country })),
  })
}

export interface Applied {
  made: string[]
  refused: string[]
  skipped: string[]
}

/** Make the ticked changes of a plan, in order, through the screen's own acts. */
export async function applyTicked(w: Writer, plan: Plan, ticked: readonly string[]): Promise<Applied> {
  const want = new Set(ticked)
  const chosen = applyOrder(plan.changes.filter((c) => want.has(c.key) && c.tickable && c.op))
  const created = new Map<string, string>()
  const out: Applied = { made: [], refused: [], skipped: [] }
  const resolve = (r: Ref | null): string | null | undefined => (!r ? null : 'id' in r ? r.id : created.get(r.newDepartment.trim().toLowerCase()))

  for (const c of chosen) {
    const op = c.op!
    let req: ActRequest | null = null
    if (op.act === 'ADD') {
      const parentId = resolve(op.parent)
      if (parentId === undefined) { out.skipped.push(`${op.name} was added at the top: the department above it was not ticked.`) }
      req = { act: 'ADD', parentId: parentId ?? null, at: null, name: op.name, kind: 'DEPARTMENT' }
    } else if (op.act === 'MOVE') {
      const unitId = resolve(op.unit)
      const parentId = resolve(op.parent)
      if (!unitId || parentId === undefined) { out.skipped.push(`${c.says} Not made: the box it goes under was not ticked.`); continue }
      req = { act: 'MOVE', unitId, parentId, at: null }
    } else if (op.act === 'LEAD') {
      const unitId = resolve(op.unit)
      if (!unitId) { out.skipped.push(`${c.says} Not made: the department was not ticked.`); continue }
      req = { act: 'LEAD', unitId, contextId: op.contextId }
    } else {
      const unitId = resolve(op.unit)
      if (!unitId) { out.skipped.push(`${c.says} Not made: the department was not ticked.`); continue }
      req = { act: 'MOVE_PERSON', contextId: op.contextId, unitId }
    }
    const done = await performAct(w, req, 'DIRECTORY')
    if (done.ok) {
      out.made.push(done.says)
      if (op.act === 'ADD' && done.unitId) created.set(op.name.trim().toLowerCase(), done.unitId)
    } else {
      out.refused.push(`${c.says} Not made: ${done.says}`)
    }
  }
  return out
}
