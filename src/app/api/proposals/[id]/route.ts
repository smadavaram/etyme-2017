import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { pluginGate } from '@/lib/plugin-gate'
import { emit } from '@/lib/events'

/**
 * PATCH /api/proposals/[id] — a person edits the draft's words (record 124).
 *
 * Only a person edits. The agent writes a draft once, when there is none,
 * and never writes over what a person changed. An approved or sent
 * proposal is not edited: it goes back to a person's yes first.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company || !hasPermission(caller.permissions, 'submissions.create')) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: askTheDesk({ doing: 'Editing a proposal', needs: 'submissions.create', kind: caller.company?.kind, companyName: caller.company?.name }) } }, { status: 403 })
  }
  const off = await pluginGate(caller, 'PUBLIC_SECTOR')
  if (off) return off
  const { id } = await params
  const body = await request.json().catch(() => null) as { draft?: unknown } | null
  if (typeof body?.draft !== 'string' || !body.draft.trim() || body.draft.length > 50000) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'The draft is words, between one character and 50,000.' } }, { status: 422 })
  }
  const by = realPersonId(caller)
  if (!by) return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Only a signed-in person edits a draft. An agent cannot.' } }, { status: 403 })
  const p = await prisma.proposal.findFirst({ where: { id, companyId: caller.company.id }, select: { id: true, state: true } })
  if (!p) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That proposal is not on this firm’s list.' } }, { status: 404 })
  if (p.state === 'APPROVED' || p.state === 'SUBMITTED') {
    return NextResponse.json({ error: { code: 'REFUSED', message: p.state === 'APPROVED' ? 'This proposal is approved. Words changed now would not be the words approved.' : 'This proposal was sent. A change now would not be the words that went.' } }, { status: 409 })
  }
  await prisma.proposal.update({ where: { id: p.id }, data: { draft: body.draft.trim() } })
  await emit({ type: 'proposal.draft_edited', companyId: caller.company.id, subjectType: 'Proposal', subjectId: p.id, actorPersonId: by, payload: {} })
  return NextResponse.json({ data: { id: p.id } })
}
