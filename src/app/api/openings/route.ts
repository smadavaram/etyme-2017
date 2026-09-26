import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { bestRoute, clientLabel, type Lead as SeatLead } from '@/lib/openings'

/**
 * GET /api/openings
 *
 * The seats, after the adverts have been collapsed onto them.
 *
 * This is the top of the diamond and it is the screen a recruiter actually
 * wants: not "eleven adverts came in" but "four seats, and one of them you
 * are seeing from three different primes". The three-primes case is the
 * whole argument — submit the same person down all three routes and the
 * client sees the name three times and rejects all three.
 *
 * Each seat carries which route to answer, and why that one. Not the
 * highest posted rate: a prime who pays in ninety days at $70 is worse
 * than one who pays in thirty at $65, and a prime you already have paper
 * with beats both.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Openings')
  if (notStaff) return notStaff

  const companyId = caller.company!.id
  const status = (request.nextUrl.searchParams.get('status') ?? 'LIVE').toUpperCase()

  const openings = await prisma.opening.findMany({
    where: { companyId, ...(status === 'ALL' ? {} : { status }) },
    include: {
      leads: { orderBy: { seenAt: 'desc' } },
      clientCompany: { select: { id: true, name: true } },
      requirements: { select: { id: true, title: true, status: true } },
      _count: { select: { representations: true } },
    },
    orderBy: { lastSeen: 'desc' },
  })

  // Who this company has paper with, and how fast they pay — the two
  // things that actually decide which route to answer.
  const primes = await knownPrimes(companyId)

  return NextResponse.json({
    data: {
      openings: openings.map((o) => {
        const leads: SeatLead[] = o.leads.map((l) => ({
          id: l.id,
          source: l.source as SeatLead['source'],
          postedBy: l.postedBy,
          title: l.title,
          skills: l.skills,
          location: l.location,
          rateCents: l.rateCents,
          seenAt: l.seenAt,
        }))

        const route = bestRoute(leads, primes)
        const posted = leads.map((l) => l.rateCents).filter((r): r is number => r !== null)

        return {
          id: o.id,
          title: o.title,
          skills: o.skills,
          location: o.location,
          status: o.status,
          headcount: o.headcount,
          // Most demand is blind, which is the ordinary case and not an
          // edge one. Say what can honestly be said instead of a blank.
          client: clientLabel({
            clientName: o.clientCompany?.name ?? null,
            inferredClient: o.inferredClient,
          }),
          clientKnown: o.clientCompany !== null,
          firstSeen: o.firstSeen.toISOString(),
          lastSeen: o.lastSeen.toISOString(),
          routeCount: new Set(
            leads.map((l) => l.postedBy?.toLowerCase()).filter(Boolean)
          ).size,
          leads: o.leads.map((l) => ({
            id: l.id,
            source: l.source,
            postedBy: l.postedBy,
            rateCents: l.rateCents,
            seenAt: l.seenAt.toISOString(),
            matchStrength: l.matchStrength,
            matchBecause: l.matchBecause,
          })),
          // The spread across routes, which is the number that tells a
          // recruiter whether the route choice is worth thinking about.
          rateLow: posted.length > 0 ? Math.min(...posted) : null,
          rateHigh: posted.length > 0 ? Math.max(...posted) : null,
          bestRoute: route
            ? {
                leadId: route.lead.id,
                postedBy: route.lead.postedBy,
                rateCents: route.lead.rateCents,
                because: route.because,
              }
            : null,
          // Once a role has been written up, the seat stops being a lead
          // and starts being a pipeline.
          requirements: o.requirements,
          holds: o._count.representations,
        }
      }),
      total: openings.length,
    },
  })
}

/**
 * The primes this company already deals with.
 *
 * Paper on file is proved by a master agreement; payment speed by the
 * terms on it. Both are read from what exists rather than asked for,
 * because a recruiter will not fill in a supplier form to get a
 * recommendation.
 */
async function knownPrimes(companyId: string) {
  const msas = await prisma.masterAgreement.findMany({
    where: { vendorId: companyId },
    select: {
      paymentTerms: true,
      client: { select: { name: true } },
    },
  })

  return msas.map((m) => ({
    postedBy: m.client.name,
    msaOnFile: true,
    paysInDays: m.paymentTerms,
  }))
}
