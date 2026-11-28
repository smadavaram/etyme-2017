import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { pluginGate } from '@/lib/plugin-gate'
import { emit } from '@/lib/events'
import { asEvent, mayRecordDiversity, refuseDiversity } from '@/lib/attestation/certification-door'
import { REGISTRATION_EVENTS } from '@/lib/diversity/registration-rules'

/**
 * GET /api/diversity/legal-entity — the legal entity the firm's bids are made in (record 132, plugin 5)
 * PUT /api/diversity/legal-entity — the Owner enters it
 *
 * It is `Company.legalName`, the same field the setup checklist writes. No name is written in code:
 * what a bid says is what the Owner entered. Entering it here is the Owner's alone, at a company with
 * a verified Owner, never an agent; the refusal is on the access log before it is sent.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) return NextResponse.json({ error: { code: 'NO_COMPANY', message: 'The legal entity belongs to a company. Open it from a company seat.' } }, { status: 403 })
  const off = await pluginGate(caller, 'PUBLIC_SECTOR')
  if (off) return off
  const c = await prisma.company.findUniqueOrThrow({ where: { id: caller.company.id }, select: { legalName: true } })
  const may = await mayRecordDiversity(caller as never, 'enter the legal entity name')
  return NextResponse.json({ data: { legalName: c.legalName?.trim() || null, says: c.legalName?.trim() ? null : 'The legal entity name is not set. Bids and registrations cannot name the firm until the Owner enters it.' }, mayWrite: may.ok })
}

export async function PUT(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const may = await mayRecordDiversity(caller as never, 'enter the legal entity name')
  if (!may.ok) return refuseDiversity(caller as never, may)
  const off = await pluginGate(caller, 'PUBLIC_SECTOR')
  if (off) return off
  const by = realPersonId(caller)
  if (!by) return NextResponse.json({ error: { code: 'PERSON_REQUIRED', message: 'An integration cannot enter the legal entity name. An Owner has to.' } }, { status: 403 })
  const body = await request.json().catch(() => null) as { legalName?: unknown } | null
  const legalName = typeof body?.legalName === 'string' ? body.legalName.trim() : ''
  if (!legalName || legalName.length > 200) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Type the legal name, the one on your tax registration.' } }, { status: 422 })
  const companyId = caller.company!.id
  const before = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { legalName: true } })
  await prisma.company.update({ where: { id: companyId }, data: { legalName } })
  await emit({ type: asEvent(REGISTRATION_EVENTS.legalEntitySet), companyId, subjectType: 'Company', subjectId: companyId, actorPersonId: by, payload: { changed: (before.legalName ?? '') !== legalName } })
  return NextResponse.json({ data: { legalName } })
}
