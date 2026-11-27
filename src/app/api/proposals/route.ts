import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { pluginGate } from '@/lib/plugin-gate'
import { emit } from '@/lib/events'
import { PIECE_KINDS, stateSays } from '@/lib/proposals/rules'

/**
 * GET  /api/proposals — the firm's public-sector proposals (record 124)
 * POST /api/proposals — a person starts one
 *
 * Plugin 5. Off for the firm, every route here refuses in one sentence.
 * The agent that drafts and chases is not built; a person starts the
 * proposal and names the pieces it needs from the firm's own record.
 */

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company || !hasPermission(caller.permissions, 'submissions.read')) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: askTheDesk({ doing: 'Reading proposals', needs: 'submissions.read', kind: caller.company?.kind, companyName: caller.company?.name }) } }, { status: 403 })
  }
  const off = await pluginGate(caller, 'PUBLIC_SECTOR')
  if (off) return off
  const rows = await prisma.proposal.findMany({
    where: { companyId: caller.company.id },
    orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
    take: 200,
    include: { pieces: { orderBy: { label: 'asc' } } },
  })
  return NextResponse.json({
    data: rows.map((p) => ({
      id: p.id, title: p.title, buyer: p.buyer, dueAt: p.dueAt?.toISOString().slice(0, 10) ?? null,
      state: p.state, stateSays: stateSays(p.state), draft: p.draft,
      approvedAt: p.approvedAt?.toISOString() ?? null, submittedAt: p.submittedAt?.toISOString() ?? null,
      missing: p.pieces.filter((x) => !x.haveIt).length,
      pieces: p.pieces.map((x) => ({ id: x.id, kind: x.kind, label: x.label, source: x.source, haveIt: x.haveIt })),
    })),
  })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company || !hasPermission(caller.permissions, 'submissions.create')) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: askTheDesk({ doing: 'Starting a proposal', needs: 'submissions.create', kind: caller.company?.kind, companyName: caller.company?.name }) } }, { status: 403 })
  }
  const off = await pluginGate(caller, 'PUBLIC_SECTOR')
  if (off) return off
  const body = await request.json().catch(() => null) as { title?: unknown; buyer?: unknown; dueAt?: unknown; pieces?: unknown } | null
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  if (!title) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Name the proposal: the solicitation’s title or number.' } }, { status: 422 })
  let dueAt: Date | null = null
  if (body?.dueAt != null && body.dueAt !== '') {
    dueAt = typeof body.dueAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.dueAt) ? new Date(`${body.dueAt}T00:00:00.000Z`) : null
    if (!dueAt || Number.isNaN(dueAt.getTime())) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Say the deadline as a day, like 2027-01-31, or leave it empty.' } }, { status: 422 })
  }
  const pieces = Array.isArray(body?.pieces) ? body!.pieces as Array<{ kind?: unknown; label?: unknown }> : []
  for (const x of pieces) {
    if (typeof x?.label !== 'string' || !x.label.trim() || !(PIECE_KINDS as readonly string[]).includes(String(x.kind))) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'Each piece needs a name and a kind: bench, compliance, rates or past performance.' } }, { status: 422 })
    }
  }
  const by = realPersonId(caller)
  if (!by) return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Sign in as a person to start a proposal.' } }, { status: 403 })
  const row = await prisma.proposal.create({
    data: {
      companyId: caller.company.id, title, buyer: typeof body?.buyer === 'string' && body.buyer.trim() ? body.buyer.trim() : null,
      dueAt, createdById: by, state: pieces.length ? 'NEEDS_PIECES' : 'DRAFT',
      pieces: { create: pieces.map((x) => ({ kind: String(x.kind), label: String(x.label).trim() })) },
    },
    select: { id: true, state: true },
  })
  await emit({ type: 'proposal.started', companyId: caller.company.id, subjectType: 'Proposal', subjectId: row.id, actorPersonId: by, payload: {} })
  return NextResponse.json({ data: { id: row.id, state: row.state, stateSays: stateSays(row.state) } }, { status: 201 })
}
