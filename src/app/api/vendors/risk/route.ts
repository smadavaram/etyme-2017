import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { fromPrismaDecimal } from '@/lib/money'
import {
  supplierRisk, watchlist,
  type Cover, type Settlement, type Owner, type CounterpartyRegister,
} from '@/lib/supplier-risk'

/**
 * GET /api/vendors/risk — who we trade with, and whether that still looks
 * like a good idea.
 *
 * ── Three places nobody had joined ───────────────────────────────────
 *
 * The data was already here and it was in three tables that never met:
 * the certificates a counterparty gave us (`Verification`), what they did
 * with money they owed us (`Invoice` and its `Payment` rows), what we did
 * with money we owed them (`VendorBill`), and the judgement somebody made
 * in the register (`Counterparty.riskLevel`).
 *
 * Joining them is the entire feature. None of the four says much alone.
 *
 * ── It warns. It never blocks ────────────────────────────────────────
 *
 * The legal bar on lapsed supplier insurance lives in
 * `src/lib/governance.ts` and stops a placement. This is the commercial
 * judgement beside it, and stopping work on somebody's opinion of a
 * supplier would be the wrong end of Addendum E's rule: BLOCK where
 * legally grounded, WARN and name somebody everywhere else.
 *
 * ── What a caller without the money permission sees ──────────────────
 *
 * The standing, the dates and the sentences, with the amounts withheld.
 * How much a client owes us is the same class of fact as what a placement
 * earns, and a recruiter role deliberately does not see either — so the
 * figures are stripped here rather than hidden on the screen.
 */

/**
 * Company-level certificates, as the schema currently names them.
 *
 * `VerificationType` is a fixed enum and its insurance members are the
 * four a technology staffing firm holds. A nursing agency's malpractice
 * cover and a laboratory's product liability have no value in it. The
 * arithmetic in `lib/supplier-risk.ts` takes any string with any label
 * and has no opinion; the enum is where the assumption sits, and it is
 * the architect's to widen.
 */
const COVER_TYPES = [
  'INSURANCE_GL',
  'INSURANCE_WC',
  'INSURANCE_EO',
  'INSURANCE_CYBER',
  'BUSINESS_PARTNER',
] as const

const COVER_LABELS: Record<string, string> = {
  INSURANCE_GL: 'general liability insurance',
  INSURANCE_WC: "workers' compensation",
  INSURANCE_EO: 'errors and omissions cover',
  INSURANCE_CYBER: 'cyber liability cover',
  BUSINESS_PARTNER: 'business registration',
}

/** Nothing owed on these, so they say nothing about payment behaviour. */
const NOT_RECEIVABLE = ['DRAFT', 'CANCELLED', 'VOID']
const NOT_PAYABLE = ['CANCELLED', 'DISPUTED']

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Counterparty risk')
  if (notStaff) return notStaff

  if (!caller.permissions.includes('vendors.read')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message:
            'You cannot see the counterparty register. Ask whoever manages suppliers here ' +
            'for the vendors.read permission.',
        },
      },
      { status: 403 }
    )
  }

  const seesMoney =
    caller.permissions.includes('margin.read') || caller.permissions.includes('pnl.read')

  const companyId = caller.company!.id
  const now = new Date()

  const register = await prisma.counterparty.findMany({
    where: { companyId },
    select: {
      id: true,
      otherCompanyId: true,
      relationship: true,
      status: true,
      riskLevel: true,
      riskReviewBy: true,
      createdById: true,
      otherCompany: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
    take: 500,
  })

  if (register.length === 0) {
    return NextResponse.json({
      data: {
        asOf: now.toISOString(),
        watchlist: watchlist([]),
        seesMoney,
        note:
          'Nobody is in your counterparty register yet. Add the firms you already trade ' +
          'with and this fills in from what is on file about them.',
      },
    })
  }

  const otherIds = Array.from(new Set(register.map((r) => r.otherCompanyId)))

  const [covers, invoices, bills, seats] = await Promise.all([
    // Certificates about them. Company-level only — a person's checks are
    // a different subject and a different permission.
    prisma.verification.findMany({
      where: {
        companyId: { in: otherIds },
        personId: null,
        type: { in: [...COVER_TYPES] },
      },
      select: { companyId: true, type: true, status: true, expiresAt: true },
      take: 2_000,
    }),

    // What they did with money they owed us. Our side only: an invoice
    // where we are the client is somebody else's receivable.
    prisma.invoice.findMany({
      where: {
        engagement: { msa: { vendorId: companyId, clientId: { in: otherIds } } },
        status: { notIn: NOT_RECEIVABLE },
      },
      select: {
        id: true,
        currency: true,
        total: true,
        paid: true,
        dueAt: true,
        payments: { select: { amount: true, receivedAt: true } },
        engagement: { select: { msa: { select: { clientId: true } } } },
      },
      take: 5_000,
    }),

    // What we did with money we owed them. Reported as ours.
    prisma.vendorBill.findMany({
      where: {
        companyId,
        vendorCompanyId: { in: otherIds },
        status: { notIn: NOT_PAYABLE },
      },
      select: {
        id: true,
        vendorCompanyId: true,
        currency: true,
        totalCents: true,
        dueAt: true,
        paidAt: true,
      },
      take: 5_000,
    }),

    // What the person who recorded them actually does here, so the owner
    // reads as a role rather than as a name with no job attached.
    prisma.context.findMany({
      where: {
        companyId,
        personId: { in: register.map((r) => r.createdById).filter((x): x is string => !!x) },
      },
      select: { personId: true, role: { select: { name: true } } },
    }),
  ])

  const roleOf = new Map(seats.map((s) => [s.personId, s.role?.name ?? null]))

  // ── Into the shapes the arithmetic works in ─────────────────────────

  const coversFor = new Map<string, Cover[]>()
  for (const v of covers) {
    if (!v.companyId) continue
    const list = coversFor.get(v.companyId) ?? []
    list.push({
      type: v.type,
      label: COVER_LABELS[v.type],
      status: v.status,
      expiresAt: v.expiresAt,
    })
    coversFor.set(v.companyId, list)
  }

  const settlementsFor = new Map<string, Settlement[]>()
  const push = (companyKey: string, s: Settlement) => {
    const list = settlementsFor.get(companyKey) ?? []
    list.push(s)
    settlementsFor.set(companyKey, list)
  }

  for (const inv of invoices) {
    const clientId = inv.engagement.msa.clientId
    const total = fromPrismaDecimal(inv.total, inv.currency).minor
    const paid = fromPrismaDecimal(inv.paid, inv.currency).minor

    // Settled means the balance is gone. The date is the last receipt
    // that cleared it — not the first, which would flatter a client who
    // paid a tenth on time and the rest in March.
    const receipts = inv.payments
      .map((p) => p.receivedAt)
      .sort((a, b) => b.getTime() - a.getTime())
    const settledAt = total > 0 && paid >= total ? (receipts[0] ?? null) : null

    push(clientId, {
      id: inv.id,
      whose: 'THEIRS',
      dueAt: inv.dueAt,
      settledAt,
      amountMinor: total - paid,
      currency: inv.currency,
    })
  }

  for (const b of bills) {
    push(b.vendorCompanyId, {
      id: b.id,
      whose: 'OURS',
      dueAt: b.dueAt,
      settledAt: b.paidAt,
      amountMinor: b.totalCents,
      currency: b.currency,
    })
  }

  const rows = register.map((r) => {
    const cp: CounterpartyRegister = {
      id: r.id,
      name: r.otherCompany.name,
      relationship: r.relationship,
      status: r.status,
      riskLevel: r.riskLevel,
      riskReviewBy: r.riskReviewBy,
    }

    const owner: Owner | null = r.createdBy
      ? {
          name: r.createdBy.name,
          // The register does not hold an owner field, so the person who
          // recorded them is the only name we can honestly put against
          // this. Said plainly rather than dressed up as an assignment.
          role: roleOf.get(r.createdBy.id) ?? 'recorded them in the register',
        }
      : null

    return supplierRisk(
      {
        counterparty: cp,
        covers: coversFor.get(r.otherCompanyId) ?? [],
        settlements: settlementsFor.get(r.otherCompanyId) ?? [],
        owner,
      },
      now
    )
  })

  const list = watchlist(rows)

  // ── Field-level, at the query's edge rather than on the screen ──────
  const withheld: string[] = []
  const shown = seesMoney
    ? list.rows
    : list.rows.map((r) => ({
        ...r,
        theyPayUs: { ...r.theyPayUs, openOverdueMinor: null },
        wePayThem: { ...r.wePayThem, openOverdueMinor: null },
      }))

  if (!seesMoney) {
    withheld.push(
      'Amounts are withheld. How much a counterparty owes is the same class of fact as ' +
        'what a placement earns, and this role does not see either.'
    )
  }

  return NextResponse.json({
    data: {
      asOf: now.toISOString(),
      watchlist: { ...list, rows: shown },
      seesMoney,
      withheld,
      // Said on the page rather than assumed. A watchlist nobody can
      // account for is one nobody acts on.
      howJudged:
        'Certificates on file, what they did with money they owed us, what we did with ' +
        'money we owed them, and whatever somebody last recorded in the register. Where ' +
        'none of those exist the answer is that nobody has looked — never a clean bill.',
      neverBlocks:
        'Nothing here stops a submission or a placement. Lapsed cover blocks through ' +
        'governance, which is a legal rule; this is commercial judgement and it warns.',
    },
  })
}
