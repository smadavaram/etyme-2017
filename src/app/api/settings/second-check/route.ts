import { NextRequest, NextResponse } from 'next/server'
import { secondCheckDoor, refused } from './door'
import { factorsOf, secondCheckKey, startAdding, finishAdding, removeFactor } from '@/lib/identity/second-check'
import { mayAddFactor } from '@/lib/identity/second-check-rules'

/**
 * GET    /api/settings/second-check
 *        The person's own passkeys and authenticator app: labels and dates,
 *        never a key. Whether a first one may be added now.
 * POST   /api/settings/second-check { step: 'start', kind, proof?, label? }
 *        { step: 'finish', ticket, response? | code?, label? }
 *        Add a passkey (kind PASSKEY) or an authenticator app (kind
 *        AUTHENTICATOR_APP). The first needs a sign-in within the last 15
 *        minutes; each later one a proof for `second_check.add`.
 * DELETE /api/settings/second-check { id, proof }
 *        Remove one, after a check spent on removing that one.
 *
 * The person's own, only. Rules in lib/identity/second-check-rules; the
 * record in lib/identity/second-check. Never a second step of signing in.
 */

export async function GET(request: NextRequest) {
  const door = await secondCheckDoor(request)
  if (door.error) return door.error
  const me = door.ok
  const keySet = secondCheckKey() !== null
  const f = await factorsOf(me.personId)
  const live = f.passkeys.length + (f.app ? 1 : 0)
  const first = mayAddFactor({ keySet, liveFactors: live, authAt: me.authAt, spentProof: false, now: new Date() })
  return NextResponse.json({
    data: {
      keySet,
      personId: me.personId,
      passkeys: f.passkeys.map((p) => ({ id: p.id, label: p.label, createdAt: p.createdAt, lastUsedAt: p.lastUsedAt })),
      app: f.app,
      /** Whether adding one now needs a check first, or a fresh sign-in. */
      adding: live > 0 ? 'CHECK_FIRST' : first.ok ? 'OPEN' : keySet ? 'SIGN_IN_AGAIN' : 'NOT_READY',
      says: live > 0 ? null : first.ok ? null : first.says,
    },
  })
}

export async function POST(request: NextRequest) {
  const door = await secondCheckDoor(request)
  if (door.error) return door.error
  const me = door.ok
  const body = await request.json().catch(() => ({}))
  const adder = { personId: me.personId, companyId: me.companyId, email: me.email, name: me.name, authAt: me.authAt, origin: me.origin }
  if (body.step === 'start') {
    const r = await startAdding({ ...adder, kind: body.kind, proof: body.proof, label: body.label })
    if (!r.ok) return refused(r.says, r.status, r.code, r.code === 'SECOND_CHECK' ? { act: 'second_check.add', subjectId: me.personId } : {})
    return NextResponse.json({ data: r })
  }
  if (body.step === 'finish') {
    const r = await finishAdding({ ...adder, ticket: body.ticket, response: body.response, code: body.code, label: body.label })
    if (!r.ok) return refused(r.says, r.status, r.code)
    return NextResponse.json({ data: { says: r.says } })
  }
  return refused('Say whether this starts or finishes adding a passkey or app.', 422, 'VALIDATION')
}

export async function DELETE(request: NextRequest) {
  const door = await secondCheckDoor(request)
  if (door.error) return door.error
  const me = door.ok
  const body = await request.json().catch(() => ({}))
  const r = await removeFactor({ personId: me.personId, companyId: me.companyId, factorId: body.id, proof: body.proof })
  if (!r.ok) return refused(r.says, r.status, r.code, r.code === 'SECOND_CHECK' ? { act: 'second_check.remove', subjectId: String(body.id ?? '') } : {})
  return NextResponse.json({ data: { says: r.says } })
}
