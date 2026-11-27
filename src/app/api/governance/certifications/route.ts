import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { emit } from '@/lib/events'
import { pluginGate } from '@/lib/plugin-gate'
import { checkCertificationInput, certificationHeldOn, kindName, kindKey } from '@/lib/attestation/certification-held'
import { DIVERSITY_EVENTS, asEvent, lapseByDate, mayRecordDiversity, refuseDiversity } from '@/lib/attestation/certification-door'

/**
 * GET  /api/governance/certifications   the firm's certifications, each read as held or not today
 * POST /api/governance/certifications   the Owner records one (record 132, plugin 5)
 *
 * Plugin 5 gates both. Recording is the Owner's alone, at a company with a
 * verified Owner: never an agent, never an Admin. A certification is
 * recorded HELD only with its certificate on file and its expiry day.
 * One row per kind (an OTHER by its name): recording again updates it.
 * Every record is an Event naming who.
 */

const SELECT = {
  id: true, kind: true, otherName: true, certifier: true, status: true, number: true, issuedOn: true, expiresOn: true, documentId: true, setById: true, updatedAt: true,
  document: { select: { status: true, signedFileUrl: true, file: { select: { id: true } } } },
} as const

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) return NextResponse.json({ error: { code: 'NO_COMPANY', message: 'Certifications belong to a company. Open them from a company seat.' } }, { status: 403 })
  const off = await pluginGate(caller, 'PUBLIC_SECTOR')
  if (off) return off
  // The sweep runs where it is read, so a lapse is recorded the first time anybody looks.
  await lapseByDate(caller.company.id)
  const today = new Date()
  const rows = await prisma.supplierCertification.findMany({ where: { companyId: caller.company.id }, select: SELECT, orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }] })
  const may = await mayRecordDiversity(caller as never, 'record a certification')
  return NextResponse.json({
    mayWrite: may.ok,
    data: rows.map((r) => {
      const read = certificationHeldOn(r, today)
      return {
        id: r.id, kind: r.kind, name: kindName(r.kind, r.otherName), otherName: r.otherName, certifier: r.certifier, status: r.status, number: r.number,
        issuedOn: r.issuedOn?.toISOString().slice(0, 10) ?? null, expiresOn: r.expiresOn?.toISOString().slice(0, 10) ?? null, documentId: r.documentId,
        held: read.held, heldState: read.state, says: read.says,
      }
    }),
  })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const may = await mayRecordDiversity(caller as never, 'record a certification')
  if (!may.ok) return refuseDiversity(caller as never, may)
  const off = await pluginGate(caller, 'PUBLIC_SECTOR')
  if (off) return off
  const by = realPersonId(caller)
  if (!by) return NextResponse.json({ error: { code: 'PERSON_REQUIRED', message: 'An integration cannot record a certification. An Owner has to.' } }, { status: 403 })
  const companyId = caller.company!.id
  const checked = checkCertificationInput(await request.json().catch(() => null))
  if (!checked.ok) return NextResponse.json({ error: { code: 'VALIDATION', message: checked.says } }, { status: 422 })
  const v = checked.value
  if (v.documentId) {
    // The certificate is the firm's own paper: about this company, uploaded or signed, with its file.
    const doc = await prisma.docInstance.findFirst({ where: { id: v.documentId, subjectType: 'COMPANY', subjectId: companyId }, select: { id: true } })
    if (!doc) return NextResponse.json({ error: { code: 'VALIDATION', message: 'That certificate is not one of this company’s papers. Upload it under the company’s paperwork first.' } }, { status: 422 })
  }
  const same = await prisma.supplierCertification.findMany({ where: { companyId, kind: v.kind as never }, select: { id: true, otherName: true } })
  const existing = same.find((r) => kindKey(v.kind, r.otherName) === kindKey(v.kind, v.otherName))
  const data = { kind: v.kind as never, otherName: v.otherName, certifier: v.certifier, status: v.status as never, number: v.number, issuedOn: v.issuedOn, expiresOn: v.expiresOn, documentId: v.documentId, setById: by }
  const row = existing
    ? await prisma.supplierCertification.update({ where: { id: existing.id }, data, select: SELECT })
    : await prisma.supplierCertification.create({ data: { ...data, companyId }, select: SELECT })
  await emit({
    type: asEvent(DIVERSITY_EVENTS.certificationSet), companyId, subjectType: 'SupplierCertification', subjectId: row.id, actorPersonId: by,
    payload: { kind: v.kind, otherName: v.otherName, status: v.status, number: v.number, expiresOn: v.expiresOn?.toISOString().slice(0, 10) ?? null, documentId: v.documentId, updated: Boolean(existing) },
  })
  const read = certificationHeldOn(row, new Date())
  return NextResponse.json({ data: { id: row.id, kind: row.kind, name: kindName(row.kind, row.otherName), status: row.status, held: read.held, heldState: read.state, says: read.says } }, { status: existing ? 200 : 201 })
}
