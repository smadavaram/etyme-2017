import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { endClientFilter } from '@/lib/resolve-end-client'
import { merge, order, summarise, type Person, type Offer } from '@/lib/one-person'
import { bestMatchPerPerson, type Candidate } from '@/lib/identity-resolution'

/**
 * GET /api/people — everyone who has been put in front of you, merged
 *
 * One record per person, however many suppliers are selling them. The
 * client's own register, and the only place it can be assembled: every
 * fact in it sits in a different supplier's system and none of them can
 * see the others.
 *
 * Scoped to submissions addressed to this company. A person a supplier
 * has on their bench and has never put forward here is none of this
 * client's business.
 */

const DAY = 86_400_000

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'The register')
  if (notStaff) return notStaff

  const companyId = caller.company!.id
  const now = new Date()

  const subs = await prisma.submission.findMany({
    where: { toCompanyId: companyId },
    select: {
      personId: true, rate: true, submittedAt: true, requirementId: true,
      status: true, screenState: true,
      person: { select: { id: true, name: true } },
      fromCompany: { select: { id: true, name: true } },
      requirement: { select: { title: true } },
    },
    orderBy: { submittedAt: 'desc' },
    take: 2000,
  })

  const personIds = [...new Set(subs.map((s) => s.personId))]

  const [contracts, barred, cap, interviews, profiles] = await Promise.all([
    // Time served here, through anybody. Counted against the person,
    // which is the entire reason this register is worth having.
    prisma.sellContract.findMany({
      where: { ...endClientFilter(companyId), personId: { in: personIds } },
      select: {
        personId: true, startDate: true, endDate: true,
        company: { select: { name: true } },
      },
    }),
    prisma.blacklist.findMany({
      where: {
        companyId,
        targetType: 'PERSON',
        targetId: { in: personIds },
        liftedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { targetId: true, reason: true, blockedAt: true },
    }),
    prisma.governanceRule.findFirst({
      where: {
        ruleType: 'TENURE_CAP',
        isActive: true,
        policy: { companyId, isActive: true },
      },
      select: { parameters: true },
    }),
    // Somebody mid-process is further along than the submission row
    // knows: status lags, and an interview booked yesterday is the
    // truest thing on the record.
    prisma.interview.findMany({
      where: { companyId, state: { in: ['PROPOSED', 'CONFIRMED'] } },
      select: { submission: { select: { personId: true } } },
    }),
    // For the other kind of duplicate — see the possibleDuplicate note
    // on Merged below. This is the only thing on this route that reads
    // outside this company's own submissions/contracts, and it stays
    // inside them: only the mobile, location and skills of people
    // already on this register, never a lookup of anybody else's.
    prisma.consultantProfile.findMany({
      where: { personId: { in: personIds } },
      select: { personId: true, mobile: true, location: true, skills: true },
    }),
  ])

  const capMonths = (cap?.parameters as any)?.maxMonths ?? null
  const barredBy = new Map(barred.map((b) => [b.targetId, b]))
  const interviewing = new Set(interviews.map((i) => i.submission.personId))

  const byPerson = new Map<string, Person>()

  for (const s of subs) {
    const row: Person =
      byPerson.get(s.personId) ??
      ({
        personId: s.personId,
        name: s.person.name,
        offers: [] as Offer[],
        stints: contracts
          .filter((c) => c.personId === s.personId && c.endDate)
          .map((c) => ({
            months: Math.max(
              0,
              Math.round((c.endDate!.getTime() - c.startDate.getTime()) / DAY / 30.44)
            ),
            endedAt: c.endDate,
            vendorName: c.company.name,
          })),
        barred: barredBy.has(s.personId)
          ? {
              at: barredBy.get(s.personId)!.blockedAt,
              reason: barredBy.get(s.personId)!.reason,
            }
          : null,
        capMonths,
      } satisfies Person)

    const offer: Offer = {
      vendorName: s.fromCompany.name,
      vendorId: s.fromCompany.id,
      rateCents: s.rate,
      submittedAt: s.submittedAt,
      requirementId: s.requirementId,
      roleTitle: s.requirement.title,
      cleared:
        s.screenState === 'READY' ? true : s.screenState === 'NEEDS_FIX' ? false : null,
      state: stateOf(s.status, interviewing.has(s.personId)),
    }

    row.offers.push(offer)
    byPerson.set(s.personId, row)
  }

  const rows = order([...byPerson.values()].map((p) => merge(p, now)))

  // ── The other kind of duplicate ──────────────────────────────────────
  //
  // merge() already collapses the same personId showing up in two
  // submissions — that was never the bug. The one still open: two
  // *different* personIds, from two suppliers who have never met, that
  // are offline the same human. Nothing above catches that, because
  // nothing above compares one row against another — each Person object
  // is built and merged in isolation.
  //
  // Run the same comparison /dashboard/identity uses, but against only
  // the people already on this register, and pin the best match onto
  // each row so it is visible on the screen a client is already reading
  // rather than a second page they have to know exists. Still never
  // merges — CLAUDE.md: "probabilistic matches surfaced for human
  // confirmation, never silently merged."
  const profileByPerson = new Map(profiles.map((p) => [p.personId, p]))
  const candidates: Candidate[] = [...byPerson.values()].map((p) => {
    const profile = profileByPerson.get(p.personId)
    return {
      personId: p.personId,
      name: p.name,
      mobile: profile?.mobile ?? null,
      // Not fetched here — compare() never actually reads it (only
      // mobile is a decisive signal), and adding a Person query just to
      // populate an unused field isn't worth the extra round trip.
      email: null,
      location: profile?.location ?? null,
      skills: profile?.skills ?? [],
      stints: contracts
        .filter((c) => c.personId === p.personId)
        .map((c) => ({
          start: c.startDate,
          end: c.endDate,
          vendorName: c.company.name,
          months: c.endDate
            ? Math.max(0, Math.round((c.endDate.getTime() - c.startDate.getTime()) / DAY / 30.44))
            : 0,
        })),
    }
  })

  const bestMatch = bestMatchPerPerson(candidates)

  for (const row of rows) {
    const m = bestMatch.get(row.personId)
    if (!m) continue
    const otherId = m.aId === row.personId ? m.bId : m.aId
    const other = candidates.find((c) => c.personId === otherId)
    if (!other) continue
    row.possibleDuplicate = {
      personId: otherId,
      name: other.name,
      confidence: m.confidence,
      says: m.says,
    }
  }

  return NextResponse.json({
    data: { people: rows, summary: summarise(rows), capMonths },
  })
}

/**
 * Where a submission has got to.
 *
 * An interview in the diary outranks the pipeline field, which lags
 * behind whatever somebody last remembered to update.
 */
function stateOf(status: string, hasInterview: boolean): Offer['state'] {
  if (status === 'PLACED') return 'PLACED'
  if (status === 'OFFERED') return 'OFFERED'
  if (hasInterview) return 'INTERVIEWING'
  if (status === 'REJECTED' || status === 'WITHDRAWN') return 'REJECTED'
  return 'SUBMITTED'
}
