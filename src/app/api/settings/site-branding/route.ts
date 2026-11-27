import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { emit } from '@/lib/events'
import { maySwitchPlugin, pluginsOfferedTo, notOfferedSays } from '@/lib/plugins'
import {
  SITE_TEMPLATES, SITE_TEMPLATE_NAMES, FONT_PAIRINGS, isSiteTemplate, checkBranding, checkPages, brandingChanged,
  contrastWarnings, approvalHolds, type Branding, type SitePage,
} from '@/lib/site-settings'

/**
 * The tenant's template, branding and pages (records 111, 79, 121).
 *
 * GET   /api/settings/site-branding   what is stored, and whether the Owner's yes still covers it
 * PATCH { template?, branding?, pages? }   the Owner saves any of the three.
 *
 * The template is a layout and never a look: saving it touches nothing else, and
 * saving branding never touches the template. A change to any stored branding value
 * (logo, colors, font pairing) clears the Owner's yes in the same write, and the reply
 * says so. Pages are words and are not part of the yes.
 *
 * Owner only, a verified Owner, never the twin or an agent. Every act is an Event.
 * The plugin need not be on: the branding is approved before the site may go on.
 */

const SELECT = {
  siteTemplate: true, siteLogoRef: true, sitePrimaryColor: true, siteSecondaryColor: true, siteFontPairing: true, sitePages: true,
  siteBrandingApprovedAt: true, siteBrandingApprovedHash: true,
} as const

type Row = { siteTemplate: string; siteLogoRef: string | null; sitePrimaryColor: string | null; siteSecondaryColor: string | null; siteFontPairing: string | null; sitePages: unknown; siteBrandingApprovedAt: Date | null; siteBrandingApprovedHash: string | null }

const brandingOf = (c: Row): Branding => ({ logoRef: c.siteLogoRef, primaryColor: c.sitePrimaryColor, secondaryColor: c.siteSecondaryColor, fontPairing: c.siteFontPairing })

function screen(c: Row) {
  const branding = brandingOf(c)
  return {
    template: c.siteTemplate,
    templates: SITE_TEMPLATES.map((k) => ({ key: k, name: SITE_TEMPLATE_NAMES[k] })),
    branding,
    fontPairings: Object.entries(FONT_PAIRINGS).map(([key, name]) => ({ key, name })),
    contrastWarnings: contrastWarnings(branding),
    pages: (Array.isArray(c.sitePages) ? c.sitePages : []) as SitePage[],
    brandingApproved: approvalHolds(c.siteBrandingApprovedAt, c.siteBrandingApprovedHash, branding),
  }
}

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) return NextResponse.json({ error: { code: 'NO_COMPANY', message: 'The site settings are a company setting. Open them from a company seat.' } }, { status: 403 })
  const role = caller.context.roleId
    ? await prisma.role.findFirst({ where: { id: caller.context.roleId, companyId: caller.company.id }, select: { name: true } })
    : null
  if (!role || (role.name !== 'Owner' && role.name !== 'Admin')) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: `The site settings at ${caller.company.name} are read by its Owners and Admins.` } }, { status: 403 })
  }
  if (!pluginsOfferedTo(caller.company.kind).some((p) => p.key === 'WEBSITE')) {
    return NextResponse.json({ error: { code: 'NOT_OFFERED', message: notOfferedSays() } }, { status: 403 })
  }
  const c = await prisma.company.findUnique({ where: { id: caller.company.id }, select: SELECT })
  return NextResponse.json({ data: { ...screen(c as Row), canSet: role.name === 'Owner' } })
}

export async function PATCH(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const may = await maySwitchPlugin({ ...caller, twin: Boolean((caller as any).twin) })
  if (!may.ok) {
    return NextResponse.json({ error: { code: may.code === 'OWNER_NOT_VERIFIED' ? 'OWNER_NOT_VERIFIED' : 'FORBIDDEN', message: may.says, ...(may.href ? { href: may.href } : {}) } }, { status: 403 })
  }
  const by = realPersonId(caller)
  if (!by) return NextResponse.json({ error: { code: 'PERSON_REQUIRED', message: 'An integration cannot change the site. An Owner has to.' } }, { status: 403 })
  if (!pluginsOfferedTo(caller.company!.kind).some((p) => p.key === 'WEBSITE')) {
    return NextResponse.json({ error: { code: 'NOT_OFFERED', message: notOfferedSays() } }, { status: 403 })
  }
  const companyId = caller.company!.id
  const body = await request.json().catch(() => null) as { template?: unknown; branding?: unknown; pages?: unknown } | null
  if (!body || (body.template === undefined && body.branding === undefined && body.pages === undefined)) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Send a template, the branding or the pages to save.' } }, { status: 422 })
  }
  const before = await prisma.company.findUnique({ where: { id: companyId }, select: SELECT }) as Row | null
  if (!before) return NextResponse.json({ error: { code: 'NO_COMPANY', message: 'That company is not found.' } }, { status: 404 })

  const data: Record<string, unknown> = {}
  let approvalCleared = false
  if (body.template !== undefined) {
    if (!isSiteTemplate(body.template)) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: `Pick a template: ${SITE_TEMPLATES.map((k) => SITE_TEMPLATE_NAMES[k]).join(', ')}.` } }, { status: 422 })
    }
    data.siteTemplate = body.template
  }
  if (body.branding !== undefined) {
    const b = checkBranding(body.branding)
    if (!b.ok) return NextResponse.json({ error: { code: 'VALIDATION', message: b.says } }, { status: 422 })
    data.siteLogoRef = b.value.logoRef
    data.sitePrimaryColor = b.value.primaryColor
    data.siteSecondaryColor = b.value.secondaryColor
    data.siteFontPairing = b.value.fontPairing
    // A changed stored value clears the yes in the same write (record 111).
    if (brandingChanged(brandingOf(before), b.value) && (before.siteBrandingApprovedAt || before.siteBrandingApprovedHash)) {
      data.siteBrandingApprovedAt = null
      data.siteBrandingApprovedById = null
      data.siteBrandingApprovedHash = null
      approvalCleared = true
    }
  }
  if (body.pages !== undefined) {
    const p = checkPages(body.pages)
    if (!p.ok) return NextResponse.json({ error: { code: 'VALIDATION', message: p.says } }, { status: 422 })
    data.sitePages = p.value
  }
  const after = await prisma.company.update({ where: { id: companyId }, data, select: SELECT }) as Row
  await emit({ type: 'site.settings_saved', companyId, subjectType: 'Company', subjectId: companyId, actorPersonId: by, payload: { template: body.template !== undefined, branding: body.branding !== undefined, pages: body.pages !== undefined, approvalCleared } })
  if (approvalCleared) await emit({ type: 'site.branding_withdrawn', companyId, subjectType: 'Company', subjectId: companyId, actorPersonId: by, payload: { because: 'a stored branding value changed' } })
  return NextResponse.json({
    data: {
      ...screen(after), canSet: true, approvalCleared,
      ...(approvalCleared ? { says: 'Your branding changed, so your earlier approval no longer counts. Approve the new branding to keep the site able to go public.' } : {}),
    },
  })
}
