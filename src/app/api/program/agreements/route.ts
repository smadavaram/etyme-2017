import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import {
  agreementFindings,
  findingsFor,
  marginFloorSays,
  marginPct,
  paymentDaysSays,
  summarise,
  workHasStarted,
  type AgreementInput,
  type ContractInput,
} from './verdict'

/**
 * GET /api/program/agreements
 *
 * Every master agreement this company is a party to, with the terms that
 * govern everything underneath it: payment days, the margin floor, the
 * headcount cap, whether anybody actually signed it, and the statements of
 * work on its engagements.
 *
 * ── Why this is one screen and not four fields on a contract ─────────
 *
 * The agreement is the answer to "are we allowed to trade at all". Every
 * order and every contract inherits from it and nothing showed it. Payment
 * terms were being read out of it by the award path and the invoice
 * generator, the margin floor by the profitability report, and no human
 * could see either without opening a database.
 *
 * ── What the other side does not see ─────────────────────────────────
 *
 * The margin floor is the vendor's own pricing policy. A client reading
 * this endpoint gets the terms and the paper and neither of the two margin
 * codes — enforced in `findingsFor`, not by remembering to leave a field
 * out of one branch.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const companyId = caller.company?.id
  if (!companyId) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: 'You must belong to a company to see its agreements.' } },
      { status: 403 }
    )
  }

  const agreements = await prisma.masterAgreement.findMany({
    where: { OR: [{ vendorId: companyId }, { clientId: companyId }] },
    select: {
      id: true,
      vendorId: true,
      clientId: true,
      paymentTerms: true,
      currency: true,
      signedAt: true,
      minMarginPct: true,
      capacity: true,
      createdAt: true,
      vendor: { select: { id: true, name: true } },
      client: { select: { id: true, name: true } },
      engagements: {
        select: {
          id: true,
          title: true,
          invoiceCycle: true,
          statementOfWork: true,
          sowSignedAt: true,
          sellContracts: { select: { id: true, state: true } },
        },
      },
      sellContracts: {
        select: {
          id: true,
          state: true,
          billRate: true,
          startDate: true,
          endDate: true,
          engagementId: true,
          person: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })

  // The cost side, for the margin floor. Read the same way the
  // profitability report reads it — the pay rate sits on the buy
  // contract's candidate row, not on the buy contract.
  //
  // Only fetched where this company is the seller. A client has no
  // business computing a supplier's margin and this is where they would.
  const sellerAgreements = agreements.filter((a) => a.vendorId === companyId)
  const payByPerson = new Map<string, number>()

  if (sellerAgreements.length > 0) {
    const buys = await prisma.buyContract.findMany({
      where: { companyId },
      select: { candidates: { select: { personId: true, payRate: true } } },
      take: 1000,
    })
    for (const b of buys) {
      for (const c of b.candidates) payByPerson.set(c.personId, c.payRate)
    }
  }

  const rows = agreements.map((a) => {
    const seller = a.vendorId === companyId
    const role: 'VENDOR' | 'CLIENT' = seller ? 'VENDOR' : 'CLIENT'
    const counterparty = seller ? a.client : a.vendor

    const contracts: ContractInput[] = a.sellContracts.map((c) => ({
      id: c.id,
      personName: c.person.name,
      billRateCents: c.billRate,
      payRateCents: seller ? (payByPerson.get(c.person.id) ?? null) : null,
      live: workHasStarted(c.state),
    }))

    const input: AgreementInput = {
      id: a.id,
      counterpartyName: counterparty.name,
      signedAt: a.signedAt,
      paymentTermsDays: a.paymentTerms,
      // A client is never told the floor, so it is never fed into the
      // findings on their side either.
      minMarginPct: seller ? a.minMarginPct : null,
      currency: a.currency,
      capacity: a.capacity,
      contracts,
      engagements: a.engagements.map((e) => ({
        id: e.id,
        title: e.title,
        statementOfWork: e.statementOfWork,
        sowSignedAt: e.sowSignedAt,
        liveContracts: e.sellContracts.filter((c) => workHasStarted(c.state)).length,
      })),
    }

    const findings = findingsFor(role, agreementFindings(input))

    return {
      id: a.id,
      role,
      counterparty: { id: counterparty.id, name: counterparty.name },
      terms: {
        paymentTermsDays: a.paymentTerms,
        paymentTermsSays: paymentDaysSays(a.paymentTerms),
        currency: a.currency,
        minMarginPct: seller ? a.minMarginPct : null,
        marginFloorSays: seller ? marginFloorSays(a.minMarginPct) : null,
        capacity: a.capacity,
        signedAt: a.signedAt?.toISOString() ?? null,
      },
      headcount: contracts.filter((c) => c.live).length,
      engagements: a.engagements.map((e) => ({
        id: e.id,
        title: e.title,
        invoiceCycle: e.invoiceCycle,
        statementOfWork: e.statementOfWork,
        sowSignedAt: e.sowSignedAt?.toISOString() ?? null,
        liveContracts: e.sellContracts.filter((c) => workHasStarted(c.state)).length,
      })),
      contracts: a.sellContracts.map((c) => {
        const pay = seller ? (payByPerson.get(c.person.id) ?? null) : null
        return {
          id: c.id,
          person: c.person,
          billRateCents: c.billRate,
          // Null, never zero. A margin against an unknown cost reads as
          // healthy, and nobody audits good news.
          marginPct: seller ? marginPct(c.billRate, pay) : null,
          state: c.state,
          live: workHasStarted(c.state),
          engagementId: c.engagementId,
          startDate: c.startDate.toISOString(),
          endDate: c.endDate?.toISOString() ?? null,
        }
      }),
      findings,
      says: summarise(findings),
      createdAt: a.createdAt.toISOString(),
    }
  })

  const warned = rows.filter((r) => r.findings.some((f) => f.severity === 'WARN')).length

  return NextResponse.json({
    data: {
      agreements: rows,
      summary: {
        total: rows.length,
        unsigned: rows.filter((r) => r.terms.signedAt == null).length,
        needAttention: warned,
        engagements: rows.reduce((n, r) => n + r.engagements.length, 0),
        sowMissing: rows.reduce(
          (n, r) => n + r.findings.filter((f) => f.code === 'SOW_MISSING').length,
          0
        ),
      },
    },
  })
}
