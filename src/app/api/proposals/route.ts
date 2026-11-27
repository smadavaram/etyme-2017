import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { pluginGate } from '@/lib/plugin-gate'
import { emit } from '@/lib/events'
import { PIECE_KINDS, stateSays } from '@/lib/proposals/rules'
import { checkProposal, requirementLines } from '@/lib/proposals/draft-rules'

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
    // The page draws a button only where its route will take it.
    mayWrite: hasPermission(caller.permissions, 'submissions.create'),
    data: rows.map((p) => {
      // The flags are read live from the pieces as they stand, never kept: a kept flag goes stale the day a piece arrives.
      const check = checkProposal(requirementLines(p.requirements), p.pieces)
      return {
      id: p.id, title: p.title, buyer: p.buyer, sourceUrl: p.sourceUrl, requirements: p.requirements, dueAt: p.dueAt?.toISOString().slice(0, 10) ?? null,
      state: p.state, stateSays: stateSays(p.state), draft: p.draft,
      approvedAt: p.approvedAt?.toISOString() ?? null, submittedAt: p.submittedAt?.toISOString() ?? null,
      missing: p.pieces.filter((x) => !x.haveIt).length,
      pieces: p.pieces.map((x) => ({ id: x.id, kind: x.kind, label: x.label, source: x.source, haveIt: x.haveIt })),
      flags: check.rows.filter((r) => r.status !== 'IN_HAND').map((r) => ({ text: r.text, status: r.status, says: r.says })),
      nothingToCheck: check.nothingToCheck,
    }
    }),
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
  const body = await request.json().catch(() => null) as { title?: unknown; buyer?: unknown; dueAt?: unknown; pieces?: unknown; sourceUrl?: unknown; requirements?: unknown } | null
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
  // A bid comes from a person: the link and the requirements are pasted by her (lead ruling, record 124).
  let sourceUrl: string | null = null
  if (body?.sourceUrl != null && body.sourceUrl !== '') {
    if (typeof body.sourceUrl !== 'string' || !/^https?:\/\/[^\s]+$/i.test(body.sourceUrl.trim()) || body.sourceUrl.length > 1000) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'The link is the web address of the solicitation, starting with https://.' } }, { status: 422 })
    }
    sourceUrl = body.sourceUrl.trim()
  }
  let requirements: string | null = null
  if (body?.requirements != null && body.requirements !== '') {
    if (typeof body.requirements !== 'string' || body.requirements.length > 50000) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'Paste the requirements as text, up to 50,000 characters.' } }, { status: 422 })
    }
    requirements = body.requirements.trim() || null
  }
  const by = realPersonId(caller)
  if (!by) return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Sign in as a person to start a proposal.' } }, { status: 403 })
  const row = await prisma.proposal.create({
    data: {
      companyId: caller.company.id, title, buyer: typeof body?.buyer === 'string' && body.buyer.trim() ? body.buyer.trim() : null,
      dueAt, sourceUrl, requirements, createdById: by, state: pieces.length ? 'NEEDS_PIECES' : 'DRAFT',
      pieces: { create: pieces.map((x) => ({ kind: String(x.kind), label: String(x.label).trim() })) },
    },
    select: { id: true, state: true },
  })
  await emit({ type: 'proposal.started', companyId: caller.company.id, subjectType: 'Proposal', subjectId: row.id, actorPersonId: by, payload: {} })
  return NextResponse.json({ data: { id: row.id, state: row.state, stateSays: stateSays(row.state) } }, { status: 201 })
}
