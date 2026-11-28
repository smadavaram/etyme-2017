import { prisma } from '@/lib/db'
import { lookFor, type SiteLook } from '@/lib/public-site/site-look'
import { trackOf } from './courses/index'
import { learnOpen } from './learn-gate'
import { readVideo, type LessonVideoView } from './video'
import { credentialCourseTitle, mayShowCredential, type CredentialRefusal } from './credential'

export interface LearnTenant { id: string; name: string; slug: string; look: SiteLook }

/**
 * The firm a learning address belongs to, with its own saved branding (as
 * the Owner approved it, never corrected). Null where the firm does not
 * exist or its plugin is off: the two read the same.
 */
export async function learnTenant(slug: string): Promise<LearnTenant | null> {
  const c = await prisma.company.findFirst({
    where: { OR: [{ slug }, { subdomainAliases: { some: { subdomain: slug } } }] },
    select: {
      id: true, name: true, slug: true, pluginsOn: true,
      siteTemplate: true, siteLogoRef: true, sitePrimaryColor: true, siteSecondaryColor: true, siteFontPairing: true,
      sitePages: true, siteBrandingApprovedAt: true, siteBrandingApprovedHash: true,
    },
  })
  if (!c || !learnOpen(c)) return null
  return { id: c.id, name: c.name, slug: c.slug, look: lookFor(c) }
}

/** The video a firm anchored to one lesson, or null. Read by the lesson page; nothing is fetched from the link. */
export async function videoFor(tenantId: string, trackKey: string, lessonKey: string): Promise<LessonVideoView | null> {
  const row = await prisma.lessonVideo.findFirst({
    where: { companyId: tenantId, lessonKey, course: { trackKey } },
    select: { sourceUrl: true, startSec: true, endSec: true, steps: true, frames: true },
  })
  return readVideo(row)
}

/** The typed course content was written by Tapin, and its title says so; another firm's page must not. */
const COURSE_CONTENT_AUTHOR = 'Tapin'

export interface CredentialView { courseTitle: string; trackTitle: string | null; issuer: string; learnerName: string; completedAt: Date; code: string; certId: string
  /** The track's "What you are now good at" lines, the only other thing the page shows. */
  skills: string[] }

/**
 * The public credential page's one reader. It checks the code against the
 * record each time: the plugin, the code, the firm, a COMPLETED enrollment,
 * her yes and no revoke. Any refusal is returned with its reason; the page
 * shows all of them as no page.
 */
export async function readCredential(slug: string, code: string): Promise<{ ok: true; view: CredentialView; tenantSlug: string } | { ok: false; reason: CredentialRefusal }> {
  const c = await prisma.company.findFirst({ where: { OR: [{ slug }, { subdomainAliases: { some: { subdomain: slug } } }] }, select: { id: true, name: true, slug: true, pluginsOn: true } })
  if (!c) return { ok: false, reason: 'PLUGIN_OFF' }
  const row = code ? await prisma.learnCredential.findUnique({
    where: { verificationCode: code },
    select: { companyId: true, shownAt: true, revokedAt: true, verificationCode: true, enrollment: { select: { status: true, completedAt: true, course: { select: { title: true, trackKey: true, sourceCompanyId: true, company: { select: { name: true } } } }, person: { select: { name: true } } } } },
  }) : null
  const may = mayShowCredential({ pluginOn: learnOpen(c), row, tenantId: c.id, enrollmentStatus: row?.enrollment.status })
  if (!may.ok || !row) return { ok: false, reason: may.ok ? 'NO_SUCH_CODE' : may.reason }
  const course = row.enrollment.course
  const source = course.sourceCompanyId ? await prisma.company.findUnique({ where: { id: course.sourceCompanyId }, select: { name: true } }) : null
  return {
    ok: true, tenantSlug: c.slug,
    view: { courseTitle: credentialCourseTitle(course.title, [course.company.name, source?.name, COURSE_CONTENT_AUTHOR], c.name), trackTitle: (course.trackKey && trackOf(course.trackKey)?.title) || null, issuer: c.name, learnerName: row.enrollment.person.name, completedAt: row.enrollment.completedAt ?? row.shownAt!, code: row.verificationCode, certId: row.verificationCode,
      skills: [...((course.trackKey && trackOf(course.trackKey)?.goodAt) || [])] },
  }
}
