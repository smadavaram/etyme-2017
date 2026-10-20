import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { getCallerContext } from '@/lib/api-context'
import { hasAnyPermission, askTheDesk, type Permission } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { notify, notifyBulk, type NotifyParams } from '@/lib/notify'
import { accessActor, logAccess, recordRefusal } from '@/lib/access-log'
import { writingDesk, seatedRefusal } from '@/lib/money/seated-books'
import { amount } from '@/lib/money-display'
import {
  acceptanceChain, capFor, fullyAccepted, mayDecide, nextDown, waitingOn, type Decision,
} from '@/lib/money/expense-acceptance'
import { readForAcceptance } from '@/lib/money/expense-acceptance-read'

/**
 * GET  /api/expenses/:id/accept   where this firm stands on an expense it pays for
 * POST /api/expenses/:id/accept   { decision: 'accept' | 'send_back', amountCents?, reason? }
 *
 * An expense is accepted like a week (the founder, 2026-10-19, decision
 * 1): the worker's employer approves it for reimbursement
 * (`/api/expenses/actions`); each firm above accepts it before it pays
 * it, the client first and then down the chain, nobody accepting their
 * own. The rules are `mayDecide` in `lib/money/expense-acceptance`; this
 * reads the chain, writes the firm's one row, and tells the worker and
 * the firm below.
 *
 * Who may decide: whoever signs the work or pays for it at the firm
 * (`timesheets.approve` or `payments.record`), at the book the screen
 * reads — the client's, under a seat it granted.
 *
 * What a reader sees: the firms at and above it in the chain, never one
 * below. A sub-vendor's name is the prime's to keep, so the client is
 * shown its own decision and nobody beneath it.
 */

const DECIDES: Permission[] = ['timesheets.approve', 'payments.record']

const DECISIONS: Record<string, Decision> = { accept: 'ACCEPT', send_back: 'SEND_BACK' }

type Params = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const desk = await writingDesk(caller, request)
  if (!desk) {
    return NextResponse.json({ error: { code: 'NO_COMPANY', message: 'An expense is accepted by a company, and your seat is not at one.' } }, { status: 403 })
  }
  const { id } = await params
  const read = await readForAcceptance(id)
  const party = read && (read.expense.companyId === desk.companyId || read.legs.some((l) => l.payerId === desk.companyId))
  if (!read || !party) {
    if (read) {
      await recordRefusal([read.expense.personId], {
        ...accessActor(caller), action: 'CONTRACT_VIEW', allowed: false,
        reason: `Refused a read of an expense ${desk.companyName} neither raised nor pays for.`,
      })
    }
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'There is no expense here that your company raised or pays for.' } }, { status: 404 })
  }
  logAccess({
    ...accessActor(caller), subjectId: read.expense.personId, action: 'CONTRACT_VIEW',
    reason: `Read where ${desk.companyName} stands on an expense it ${read.expense.companyId === desk.companyId ? 'raised' : 'pays for'}.`,
  })

  const { expense: e, legs, acceptances } = read
  const chain = acceptanceChain(e, legs)
  const at = chain.steps.findIndex((s) => s.companyId === desk.companyId)
  const own = read.expense.companyId === desk.companyId
  // At and above the reader; the employer reads the whole chain above it.
  const visible = own ? chain.steps : at >= 0 ? chain.steps.slice(0, at + 1) : []
  const mine = acceptances.find((a) => a.companyId === desk.companyId) ?? null
  const next = waitingOn(chain, acceptances)
  const cap = at >= 0 ? capFor(e, chain, acceptances, desk.companyId) : null
  return NextResponse.json({
    data: {
      expenseId: e.id,
      personName: e.personName,
      category: e.category,
      currency: e.currency,
      approvedCents: own || at === 0 ? e.totalCents : null,
      // What this firm may accept at most; null where it is not its turn.
      upToCents: mine?.status === 'ACCEPTED' ? null : cap,
      mine: mine ? { status: mine.status, acceptedCents: mine.acceptedCents, reason: mine.reason, by: mine.byName ?? null, at: mine.createdAt.toISOString() } : null,
      chain: visible.map((s) => {
        const d = acceptances.find((a) => a.companyId === s.companyId)
        return { companyId: s.companyId, name: s.name, status: d?.status ?? 'WAITING', at: d?.createdAt.toISOString() ?? null }
      }),
      // Only where the next firm to decide is one the reader may see.
      waitingOn: next && visible.some((s) => s.companyId === next.companyId) ? next.name : null,
      // Where the reader is a payer whose leg does not bill it, the sentence that says so.
      says: at < 0 && !own ? chain.stopped?.says ?? null : null,
    },
  })
}

export async function POST(request: NextRequest, { params }: Params) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const desk = await writingDesk(caller, request)
  if (!desk) {
    return NextResponse.json({ error: { code: 'NO_COMPANY', message: 'An expense is accepted by a company, and your seat is not at one.' } }, { status: 403 })
  }
  if (!hasAnyPermission(desk.permissions, DECIDES)) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: desk.seat
            ? seatedRefusal(desk.seat, 'Accepting an expense')
            : askTheDesk({ doing: 'Accepting an expense before it is paid', needs: DECIDES, kind: caller.company?.kind, companyName: desk.companyName }),
        },
      },
      { status: 403 }
    )
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const decision = DECISIONS[String(body?.decision ?? '').toLowerCase()]
  if (!decision) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Say accept or send_back.' } }, { status: 422 })
  }
  const cents = body?.amountCents == null ? null : Number(body.amountCents)
  const reason = typeof body?.reason === 'string' ? body.reason : null

  const read = await readForAcceptance(id)
  if (!read) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'There is no such expense.' } }, { status: 404 })
  }

  const verdict = mayDecide({
    expense: read.expense, legsTopFirst: read.legs, acceptances: read.acceptances,
    firm: { id: desk.companyId, name: desk.companyName }, personId: caller.person.id,
    decision, cents, reason,
  })
  if (!verdict.ok) {
    if (verdict.status === 403) {
      await recordRefusal([read.expense.personId], {
        ...accessActor(caller), action: 'CONTRACT_VIEW', allowed: false,
        reason: `Refused accepting an expense: ${verdict.says}`,
      })
    }
    return NextResponse.json({ error: { code: verdict.code, message: verdict.says } }, { status: verdict.status })
  }

  try {
    const row = await prisma.expenseAcceptance.upsert({
      where: { expenseId_companyId: { expenseId: id, companyId: desk.companyId } },
      // Only a send-back is ever replaced: `mayDecide` refuses a second
      // decision on an acceptance that stands.
      update: { ...verdict.row, byId: caller.person.id, createdAt: new Date() },
      create: { expenseId: id, companyId: desk.companyId, byId: caller.person.id, ...verdict.row },
      select: { id: true, status: true, acceptedCents: true, reason: true, createdAt: true },
    })
    logAccess({
      ...accessActor(caller), subjectId: read.expense.personId, action: 'CONTRACT_VIEW',
      reason: verdict.says,
    })

    // ── Who is told ────────────────────────────────────────────────────
    //
    // The worker who spent the money, and the firm below — the next to
    // accept, or the employer, which bills on it. The worker reads the
    // firm's decision, never its name where it is above the worker's own
    // employer: the employer is the worker's counterparty.
    const e = read.expense
    const chain = acceptanceChain(e, read.legs)
    const below = nextDown(chain, desk.companyId, { id: e.companyId, name: e.companyName })
    const money = (c: number) => amount(c, e.currency)
    const what = `${e.personName}’s ${e.category.toLowerCase()} expense`
    const accepted = verdict.row.status === 'ACCEPTED'
    // The worker hears the outcome once: when the last firm that pays for
    // it has accepted (`fullyAccepted`), or when one sends it back. Each
    // firm's step is told to the firm below, not to the worker — one
    // worker read "An expense of yours was accepted" once per firm.
    const done = accepted && fullyAccepted(chain, read.acceptances, {
      companyId: desk.companyId, status: 'ACCEPTED', acceptedCents: verdict.row.acceptedCents,
      reason: verdict.row.reason, createdAt: row.createdAt,
    })
    if (done || !accepted) {
      notify({
        personId: e.personId, companyId: e.companyId, type: 'EXPENSE', entityId: e.id,
        title: accepted
          ? `Your ${e.category.toLowerCase()} expense was accepted`
          : `Your ${e.category.toLowerCase()} expense was sent back`,
        body: accepted
          ? `Your ${e.category.toLowerCase()} expense was accepted at ${money(verdict.row.acceptedCents)} by every firm that pays for it.`
          : `Your ${e.category.toLowerCase()} expense was sent back: ${verdict.row.reason}`,
        data: { expenseId: e.id, decision: verdict.row.status },
      })
    }
    if (below) {
      const seats = await prisma.context.findMany({
        where: {
          companyId: below.companyId, revokedAt: null, type: { not: 'CONSULTANT' },
          role: { permissions: { hasSome: [...DECIDES, '*'] } },
        },
        select: { personId: true },
        take: 10,
      })
      const letters: NotifyParams[] = seats
        .filter((s) => s.personId !== e.personId)
        .map((s) => ({
          personId: s.personId, companyId: below.companyId, type: 'EXPENSE' as const, entityId: e.id,
          title: accepted ? `${desk.companyName} accepted ${what}` : `${desk.companyName} sent ${what} back`,
          body: accepted
            ? below.companyId === e.companyId
              ? `${desk.companyName} accepted ${money(verdict.row.acceptedCents)}. It can go on your next bill to ${desk.companyName}.`
              : `${desk.companyName} accepted ${money(verdict.row.acceptedCents)}. It is yours to accept now, up to that amount.`
            : `${desk.companyName} sent it back: ${verdict.row.reason}`,
          data: { expenseId: e.id, decision: verdict.row.status },
        }))
      if (letters.length > 0) notifyBulk(letters)
    }

    return NextResponse.json({
      data: {
        acceptance: { ...row, createdAt: row.createdAt.toISOString() },
        message: verdict.says,
      },
    })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: { code: 'ALREADY_DECIDED', message: `${desk.companyName} decided this expense a moment ago. Open it again to read the decision.` } }, { status: 409 })
    }
    reportError('Accepting an expense failed:', err)
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'The expense could not be accepted.' } }, { status: 500 })
  }
}
