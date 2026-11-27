import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { emit } from '@/lib/events'
import { saidYesToUpdates, updatesSays } from '@/lib/updates-consent'

/**
 * A person's own yes to updates (record 117).
 *
 * GET     her standing answer
 * POST    she says yes: the day is kept on her own record
 * DELETE  she takes it back: the day is kept, the yes ends
 *
 * Her own record only, scoped to the signed-in person in every query, so there is no
 * permission to ask for. A service key, the twin and an agent are refused: the yes is
 * hers to give and nobody else's.
 */

async function me(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return { error }
  const id = realPersonId(caller)
  if (!id || (caller as any).twin || (caller as any).agent) {
    return { error: NextResponse.json({ error: { code: 'PERSON_REQUIRED', message: 'Only the person herself says yes to updates. An integration, the twin or an agent cannot.' } }, { status: 403 }) }
  }
  return { id }
}

async function answer(id: string) {
  const p = await prisma.person.findUniqueOrThrow({ where: { id }, select: { updatesYesAt: true, updatesRevokedAt: true } })
  return { yes: saidYesToUpdates(p), says: updatesSays(p), yesAt: p.updatesYesAt?.toISOString() ?? null, revokedAt: p.updatesRevokedAt?.toISOString() ?? null }
}

export async function GET(request: NextRequest) {
  const r = await me(request)
  if ('error' in r && r.error) return r.error
  return NextResponse.json({ data: await answer((r as { id: string }).id) })
}

export async function POST(request: NextRequest) {
  const r = await me(request)
  if ('error' in r && r.error) return r.error
  const id = (r as { id: string }).id
  await prisma.person.update({ where: { id }, data: { updatesYesAt: new Date() } })
  await emit({ type: 'person.updates_yes_given', companyId: null, subjectType: 'Person', subjectId: id, actorPersonId: id, payload: {} })
  return NextResponse.json({ data: await answer(id) }, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const r = await me(request)
  if ('error' in r && r.error) return r.error
  const id = (r as { id: string }).id
  await prisma.person.update({ where: { id }, data: { updatesRevokedAt: new Date() } })
  await emit({ type: 'person.updates_yes_revoked', companyId: null, subjectType: 'Person', subjectId: id, actorPersonId: id, payload: {} })
  return NextResponse.json({ data: await answer(id) })
}
