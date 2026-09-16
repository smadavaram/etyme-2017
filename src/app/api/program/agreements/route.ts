import { NextRequest, NextResponse } from 'next/server'
import { logBulkAccess } from '@/lib/access-log'
import {
  STATUS_SAYS,
  daysUntilExpiry,
  signingSays,
  termSays,
} from '@/lib/agreement-term'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import {
  agreementFindings,
  findingsFor,
  marginFloorSays,
  marginPct,
  paymentDaysSays,
  summarize,
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

  // One clock for the whole answer. Reading `new Date()` inside each row
  // would let two agreements on the same screen be judged a millisecond
  // apart, which is how a boundary case reports itself differently on
  // two refreshes.
  const now = new Date()

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
      // ── The term, the standing and the paper ──
      effectiveDate: true,
      expiresAt: true,
      renewalKind: true,
      renewalMonths: true,
      noticeDays: true,
      status: true,
      endedAt: true,
      endedReason: true,
      executedFileName: true,
      executedFileUrl: true,
      signatures: {
        select: { party: true, signerName: true, signerTitle: true, signedAt: true, method: true },
      },
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
      status: a.status,
      effectiveDate: a.effectiveDate,
      expiresAt: a.expiresAt,
      renewalKind: a.renewalKind,
      renewalMonths: a.renewalMonths,
      noticeDays: a.noticeDays,
      endedAt: a.endedAt,
      signatures: a.signatures.map((sig) => ({ party: sig.party, signedAt: sig.signedAt })),
      contracts,
      engagements: a.engagements.map((e) => ({
        id: e.id,
        title: e.title,
        statementOfWork: e.statementOfWork,
        sowSignedAt: e.sowSignedAt,
        liveContracts: e.sellContracts.filter((c) => workHasStarted(c.state)).length,
      })),
    }

    const findings = findingsFor(role, agreementFindings(input, now))

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
        effectiveDate: a.effectiveDate?.toISOString() ?? null,
        expiresAt: a.expiresAt?.toISOString() ?? null,
        renewalKind: a.renewalKind,
        renewalMonths: a.renewalMonths,
        noticeDays: a.noticeDays,
      },
      status: a.status,
      statusSays: STATUS_SAYS[a.status as keyof typeof STATUS_SAYS] ?? a.status,
      termSays: termSays(
        {
          status: a.status,
          effectiveDate: a.effectiveDate,
          expiresAt: a.expiresAt,
          renewalKind: a.renewalKind,
          renewalMonths: a.renewalMonths,
          noticeDays: a.noticeDays,
        },
        now,
        a.endedAt
      ),
      daysToExpiry: daysUntilExpiry(a.expiresAt, now),
      endedAt: a.endedAt?.toISOString() ?? null,
      endedReason: a.endedReason,
      signing: {
        says: signingSays(a.signatures),
        // Both sides, so "who signed and with what authority" is on the
        // row rather than in somebody's inbox.
        signatures: a.signatures.map((sig) => ({
          party: sig.party,
          signerName: sig.signerName,
          signerTitle: sig.signerTitle,
          signedAt: sig.signedAt.toISOString(),
          method: sig.method,
        })),
      },
      executedDocument: a.executedFileName
        ? { fileName: a.executedFileName, fileUrl: a.executedFileUrl }
        : null,
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
      says: summarize(findings),
      createdAt: a.createdAt.toISOString(),
    }
  })

  const warned = rows.filter((r) => r.findings.some((f) => f.severity === 'WARN')).length

  // This screen hands back consultants by name, with the rate each is
  // billed at, for every agreement the caller is a party to. That is a
  // read of other people's data and the invariant does not carve out a
  // screen because it is convenient — every read leaves a row.
  const subjects = [
    ...new Set(agreements.flatMap((a) => a.sellContracts.map((c) => c.person.id))),
  ]
  logBulkAccess(subjects, {
    actorPersonId: realPersonId(caller) ?? undefined,
    actorCompanyId: companyId,
    action: 'CONTRACT_VIEW',
    reason: 'Read the agreements screen, which names the people working under each agreement.',
  })

  return NextResponse.json({
    data: {
      agreements: rows,
      summary: {
        total: rows.length,
        unsigned: rows.filter((r) => r.terms.signedAt == null).length,
        // A lapsed agreement and one with no term at all are different
        // facts and are counted apart. Folding them together would report
        // a firm that has never used the term column as one that let
        // every agreement run out.
        lapsed: rows.filter((r) => r.findings.some((f) => f.code === 'MSA_EXPIRED')).length,
        lapsingSoon: rows.filter((r) => r.findings.some((f) => f.code === 'MSA_LAPSING')).length,
        noTermOnFile: rows.filter((r) => r.findings.some((f) => f.code === 'MSA_NO_TERM')).length,
        ended: rows.filter((r) => r.status === 'TERMINATED').length,
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
