import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { decideApproval, type Surface } from '@/lib/twin/ledger'

/**
 * POST /api/twin/approvals/:id   { decision: 'APPROVED' | 'REJECTED', reason?, surface? }
 *
 * A person answering what the program manager's twin asked. The one
 * route the web and Teams both call: Teams never writes state itself
 * (CLAUDE.md, "The job twin"). Everything that decides is in
 * `decideApproval` (lib/twin/ledger): the desk the act needs, nobody
 * signing their own, the record checked again, then the answer, the act
 * and its ledger entry in one transaction.
 *
 * An approval is a person's signature, so a machine holding an API key
 * cannot give one.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { id } = await params

  if (caller.isService) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'An approval is a person’s signature. A key held by a machine cannot give one.' } },
      { status: 403 }
    )
  }
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'The twin asks a person at its own company. Choose that company’s seat first.' } },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const decision = body.decision === 'APPROVED' || body.decision === 'REJECTED' ? body.decision : null
  if (!decision) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Say yes or no: approved or rejected.', field: 'decision' } },
      { status: 422 }
    )
  }
  const surface: Surface = body.surface === 'TEAMS' ? 'TEAMS' : 'WEB'

  const out = await decideApproval({
    approvalId: id,
    decision,
    reason: typeof body.reason === 'string' ? body.reason : null,
    surface,
    decider: {
      personId: caller.person.id,
      personName: caller.person.name,
      companyId: caller.company.id,
      companyKind: caller.company.kind,
      companyName: caller.company.name,
      permissions: caller.permissions,
    },
  })
  if (!out.ok) {
    const code = out.status === 404 ? 'NOT_FOUND' : out.status === 409 ? 'CONFLICT' : out.status === 403 ? 'FORBIDDEN' : out.status === 500 ? 'NOT_RECORDED' : 'REFUSED'
    return NextResponse.json({ error: { code, message: out.says } }, { status: out.status })
  }
  return NextResponse.json({
    data: {
      outcome: out.outcome,
      ledgerEntryId: out.entryId,
      result: out.result ?? null,
      note: out.outcome === 'PERFORMED' ? 'Done, and recorded in Etyme’s ledger under your name.' : 'Recorded as no, with your reason.',
    },
  })
}
