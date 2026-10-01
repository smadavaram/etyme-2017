import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { readerOf, readerAtWeek, readWeekApprovals, sendApprovalLink, attachEvidence, type Refused } from '@/lib/week-approval'

/**
 * GET  /api/week-approvals?timesheetId=…   the client's approvals on a week,
 *                                          as this reader may see them
 * POST /api/week-approvals                 send "Approve by email", or
 *                                          attach evidence of an approval
 *
 * The founder, 2026-09-30 (CLAUDE.md, "A client may approve by email, and
 * the proof travels down the chain"). The worker on their own week, or a
 * supplier's timesheet desk on the chain, sends the link or attaches the
 * evidence, and picks the contracts it applies to — all of them unless
 * fewer are picked. Who may, and what each rung reads, is decided in
 * `app/api/timesheets/approval-by-email.ts`; the rows are written by
 * `lib/week-approval`. Every read is an access log row, refusals included.
 *
 * POST takes JSON for a link — `{ timesheetId, how: "LINK", approverName,
 * approverEmail, contracts? }` — and a form for evidence, because evidence
 * carries a file: `timesheetId`, `how=EVIDENCE`, `approverName`,
 * `approverEmail`, `kind` (EMAIL · PDF · EXPORT), `approvedOn`
 * (YYYY-MM-DD), `file` or `pastedText`, and `contracts` once per contract.
 */

const no = (r: Refused) =>
  NextResponse.json({ error: { code: r.code, message: r.says, ...(r.field ? { field: r.field } : {}) } }, { status: r.status })

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const timesheetId = request.nextUrl.searchParams.get('timesheetId')
  if (!timesheetId) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Say which week.', field: 'timesheetId' } }, { status: 422 })
  }
  // Through a seat where the caller's firm runs this client's program.
  const out = await readWeekApprovals(await readerAtWeek(caller, { timesheetId }), timesheetId)
  if (!out.ok) return no(out)
  return NextResponse.json({ data: out.seen })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const reader = readerOf(caller)

  const type = request.headers.get('content-type') ?? ''
  if (type.includes('multipart/form-data')) {
    const form = await request.formData().catch(() => null)
    if (!form) return NextResponse.json({ error: { code: 'VALIDATION', message: 'The form could not be read. Try again.' } }, { status: 422 })
    const timesheetId = String(form.get('timesheetId') ?? '')
    const raw = form.get('file')
    const file = raw && typeof raw === 'object' && 'arrayBuffer' in raw && (raw as File).size > 0 ? (raw as File) : null
    const contracts = form.getAll('contracts').map(String).filter(Boolean)
    const approvedOn = typeof form.get('approvedOn') === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(String(form.get('approvedOn')))
      ? new Date(`${form.get('approvedOn')}T00:00:00.000Z`)
      : null
    const out = await attachEvidence(reader, timesheetId, {
      approverName: form.get('approverName'),
      approverEmail: form.get('approverEmail'),
      kind: form.get('kind'),
      approvedOn,
      file: file ? { name: file.name, size: file.size, type: file.type, bytes: Buffer.from(await file.arrayBuffer()) } : null,
      pastedText: form.get('pastedText'),
      contracts: contracts.length ? contracts : null,
    })
    if (!out.ok) return no(out)
    return NextResponse.json({ data: { id: out.id, words: out.words, says: out.says } }, { status: 201 })
  }

  const body = await request.json().catch(() => ({}))
  if (body?.how !== 'LINK') {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Send a link, or attach the approval as a file.', field: 'how' } },
      { status: 422 }
    )
  }
  const out = await sendApprovalLink(reader, String(body?.timesheetId ?? ''), {
    approverName: body?.approverName,
    approverEmail: body?.approverEmail,
    contracts: Array.isArray(body?.contracts) ? body.contracts.map(String) : null,
  })
  if (!out.ok) return no(out)
  return NextResponse.json({ data: { id: out.id, says: out.says, delivery: out.delivery } }, { status: 201 })
}
