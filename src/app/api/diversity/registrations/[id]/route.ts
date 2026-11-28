import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { pluginGate } from '@/lib/plugin-gate'
import { emit } from '@/lib/events'
import { asEvent } from '@/lib/attestation/certification-door'
import { REGISTRATION_EVENTS } from '@/lib/diversity/registration-rules'

/**
 * PATCH /api/diversity/registrations/[id] — a person edits the questions or the answers (record 132).
 *
 * Only a person edits. The agent drafts the answers once, when there are none, and never writes over
 * what a person changed. A registration marked submitted is not edited: the portal has those words.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company || !hasPermission(caller.permissions, 'submissions.create')) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: askTheDesk({ doing: 'Editing a portal registration', needs: 'submissions.create', kind: caller.company?.kind, companyName: caller.company?.name }) } }, { status: 403 })
  }
  const off = await pluginGate(caller, 'PUBLIC_SECTOR')
  if (off) return off
  const { id } = await params
  const body = await request.json().catch(() => null) as { answers?: unknown; questions?: unknown } | null
  const data: { answers?: string; questions?: string } = {}
  for (const k of ['answers', 'questions'] as const) {
    const v = body?.[k]
    if (v === undefined) continue
    if (typeof v !== 'string' || !v.trim() || v.length > 50000) return NextResponse.json({ error: { code: 'VALIDATION', message: `The ${k} are words, between one character and 50,000.` } }, { status: 422 })
    data[k] = v.trim()
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Send the answers or the questions to change.' } }, { status: 422 })
  const by = realPersonId(caller)
  if (!by) return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Only a signed-in person edits a registration. An agent cannot.' } }, { status: 403 })
  const r = await prisma.diversityRegistration.findFirst({ where: { id, companyId: caller.company.id }, select: { id: true, status: true } })
  if (!r) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That registration is not on this firm’s list.' } }, { status: 404 })
  if (r.status === 'SUBMITTED') return NextResponse.json({ error: { code: 'REFUSED', message: 'This registration was submitted on the portal. A change now would not be the words that went.' } }, { status: 409 })
  await prisma.diversityRegistration.update({ where: { id: r.id }, data: { ...data, ...(data.answers && r.status === 'NOT_STARTED' ? { status: 'DRAFTED' as const } : {}) } })
  await emit({ type: asEvent(REGISTRATION_EVENTS.edited), companyId: caller.company.id, subjectType: 'DiversityRegistration', subjectId: r.id, actorPersonId: by, payload: {} })
  return NextResponse.json({ data: { id: r.id } })
}
