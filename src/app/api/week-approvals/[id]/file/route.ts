import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { readerOf, readEvidenceFile } from '@/lib/week-approval'

/**
 * GET /api/week-approvals/:id/file — the evidence of a client's approval.
 *
 * Opened by every rung the approval applies to, and by the worker; refused
 * to anybody else. Every open writes an access log row about the worker,
 * refusals included.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { id } = await params
  const out = await readEvidenceFile(readerOf(caller), id)
  if (!out.ok) return NextResponse.json({ error: { code: out.code, message: out.says } }, { status: out.status })
  return new NextResponse(new Uint8Array(out.bytes), {
    headers: {
      'content-type': out.contentType,
      'content-disposition': `attachment; filename="${out.fileName.replace(/["\\\r\n]/g, '_')}"`,
      'cache-control': 'private, no-store',
    },
  })
}
