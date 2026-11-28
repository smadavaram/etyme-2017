import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { readPartyLedger } from '@/lib/party-ledger'

/**
 * GET /api/party-ledger/[kind]/[id] — one party's ledger (record 134)
 *
 * kind is `person` or `company`. Three sections read off the one record:
 * activity, money and documents. The reader applies every visibility rule
 * the record already has; a refusal is logged before it is sent.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (kind !== 'person' && kind !== 'company') {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'A ledger is read for a person or a company.' } }, { status: 404 })
  }
  const answer = await readPartyLedger(caller, { kind, id })
  if (!answer.ok) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: answer.says } }, { status: answer.status })
  }
  return NextResponse.json({ data: answer.ledger })
}
