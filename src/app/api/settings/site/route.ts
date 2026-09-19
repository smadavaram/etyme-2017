import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { staffOnly } from '@/lib/seat'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import {
  writeVoice, writeFromRules, checkEdit, modelAvailable,
  DEFAULT_HEADINGS, type SiteFacts,
} from '@/lib/site-voice'

/**
 * GET   /api/settings/site — what their page says, and how it got written
 * POST  /api/settings/site — write it again
 * PATCH /api/settings/site — change a line by hand
 *
 * Base44 and its kind generate a website you then own and maintain. That is
 * good and it has one failure this product cannot afford: the moment it is
 * generated it starts going out of date, because nothing on it is connected
 * to anything.
 *
 * So only the words are generated here. The numbers on the page — open
 * positions, who is coming free, what insurance is in date — are read live
 * from the same rows the dashboard reads, and cannot go stale because
 * nothing copied them.
 *
 * Regenerating is offered rather than automatic. A company that has written
 * their own line should never lose it because their headcount changed.
 */

async function factsFor(companyId: string): Promise<SiteFacts> {
  const now = new Date()

  const [company, placements, activeNow, contracts, profiles, positions, courses, rollingOff] =
    await Promise.all([
      prisma.company.findUniqueOrThrow({
        where: { id: companyId },
        select: {
          name: true, kind: true, supplierPosture: true,
          locations: { where: { isRemote: false }, select: { city: true, state: true, country: true } },
        },
      }),
      prisma.sellContract.count({ where: { companyId } }),
      prisma.sellContract.count({ where: { companyId, state: 'IN_PROGRESS' } }),
      prisma.sellContract.findMany({
        where: { companyId },
        select: { endClientCompanyId: true, clientCompanyId: true },
      }),
      prisma.consultantProfile.findMany({
        where: { listings: { some: { companyId, revokedAt: null } } },
        select: { skills: true },
      }),
      prisma.requirement.count({ where: { companyId, openToNetwork: true, status: 'OPEN' } }),
      prisma.course.count({ where: { companyId, isPublic: true } }),
      prisma.sellContract.count({
        where: {
          companyId,
          state: { in: ['IN_PROGRESS', 'PAUSED'] },
          endDate: { not: null, gte: now, lte: new Date(now.getTime() + 90 * 86_400_000) },
        },
      }),
    ])

  const counts = new Map<string, number>()
  for (const p of profiles) for (const s of p.skills) counts.set(s, (counts.get(s) ?? 0) + 1)

  return {
    name: company.name,
    kind: company.kind,
    posture: company.supplierPosture,
    skills: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([s]) => s),
    locations: [...new Set(
      company.locations.map((l) => [l.city, l.state ?? l.country].filter(Boolean).join(', ')).filter(Boolean)
    )],
    placements,
    activeNow,
    clients: new Set(contracts.map((c) => c.endClientCompanyId ?? c.clientCompanyId)).size,
    openPositions: positions,
    comingFree: rollingOff,
    trainingCourses: courses,
  }
}

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'The public site editor')
  if (notStaff) return notStaff
  if (!caller.company) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'A site belongs to a company' } },
      { status: 403 }
    )
  }

  const company = await prisma.company.findUniqueOrThrow({
    where: { id: caller.company.id },
    select: {
      slug: true, siteTagline: true, siteIntro: true, siteHeadings: true,
      siteWrittenBy: true, siteWrittenAt: true,
    },
  })

  const facts = await factsFor(caller.company.id)
  // What it would say if written now, so somebody can compare before
  // replacing what is there.
  const wouldSay = writeFromRules(facts)

  return NextResponse.json({
    data: {
      url: `https://${company.slug}.etyme.com`,
      tagline: company.siteTagline ?? wouldSay.tagline,
      intro: company.siteIntro ?? wouldSay.intro,
      headings: { ...DEFAULT_HEADINGS, ...((company.siteHeadings as Record<string, string>) ?? {}) },
      writtenBy: company.siteTagline === null ? 'NOT_YET' : company.siteWrittenBy ?? 'PERSON',
      writtenAt: company.siteWrittenAt?.toISOString().slice(0, 10) ?? null,
      // The facts it would be written from, shown so the words are never a
      // black box — somebody disagreeing with a sentence can see what it
      // was drawn from.
      basedOn: facts,
      preview: { tagline: wouldSay.tagline, intro: wouldSay.intro },
      canWrite: hasPermission(caller.permissions, 'settings.manage'),
      // Said plainly rather than silently producing a lesser result.
      modelAvailable: modelAvailable(),
      note: modelAvailable()
        ? 'Written for you from your own numbers.'
        : 'No writing key is set, so this is written from your numbers by rule. It is plainer, and everything on it is still true.',
    },
  })
}

/**
 * POST — write it again.
 *
 * Offered rather than automatic, because a company that wrote their own
 * line should never lose it to a headcount change.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company || !hasPermission(caller.permissions, 'settings.manage')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Writing your public page needs settings.manage' } },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const existing = await prisma.company.findUniqueOrThrow({
    where: { id: caller.company.id },
    select: { siteTagline: true, siteWrittenBy: true },
  })

  // Replacing something a person wrote is worth asking about once.
  if (existing.siteWrittenBy === 'PERSON' && existing.siteTagline && body.replaceMine !== true) {
    return NextResponse.json(
      {
        error: {
          code: 'WOULD_REPLACE_YOURS',
          message: 'You wrote this yourself. Writing it again would replace your words — send replaceMine: true if that is what you want.',
          yours: existing.siteTagline,
        },
      },
      { status: 409 }
    )
  }

  const facts = await factsFor(caller.company.id)
  const voice = await writeVoice(facts)

  await prisma.company.update({
    where: { id: caller.company.id },
    data: {
      siteTagline: voice.tagline,
      siteIntro: voice.intro,
      siteHeadings: voice.headings as any,
      siteWrittenBy: voice.writtenBy,
      siteWrittenAt: new Date(),
    },
  })

  await prisma.automationLog.create({
    data: {
      companyId: caller.company.id,
      action: 'SITE_WRITTEN',
      summary: `${caller.person.name} had the public page written again`,
      reason: voice.writtenBy === 'MODEL'
        ? 'Written from the company’s own numbers'
        : 'Written by rule — no writing key is configured',
      payload: { writtenBy: voice.writtenBy, basedOn: facts as any },
      reversible: true,
    },
  })

  return NextResponse.json({
    data: {
      tagline: voice.tagline,
      intro: voice.intro,
      headings: voice.headings,
      writtenBy: voice.writtenBy,
      note: voice.note,
      message: 'Your page is written. Every number on it stays live — only the words are stored.',
    },
  })
}

/** PATCH — change a line by hand. It is their page. */
export async function PATCH(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company || !hasPermission(caller.permissions, 'settings.manage')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Editing your public page needs settings.manage' } },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const data: Record<string, unknown> = {}

  for (const field of ['tagline', 'intro'] as const) {
    if (typeof body[field] !== 'string') continue
    const verdict = checkEdit(field, body[field])
    if (!verdict.ok) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: verdict.reason, field } },
        { status: 422 }
      )
    }
    data[field === 'tagline' ? 'siteTagline' : 'siteIntro'] = body[field].trim()
  }

  if (body.headings && typeof body.headings === 'object') {
    const clean: Record<string, string> = {}
    for (const k of Object.keys(DEFAULT_HEADINGS)) {
      const v = body.headings[k]
      if (typeof v === 'string' && v.trim() && v.trim().length <= 60) clean[k] = v.trim()
    }
    if (Object.keys(clean).length > 0) data.siteHeadings = clean as any
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Nothing to change' } },
      { status: 422 }
    )
  }

  // Marked as theirs, so writing it again asks before replacing it.
  data.siteWrittenBy = 'PERSON'
  data.siteWrittenAt = new Date()

  const updated = await prisma.company.update({
    where: { id: caller.company.id },
    data,
    select: { siteTagline: true, siteIntro: true, siteHeadings: true, slug: true },
  })

  return NextResponse.json({
    data: {
      tagline: updated.siteTagline,
      intro: updated.siteIntro,
      headings: updated.siteHeadings,
      url: `https://${updated.slug}.etyme.com`,
      message: 'Saved. These are your words now — writing the page again will ask before replacing them.',
    },
  })
}
