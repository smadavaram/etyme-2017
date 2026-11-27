import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { pluginGate } from '@/lib/plugin-gate'
import { emit } from '@/lib/events'
import { mayMove, type ProposalState } from '@/lib/proposals/rules'

/**
 * PATCH /api/proposals/[id]/pieces/[pieceId] — a person says where a piece is (record 124).
 *
 * Any seat that reads proposals may say where a piece is kept: it is a pointer, not a decision, and the seat that owes a paper (HR, say) is the one who knows where it is. The yes on the whole proposal stays with a seat that may put proposals forward.
 *
 * A piece is in hand only when a person says where it is kept, or the
 * agent found it in the firm's own record. Rates and compliance papers are
 * never read from the record: a seat says where they are, in words, and the
 * agent never does. Taking a piece back moves a ready proposal back to
 * waiting on pieces, so a yes is never given on a piece that went missing.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; pieceId: string }> | { id: string; pieceId: string } }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company || !hasPermission(caller.permissions, 'submissions.read')) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: askTheDesk({ doing: 'Marking a proposal piece', needs: 'submissions.read', kind: caller.company?.kind, companyName: caller.company?.name }) } }, { status: 403 })
  }
  const off = await pluginGate(caller, 'PUBLIC_SECTOR')
  if (off) return off
  const { id, pieceId } = await params
  const body = await request.json().catch(() => null) as { haveIt?: unknown; source?: unknown } | null
  if (typeof body?.haveIt !== 'boolean') return NextResponse.json({ error: { code: 'VALIDATION', message: 'Say whether the piece is in hand: true or false.' } }, { status: 422 })
  const source = typeof body.source === 'string' ? body.source.trim() : ''
  if (body.haveIt && !source) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Say where the piece is kept, in a few words, so the next person can find it.' } }, { status: 422 })
  if (source.length > 300) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Where it is kept is at most 300 characters.' } }, { status: 422 })
  const by = realPersonId(caller)
  if (!by) return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Only a signed-in person marks a piece. An agent cannot say a piece is in hand.' } }, { status: 403 })
  const piece = await prisma.proposalPiece.findFirst({ where: { id: pieceId, proposalId: id, proposal: { companyId: caller.company.id } }, include: { proposal: { select: { state: true } } } })
  if (!piece) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That piece is not on this firm’s proposal.' } }, { status: 404 })
  const state = piece.proposal.state as ProposalState
  if (state === 'APPROVED' || state === 'SUBMITTED') {
    return NextResponse.json({ error: { code: 'REFUSED', message: 'This proposal is already approved. Pieces change before the yes, not after it.' } }, { status: 409 })
  }
  await prisma.proposalPiece.update({ where: { id: piece.id }, data: { haveIt: body.haveIt, source: body.haveIt ? source : null } })
  // A piece taken back withdraws a proposal that was ready; a piece put in is read by the agent's next check.
  if (!body.haveIt && state === 'READY_FOR_PERSON' && mayMove('PERSON', state, 'NEEDS_PIECES')) {
    await prisma.proposal.updateMany({ where: { id, state: 'READY_FOR_PERSON' }, data: { state: 'NEEDS_PIECES' } })
  }
  // The last missing piece put in makes the proposal ready for a yes, with or without the agent.
  if (body.haveIt && state === 'NEEDS_PIECES' && mayMove('PERSON', state, 'READY_FOR_PERSON') && (await prisma.proposalPiece.count({ where: { proposalId: id, haveIt: false } })) === 0) {
    await prisma.proposal.updateMany({ where: { id, state: 'NEEDS_PIECES' }, data: { state: 'READY_FOR_PERSON' } })
  }
  await emit({ type: 'proposal.piece_marked', companyId: caller.company.id, subjectType: 'Proposal', subjectId: id, actorPersonId: by, payload: { pieceId: piece.id, haveIt: body.haveIt } })
  return NextResponse.json({ data: { id: piece.id, haveIt: body.haveIt, source: body.haveIt ? source : null } })
}
