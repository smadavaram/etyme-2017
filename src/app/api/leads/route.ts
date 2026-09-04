import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { splitAdverts, readLead, pasteSentence } from '@/lib/lead-reader'
import { sameSeat, type Lead as SeatLead } from '@/lib/openings'

/**
 * The door into the demand cone.
 *
 * Openings and the seat-matching that collapses them were built and
 * unreachable: leads 0, openings 0, because the only way to get demand into
 * this system was to hand-type a requirement. Nobody hand-types a Dice
 * advert at nine at night.
 *
 * POST /api/leads  { text }   — paste one advert, or a morning's worth
 * GET  /api/leads             — what came in, newest first
 *
 * Each advert is read, then matched against the seats this company is
 * already working. SAME collapses on its own. LIKELY is kept apart and
 * flagged for a person — the same rule CLAUDE.md sets for resolving people,
 * because a wrongly merged seat loses a live role and nobody notices.
 */

/** How far back to look for a seat this might be. */
const WINDOW_DAYS = 45

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Leads')
  if (notStaff) return notStaff

  const companyId = caller.company!.id

  let body: { text?: string }
  try {
    body = await request.json()
  } catch {
    return bad('Paste an advert into the box.')
  }

  const adverts = splitAdverts(body.text ?? '')
  if (adverts.length === 0) {
    return bad('Paste an advert into the box.')
  }
  if (adverts.length > 40) {
    return bad(
      `That is ${adverts.length} adverts in one go. Forty at a time — past that it is worth checking the split is right before it writes anything.`
    )
  }

  // The seats already being worked, with the adverts behind each one, so a
  // new paste can be matched against what is actually there.
  const since = new Date(Date.now() - WINDOW_DAYS * 86400000)
  const openings = await prisma.opening.findMany({
    where: { companyId, status: 'LIVE', lastSeen: { gte: since } },
    include: { leads: { orderBy: { seenAt: 'desc' }, take: 5 } },
  })

  const created: any[] = []
  let newOpenings = 0
  let collapsed = 0
  let needsAPerson = 0

  for (const advert of adverts) {
    const read = readLead(advert)

    const asSeat: SeatLead = {
      id: 'incoming',
      source: read.source,
      postedBy: read.postedBy,
      title: read.title,
      skills: read.skills,
      location: read.location,
      rateCents: read.rateCents,
      seenAt: new Date(),
    }

    // Best verdict across every advert behind every live seat. A seat is
    // the same seat if any of its adverts is.
    let best: { openingId: string; strength: string; because: string[] } | null = null

    for (const opening of openings) {
      for (const existing of opening.leads) {
        const verdict = sameSeat(asSeat, {
          id: existing.id,
          source: existing.source as SeatLead['source'],
          postedBy: existing.postedBy,
          title: existing.title,
          skills: existing.skills,
          location: existing.location,
          rateCents: existing.rateCents,
          seenAt: existing.seenAt,
        })

        if (verdict.strength === 'UNRELATED') continue
        if (best === null || (verdict.strength === 'SAME' && best.strength !== 'SAME')) {
          best = { openingId: opening.id, strength: verdict.strength, because: verdict.because }
        }
      }
    }

    // SAME joins the seat. LIKELY is recorded against it and left for a
    // person to confirm — nothing merges silently.
    const joins = best?.strength === 'SAME'
    let openingId: string

    if (joins) {
      openingId = best!.openingId
      await prisma.opening.update({
        where: { id: openingId },
        data: { lastSeen: new Date() },
      })
      collapsed++
    } else {
      const opening = await prisma.opening.create({
        data: {
          companyId,
          title: read.title,
          skills: read.skills,
          location: read.location,
        },
        include: { leads: true },
      })
      openingId = opening.id
      // Pushed with an empty leads array and filled in below. Without the
      // fill, two adverts for the same seat pasted together never met:
      // the second compared itself against a seat with nothing behind it
      // and started a third. Which is the exact failure this screen exists
      // to prevent, happening inside the screen.
      openings.push(opening)
      newOpenings++
      if (best?.strength === 'LIKELY') needsAPerson++
    }

    const lead = await prisma.lead.create({
      data: {
        companyId,
        source: read.source,
        postedBy: read.postedBy,
        title: read.title,
        skills: read.skills,
        location: read.location,
        rateCents: read.rateCents,
        contact: read.contact,
        text: read.text,
        openingId,
        matchStrength: best?.strength ?? null,
        matchBecause: best?.because ?? [],
        // Where the question points. Only set when the matching would not
        // commit — without it the person is asked "is this the same seat
        // as itself".
        likeOpeningId: !joins && best?.strength === 'LIKELY' ? best.openingId : null,
      },
    })

    const home = openings.find((o) => o.id === openingId)
    if (home) home.leads.unshift(lead)

    created.push({
      id: lead.id,
      title: lead.title,
      source: lead.source,
      postedBy: lead.postedBy,
      location: lead.location,
      rateCents: lead.rateCents,
      skills: lead.skills,
      openingId,
      joinedExistingSeat: joins,
      maybeDuplicate: !joins && best?.strength === 'LIKELY',
      because: best?.because ?? [],
      unknowns: read.unknowns,
    })
  }

  const summary = pasteSentence({
    read: adverts.length,
    newOpenings,
    collapsed,
    needsAPerson,
  })

  await prisma.automationLog.create({
    data: {
      companyId,
      action: 'LEADS_READ',
      summary,
      reason: `${caller.person.name} pasted ${adverts.length} advert${adverts.length === 1 ? '' : 's'}`,
      payload: { leadIds: created.map((l) => l.id), collapsed, newOpenings, needsAPerson },
      // Deleting a lead is a delete, and the adverts are kept whole.
      reversible: true,
    },
  })

  return NextResponse.json({ data: { summary, leads: created } }, { status: 201 })
}

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Leads')
  if (notStaff) return notStaff

  const url = request.nextUrl
  const openingId = url.searchParams.get('openingId') ?? undefined
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10)))

  const leads = await prisma.lead.findMany({
    // Leads are private. Two vendors chasing the same seat each keep their
    // own, because neither can see the other's pipeline.
    where: { companyId: caller.company!.id, ...(openingId ? { openingId } : {}) },
    orderBy: { seenAt: 'desc' },
    take: limit,
    include: { opening: { select: { id: true, title: true, status: true } } },
  })

  return NextResponse.json({
    data: {
      leads: leads.map((l) => ({
        id: l.id,
        source: l.source,
        postedBy: l.postedBy,
        title: l.title,
        skills: l.skills,
        location: l.location,
        rateCents: l.rateCents,
        contact: l.contact,
        seenAt: l.seenAt.toISOString(),
        opening: l.opening,
        matchStrength: l.matchStrength,
        matchBecause: l.matchBecause,
      })),
      total: leads.length,
    },
  })
}

function bad(message: string) {
  return NextResponse.json(
    { error: { code: 'VALIDATION', message, field: 'text' } },
    { status: 422 }
  )
}
