import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { pluginGate } from '@/lib/plugin-gate'
import { emit } from '@/lib/events'
import { asEvent } from '@/lib/attestation/certification-door'
import { REGISTRATION_EVENTS, registrationSays } from '@/lib/diversity/registration-rules'

/**
 * POST /api/diversity/registrations/[id]/submitted — a person says she submitted it on the buyer's portal (record 132).
 *
 * A person only: Etyme submits nothing, and the agent has no door here. This records who and when.
 * It needs answers on the record, drafted or typed, so a registration is never marked sent empty.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company || !hasPermission(caller.permissions, 'submissions.create')) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: askTheDesk({ doing: 'Marking a registration submitted', needs: 'submissions.create', kind: caller.company?.kind, companyName: caller.company?.name }) } }, { status: 403 })
  }
  const off = await pluginGate(caller, 'PUBLIC_SECTOR')
  if (off) return off
  const by = realPersonId(caller)
  if (!by) return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Only a signed-in person can say a registration was submitted. An agent cannot.' } }, { status: 403 })
  const { id } = await params
  const r = await prisma.diversityRegistration.findFirst({ where: { id, companyId: caller.company.id }, select: { id: true, status: true, answers: true } })
  if (!r) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That registration is not on this firm’s list.' } }, { status: 404 })
  if (r.status === 'SUBMITTED') return NextResponse.json({ error: { code: 'REFUSED', message: 'This registration is already marked submitted.' } }, { status: 409 })
  if (!r.answers?.trim()) return NextResponse.json({ error: { code: 'REFUSED', message: 'There are no answers on this registration yet. Paste the questions so the agent can draft, or type the answers, then mark it submitted.' } }, { status: 409 })
  const moved = await prisma.diversityRegistration.updateMany({ where: { id: r.id, companyId: caller.company.id, status: { not: 'SUBMITTED' } }, data: { status: 'SUBMITTED', submittedById: by, submittedAt: new Date() } })
  if (moved.count !== 1) return NextResponse.json({ error: { code: 'REFUSED', message: 'That registration was changed while you were reading it. Open it again.' } }, { status: 409 })
  await emit({ type: asEvent(REGISTRATION_EVENTS.submitted), companyId: caller.company.id, subjectType: 'DiversityRegistration', subjectId: r.id, actorPersonId: by, payload: {} })
  return NextResponse.json({ data: { id: r.id, status: 'SUBMITTED', statusSays: registrationSays('SUBMITTED') } })
}
