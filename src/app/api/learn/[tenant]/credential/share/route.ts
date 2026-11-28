import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { recordRefusal } from '@/lib/access-log'
import { appUrl } from '@/lib/app-url'
import { learnTenant, readCredential } from '@/lib/training/learn-read'
import { courseSlugFor } from '@/lib/training/learn-db'
import { addToProfileUrl, credentialPath, sharePostUrl, SHARE_KINDS, type ShareKind } from '@/lib/training/credential'

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'There is no learning site at this address.' } }

/**
 * POST /api/learn/:tenant/credential/share  { track, kind: 'post' | 'profile' }
 *
 * The learner pressed "Share a post" or "Add to your profile". Only she can:
 * the track is read from her own enrollment, so nobody else's finish is
 * reachable, and a refusal is written to the access log before it is sent.
 * The page must be shown (her yes) and not taken down. The answer is the
 * plain address her own click opens; the server calls no network, reads
 * nothing back, and no agent reaches this door. The press is ledgered.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { tenant } = await params
  const t = await learnTenant(tenant)
  if (!t) return NextResponse.json(NOT_FOUND, { status: 404 })
  const body = await request.json().catch(() => ({}))
  const kind = SHARE_KINDS.find((k) => k === body.kind) as ShareKind | undefined
  if (!kind) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Say post or profile.', field: 'kind' } }, { status: 422 })
  const enrollment = typeof body.track === 'string'
    ? await prisma.enrollment.findFirst({ where: { personId: caller.person.id, companyId: t.id, trackKey: body.track, course: { slug: courseSlugFor(body.track) } }, select: { id: true, status: true } })
    : null
  if (!enrollment) {
    await recordRefusal([{ companyId: t.id }], { actorPersonId: caller.person.id, actorCompanyId: t.id, action: 'PROFILE_VIEW', reason: `Refused a LinkedIn share of a course completion at ${t.name}: the person has no finished course of her own there. Only the learner shares her own completion.` })
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Only the person who finished a course can share it.' } }, { status: 404 })
  }
  const row = enrollment.status === 'COMPLETED' ? await prisma.learnCredential.findUnique({ where: { enrollmentId: enrollment.id }, select: { verificationCode: true, shownAt: true, revokedAt: true } }) : null
  if (!row || !row.shownAt || row.revokedAt) return NextResponse.json({ error: { code: 'NOT_SHOWN', message: 'Show your finished page first. Then you can share it.' } }, { status: 409 })
  const read = await readCredential(t.slug, row.verificationCode)
  if (!read.ok) return NextResponse.json({ error: { code: 'NOT_SHOWN', message: 'Show your finished page first. Then you can share it.' } }, { status: 409 })
  const v = read.view
  const page = `${appUrl()}${credentialPath(read.tenantSlug, v.code)}`
  const url = kind === 'post' ? sharePostUrl(page) : addToProfileUrl({ courseName: v.courseTitle, issuer: v.issuer, issuedAt: v.completedAt, certUrl: page, certId: v.certId })
  await prisma.automationLog.create({
    data: {
      companyId: t.id, action: 'CREDENTIAL_SHARED',
      summary: `${v.learnerName} pressed ${kind === 'post' ? 'share a post' : 'add to profile'} for ${v.courseTitle} at ${t.name}.`,
      reason: 'The learner herself chose to share her finished course on LinkedIn. Nothing was posted for her; the link opened from her own click.',
      payload: { enrollmentId: enrollment.id, personId: caller.person.id, kind }, reversible: false,
    },
  })
  return NextResponse.json({ data: { kind, url } })
}
