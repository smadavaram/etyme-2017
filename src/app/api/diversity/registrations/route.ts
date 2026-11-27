import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { pluginGate } from '@/lib/plugin-gate'
import { emit } from '@/lib/events'
import { asEvent } from '@/lib/attestation/certification-door'
import { REGISTRATION_EVENTS, registrationSays } from '@/lib/diversity/registration-rules'

/**
 * GET  /api/diversity/registrations — the firm's registrations on buyers' supplier-diversity portals (record 132)
 * POST /api/diversity/registrations — a person records one: the buyer as typed, the portal's link, its questions
 *
 * Plugin 5. Off for the firm, both refuse in one sentence. The agent drafts
 * the answers from the record; a person submits on the portal, outside
 * Etyme, and marks it here. Etyme submits nothing.
 */

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company || !hasPermission(caller.permissions, 'submissions.read')) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: askTheDesk({ doing: 'Reading portal registrations', needs: 'submissions.read', kind: caller.company?.kind, companyName: caller.company?.name }) } }, { status: 403 })
  }
  const off = await pluginGate(caller, 'PUBLIC_SECTOR')
  if (off) return off
  const rows = await prisma.diversityRegistration.findMany({
    where: { companyId: caller.company.id }, orderBy: [{ createdAt: 'desc' }], take: 200,
    include: { submittedBy: { select: { name: true } } },
  })
  return NextResponse.json({
    mayWrite: hasPermission(caller.permissions, 'submissions.create'),
    data: rows.map((r) => ({
      id: r.id, buyerName: r.buyerName, portalUrl: r.portalUrl, status: r.status, statusSays: registrationSays(r.status),
      questions: r.questions, answers: r.answers, draftedAt: r.draftedAt?.toISOString() ?? null,
      submittedBy: r.submittedBy?.name ?? null, submittedAt: r.submittedAt?.toISOString() ?? null,
    })),
  })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company || !hasPermission(caller.permissions, 'submissions.create')) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: askTheDesk({ doing: 'Recording a portal registration', needs: 'submissions.create', kind: caller.company?.kind, companyName: caller.company?.name }) } }, { status: 403 })
  }
  const off = await pluginGate(caller, 'PUBLIC_SECTOR')
  if (off) return off
  const body = await request.json().catch(() => null) as { buyerName?: unknown; portalUrl?: unknown; questions?: unknown } | null
  const buyerName = typeof body?.buyerName === 'string' ? body.buyerName.trim() : ''
  if (!buyerName || buyerName.length > 200) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Name the buyer whose portal this is, as you would say it.' } }, { status: 422 })
  let portalUrl: string | null = null
  if (body?.portalUrl != null && body.portalUrl !== '') {
    if (typeof body.portalUrl !== 'string' || !/^https?:\/\/[^\s]+$/i.test(body.portalUrl.trim()) || body.portalUrl.length > 1000) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'The link is the web address of the portal, starting with https://.' } }, { status: 422 })
    }
    portalUrl = body.portalUrl.trim()
  }
  let questions: string | null = null
  if (body?.questions != null && body.questions !== '') {
    if (typeof body.questions !== 'string' || body.questions.length > 50000) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Paste the questions as text, up to 50,000 characters.' } }, { status: 422 })
    questions = body.questions.trim() || null
  }
  const by = realPersonId(caller)
  if (!by) return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Sign in as a person to record a registration.' } }, { status: 403 })
  const row = await prisma.diversityRegistration.create({ data: { companyId: caller.company.id, buyerName, portalUrl, questions, createdById: by }, select: { id: true, status: true } })
  await emit({ type: asEvent(REGISTRATION_EVENTS.started), companyId: caller.company.id, subjectType: 'DiversityRegistration', subjectId: row.id, actorPersonId: by, payload: {} })
  return NextResponse.json({ data: { id: row.id, status: row.status, statusSays: registrationSays(row.status) } }, { status: 201 })
}
