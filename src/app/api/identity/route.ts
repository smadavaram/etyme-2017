import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { endClientFilter } from '@/lib/resolve-end-client'
import {
  compare, worthAsking, summarise, ifConfirmed, type Candidate,
} from '@/lib/identity-resolution'

/**
 * GET  /api/identity — who might be the same person
 * POST /api/identity — somebody decides
 *
 * The tenure ledger is the one number this product sells on, and when a
 * client and a bench vendor are both here with the prime between them
 * offline, it counts one human twice and reports a confidently wrong
 * answer. A wrong number is worse than no number.
 *
 * Nothing merges. The rows stay separate and a confirmed link is read by
 * whatever aggregates — because merging two different contractors blocks
 * one on a cap they never earned and pays the other at somebody else's
 * rate, and both are found late by the person affected.
 */

const DAY = 86_400_000

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Identity')
  if (notStaff) return notStaff

  const companyId = caller.company!.id

  // Only people this company has already been shown. Identity resolution
  // that reached outside would be a directory of every contractor on the
  // platform, assembled one confirmation at a time.
  const [submitted, contracted] = await Promise.all([
    prisma.submission.findMany({
      where: { toCompanyId: companyId },
      select: { personId: true },
      distinct: ['personId'],
      take: 3000,
    }),
    prisma.sellContract.findMany({
      where: endClientFilter(companyId),
      select: { personId: true },
      distinct: ['personId'],
      take: 3000,
    }),
  ])

  const ids = [...new Set([...submitted, ...contracted].map((x) => x.personId))]

  const people = await prisma.person.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, name: true,
      consultant: { select: { mobile: true, location: true, skills: true } },
      sellContracts: {
        where: endClientFilter(companyId),
        select: {
          startDate: true, endDate: true,
          company: { select: { name: true } },
        },
      },
    },
  })

  const cap = await prisma.governanceRule.findFirst({
    where: { ruleType: 'TENURE_CAP', isActive: true, policy: { companyId, isActive: true } },
    select: { parameters: true },
  })
  const capMonths = (cap?.parameters as any)?.maxMonths ?? null

  const candidates: Candidate[] = people.map((p) => ({
    personId: p.id,
    name: p.name,
    mobile: p.consultant?.mobile ?? null,
    email: null,
    location: p.consultant?.location ?? null,
    skills: p.consultant?.skills ?? [],
    stints: p.sellContracts.map((c) => ({
      start: c.startDate,
      end: c.endDate,
      vendorName: c.company.name,
      months: c.endDate
        ? Math.max(0, Math.round((c.endDate.getTime() - c.startDate.getTime()) / DAY / 30.44))
        : 0,
    })),
  }))

  // Compared within a normalised name bucket rather than every pair
  // against every other. A thousand people is half a million comparisons
  // otherwise, and a differently named pair is never a match anyway.
  const byName = new Map<string, Candidate[]>()
  for (const c of candidates) {
    const key = c.name.toLowerCase().replace(/[^a-z ]/g, '').trim()
    byName.set(key, [...(byName.get(key) ?? []), c])
  }

  const matches = []
  for (const group of byName.values()) {
    for (let i = 0; i < group.length - 1; i++) {
      for (let j = i + 1; j < group.length; j++) {
        matches.push(compare(group[i], group[j]))
      }
    }
  }

  const asking = worthAsking(matches, capMonths)

  // What somebody has already said about these pairs, so a dismissed
  // one does not come back tomorrow looking new.
  const decided = await prisma.identityMatch.findMany({
    where: { companyId, state: { not: 'SUGGESTED' } },
    select: { personAId: true, personBId: true, state: true, note: true },
  })
  const decidedOn = new Map(
    decided.map((d) => [[d.personAId, d.personBId].sort().join(':'), d])
  )

  const open = asking.filter((m) => !decidedOn.has([m.aId, m.bId].sort().join(':')))

  return NextResponse.json({
    data: {
      matches: open.map((m) => ({
        ...m,
        ifConfirmed: ifConfirmed(m, capMonths),
      })),
      settled: decided.length,
      capMonths,
      summary: summarise(open, capMonths),
      note:
        'Nothing is merged. Confirming records that these are one person; the ' +
        'records stay separate and tenure reads the link.',
    },
  })
}

/**
 * POST — somebody decides.
 *
 * Both answers are recorded. A dismissal is the more useful of the two:
 * without it the same pair is offered again every day, and a queue that
 * repeats itself is one people stop opening.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Identity')
  if (notStaff) return notStaff

  const companyId = caller.company!.id
  const body = await request.json().catch(() => ({}))

  const [aId, bId] = [String(body?.aId ?? ''), String(body?.bId ?? '')].sort()
  const same = body?.same === true

  if (!aId || !bId || aId === bId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Two different people are needed.' } },
      { status: 422 }
    )
  }

  // Both must be people this company has already been shown, or a caller
  // could confirm a link between two strangers and read the result.
  const mine = await prisma.submission.count({
    where: { toCompanyId: companyId, personId: { in: [aId, bId] } },
  })
  const mineToo = await prisma.sellContract.count({
    where: { ...endClientFilter(companyId), personId: { in: [aId, bId] } },
  })
  if (mine + mineToo < 2) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Those are not both people you have records for.' } },
      { status: 404 }
    )
  }

  const note = typeof body?.note === 'string' ? body.note.trim() : ''

  // A dismissal without a reason comes back as a mystery when somebody
  // asks in six months why two obvious duplicates were left apart.
  if (!same && note.length < 3) {
    return NextResponse.json(
      {
        error: {
          code: 'NEEDS_REASON',
          message: 'Say why they are not the same person. In six months nobody will remember.',
          field: 'note',
        },
      },
      { status: 422 }
    )
  }

  const saved = await prisma.identityMatch.upsert({
    where: { companyId_personAId_personBId: { companyId, personAId: aId, personBId: bId } },
    create: {
      companyId,
      personAId: aId,
      personBId: bId,
      confidence: String(body?.confidence ?? 'POSSIBLE'),
      score: Number(body?.score ?? 0),
      signals: body?.signals ?? [],
      monthsIfSame: Number(body?.monthsIfSame ?? 0),
      state: same ? 'CONFIRMED' : 'DISMISSED',
      decidedById: caller.person.id,
      decidedAt: new Date(),
      note: note || null,
    },
    update: {
      state: same ? 'CONFIRMED' : 'DISMISSED',
      decidedById: caller.person.id,
      decidedAt: new Date(),
      note: note || null,
    },
  })

  return NextResponse.json({
    data: {
      state: saved.state,
      says: same
        ? `Recorded as one person. Their tenure here now reads ${saved.monthsIfSame} months across every supplier.`
        : 'Recorded as two people. This pair will not be offered again.',
    },
  })
}
