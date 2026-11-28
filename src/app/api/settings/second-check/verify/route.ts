import { NextRequest, NextResponse } from 'next/server'
import { secondCheckDoor, refused } from '../door'
import { beginCheck, proveCheck } from '@/lib/identity/second-check'

/**
 * POST /api/settings/second-check/verify
 *   { step: 'begin', act, subjectId }
 *     The methods the person holds, passkey first, and a passkey's
 *     challenge in a sealed ticket. Writes nothing.
 *   { step: 'check', act, subjectId, ticket, response }   a passkey
 *   { step: 'check', act, subjectId, code }               an authenticator app
 *     Proves one check for one act and its subject. Answers a proof, good
 *     for two minutes and spent once by the route that does the act.
 *     Every check, passed or failed, is written to the security log.
 *
 * Read by the shared dialog (components/step-up/second-check-dialog).
 */
export async function POST(request: NextRequest) {
  const door = await secondCheckDoor(request)
  if (door.error) return door.error
  const me = door.ok
  const body = await request.json().catch(() => ({}))
  const ask = { personId: me.personId, companyId: me.companyId, act: body.act, subjectId: body.subjectId, origin: me.origin }
  if (body.step === 'begin') {
    const r = await beginCheck(ask)
    if (!r.ok) return refused(r.says, r.status, r.code)
    return NextResponse.json({ data: { methods: r.methods, passkey: r.passkey } })
  }
  if (body.step === 'check') {
    const r = await proveCheck({ ...ask, ticket: body.ticket, response: body.response, code: body.code })
    if (!r.ok) return refused(r.says, r.status, r.code)
    return NextResponse.json({ data: { proof: r.proof, method: r.method } })
  }
  return refused('Say whether this begins a check or makes it.', 422, 'VALIDATION')
}
