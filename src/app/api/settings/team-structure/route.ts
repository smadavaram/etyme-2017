import { NextRequest, NextResponse } from 'next/server'
import { logBulkAccess } from '@/lib/access-log'
import { readAct } from '@/lib/team-structure/acts'
import { readTree } from '@/lib/team-structure/read'
import { performAct } from '@/lib/team-structure/write'
import { reportError } from '@/lib/alerts'
import { hasPermission } from '@/lib/permissions'
import { treeCaller, refusedTree, writerFor, refuse } from './door'

/**
 * GET  /api/settings/team-structure   the company's tree, every box with its lead, people, contractors and roll-ups
 * POST /api/settings/team-structure   one act: { act, …its fields } (lib/team-structure/acts)
 *
 * Team structure is one tree the Owner draws (founder, 2026-11-09). The
 * Owner and the Admin only, at their own company. Every act is one
 * transaction and one `OrgChange` with who, when and the sentence; the
 * screen reads the tree again after every act, so it never shows a
 * change the record did not make.
 */

export async function GET(request: NextRequest) {
  const { caller, error } = await treeCaller(request)
  if (error) return error
  if (!hasPermission(caller.permissions, 'settings.manage')) return refusedTree(caller, 'Reading the team structure')
  const writer = await writerFor(caller)
  if (!writer) return refusedTree(caller, 'Reading the team structure')
  const tree = await readTree(writer.companyId, writer.personId)
  // The contractors on the tree are the company's own book; the read is
  // logged the way every other list of them is.
  logBulkAccess(tree.contractorPersonIds, {
    actorPersonId: writer.personId,
    actorCompanyId: writer.companyId,
    action: 'CONTRACT_VIEW',
    reason: `The team structure of ${caller.company.name}`,
  })
  const { contractorPersonIds: _named, ...data } = tree
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await treeCaller(request)
  if (error) return error
  if (!hasPermission(caller.permissions, 'settings.manage')) return refusedTree(caller, 'Changing the team structure')
  const writer = await writerFor(caller)
  if (!writer) return refusedTree(caller, 'Changing the team structure')
  const read = readAct(await request.json().catch(() => null))
  if (!read.ok) return refuse(read.says, 422, read.field)
  try {
    const done = await performAct(writer, read.request, 'SCREEN')
    if (!done.ok) return refuse(done.says, done.status, done.field)
    return NextResponse.json({ data: { says: done.says, changeId: done.changeId, unitId: done.unitId ?? null } })
  } catch (e) {
    await reportError('settings/team-structure', e, { personId: writer.personId, companyId: writer.companyId })
    return refuse('The change could not be saved. Nothing was changed; try again.', 500)
  }
}
