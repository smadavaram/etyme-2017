import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { poolFor, tiesOf, type PoolEntry } from '@/lib/match-pool'
import { mayRecommend } from '@/lib/supplier-onboarding'
import { COMES_IN_AS, comesInWords, openSupplierRequest, type ComesInAs } from '@/lib/supplier-recommend'
import { matchViewer, NOT_HERE, type MatchViewer, type ViewerRequirement } from '../viewer'

/**
 * GET  /api/requirements/:id/matches/add-firm?matchId=   — the choices for one suggestion
 * POST /api/requirements/:id/matches/add-firm            — { matchId, comesInAs, underCompanyId?, reason? }
 *
 * A suggestion's one action. Decided by the founder, 2026-09-30: a match
 * from a firm that is not a supplier yet is a door, not a dead end — the
 * client's recruiter asks for the firm to be added, and it walks supplier
 * onboarding like any other firm before its person can be put forward.
 *
 * Three ways in, and Etyme is none of them:
 *
 *   PRIME_VENDOR      the firm bills the client directly
 *   SUB_UNDER_MSP     a supplier in the program the client's MSP runs —
 *                     which may be Etyme's own program office. Etyme runs
 *                     a program and places nobody.
 *   SUB_UNDER_PRIME   a sub-vendor under one of the client's own primes,
 *                     who bills the client and holds the paper with it
 *
 * Nothing is created for the firm here. The request lands on the first of
 * the four desks, exactly as a recommendation from Suppliers does
 * (`lib/supplier-recommend`), and the firm is told by its own link.
 */

type Loaded =
  | { ok: false; res: NextResponse }
  | { ok: true; viewer: MatchViewer; requirement: ViewerRequirement & { title: string }; entry: PoolEntry; matchId: string }

async function load(request: NextRequest, requirementId: string, matchId: string | null): Promise<Loaded> {
  const { caller, error } = await getCallerContext(request)
  if (error) return { ok: false, res: error }
  const requirement = await prisma.requirement.findUnique({
    where: { id: requirementId },
    select: {
      id: true, title: true, companyId: true, payerCompanyId: true, endClientCompanyId: true,
      company: { select: { kind: true, name: true } },
    },
  })
  const viewer = requirement ? await matchViewer(caller, requirement) : null
  if (!requirement || !viewer) return { ok: false, res: NextResponse.json(NOT_HERE, { status: 404 }) }

  if (!viewer.suggest) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: { code: 'NOT_A_CLIENT_REQUEST', message: 'Adding a supplier from a match is for the company that raised the job request.' } },
        { status: 409 }
      ),
    }
  }
  if (!mayRecommend(viewer.permissions)) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Asking to add a supplier is for whoever raises job requests here — the hiring manager or the program office.' } },
        { status: 403 }
      ),
    }
  }

  const match = matchId
    ? await prisma.match.findFirst({ where: { id: matchId, requirementId }, select: { consultantId: true } })
    : null
  if (!match || !matchId) {
    return { ok: false, res: NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That match is not on this job request any more. Run matching again.' } }, { status: 404 }) }
  }
  const pool = await poolFor(requirement, viewer.companyId, { suggest: true })
  const entry = pool.entries.find((e) => e.consultantId === match.consultantId)
  if (!entry) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: { code: 'NOT_AVAILABLE', message: 'That suggestion is no longer offered. The person or their firm took it back.' } },
        { status: 409 }
      ),
    }
  }
  if (entry.reach !== 'SUGGESTION') {
    return {
      ok: false,
      res: NextResponse.json(
        { error: { code: 'ALREADY_A_SUPPLIER', message: `${entry.firmName} already works with you. Ask them to put this person forward instead.` } },
        { status: 409 }
      ),
    }
  }
  return { ok: true, viewer, requirement, entry, matchId }
}

/** The primes and program offices a firm could come in under, for this client. */
async function underOptions(clientId: string, firmId: string, now: Date) {
  const ties = await tiesOf(clientId, now)
  const [seats, mspRows] = await Promise.all([
    prisma.programSeat.findMany({
      where: { clientCompanyId: clientId, revokedAt: null, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] },
      select: { officeCompanyId: true },
    }),
    prisma.counterparty.findMany({
      where: { companyId: clientId, relationship: 'MSP', status: 'ACTIVE' },
      select: { otherCompanyId: true },
    }),
  ])
  const mspIds = [...new Set([...seats.map((s) => s.officeCompanyId), ...mspRows.map((r) => r.otherCompanyId)])]
  const primeIds = [...ties.panel].filter((id) => id !== firmId && !mspIds.includes(id))
  const firms = await prisma.company.findMany({
    where: { id: { in: [...primeIds, ...mspIds] } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })
  return {
    primes: firms.filter((f) => primeIds.includes(f.id)),
    msps: firms.filter((f) => mspIds.includes(f.id)),
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const loaded = await load(request, id, request.nextUrl.searchParams.get('matchId'))
  if (!loaded.ok) return loaded.res
  const { viewer, entry } = loaded
  const options = await underOptions(viewer.companyId, entry.firmId, new Date())
  const pending = await prisma.supplierRequest.findFirst({
    where: { companyId: viewer.companyId, firmCompanyId: entry.firmId, state: { in: ['RECOMMENDED', 'IN_REVIEW'] } },
    select: { stage: true, createdAt: true },
  })
  return NextResponse.json({
    data: {
      firm: { id: entry.firmId, name: entry.firmName },
      skills: entry.consultant.skills,
      pending: pending ? { stage: pending.stage, at: pending.createdAt.toISOString() } : null,
      ways: [
        { comesInAs: 'PRIME_VENDOR', says: `${entry.firmName} bills you directly, under its own agreement with you.` },
        {
          comesInAs: 'SUB_UNDER_MSP',
          says: `${entry.firmName} works in the program your program office runs. Etyme's program office can run it for you if you have none.`,
          under: [...options.msps.map((m) => ({ id: m.id, name: m.name })), { id: null, name: 'Etyme’s program office' }],
        },
        {
          comesInAs: 'SUB_UNDER_PRIME',
          says: `${entry.firmName} works under one of your prime vendors, who bills you and holds the paper with it.`,
          under: options.primes.map((p) => ({ id: p.id, name: p.name })),
        },
      ],
      says:
        `${entry.firmName} is not your supplier yet. Asking to add it starts your supplier onboarding: your department lead ` +
        '(or the program office), Procurement, HR and Finance, in turn. Etyme is never a prime vendor.',
    },
  })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const loaded = await load(request, id, typeof body?.matchId === 'string' ? body.matchId : null)
  if (!loaded.ok) return loaded.res
  const { viewer, requirement, entry, matchId } = loaded
  const { caller } = (await getCallerContext(request)) as { caller: NonNullable<Awaited<ReturnType<typeof getCallerContext>>['caller']> }

  const comesInAs = String(body?.comesInAs ?? '') as ComesInAs
  if (!COMES_IN_AS.includes(comesInAs)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Say how the firm comes in: as a prime vendor, under your program office, or under one of your primes.', field: 'comesInAs' } },
      { status: 422 }
    )
  }
  const underId = typeof body?.underCompanyId === 'string' && body.underCompanyId ? body.underCompanyId : null
  const options = await underOptions(viewer.companyId, entry.firmId, new Date())
  let underName: string | null = null
  if (comesInAs === 'PRIME_VENDOR' && underId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'A prime vendor works under nobody. Leave the firm above it empty.', field: 'underCompanyId' } },
      { status: 422 }
    )
  }
  if (comesInAs === 'SUB_UNDER_PRIME') {
    const prime = options.primes.find((p) => p.id === underId)
    if (!prime) {
      return NextResponse.json(
        { error: { code: 'NOT_YOUR_PRIME', message: 'Pick one of your own prime vendors for the firm to work under.', field: 'underCompanyId' } },
        { status: 422 }
      )
    }
    underName = prime.name
  }
  if (comesInAs === 'SUB_UNDER_MSP' && underId) {
    const msp = options.msps.find((m) => m.id === underId)
    if (!msp) {
      return NextResponse.json(
        { error: { code: 'NOT_YOUR_MSP', message: 'That firm does not run your program. Pick your program office, or Etyme’s.', field: 'underCompanyId' } },
        { status: 422 }
      )
    }
    underName = msp.name
  }

  const open = await prisma.supplierRequest.findFirst({
    where: {
      companyId: viewer.companyId,
      OR: [{ firmCompanyId: entry.firmId }, { name: { equals: entry.firmName, mode: 'insensitive' } }],
      state: { in: ['RECOMMENDED', 'IN_REVIEW'] },
    },
    select: { id: true, stage: true },
  })
  if (open) {
    return NextResponse.json(
      { error: { code: 'ALREADY_RECOMMENDED', message: `${entry.firmName} is already in your supplier onboarding. It walks the desks once; you will be told when it is decided.` } },
      { status: 409 }
    )
  }

  // The firm's own account owner gets the link. Their address is not
  // written on the request, so the client's desks read the firm, not a
  // private inbox it never gave them.
  const owner = await prisma.context.findFirst({
    where: { companyId: entry.firmId, type: 'EMPLOYEE', revokedAt: null, suspendedAt: null, role: { permissions: { has: '*' } } },
    select: { person: { select: { name: true, primaryEmail: true } } },
    orderBy: { grantedAt: 'asc' },
  })

  const note = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
  const how = comesInWords(comesInAs, underName)
  const reason =
    `A consultant at ${entry.firmName} came up in matching for ${requirement.title} ` +
    `(${entry.consultant.skills.slice(0, 4).join(', ')}). Asked to add ${entry.firmName} ${how}.${note ? ` ${note}` : ''}`

  const opened = await openSupplierRequest({
    companyId: viewer.companyId,
    companyName: viewer.companyName,
    recommender: { id: caller.person.id, name: caller.person.name },
    name: entry.firmName,
    domain: null,
    contactName: null,
    contactEmail: null,
    reason,
    skills: entry.consultant.skills.slice(0, 6),
    linkTo: owner?.person.primaryEmail ? { email: owner.person.primaryEmail, name: owner.person.name } : null,
    fromMatch: { requirementId: requirement.id, matchId, firmCompanyId: entry.firmId, comesInAs, underCompanyId: underId },
  })

  // Recorded, because the system now carries a stranger's firm into a
  // client's onboarding on the strength of a person's consent.
  await prisma.automationLog.create({
    data: {
      companyId: viewer.companyId,
      action: 'SUPPLIER_ASKED_FROM_MATCH',
      summary: `${caller.person.name} asked to add ${entry.firmName} ${how}, from a match on ${requirement.title}.`,
      reason: 'A suggestion from matching: the person agreed to be shown in matches beyond their firm’s partners.',
      payload: { requestId: opened.row.id, requirementId: requirement.id, matchId, firmCompanyId: entry.firmId, comesInAs, underCompanyId: underId },
      reversible: true,
    },
  })

  return NextResponse.json(
    {
      data: {
        request: { id: opened.row.id, stage: opened.row.stage, comesInAs, underCompanyId: underId },
        says:
          `${entry.firmName} is with ${opened.leadNamed ? 'your department lead' : 'the program office'}. It walks four desks — ` +
          `${opened.leadNamed ? 'your lead' : 'the program office'}, Procurement, HR, Finance — and comes in ${how} when the last one says yes. ` +
          `Then this person can be put forward, if they still agree.`,
      },
    },
    { status: 201 }
  )
}
