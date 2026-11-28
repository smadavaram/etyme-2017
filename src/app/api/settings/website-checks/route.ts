import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { emit } from '@/lib/events'
import { maySwitchPlugin, pluginsOfferedTo, notOfferedSays, websiteChecklist, websiteFacts } from '@/lib/plugins'
import { momentFor } from '@/lib/when'
import { approvalHolds, brandingFingerprint, brandingIsStored, type Branding } from '@/lib/site-settings'

/**
 * The Owner's two stored checks for the Website switch (records 121, 123).
 *
 * GET   /api/settings/website-checks   the three checks, and who set what, for an Owner or Admin.
 * PATCH { brandingApproved?, compliancePassRequired? }   the Owner approves or withdraws the
 *       branding (a dated record of who), or says whether a compliance pass is required.
 * POST  { passedAt, fileName, contentType, contentBase64, note? }   the Owner records a pass
 *       with the day it passed and the paper attached.
 *
 * Owner only, a verified Owner, never the twin or an agent. Every act is an Event.
 */

const MAX_BYTES = 5 * 1024 * 1024
const PASS_TEMPLATE = 'Site compliance pass'

function storedOf(c: { siteLogoRef: string | null; sitePrimaryColor: string | null; siteSecondaryColor: string | null; siteFontPairing: string | null }): Branding {
  return { logoRef: c.siteLogoRef, primaryColor: c.sitePrimaryColor, secondaryColor: c.siteSecondaryColor, fontPairing: c.siteFontPairing }
}

async function readScreen(companyId: string) {
  const [c, passes, facts] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { siteBrandingApprovedAt: true, siteBrandingApprovedById: true, siteBrandingApprovedHash: true, siteLogoRef: true, sitePrimaryColor: true, siteSecondaryColor: true, siteFontPairing: true, siteCompliancePassRequired: true } }),
    prisma.siteCompliancePass.findMany({ where: { companyId }, orderBy: { passedAt: 'desc' }, take: 50, include: { document: { select: { fileName: true } } } }),
    websiteFacts(companyId),
  ])
  const ids = [...new Set([c?.siteBrandingApprovedById, ...passes.map((p) => p.recordedById)].filter((x): x is string => Boolean(x)))]
  const people = await prisma.person.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
  const name = (id: string | null | undefined) => (id ? people.find((p) => p.id === id)?.name ?? 'Somebody who has left' : null)
  return {
    branding: c?.siteBrandingApprovedAt && approvalHolds(c.siteBrandingApprovedAt, c.siteBrandingApprovedHash, storedOf(c))
      ? { approved: true, by: name(c.siteBrandingApprovedById), at: c.siteBrandingApprovedAt.toISOString(), atWords: momentFor(c.siteBrandingApprovedAt, 'UTC') }
      : { approved: false, by: null, at: null, atWords: null },
    compliancePassRequired: Boolean(c?.siteCompliancePassRequired),
    passes: passes.map((p) => ({ id: p.id, passedAt: p.passedAt.toISOString().slice(0, 10), by: name(p.recordedById), fileName: p.document.fileName, note: p.note })),
    checks: websiteChecklist(facts),
  }
}

async function owner(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return { error }
  const may = await maySwitchPlugin({ ...caller, twin: Boolean((caller as any).twin) })
  if (!may.ok) {
    return { error: NextResponse.json({ error: { code: may.code === 'OWNER_NOT_VERIFIED' ? 'OWNER_NOT_VERIFIED' : 'FORBIDDEN', message: may.says, ...(may.href ? { href: may.href } : {}) } }, { status: 403 }) }
  }
  const by = realPersonId(caller)
  if (!by) return { error: NextResponse.json({ error: { code: 'PERSON_REQUIRED', message: 'An integration cannot approve a site. An Owner has to.' } }, { status: 403 }) }
  if (!pluginsOfferedTo(caller.company!.kind).some((p) => p.key === 'WEBSITE')) {
    return { error: NextResponse.json({ error: { code: 'NOT_OFFERED', message: notOfferedSays() } }, { status: 403 }) }
  }
  return { caller, by, companyId: caller.company!.id }
}

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) return NextResponse.json({ error: { code: 'NO_COMPANY', message: 'The site checks are a company setting. Open them from a company seat.' } }, { status: 403 })
  const role = caller.context.roleId
    ? await prisma.role.findFirst({ where: { id: caller.context.roleId, companyId: caller.company.id }, select: { name: true } })
    : null
  if (!role || (role.name !== 'Owner' && role.name !== 'Admin')) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: `The site checks at ${caller.company.name} are read by its Owners and Admins.` } }, { status: 403 })
  }
  if (!pluginsOfferedTo(caller.company.kind).some((p) => p.key === 'WEBSITE')) {
    return NextResponse.json({ error: { code: 'NOT_OFFERED', message: notOfferedSays() } }, { status: 403 })
  }
  return NextResponse.json({ data: { ...(await readScreen(caller.company.id)), canSet: role.name === 'Owner' } })
}

export async function PATCH(request: NextRequest) {
  const o = await owner(request)
  if ('error' in o && o.error) return o.error
  const { by, companyId } = o as { by: string; companyId: string }
  const body = await request.json().catch(() => null) as { brandingApproved?: unknown; compliancePassRequired?: unknown } | null
  const hasB = typeof body?.brandingApproved === 'boolean'
  const hasR = typeof body?.compliancePassRequired === 'boolean'
  if (!body || (!hasB && !hasR)) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Say whether the branding is approved, or whether a compliance pass is required.' } }, { status: 422 })
  }
  if (hasB) {
    const approved = body.brandingApproved as boolean
    let hash: string | null = null
    if (approved) {
      // The yes is over the values stored now (record 111), so there must be some.
      const stored = await prisma.company.findUnique({ where: { id: companyId }, select: { siteLogoRef: true, sitePrimaryColor: true, siteSecondaryColor: true, siteFontPairing: true } })
      const b = stored ? storedOf(stored) : null
      if (!b || !brandingIsStored(b)) {
        return NextResponse.json({ error: { code: 'BRANDING_NOT_STORED', message: 'Save your branding first: at least the primary color. The yes is over what is saved.' } }, { status: 422 })
      }
      hash = brandingFingerprint(b)
    }
    await prisma.company.update({ where: { id: companyId }, data: approved ? { siteBrandingApprovedAt: new Date(), siteBrandingApprovedById: by, siteBrandingApprovedHash: hash } : { siteBrandingApprovedAt: null, siteBrandingApprovedById: null, siteBrandingApprovedHash: null } })
    await emit({ type: approved ? 'site.branding_approved' : 'site.branding_withdrawn', companyId, subjectType: 'Company', subjectId: companyId, actorPersonId: by, payload: {} })
  }
  if (hasR) {
    const required = body.compliancePassRequired as boolean
    await prisma.company.update({ where: { id: companyId }, data: { siteCompliancePassRequired: required } })
    await emit({ type: 'site.compliance_pass_required_set', companyId, subjectType: 'Company', subjectId: companyId, actorPersonId: by, payload: { required } })
  }
  return NextResponse.json({ data: { ...(await readScreen(companyId)), canSet: true } })
}

export async function POST(request: NextRequest) {
  const o = await owner(request)
  if ('error' in o && o.error) return o.error
  const { by, companyId } = o as { by: string; companyId: string }
  const body = await request.json().catch(() => null) as { passedAt?: unknown; fileName?: unknown; contentType?: unknown; contentBase64?: unknown; note?: unknown } | null
  const day = typeof body?.passedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.passedAt) ? new Date(`${body.passedAt}T00:00:00.000Z`) : null
  if (!day || Number.isNaN(day.getTime())) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Say the day the pass was passed.' } }, { status: 422 })
  if (day.getTime() > Date.now()) return NextResponse.json({ error: { code: 'VALIDATION', message: 'A pass that has not happened yet cannot be recorded.' } }, { status: 422 })
  const fileName = typeof body?.fileName === 'string' ? body.fileName.trim() : ''
  const contentType = typeof body?.contentType === 'string' && body.contentType.trim() ? body.contentType.trim() : 'application/octet-stream'
  const bytes = typeof body?.contentBase64 === 'string' && body.contentBase64 ? Buffer.from(body.contentBase64, 'base64') : null
  if (!fileName || !bytes || bytes.length === 0) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Attach the document that shows the pass.' } }, { status: 422 })
  }
  if (bytes.length > MAX_BYTES) return NextResponse.json({ error: { code: 'VALIDATION', message: 'That file is over 5 MB. Attach a smaller one.' } }, { status: 422 })
  const note = typeof body?.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : null
  const pass = await prisma.$transaction(async (tx) => {
    const template = (await tx.docTemplate.findFirst({ where: { companyId, name: PASS_TEMPLATE }, select: { id: true } }))
      ?? (await tx.docTemplate.create({ data: { companyId, name: PASS_TEMPLATE, audience: 'GENERAL' }, select: { id: true } }))
    const doc = await tx.docInstance.create({
      data: { templateId: template.id, subjectType: 'COMPANY', subjectId: companyId, status: 'UPLOADED', fileName, signedById: by, signedAt: new Date(), note },
      select: { id: true },
    })
    await tx.docFile.create({ data: { docInstanceId: doc.id, fileName, contentType, sizeBytes: bytes.length, bytes, uploadedById: by } })
    return tx.siteCompliancePass.create({ data: { companyId, passedAt: day, recordedById: by, documentId: doc.id, note }, select: { id: true } })
  })
  await emit({ type: 'site.compliance_pass_recorded', companyId, subjectType: 'SiteCompliancePass', subjectId: pass.id, actorPersonId: by, payload: { passedAt: body!.passedAt } })
  return NextResponse.json({ data: { ...(await readScreen(companyId)), canSet: true } }, { status: 201 })
}
