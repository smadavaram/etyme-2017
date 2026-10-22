import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { desksFor, deskPeople, orderedOfSuppliers, keepSupplierPaper } from '@/lib/supplier-desks'
import { checkDocumentUpload, MAX_DOCUMENT_BYTES, sizeSaid } from '@/lib/document-request'
import {
  mayActAt, withOrderedItems, attachToItem, STAGE_WORD,
  type ChecklistItem, type Decision, type Stage,
} from '@/lib/supplier-onboarding'
import { actingDesk } from '@/lib/program-seat'

/**
 * POST /api/supplier-requests/[id]/file — multipart: `key`, `file`
 *
 * The desk the request is on attaches a file to one of its own items:
 * the copy both firms signed of an agreement it papers itself. Found by
 * the screen walk of 2026-10-22: the MSA and the NDA were marked on file
 * with no signed copy anywhere. An agreement cannot be marked on file
 * now until one is here (`markItem`), so this is the step before it.
 *
 * The file is kept the way the firm's own files are — a paper of the
 * client's for that item, the bytes on it, opened through the one file
 * door by the client's paperwork team and nobody else. Attaching does
 * not verify: the same desk then says it is on file.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const desk = await actingDesk(caller)
  const deskPermissions = desk?.permissions ?? caller.permissions
  const notStaff = staffOnly(caller, 'Supplier requests')
  if (notStaff) return notStaff
  const companyId = desk!.companyId

  const row = await prisma.supplierRequest.findFirst({ where: { id, companyId } })
  if (!row) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That recommendation is not here.' } }, { status: 404 })
  if (row.state === 'APPROVED' || row.state === 'DECLINED') {
    return NextResponse.json({ error: { code: 'DECIDED', message: `${row.name} was already ${row.state.toLowerCase()}.` } }, { status: 409 })
  }

  const stage = row.stage as Stage
  const decisions = ((row.decisions as unknown as Decision[]) ?? [])
  const desks = await desksFor(companyId, row.recommendedById)
  const verdict = mayActAt({
    stage, permissions: deskPermissions, callerId: caller.person.id,
    recommendedById: row.recommendedById, decisions, desks, firmName: row.name,
    deskHolders: stage === 'DONE' ? undefined : await deskPeople(companyId, stage, desks),
    companyName: desk!.companyName,
  })
  if (!verdict.ok) return NextResponse.json({ error: { code: verdict.code, message: verdict.message } }, { status: 403 })

  const form = await request.formData().catch(() => null)
  const key = String(form?.get('key') ?? '')
  const file = form?.get('file')
  const checklist = withOrderedItems(
    row.checklist as unknown as ChecklistItem[],
    await orderedOfSuppliers(companyId),
    desk!.companyName
  )
  const item = checklist.find((i) => i.key === key)
  if (!item) return NextResponse.json({ error: { code: 'VALIDATION', message: 'That is not on the checklist.' } }, { status: 422 })
  if (item.desk !== stage) {
    return NextResponse.json({ error: { code: 'NOT_YOUR_ITEM', message: `${item.label} is ${STAGE_WORD[item.desk]}’s, not yours at this step.` } }, { status: 409 })
  }
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: { code: 'FILE_REQUIRED', message: `Attach the file for ${item.label.toLowerCase()}.`, field: 'file' } }, { status: 422 })
  }
  const bytes = Buffer.from(await file.arrayBuffer())
  if (bytes.byteLength === 0) {
    return NextResponse.json({ error: { code: 'FILE_REQUIRED', message: `${file.name} arrived empty. Pick it again and send it.`, field: 'file' } }, { status: 422 })
  }
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) {
    return NextResponse.json({ error: { code: 'FILE_REFUSED', message: `${file.name} arrived as ${sizeSaid(bytes.byteLength)} and ten megabytes is the limit. Send a smaller copy.` } }, { status: 413 })
  }
  const allowed = checkDocumentUpload({ name: file.name, type: file.type || 'application/octet-stream', size: bytes.byteLength })
  if (!allowed.ok) return NextResponse.json({ error: { code: 'FILE_REFUSED', message: allowed.says } }, { status: 422 })

  const now = new Date()
  const fileUrl = await keepSupplierPaper(companyId, row.id, item.key, item.label, {
    name: file.name.slice(0, 200), type: file.type || 'application/octet-stream', bytes,
  })
  const next = attachToItem(checklist, item.key, { fileName: file.name.slice(0, 200), fileUrl }, now)
  await prisma.supplierRequest.update({ where: { id }, data: { checklist: next as unknown as object, state: 'IN_REVIEW' } })

  await prisma.automationLog.create({
    data: {
      companyId,
      action: 'SUPPLIER_ITEM_MARKED',
      summary: `${caller.person.name} (${STAGE_WORD[stage]}) attached ${file.name} to ${item.label} for ${row.name}`,
      reason: `Attached by ${STAGE_WORD[stage]}; attaching a file does not verify the item.`,
      payload: { supplierRequestId: id, firm: row.name, key: item.key, state: 'ATTACHED', desk: stage, byId: caller.person.id, fileUrl },
      reversible: true,
    },
  })

  return NextResponse.json({
    data: {
      request: { ...row, checklist: next },
      says: `${file.name} is attached to ${item.label.toLowerCase()}. Mark it on file when you have checked it.`,
    },
  }, { status: 201 })
}
