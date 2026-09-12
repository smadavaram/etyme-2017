import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { isConsultantSeat } from '@/lib/seat'
import { band, warnAbout, forTheConsultant, WINDOW_DAYS, type Observation } from '@/lib/benchmark'
import { isBadSubmission, type Reason } from '@/lib/outcomes'

/**
 * GET /api/benchmark?skills=SAP+FICO,S/4HANA&location=Denver&rate=13500
 *
 * What has actually cleared, for work like this.
 *
 * The outcome loop turning. Built from this company's own submissions and
 * what happened to them — not from a published survey, which says what a
 * job title pays somewhere and never what this kind of client accepted
 * last quarter through this kind of chain.
 *
 * A consultant asking gets the same figure with nothing identifying in it,
 * which is the one number nobody else will give them.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const url = request.nextUrl
  const skills = (url.searchParams.get('skills') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const location = url.searchParams.get('location')
  const rate = url.searchParams.get('rate') ? parseInt(url.searchParams.get('rate')!, 10) : null

  const now = new Date()
  const since = new Date(now.getTime() - WINDOW_DAYS * 86400000)

  const consultant = isConsultantSeat(caller)

  // Whose submissions the figure is built from.
  //
  // A vendor's own book. A consultant sees the market across the benches
  // they are actually on — which is theirs to know, and still names no
  // client and shows no single rate.
  const scope = consultant
    ? {
        fromCompany: {
          benchListings: {
            some: { consultant: { personId: caller.person.id }, revokedAt: null },
          },
        },
      }
    : { fromCompanyId: caller.company?.id ?? '__none__' }

  const submissions = await prisma.submission.findMany({
    where: { ...scope, submittedAt: { gte: since } },
    select: {
      rate: true,
      rejectReason: true,
      submittedAt: true,
      requirement: { select: { skills: true, location: true } },
    },
    take: 2000,
  })

  const observations: Observation[] = submissions.map((s) => ({
    rateCents: s.rate,
    // Survived means the client did not throw it out over the money. A
    // band that counts the rate rejections is a record of what people
    // asked for, which is the number that got them rejected.
    survived: !(s.rejectReason && isBadSubmission(s.rejectReason as Reason) && s.rejectReason === 'RATE'),
    skills: s.requirement.skills,
    location: s.requirement.location,
    at: s.submittedAt,
  }))

  const b = band(observations, { skills, location }, now)

  return NextResponse.json({
    data: {
      asked: { skills, location },
      band: b,
      // Nothing identifying, and nothing at all until there is enough
      // behind it that one person's rate is not visible in the figure.
      forConsultant: forTheConsultant(b, { skills, location }),
      warning: rate !== null ? warnAbout(rate, b) : null,
      builtFrom: observations.length,
      windowDays: WINDOW_DAYS,
    },
  })
}
