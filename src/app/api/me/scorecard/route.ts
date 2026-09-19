import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import {
  scorecard, whatToFix, WINDOW_DAYS, type Sent, type Put,
} from '@/lib/scorecard'
import type { Reason } from '@/lib/outcomes'

/**
 * GET /api/me/scorecard — how each of your clients sees you
 *
 * The other half, and not optional. A scorecard the supplier cannot see
 * is a blacklist with better manners: it decides who gets the next role
 * and the supplier never learns why they stopped getting called.
 *
 * Same six numbers the client sees, per client, plus the one thing the
 * client's view does not need — what to do about it. "Sixty per cent"
 * tells a recruiter nothing; "your rate is over the band on half of
 * them" tells them what to do on Monday.
 *
 * ── What it must never show ──────────────────────────────────────────
 *
 * Any other supplier's numbers. Not a rank, not an average, not "you are
 * third of nine". A supplier learning they are third has learned
 * something about two firms who never agreed to tell them, and a
 * scorecard that leaks sideways stops being something clients will let
 * their suppliers see at all.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Your scorecard')
  if (notStaff) return notStaff

  const vendorId = caller.company!.id
  const now = new Date()
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000)

  const [invites, subs] = await Promise.all([
    prisma.requirementInvitation.findMany({
      where: { toCompanyId: vendorId, createdAt: { gte: since } },
      select: {
        requirementId: true, fromCompanyId: true, createdAt: true,
        payMin: true, payMax: true, status: true,
        fromCompany: { select: { id: true, name: true } },
      },
    }),
    prisma.submission.findMany({
      where: { fromCompanyId: vendorId, submittedAt: { gte: since } },
      select: {
        id: true, requirementId: true, toCompanyId: true, personId: true,
        rate: true, submittedAt: true, status: true,
        screenState: true, rejectReason: true,
        toCompany: { select: { id: true, name: true } },
        requirement: { select: { billMin: true, billMax: true } },
      },
    }),
  ])

  // The verdicts on our own submissions — keyed by who wrote them.
  //
  // A submission in a forwarding chain is screened by more than one
  // party: our own check before it left, the prime's, and the end
  // client's. Lumping them together would put a prime's private verdict
  // into the card a supplier reads about the client, which is a leak
  // sideways between two companies that never agreed to talk.
  //
  // So the key is (whoever decided, which submission), and each client's
  // card reads only the verdicts that client wrote.
  const heldRows = await prisma.check.findMany({
    where: {
      recordType: 'SUBMISSION',
      recordId: { in: subs.map((s) => s.id) },
      verdict: 'FAIL',
    },
    select: { companyId: true, recordId: true, code: true },
  })

  const heldFor = new Map<string, string[]>()
  for (const r of heldRows) {
    const key = `${r.companyId}:${r.recordId}`
    heldFor.set(key, [...(heldFor.get(key) ?? []), r.code])
  }

  const placements = await prisma.sellContract.findMany({
    where: { companyId: vendorId, startDate: { gte: since } },
    select: { personId: true, clientCompanyId: true },
  })
  const placed = new Set(placements.map((p) => `${p.clientCompanyId}:${p.personId}`))

  const bandFor = new Map<string, { min: number | null; max: number | null }>()
  for (const i of invites) {
    bandFor.set(`${i.fromCompanyId}:${i.requirementId}`, { min: i.payMin, max: i.payMax })
  }

  const clients = new Map<string, string>()
  for (const i of invites) clients.set(i.fromCompanyId, i.fromCompany.name)
  for (const s of subs) if (s.toCompanyId) clients.set(s.toCompanyId, s.toCompany?.name ?? 'A client')

  const cards = [...clients.entries()].map(([clientId, name]) => {
    const sent: Sent[] = invites
      .filter((i) => i.fromCompanyId === clientId)
      .map((i) => ({
        requirementId: i.requirementId,
        invitedAt: i.createdAt,
        bandMinCents: i.payMin,
        bandMaxCents: i.payMax,
        declined: i.status === 'DECLINED',
      }))

    const put: Put[] = subs
      .filter((s) => s.toCompanyId === clientId)
      .map((s) => {
        const band = bandFor.get(`${clientId}:${s.requirementId}`)
        return {
          submittedAt: s.submittedAt,
          requirementId: s.requirementId,
          rateCents: s.rate,
          bandMinCents: band?.min ?? s.requirement.billMin,
          bandMaxCents: band?.max ?? s.requirement.billMax,
          cleared:
            s.screenState === 'READY' ? true : s.screenState === 'NEEDS_FIX' ? false : null,
          heldBackFor: heldFor.get(`${clientId}:${s.id}`) ?? [],
          hired: placed.has(`${clientId}:${s.personId}`) || s.status === 'PLACED',
          reason: (s.rejectReason as Reason | null) ?? null,
        }
      })

    const card = scorecard(name, sent, put, now)
    // The client's card is named for the supplier. This one is the other
    // way round — a supplier reading their own card wants to know which
    // client it is about.
    return { ...card, clientName: name, fix: whatToFix(card) }
  })

  const worst = cards
    .filter((c) => c.enough)
    .sort((a, b) => (a.worthReading.value ?? 100) - (b.worthReading.value ?? 100))[0]

  return NextResponse.json({
    data: {
      clients: cards,
      summary:
        cards.length === 0
          ? 'No client has sent you a role yet.'
          : `${cards.length} ${cards.length === 1 ? 'client' : 'clients'}.` +
            (worst?.holdsThemUp ? ` ${worst.holdsThemUp.says}` : ''),
      windowDays: WINDOW_DAYS,
    },
  })
}
