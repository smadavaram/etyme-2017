import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import {
  scorecard, order, WINDOW_DAYS, type Sent, type Put,
} from '@/lib/scorecard'
import type { Reason } from '@/lib/outcomes'

/**
 * GET /api/vendors/scorecards — what your suppliers are like to work with
 *
 * The layer asset. None of these numbers can be produced by the supplier
 * about themselves — they do not know what the other eleven did with the
 * same role — and none can be got from the suppliers, because every
 * supplier's own numbers are excellent.
 *
 * Scoped hard in both directions. A client sees only their own dealings
 * with each supplier; a supplier's record at another client is none of
 * this client's business, and showing it would turn a scorecard into a
 * back channel between competitors.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Supplier scorecards')
  if (notStaff) return notStaff

  const companyId = caller.company!.id
  const now = new Date()
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000)

  const [invites, subs] = await Promise.all([
    prisma.requirementInvitation.findMany({
      where: { fromCompanyId: companyId, createdAt: { gte: since } },
      select: {
        requirementId: true, toCompanyId: true, createdAt: true,
        payMin: true, payMax: true, status: true,
        toCompany: { select: { id: true, name: true } },
      },
    }),
    prisma.submission.findMany({
      where: { toCompanyId: companyId, submittedAt: { gte: since } },
      select: {
        id: true, requirementId: true, fromCompanyId: true, personId: true,
        rate: true, submittedAt: true, status: true,
        screenState: true, rejectReason: true,
        fromCompany: { select: { id: true, name: true } },
        requirement: { select: { billMin: true, billMax: true } },
      },
    }),
  ])

  // Why each held-back submission was held back. One query for all of
  // them rather than one per row — a client with twelve suppliers and a
  // year of history would otherwise pay for several hundred round trips
  // to draw one screen.
  const heldRows = await prisma.check.findMany({
    where: {
      companyId,
      recordType: 'SUBMISSION',
      recordId: { in: subs.map((s) => s.id) },
      verdict: 'FAIL',
    },
    select: { recordId: true, code: true },
  })

  const heldFor = new Map<string, string[]>()
  for (const r of heldRows) {
    heldFor.set(r.recordId, [...(heldFor.get(r.recordId) ?? []), r.code])
  }

  // Who actually started. A submission's own status is the pipeline's
  // view and can lag; a contract is the fact.
  const placements = await prisma.sellContract.findMany({
    where: { clientCompanyId: companyId, startDate: { gte: since } },
    select: { personId: true, companyId: true },
  })
  const placed = new Set(placements.map((p) => `${p.companyId}:${p.personId}`))

  // The band each supplier was given per role, so pricing is measured
  // against what they agreed to rather than against the requisition.
  const bandFor = new Map<string, { min: number | null; max: number | null }>()
  for (const i of invites) {
    bandFor.set(`${i.toCompanyId}:${i.requirementId}`, { min: i.payMin, max: i.payMax })
  }

  // Every supplier we have either invited or heard from.
  const suppliers = new Map<string, string>()
  for (const i of invites) suppliers.set(i.toCompanyId, i.toCompany.name)
  for (const s of subs) suppliers.set(s.fromCompanyId, s.fromCompany.name)

  const cards = [...suppliers.entries()].map(([vendorId, name]) => {
    const sent: Sent[] = invites
      .filter((i) => i.toCompanyId === vendorId)
      .map((i) => ({
        requirementId: i.requirementId,
        invitedAt: i.createdAt,
        bandMinCents: i.payMin,
        bandMaxCents: i.payMax,
        declined: i.status === 'DECLINED',
      }))

    const put: Put[] = subs
      .filter((s) => s.fromCompanyId === vendorId)
      .map((s) => {
        const band = bandFor.get(`${vendorId}:${s.requirementId}`)
        return {
          submittedAt: s.submittedAt,
          requirementId: s.requirementId,
          rateCents: s.rate,
          bandMinCents: band?.min ?? s.requirement.billMin,
          bandMaxCents: band?.max ?? s.requirement.billMax,
          // Null, not false, where nobody has screened it. A submission
          // nobody looked at is not one that failed.
          cleared:
            s.screenState === 'READY' ? true : s.screenState === 'NEEDS_FIX' ? false : null,
          heldBackFor: heldFor.get(s.id) ?? [],
          hired: placed.has(`${vendorId}:${s.personId}`) || s.status === 'PLACED',
          reason: (s.rejectReason as Reason | null) ?? null,
        }
      })

    return scorecard(name, sent, put, now)
  })

  const ranked = order(cards)
  const scored = ranked.filter((c) => c.enough).length

  return NextResponse.json({
    data: {
      suppliers: ranked.map((c, i) => ({ ...c, rank: c.enough ? i + 1 : null })),
      summary:
        ranked.length === 0
          ? 'No suppliers yet. Paste the list you already email.'
          : `${ranked.length} ${ranked.length === 1 ? 'supplier' : 'suppliers'}, ` +
            `${scored} with enough history to score.`,
      // Said on the page, not buried in a tooltip. A ranking somebody
      // cannot account for is one they will not act on.
      orderedBy:
        'Hires first, then how many were worth reading, then how fast they answer. ' +
        'No overall grade — a single letter hides which of the six is the problem.',
      windowDays: WINDOW_DAYS,
    },
  })
}
