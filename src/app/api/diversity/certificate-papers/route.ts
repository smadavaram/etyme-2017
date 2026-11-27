import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { pluginGate } from '@/lib/plugin-gate'
import { mayRecordDiversity, refuseDiversity } from '@/lib/attestation/certification-door'

/**
 * GET /api/diversity/certificate-papers — the firm's own papers that could be a certificate (record 132)
 *
 * What the Owner picks from when she records a certification as held: this company's own papers that
 * are uploaded or signed. The Owner's alone, like recording the certification itself.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const may = await mayRecordDiversity(caller as never, 'pick a certificate')
  if (!may.ok) return refuseDiversity(caller as never, may)
  const off = await pluginGate(caller, 'PUBLIC_SECTOR')
  if (off) return off
  const rows = await prisma.docInstance.findMany({
    where: { subjectType: 'COMPANY', subjectId: caller.company!.id, status: { in: ['UPLOADED', 'SIGNED'] } },
    select: { id: true, status: true, signedAt: true, sentAt: true, fileName: true, template: { select: { name: true } } }, orderBy: { id: 'desc' }, take: 100,
  })
  return NextResponse.json({ data: rows.map((r) => ({ id: r.id, name: r.fileName ?? r.template.name, status: r.status, on: (r.signedAt ?? r.sentAt)?.toISOString().slice(0, 10) ?? '' })) })
}
