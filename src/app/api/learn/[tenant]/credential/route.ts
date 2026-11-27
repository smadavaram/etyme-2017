import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { learnTenant } from '@/lib/training/learn-read'
import { courseSlugFor } from '@/lib/training/learn-db'
import { newVerificationCode, credentialPath } from '@/lib/training/credential'

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'There is no learning site at this address.' } }

/**
 * POST /api/learn/:tenant/credential  { track, action: 'show' | 'revoke' }
 *
 * A worker's own yes to a public page for a track she finished, and her
 * taking it down. Only she can, and only for a COMPLETED enrollment of hers
 * at this firm. Showing again after a revoke issues a new id, so a link
 * she took down stays dead. The server fetches nothing and reads nothing
 * from anywhere else.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { tenant } = await params
  const t = await learnTenant(tenant)
  if (!t) return NextResponse.json(NOT_FOUND, { status: 404 })
  const body = await request.json().catch(() => ({}))
  const action = body.action === 'show' || body.action === 'revoke' ? body.action : null
  if (!action) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Say show or revoke.', field: 'action' } }, { status: 422 })
  const enrollment = typeof body.track === 'string'
    ? await prisma.enrollment.findFirst({ where: { personId: caller.person.id, companyId: t.id, trackKey: body.track, course: { slug: courseSlugFor(body.track) } }, select: { id: true, status: true } })
    : null
  if (!enrollment) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'You have not started that track here.' } }, { status: 404 })
  if (enrollment.status !== 'COMPLETED') return NextResponse.json({ error: { code: 'NOT_COMPLETE', message: 'Finish every lesson of the track first. Then you can show it.' } }, { status: 409 })
  const now = new Date()
  const row = await prisma.learnCredential.findUnique({ where: { enrollmentId: enrollment.id } })

  if (action === 'revoke') {
    if (!row || !row.shownAt || row.revokedAt) return NextResponse.json({ error: { code: 'NOT_SHOWN', message: 'It is not on a public page.' } }, { status: 409 })
    await prisma.learnCredential.update({ where: { id: row.id }, data: { revokedAt: now } })
    return NextResponse.json({ data: { shown: false } })
  }
  if (row && row.shownAt && !row.revokedAt) return NextResponse.json({ data: { shown: true, code: row.verificationCode, address: credentialPath(t.slug, row.verificationCode) } })
  const code = newVerificationCode()
  if (!row) await prisma.learnCredential.create({ data: { enrollmentId: enrollment.id, companyId: t.id, verificationCode: code, shownAt: now } })
  else await prisma.learnCredential.update({ where: { id: row.id }, data: { verificationCode: code, shownAt: now, revokedAt: null } })
  return NextResponse.json({ data: { shown: true, code, address: credentialPath(t.slug, code) } }, { status: 201 })
}
