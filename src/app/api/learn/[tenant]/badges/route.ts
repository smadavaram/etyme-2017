import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { recordRefusal } from '@/lib/access-log'
import { appUrl } from '@/lib/app-url'
import { learnTenant, readCredential } from '@/lib/training/learn-read'
import { trackOf } from '@/lib/training/courses/index'
import { badgeWords } from '@/lib/training/progress/badges'
import { credentialPath, entryPath, sharePostUrl } from '@/lib/training/credential'

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'There is no learning site at this address.' } }

/**
 * POST /api/learn/:tenant/badges  { badgeId, action: 'show' | 'hide' | 'share' }
 *
 * A badge is on her own record from the moment it is earned. Showing it is
 * her yes, hiding takes it back, and share is her own press on the same
 * learner-initiated LinkedIn share the finished page uses: the route builds
 * an address, posts nothing for her, and the press is ledgered. A badge of
 * anyone else is refused, and the refusal is written to the access log first.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { tenant } = await params
  const t = await learnTenant(tenant)
  if (!t) return NextResponse.json(NOT_FOUND, { status: 404 })
  const body = await request.json().catch(() => ({}))
  const action = body.action === 'show' || body.action === 'hide' || body.action === 'share' ? body.action : null
  if (!action) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Say show, hide or share.', field: 'action' } }, { status: 422 })
  const badge = typeof body.badgeId === 'string'
    ? await prisma.learnBadge.findFirst({ where: { id: body.badgeId, companyId: t.id }, select: { id: true, personId: true, kind: true, levelKey: true, revokedAt: true, shownAt: true, enrollment: { select: { trackKey: true, status: true } } } })
    : null
  if (!badge || badge.personId !== caller.person.id) {
    await recordRefusal([{ companyId: t.id }], { actorPersonId: caller.person.id, actorCompanyId: t.id, action: 'PROFILE_VIEW', reason: `Refused a badge act at ${t.name}: the badge is not the caller's own. Only the learner shows or shares her own badge.` })
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Only the person who earned a badge can show or share it.' } }, { status: 404 })
  }
  if (badge.revokedAt) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That badge was taken down.' } }, { status: 404 })
  const track = badge.enrollment.trackKey ? trackOf(badge.enrollment.trackKey) : null
  const words = badgeWords({ kind: badge.kind as 'LEVEL' | 'COURSE', levelKey: badge.levelKey }, track?.title ?? 'the course')
  if (action === 'show' || action === 'hide') {
    await prisma.learnBadge.update({ where: { id: badge.id }, data: { shownAt: action === 'show' ? new Date() : null } })
    return NextResponse.json({ data: { shown: action === 'show' } })
  }
  if (!badge.shownAt) return NextResponse.json({ error: { code: 'NOT_SHOWN', message: 'Show the badge first. Then you can share it.' } }, { status: 409 })
  // A course badge leads to her finished page where she showed one; a level badge leads to the firm's own entry page.
  let page = `${appUrl()}${entryPath(t.slug)}`
  if (badge.kind === 'COURSE') {
    const cred = await prisma.learnCredential.findFirst({ where: { enrollment: { personId: caller.person.id, companyId: t.id, trackKey: badge.enrollment.trackKey }, shownAt: { not: null }, revokedAt: null }, select: { verificationCode: true } })
    const read = cred ? await readCredential(t.slug, cred.verificationCode) : null
    if (cred && read?.ok) page = `${appUrl()}${credentialPath(read.tenantSlug, cred.verificationCode)}`
  }
  await prisma.automationLog.create({
    data: {
      companyId: t.id, action: 'BADGE_SHARED',
      summary: `${caller.person.name} pressed share for the badge “${words}” at ${t.name}.`,
      reason: 'The learner herself chose to share her badge on LinkedIn. Nothing was posted for her; the link opened from her own click.',
      payload: { badgeId: badge.id, personId: caller.person.id }, reversible: false,
    },
  })
  return NextResponse.json({ data: { kind: 'post', url: sharePostUrl(page) } })
}
