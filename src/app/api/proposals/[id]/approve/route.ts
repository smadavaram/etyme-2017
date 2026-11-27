import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { pluginGate } from '@/lib/plugin-gate'
import { moveRefusal, stateSays } from '@/lib/proposals/rules'
import { approveByPerson } from '@/lib/proposals/approve'

/**
 * POST /api/proposals/[id]/approve (record 124): a person only. The agent has
 * no door here, and Etyme sends nothing to an agency: "submitted" is a
 * person saying it was sent, outside Etyme.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company || !hasPermission(caller.permissions, 'submissions.create')) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: askTheDesk({ doing: 'Approving a proposal', needs: 'submissions.create', kind: caller.company?.kind, companyName: caller.company?.name }) } }, { status: 403 })
  }
  const off = await pluginGate(caller, 'PUBLIC_SECTOR')
  if (off) return off
  const { id } = await params
  const p = await prisma.proposal.findFirst({ where: { id, companyId: caller.company.id }, include: { pieces: { select: { haveIt: true } } } })
  if (!p) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That proposal is not on this firm’s list.' } }, { status: 404 })
  const no = moveRefusal('PERSON', p.state, 'APPROVED', p.pieces.filter((x) => !x.haveIt).length)
  if (no) return NextResponse.json({ error: { code: 'REFUSED', message: no } }, { status: 409 })
  const by = realPersonId(caller)
  if (!by) return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Only a signed-in person can do this. An agent cannot.' } }, { status: 403 })
  const done = await approveByPerson({ companyId: caller.company.id, proposalId: p.id, personId: by })
  if (!done.ok) return NextResponse.json({ error: { code: 'REFUSED', message: done.says } }, { status: 409 })
  return NextResponse.json({ data: { id: p.id, state: 'APPROVED', stateSays: stateSays('APPROVED') } })
}
