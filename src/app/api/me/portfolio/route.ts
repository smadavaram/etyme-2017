import { NextRequest, NextResponse } from 'next/server'
import { getSessionEmail } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { checkSlug, checkBioEdit, bioModelAvailable, buildPortfolio } from '@/lib/consultant-portfolio'
import { factsFor, addressTaken, suggestAddress } from '@/lib/portfolio-data'

/**
 * GET   /api/me/portfolio — their page, and whether it is on
 * PATCH /api/me/portfolio — their address, their words, whether it is on
 *
 * Authenticated by session rather than by company context, deliberately.
 *
 * A consultant's page belongs to them, not to whichever agency currently
 * represents them. Going through getCallerContext would have made it a
 * company resource — editable by a recruiter with the right permission,
 * and lost the day the bench listing is revoked. It is the one thing here
 * that has to survive leaving.
 */

async function me() {
  const email = await getSessionEmail()
  if (!email) return null
  return prisma.person.findUnique({
    where: { primaryEmail: email },
    select: { id: true, name: true, consultant: true },
  })
}

const unauthenticated = NextResponse.json(
  { error: { code: 'UNAUTHORIZED', message: 'Not signed in' } },
  { status: 401 }
)

const noProfile = NextResponse.json(
  {
    error: {
      code: 'NO_PROFILE',
      message: 'You do not have a consultant profile yet. One is made when you join a bench.',
    },
  },
  { status: 404 }
)

export async function GET(_request: NextRequest) {
  const person = await me()
  if (!person) return unauthenticated
  if (!person.consultant) return noProfile

  const p = person.consultant

  // What a stranger would see. Shown whether the page is on or off,
  // because somebody deciding whether to turn it on has to be able to read
  // it first — publishing to find out what you published is backwards.
  const facts = await factsFor(person.id)
  const preview = facts ? buildPortfolio(facts, new Date()) : null

  return NextResponse.json({
    data: {
      address: p.slug,
      url: p.slug ? `/c/${p.slug}` : null,
      // Held forever so an old link never lands on somebody else.
      previousAddresses: p.previousSlugs,
      suggestion: p.slug ? null : suggestAddress(person.name),
      on: p.pageLiveAt !== null,
      liveSince: p.pageLiveAt?.toISOString().slice(0, 10) ?? null,
      headline: p.bioHeadline,
      intro: p.bioIntro,
      writtenBy: p.bioIntro === null ? 'NOT_YET' : p.bioWrittenBy ?? 'PERSON',
      availableFrom: p.availableFrom?.toISOString().slice(0, 10) ?? null,
      // Their own words win over anything written for them, here exactly
      // as they do on the page itself.
      preview: preview && {
        ...preview,
        headline: p.bioHeadline ?? preview.headline,
        intro: p.bioIntro ?? preview.intro,
      },
      modelAvailable: bioModelAvailable(),
      note: p.pageLiveAt === null
        ? 'Your page is off. Nothing is public until you turn it on.'
        : 'Your page is on. The numbers on it are read live from your work — only the words are stored.',
    },
  })
}

/**
 * PATCH — their address, their words, whether the page is on at all.
 *
 * Everything is optional, so a change of one thing is not a rewrite of
 * everything.
 */
export async function PATCH(request: NextRequest) {
  const person = await me()
  if (!person) return unauthenticated
  if (!person.consultant) return noProfile

  const p = person.consultant
  const body = await request.json().catch(() => ({}))
  const data: Record<string, unknown> = {}
  const said: string[] = []

  // ── The address ────────────────────────────────────────────────────
  if (typeof body.address === 'string' && body.address.trim()) {
    const verdict = checkSlug(body.address, new Set())
    if (!verdict.ok || !verdict.value) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: verdict.reason, field: 'address' } },
        { status: 422 }
      )
    }
    if (verdict.value !== p.slug) {
      if (await addressTaken(verdict.value, p.id)) {
        return NextResponse.json(
          {
            error: {
              code: 'TAKEN',
              message: `${verdict.value} is spoken for. An address is never handed on, so one somebody used before stays theirs.`,
              field: 'address',
            },
          },
          { status: 409 }
        )
      }
      data.slug = verdict.value
      // The old one is kept rather than freed, so a link that has been
      // sitting on a CV for two years still finds them.
      if (p.slug) data.previousSlugs = [...new Set([...p.previousSlugs, p.slug])]
      said.push(`Your page is at /c/${verdict.value}.`)
      if (p.slug) said.push(`/c/${p.slug} still works and always will.`)
    }
  }

  // ── The words ──────────────────────────────────────────────────────
  for (const field of ['headline', 'intro'] as const) {
    if (typeof body[field] !== 'string') continue
    const verdict = checkBioEdit(field, body[field])
    if (!verdict.ok) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: verdict.reason, field } },
        { status: 422 }
      )
    }
    data[field === 'headline' ? 'bioHeadline' : 'bioIntro'] = body[field].trim()
    // Marked as theirs, so writing it again asks before replacing it.
    data.bioWrittenBy = 'PERSON'
  }

  // ── Whether it is on ───────────────────────────────────────────────
  if (typeof body.on === 'boolean') {
    if (body.on && !p.slug && !data.slug) {
      return NextResponse.json(
        {
          error: {
            code: 'NO_ADDRESS',
            message: 'Pick an address first — there is nowhere for the page to be yet.',
          },
        },
        { status: 422 }
      )
    }
    // Its own switch, not the profile's visibility. That field is the
    // agency's — it decides whether they may show somebody to clients
    // inside the platform — and being on a bench is not agreeing to be
    // named on the open internet.
    data.pageLiveAt = body.on ? new Date() : null
    said.push(body.on ? 'Your page is live.' : 'Your page is off. It answers to nobody now.')
  }

  if (typeof body.availableFrom === 'string') {
    const d = new Date(body.availableFrom)
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'That is not a date.', field: 'availableFrom' } },
        { status: 422 }
      )
    }
    data.availableFrom = d
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Nothing to change' } },
      { status: 422 }
    )
  }

  const updated = await prisma.consultantProfile.update({
    where: { id: p.id },
    data,
    select: { slug: true, pageLiveAt: true, bioHeadline: true, bioIntro: true, previousSlugs: true },
  })

  return NextResponse.json({
    data: {
      address: updated.slug,
      url: updated.slug ? `/c/${updated.slug}` : null,
      previousAddresses: updated.previousSlugs,
      on: updated.pageLiveAt !== null,
      headline: updated.bioHeadline,
      intro: updated.bioIntro,
      message: said.join(' ') || 'Saved.',
    },
  })
}
