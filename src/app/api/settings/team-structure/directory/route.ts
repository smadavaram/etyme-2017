import { NextRequest, NextResponse } from 'next/server'
import { recordAccess } from '@/lib/access-log'
import { reportError } from '@/lib/alerts'
import { readDirectoryCsv } from '@/lib/team-structure/directory/csv'
import { directorySources } from '@/lib/team-structure/directory/providers'
import { applyTicked, planFor } from '@/lib/team-structure/directory/apply'
import { hasPermission } from '@/lib/permissions'
import { treeCaller, refusedTree, writerFor, refuse } from '../door'

/**
 * GET  /api/settings/team-structure/directory   the three sources and whether each is connected
 * POST /api/settings/team-structure/directory   { source: 'CSV', csv }            a preview of every change
 *                                               { source: 'CSV', csv, apply: [] } make the ticked changes
 *
 * The directory is read, never written (founder, 2026-11-09). The Owner or
 * the Admin reads a preview and ticks what is made; the plan is worked out
 * again from the same file when they say yes, so what is made is exactly
 * what was shown, and each change goes through the tree's own acts,
 * recorded as from the directory. Every read of a directory is written to
 * the access log as the company's before the answer goes out.
 *
 * Microsoft Entra ID and Google Workspace answer "not connected" with what
 * the client's IT admin has to approve, until an approval is kept on the
 * record (lib/team-structure/directory/providers).
 */

const MAX_BYTES = 5 * 1024 * 1024

export async function GET(request: NextRequest) {
  const { caller, error } = await treeCaller(request)
  if (error) return error
  if (!hasPermission(caller.permissions, 'settings.manage')) return refusedTree(caller, 'Importing the team structure from a directory')
  const writer = await writerFor(caller)
  if (!writer) return refusedTree(caller, 'Importing the team structure from a directory')
  void writer
  return NextResponse.json({ data: { sources: directorySources() } })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await treeCaller(request)
  if (error) return error
  if (!hasPermission(caller.permissions, 'settings.manage')) return refusedTree(caller, 'Importing the team structure from a directory')
  const writer = await writerFor(caller)
  if (!writer) return refusedTree(caller, 'Importing the team structure from a directory')
  const body = await request.json().catch(() => null)
  const source = typeof body?.source === 'string' ? body.source.toUpperCase() : ''
  const state = directorySources().find((s) => s.key === source)
  if (!state) return refuse('Choose where the directory comes from: Microsoft Entra ID, Google Workspace, or a file from Active Directory.', 422, 'source')
  if (!state.connected) return refuse(`${state.label} is not connected for ${writer.companyName}. ${state.adminApproves ?? ''} Meanwhile, a file exported from Active Directory works today.`.trim(), 409, 'source')

  const csv = typeof body?.csv === 'string' ? body.csv : ''
  if (csv.length > MAX_BYTES) return refuse('The file is over 5 MB. Export only the columns the import reads: name, email, department, manager, office, country and job title.', 422, 'csv')
  const read = readDirectoryCsv(csv)
  if (!read.ok) return refuse(read.says, 422, 'csv')

  try {
    await recordAccess([{ companyId: writer.companyId }], {
      actorPersonId: writer.personId,
      actorCompanyId: writer.companyId,
      action: 'CONTRACT_VIEW',
      reason: `Read ${writer.companyName}'s directory from ${state.label.toLowerCase()}: ${read.people.length} people, for the team structure${Array.isArray(body?.apply) ? ', and made the ticked changes' : ', as a preview'}.`,
    })
    const plan = await planFor(writer.companyId, writer.companyName, read.people)
    if (Array.isArray(body?.apply)) {
      const ticked = body.apply.filter((k: unknown): k is string => typeof k === 'string')
      const done = await applyTicked(writer, plan, ticked)
      const says = done.made.length
        ? `${done.made.length} ${done.made.length === 1 ? 'change' : 'changes'} made from the directory, each kept with your name.${done.refused.length ? ` ${done.refused.length} not made; the reasons are listed.` : ''}`
        : 'Nothing was made.'
      return NextResponse.json({ data: { says, ...done } })
    }
    return NextResponse.json({ data: { people: read.people.length, skipped: read.skipped, ...plan, changes: plan.changes.map(({ op: _op, ...c }) => c) } })
  } catch (e) {
    await reportError('settings/team-structure/directory', e, { personId: writer.personId, companyId: writer.companyId })
    return refuse('The directory could not be read. Nothing was changed; try again.', 500)
  }
}
